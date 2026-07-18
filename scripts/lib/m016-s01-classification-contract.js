#!/usr/bin/env node
'use strict';

/**
 * scripts/lib/m016-s01-classification-contract.js
 *
 * M016-txa3vu / S01 / T02 — Pure fail-closed classification contract.
 *
 * Pure-function evaluator over evidence claims. The contract NEVER touches
 * the filesystem or performs side effects; all evidence is passed in by the
 * caller. The contract is deterministic: same input claims → same output.
 *
 * Public API:
 *
 *   loadSchema(schemaPath)
 *   evaluateClassificationContract({ claims, schema, options })
 *   classifyClaim(claim, options)
 *   evaluateHardGates(classifications, options)
 *   deriveVerdicts(gates, classifications, options)
 *   compileClassificationBlockers(gates, classifications, verdicts)
 *   buildProtocolEvidence(...)
 *   buildVerificationEvidence(...)
 *   buildValidationEvidence(...)
 *   sanitizeString(value)
 *   checkRedactionSafety(value, skipKeys)
 *   assertWriteSafe(payload, skipKeys)
 */

const data = require('./m016-s01-classification-data');
const fs = require('fs');
const path = require('path');

const {
  SCHEMA_ID,
  SEMANTIC_RULES,
  PROVENANCE_KINDS,
  PROVENANCE_PROMOTION,
  VERDICT_DIMENSIONS,
  VERDICT_VALUES,
  VERDICT_DERIVATION_RULES,
  HARD_GATE_IDS,
  HARD_GATE_LABELS,
  WORKSHEET_STEP_STATUSES,
  WORKSHEET_CONTRACT,
  BLOCKER_CODES,
  EXIT_CODES,
  DEFAULTS,
  REDACTION_BOUNDS,
  IDENTITY_KIND,
  AGENT_NAMES_SET,
} = data;

const ROOT = path.resolve(__dirname, '..', '..');

// ---------------------------------------------------------------------------
// Optional AJV loader
// ---------------------------------------------------------------------------

let _ajvInstance = null;
let _ajvInitFailed = false;

function _tryInitAjv() {
  if (_ajvInstance !== null) return _ajvInstance;
  if (_ajvInitFailed) return null;
  try {
    const Ajv = require('ajv');
    const addFormats = require('ajv-formats');
    _ajvInstance = addFormats(new Ajv({ allErrors: true, strict: false }));
    return _ajvInstance;
  } catch (e) {
    _ajvInitFailed = true;
    return null;
  }
}

function loadSchema(schemaPath) {
  const rel = path.isAbsolute(schemaPath) ? schemaPath : path.join(ROOT, schemaPath);
  if (!fs.existsSync(rel)) {
    const err = new Error(`schema missing at ${rel}`);
    err.code = BLOCKER_CODES.CLAIMS_INPUT_MALFORMED;
    err.path = rel;
    throw err;
  }
  let parsed;
  try { parsed = JSON.parse(fs.readFileSync(rel, 'utf8')); }
  catch (e) {
    const err = new Error(`schema malformed JSON at ${rel}: ${e.message}`);
    err.code = BLOCKER_CODES.CLAIMS_INPUT_MALFORMED;
    err.path = rel;
    throw err;
  }
  const ajv = _tryInitAjv();
  let validate = null;
  if (ajv) {
    try { validate = ajv.compile(parsed); } catch (e) { validate = null; }
  }
  return { schema: parsed, validate, path: rel };
}

// ---------------------------------------------------------------------------
// Sanitisation helpers
// ---------------------------------------------------------------------------

function sanitizeString(value) {
  if (typeof value !== 'string') return value;
  let out = value;
  out = out.replace(REDACTION_BOUNDS.uuid, DEFAULTS.redacted_id_placeholder);
  out = out.replace(REDACTION_BOUNDS.credential_assignment, DEFAULTS.redacted_credential_placeholder);
  out = out.replace(REDACTION_BOUNDS.bearer_token, DEFAULTS.redacted_token_placeholder);
  out = out.replace(REDACTION_BOUNDS.sk_token, DEFAULTS.redacted_token_placeholder);
  out = out.replace(REDACTION_BOUNDS.tp_token, DEFAULTS.redacted_token_placeholder);
  if (out.length > REDACTION_BOUNDS.max_chars_per_summary) {
    out = out.slice(0, REDACTION_BOUNDS.max_chars_per_summary);
  }
  return out;
}

const REDACTION_SKIP_KEYS = new Set([
  'gate_labels', 'gate_codes', 'paths', '$schema', 'code', 'claim_id',
  'semantic_rule', 'verdict_dimension', 'independence_group', 'provenance_kind',
  'agent_name', 'runner_id', 'completed_by', 'reason',
]);

// Map redaction-hit kinds to the canonical BLOCKER_CODES key. The hit kinds
// are derived from REDACTION_BOUNDS regex classes; the BLOCKER_CODES entries
// in the data module use the abbreviated namespace from M016-S01-CLASSIFY-*.
const _REDACTION_LEAK_BLOCKER_KEY = Object.freeze({
  uuid: 'DIAGNOSTIC_UUID_LEAK',
  credential_assignment: 'DIAGNOSTIC_CRED_LEAK',
  bearer_token: 'DIAGNOSTIC_BEARER_LEAK',
  sk_token: 'DIAGNOSTIC_BEARER_LEAK',
  tp_token: 'DIAGNOSTIC_BEARER_LEAK',
  xiaomi_marker: 'DIAGNOSTIC_XIAOMI_LEAK',
});

function checkRedactionSafety(value, skipKeys) {
  const hits = [];
  const skip = skipKeys || REDACTION_SKIP_KEYS;
  const walk = (val, p) => {
    if (val == null) return;
    if (typeof val === 'string') {
      const checks = [
        { kind: 'uuid', re: REDACTION_BOUNDS.uuid },
        { kind: 'credential_assignment', re: REDACTION_BOUNDS.credential_assignment },
        { kind: 'bearer_token', re: REDACTION_BOUNDS.bearer_token },
        { kind: 'sk_token', re: REDACTION_BOUNDS.sk_token },
        { kind: 'tp_token', re: REDACTION_BOUNDS.tp_token },
        { kind: 'xiaomi_marker', re: REDACTION_BOUNDS.xiaomi_or_mimo },
      ];
      for (const c of checks) {
        if (c.re.test(val)) hits.push({ kind: c.kind, path: p || '$', tail: val.length > 80 ? val.slice(0, 80) + '…' : val });
      }
      return;
    }
    if (Array.isArray(val)) { for (let i = 0; i < val.length; i++) walk(val[i], `${p}[${i}]`); return; }
    if (typeof val === 'object') {
      for (const k of Object.keys(val)) {
        if (skip.has(k)) continue;
        walk(val[k], `${p}.${k}`);
      }
    }
  };
  walk(value, '$');
  return hits;
}

function assertWriteSafe(payload, skipKeys) {
  const hits = checkRedactionSafety(payload, skipKeys);
  if (hits.length > 0) {
    const err = new Error(`refused write: redaction leak in payload (count=${hits.length})`);
    err.code = BLOCKER_CODES.RUNNER_FAILURE;
    err.hits = hits;
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Per-claim shape & semantic validators
// ---------------------------------------------------------------------------

const KEBAB_CASE = /^[a-z][a-z0-9._-]{2,63}$/;
const STEP_ID = /^[A-Za-z][A-Za-z0-9._-]{2,63}$/;
const COMPLETED_BY = /^(Div[1-7]\.[A-Za-z]+|classifier)$/;
const RUNNER_ID = /^[A-Za-z][A-Za-z0-9._-]{2,63}$/;
const ARTIFACT_HASH = /^[a-f0-9]{64}$|^[a-f0-9]{128}$/;
const DIGEST_CHARSET = /^[A-Za-z0-9 .:;,_<>/\-]+$/;
const VERIFY_CMD_CHARSET = /^[A-Za-z0-9 .:;,_<>/\-]+$/;
const OBSERVED_EVIDENCE_CHARSET = /^[A-Za-z0-9 .:;,_<>/\-]*$/;
const SUMMARY_CHARSET = /^[A-Za-z0-9 .:;,_<>/\-]+$/;
const BOUNDED_PATH = /^(runtime-evidence|schemas|scripts)\/[A-Za-z0-9._/\-]+$/;
const BOUNDED_PATH_SR = /^(runtime-evidence|scripts)\/[A-Za-z0-9._/\-]+$/;

function _inRange(s, lo, hi) { return typeof s === 'string' && s.length >= lo && s.length <= hi; }

function _checkSourceRef(ref) {
  if (typeof ref === 'string') {
    return BOUNDED_PATH.test(ref) ? null : `source_ref string "${ref}" out of bound`;
  }
  if (ref && typeof ref === 'object' && !Array.isArray(ref)) {
    const allowed = new Set(['mission_evidence', 'agent_run', 'issue_event', 'document', 'comment', 'classifier_input']);
    if (!allowed.has(ref.kind)) return `source_ref.kind "${ref.kind}" not canonical`;
    if (!BOUNDED_PATH.test(ref.path)) return `source_ref.path "${ref.path}" out of bound`;
    const extra = Object.keys(ref).filter((k) => k !== 'kind' && k !== 'path');
    if (extra.length) return `source_ref has additional properties: ${extra.join(',')}`;
    return null;
  }
  return 'source_ref must be string or { kind, path } object';
}

function _checkProvenance(prov, claim) {
  if (!prov || typeof prov !== 'object' || Array.isArray(prov)) return 'executed_provenance must be an object';
  if (!PROVENANCE_PROMOTION[prov.provenance_kind]) return `provenance_kind "${prov.provenance_kind}" not canonical`;
  const id = prov.identity;
  if (!id || typeof id !== 'object' || Array.isArray(id)) return 'executed_provenance.identity must be an object';
  const hasAgent = typeof id.agent_name === 'string';
  const hasRunner = typeof id.runner_id === 'string';
  if (hasAgent && hasRunner) return 'executed_provenance.identity must declare either agent_name or runner_id, not both';
  if (!hasAgent && !hasRunner) return 'executed_provenance.identity missing agent_name or runner_id';
  if (hasAgent && !AGENT_NAMES_SET.has(id.agent_name)) return `agent_name "${id.agent_name}" not canonical`;
  if (hasRunner && !RUNNER_ID.test(id.runner_id)) return `runner_id "${id.runner_id}" malformed`;
  if (typeof prov.started_at !== 'string' || isNaN(Date.parse(prov.started_at))) return `started_at "${prov.started_at}" not parseable ISO-8601`;
  if (typeof prov.ended_at !== 'string' || isNaN(Date.parse(prov.ended_at))) return `ended_at "${prov.ended_at}" not parseable ISO-8601`;
  if (Date.parse(prov.ended_at) < Date.parse(prov.started_at)) return 'ended_at is before started_at';
  if (!Number.isInteger(prov.exit_code) || prov.exit_code < -1 || prov.exit_code > 255) return `exit_code "${prov.exit_code}" not in [-1,255]`;
  if (!_inRange(prov.sanitised_digest, 8, 256)) return 'sanitised_digest length not in [8,256]';
  if (!DIGEST_CHARSET.test(prov.sanitised_digest)) return 'sanitised_digest contains characters outside safe charset';
  if (!BOUNDED_PATH_SR.test(prov.artifact_reference)) return `artifact_reference "${prov.artifact_reference}" out of bound`;
  if (!ARTIFACT_HASH.test(prov.artifact_hash)) return 'artifact_hash must be 64/128-char lowercase hex';
  if (!_inRange(prov.scope, 1, 200)) return 'scope length not in [1,200]';
  if (!_inRange(prov.limitations, 1, 400)) return 'limitations length not in [1,400]';
  if (claim && claim.verdict_dimension === VERDICT_DIMENSIONS.LAUNCH && (!prov.artifact_hash || !prov.artifact_reference)) {
    return 'launch EXECUTED requires artifact_hash and artifact_reference';
  }
  const allowedKeys = new Set(['provenance_kind', 'identity', 'started_at', 'ended_at', 'exit_code', 'sanitised_digest', 'artifact_reference', 'artifact_hash', 'scope', 'limitations']);
  const extra = Object.keys(prov).filter((k) => !allowedKeys.has(k));
  if (extra.length) return `executed_provenance has additional properties: ${extra.join(',')}`;
  return null;
}

function _checkWorksheet(ws) {
  if (!ws || typeof ws !== 'object' || Array.isArray(ws)) return 'worksheet must be an object';
  if (!Array.isArray(ws.steps) || ws.steps.length < WORKSHEET_CONTRACT.min_steps || ws.steps.length > WORKSHEET_CONTRACT.max_steps) {
    return `worksheet.steps length not in [${WORKSHEET_CONTRACT.min_steps},${WORKSHEET_CONTRACT.max_steps}]`;
  }
  for (let i = 0; i < ws.steps.length; i++) {
    const s = ws.steps[i];
    if (!s || typeof s !== 'object' || Array.isArray(s)) return `worksheet.steps[${i}] must be object`;
    if (!STEP_ID.test(s.step_id)) return `worksheet.steps[${i}].step_id malformed`;
    if (!_inRange(s.description, 1, WORKSHEET_CONTRACT.max_description_length)) return `worksheet.steps[${i}].description length not in [1,${WORKSHEET_CONTRACT.max_description_length}]`;
    if (!_inRange(s.verify_cmd, 1, WORKSHEET_CONTRACT.max_verify_cmd_length)) return `worksheet.steps[${i}].verify_cmd length not in [1,${WORKSHEET_CONTRACT.max_verify_cmd_length}]`;
    if (!VERIFY_CMD_CHARSET.test(s.verify_cmd)) return `worksheet.steps[${i}].verify_cmd contains characters outside safe charset`;
    const allowed = new Set(Object.values(WORKSHEET_STEP_STATUSES));
    if (!allowed.has(s.observed_status)) return `worksheet.steps[${i}].observed_status "${s.observed_status}" not canonical`;
    if (s.observed_evidence !== undefined) {
      if (typeof s.observed_evidence !== 'string' || s.observed_evidence.length > WORKSHEET_CONTRACT.max_observed_evidence_length) {
        return `worksheet.steps[${i}].observed_evidence length > ${WORKSHEET_CONTRACT.max_observed_evidence_length}`;
      }
      if (!OBSERVED_EVIDENCE_CHARSET.test(s.observed_evidence)) return `worksheet.steps[${i}].observed_evidence contains characters outside safe charset`;
    }
  }
  if (typeof ws.completed_at !== 'string' || isNaN(Date.parse(ws.completed_at))) return `worksheet.completed_at "${ws.completed_at}" not parseable ISO-8601`;
  if (!COMPLETED_BY.test(ws.completed_by)) return `worksheet.completed_by "${ws.completed_by}" not Div[1-7].X or classifier`;
  return null;
}

function _checkObservedRefs(refs) {
  if (refs === undefined) return null;
  if (!Array.isArray(refs)) return 'observed_refs must be an array';
  if (refs.length > 16) return 'observed_refs exceeds 16 items';
  const kinds = new Set(['mission_evidence', 'agent_run', 'issue_event', 'document', 'comment']);
  for (let i = 0; i < refs.length; i++) {
    const r = refs[i];
    if (typeof r === 'string') { if (!BOUNDED_PATH.test(r)) return `observed_refs[${i}] path "${r}" out of bound`; continue; }
    if (r && typeof r === 'object' && !Array.isArray(r)) {
      if (!kinds.has(r.kind)) return `observed_refs[${i}].kind not canonical`;
      if (!BOUNDED_PATH.test(r.path)) return `observed_refs[${i}].path out of bound`;
      const extra = Object.keys(r).filter((k) => k !== 'kind' && k !== 'path');
      if (extra.length) return `observed_refs[${i}] additional properties`;
      continue;
    }
    return `observed_refs[${i}] must be string or { kind, path }`;
  }
  return null;
}

function _checkDiagnostic(diag) {
  if (!diag || typeof diag !== 'object' || Array.isArray(diag)) return 'diagnostic must be an object';
  if (!_inRange(diag.summary, 1, 200)) return 'diagnostic.summary length not in [1,200]';
  if (!SUMMARY_CHARSET.test(diag.summary)) return 'diagnostic.summary contains characters outside safe charset';
  if (typeof diag.redaction_applied !== 'boolean') return 'diagnostic.redaction_applied must be boolean';
  const extra = Object.keys(diag).filter((k) => k !== 'summary' && k !== 'redaction_applied');
  if (extra.length) return `diagnostic additional properties: ${extra.join(',')}`;
  return null;
}

const ALLOWED_CLAIM_KEYS = new Set([
  'claim_id', 'semantic_rule', 'verdict_dimension', 'independence_group',
  'scope', 'limitations', 'source_ref', 'gate_status', 'executed_provenance',
  'observed_refs', 'worksheet', 'diagnostic'
]);

function validateClaimShape(claim, schemaValidate) {
  if (!claim || typeof claim !== 'object' || Array.isArray(claim)) {
    return { ok: false, reason: 'claim must be an object', code: BLOCKER_CODES.CLAIM_NOT_OBJECT };
  }
  if (schemaValidate) {
    const ok = schemaValidate(claim);
    if (!ok) {
      const errs = schemaValidate.errors || [];
      const first = errs[0] ? `${errs[0].instancePath || '$'} ${errs[0].message}` : 'schema violation';
      return { ok: false, reason: `schema violation: ${first}`, code: BLOCKER_CODES.CLAIM_ADDITIONAL_PROPS(claim.claim_id || 'unknown') };
    }
  }
  if (!KEBAB_CASE.test(claim.claim_id || '')) {
    return { ok: false, reason: `claim_id "${claim.claim_id}" malformed`, code: BLOCKER_CODES.CLAIM_ID_MALFORMED(claim.claim_id || 'unknown') };
  }
  if (!Object.values(SEMANTIC_RULES).includes(claim.semantic_rule)) {
    return { ok: false, reason: `semantic_rule "${claim.semantic_rule}" not canonical`, code: BLOCKER_CODES.SEMANTIC_RULE_INVALID(claim.claim_id, claim.semantic_rule || 'undefined') };
  }
  if (!Object.values(VERDICT_DIMENSIONS).includes(claim.verdict_dimension)) {
    return { ok: false, reason: `verdict_dimension "${claim.verdict_dimension}" not canonical`, code: BLOCKER_CODES.DIMENSION_INVALID(claim.claim_id, claim.verdict_dimension || 'undefined') };
  }
  if (!KEBAB_CASE.test(claim.independence_group || '')) {
    return { ok: false, reason: `independence_group "${claim.independence_group}" malformed`, code: BLOCKER_CODES.INDEPENDENCE_GROUP_MALFORMED(claim.claim_id) };
  }
  if (!_inRange(claim.scope, 1, 200)) return { ok: false, reason: 'scope length not in [1,200]', code: BLOCKER_CODES.SOURCE_REF_MISSING(claim.claim_id) };
  if (!_inRange(claim.limitations, 1, 400)) return { ok: false, reason: 'limitations length not in [1,400]', code: BLOCKER_CODES.SOURCE_REF_MISSING(claim.claim_id) };
  const srcErr = _checkSourceRef(claim.source_ref);
  if (srcErr) return { ok: false, reason: srcErr, code: BLOCKER_CODES.SOURCE_REF_PATH_OUT_OF_BOUND(claim.claim_id) };
  if (!['PASS', 'NOT_PROVEN', 'FAIL_CLOSED'].includes(claim.gate_status)) {
    return { ok: false, reason: `gate_status "${claim.gate_status}" not canonical` };
  }
  if (claim.semantic_rule === SEMANTIC_RULES.EXECUTED) {
    if (!claim.executed_provenance) {
      return { ok: false, reason: 'EXECUTED claim missing executed_provenance', code: BLOCKER_CODES.EXECUTED_MISSING_PROVENANCE(claim.claim_id) };
    }
    const err = _checkProvenance(claim.executed_provenance, claim);
    if (err) return { ok: false, reason: err, code: BLOCKER_CODES.EXECUTED_PROVENANCE_MALFORMED(claim.claim_id) };
  } else if (claim.executed_provenance) {
    return { ok: false, reason: 'non-EXECUTED claim carries executed_provenance', code: BLOCKER_CODES.NON_EXECUTED_WITH_PROVENANCE(claim.claim_id) };
  }
  if (claim.observed_refs !== undefined) {
    const err = _checkObservedRefs(claim.observed_refs);
    if (err) return { ok: false, reason: err };
  }
  if (claim.worksheet !== undefined) {
    const err = _checkWorksheet(claim.worksheet);
    if (err) return { ok: false, reason: err, code: BLOCKER_CODES.WORKSHEET_INCOMPLETE(claim.claim_id) };
  }
  if (claim.diagnostic !== undefined) {
    const err = _checkDiagnostic(claim.diagnostic);
    if (err) return { ok: false, reason: err };
  }
  const extra = Object.keys(claim).filter((k) => !ALLOWED_CLAIM_KEYS.has(k));
  if (extra.length) {
    return { ok: false, reason: `claim has additional properties: ${extra.join(',')}`, code: BLOCKER_CODES.CLAIM_ADDITIONAL_PROPS(claim.claim_id) };
  }
  return { ok: true };
}

// ---------------------------------------------------------------------------
// classifyClaim
// ---------------------------------------------------------------------------

function classifyClaim(claim, options) {
  const opts = options || {};
  const shapeCheck = validateClaimShape(claim, opts.schemaValidate);
  const reject = (reason, code) => ({
    claim_id: (claim && claim.claim_id) || 'unknown',
    semantic_rule: (claim && claim.semantic_rule) || null,
    verdict_dimension: (claim && claim.verdict_dimension) || null,
    independence_group: (claim && claim.independence_group) || null,
    status: 'rejected',
    blockers: [{ code: code || BLOCKER_CODES.CLAIM_ADDITIONAL_PROPS(claim && claim.claim_id ? claim.claim_id : 'unknown'), severity: 'blocking', reason }],
    provenance_promotion: null, max_verdict: null, redaction_safe: false,
    sanitised_diagnostic: null, worksheet_present: false, artifact_hash: null,
    source_ref: claim && claim.source_ref ? claim.source_ref : null,
    limitations: claim && claim.limitations ? claim.limitations : null,
    scope: claim && claim.scope ? claim.scope : null,
  });

  if (!shapeCheck.ok) return reject(shapeCheck.reason, shapeCheck.code);

  const claimId = claim.claim_id;
  const semanticRule = claim.semantic_rule;
  const dimension = claim.verdict_dimension;
  const blockers = [];
  let maxVerdict = VERDICT_VALUES.NOT_PROVEN;
  let promotion = null;
  let artifactHash = null;
  const worksheetPresent = !!claim.worksheet;
  let redactionSafe = true;
  let sanitisedDiag = null;

  if (semanticRule === SEMANTIC_RULES.EXECUTED) {
    const prov = claim.executed_provenance;
    promotion = PROVENANCE_PROMOTION[prov.provenance_kind];
    maxVerdict = promotion.max_verdict;
    artifactHash = prov.artifact_hash;
    if (prov.exit_code !== 0) {
      blockers.push({ code: BLOCKER_CODES.EXIT_CODE_NON_ZERO(claimId, prov.exit_code), severity: 'warning', reason: `exit_code ${prov.exit_code} non-zero` });
    }
    const digestHits = checkRedactionSafety(prov.sanitised_digest);
    for (const h of digestHits) {
      redactionSafe = false;
      const leakKey = _REDACTION_LEAK_BLOCKER_KEY[h.kind] || `DIAGNOSTIC_${h.kind.toUpperCase()}_LEAK`;
      const codeFn = BLOCKER_CODES[leakKey];
      const code = codeFn ? codeFn(claimId) : `M16-S01-CLASSIFY-${claimId}-DIAGNOSTIC-${h.kind.toUpperCase()}-LEAK`;
      blockers.push({ code, severity: 'blocking', reason: `executed_provenance.sanitised_digest contains ${h.kind} marker` });
    }
  } else if (semanticRule === SEMANTIC_RULES.OBSERVED) {
    maxVerdict = dimension === VERDICT_DIMENSIONS.ORCHESTRATION ? VERDICT_VALUES.PARTIAL : VERDICT_VALUES.NOT_PROVEN;
  } else {
    maxVerdict = VERDICT_VALUES.NOT_PROVEN;
  }

  if (claim.diagnostic) {
    const orig = claim.diagnostic.summary;
    const sanitised = sanitizeString(orig);
    sanitisedDiag = { summary: sanitised, redaction_applied: sanitised !== orig };
    if (sanitised !== orig && claim.diagnostic.redaction_applied === false) {
      blockers.push({ code: BLOCKER_CODES.DIAGNOSTIC_UNSANITISED(claimId), severity: 'blocking', reason: 'diagnostic required redaction but redaction_applied=false' });
      redactionSafe = false;
    }
  }

  if (!worksheetPresent && maxVerdict === VERDICT_VALUES.PASS) {
    blockers.push({ code: BLOCKER_CODES.SCORE_WITHOUT_WORKSHEET(claimId), severity: 'blocking', reason: 'claim would score PASS but worksheet absent' });
    maxVerdict = VERDICT_VALUES.NOT_PROVEN;
  }

  if (dimension === VERDICT_DIMENSIONS.LAUNCH) {
    // Launch dimension is bounded by the M016-S01 historical evidence rule:
    // even when an EXECUTED claim carries a valid artifact_hash (proving a
    // bounded provenance), the launch dimension can NEVER exceed
    // PREPARATION_ONLY without an independent native_readback artifact.
    // The contract has no way to verify independence from the historical
    // evidence alone, so all launch claims are capped at PREPARATION_ONLY.
    if (maxVerdict === VERDICT_VALUES.PASS) {
      maxVerdict = VERDICT_VALUES.PREPARATION_ONLY;
    }
    if (maxVerdict === 'GO' || maxVerdict === 'PASS_AUTOMATIC') {
      blockers.push({ code: BLOCKER_CODES.LAUNCH_GO_ATTEMPT(claimId), severity: 'blocking', reason: `launch dimension attempted prohibited verdict "${maxVerdict}"` });
      maxVerdict = VERDICT_VALUES.NOT_PROVEN;
    }
  }

  const status = blockers.some((b) => b.severity === 'blocking')
    ? 'fail_closed'
    : (maxVerdict === VERDICT_VALUES.NOT_PROVEN ? 'not_proven' : 'pass');

  return {
    claim_id: claimId, semantic_rule: semanticRule, verdict_dimension: dimension,
    independence_group: claim.independence_group, status, blockers,
    provenance_promotion: promotion, max_verdict: maxVerdict, redaction_safe: redactionSafe,
    sanitised_diagnostic: sanitisedDiag, worksheet_present: worksheetPresent,
    artifact_hash: artifactHash, source_ref: claim.source_ref,
    limitations: claim.limitations, scope: claim.scope,
  };
}

// ---------------------------------------------------------------------------
// Hard gate evaluators (HG1..HG6)
// ---------------------------------------------------------------------------

function evaluateHardGates(classifications, options) {
  const opts = options || {};
  const provisional = opts.provisionalVerdicts;
  const diag = {
    total_claims: classifications.length,
    rule_distribution: {},
    executed_count: 0, native_run_count: 0, non_executed_with_provenance: 0,
    groups_seen: {}, reused_groups: [], shared_artifact_hash_pairs: [],
    bounded_paths: 0, missing_source_ref: [], executed_without_artifact_hash: [],
    worksheet_present: 0, worksheet_absent: [], exit_code_nonzero: 0,
    redaction_safe_claims: 0, sanitisation_leaks: 0, prohibited_verdicts: [],
    launch_go_attempts: 0,
  };
  for (const c of classifications) {
    diag.rule_distribution[c.semantic_rule] = (diag.rule_distribution[c.semantic_rule] || 0) + 1;
    if (c.semantic_rule === SEMANTIC_RULES.EXECUTED) {
      diag.executed_count += 1;
      if (c.provenance_promotion && c.provenance_promotion.promotes === true) diag.native_run_count += 1;
      if (c.blockers.some((b) => b.code.includes('EXIT-CODE-NON-ZERO'))) diag.exit_code_nonzero += 1;
    } else if (c.provenance_promotion !== null) {
      diag.non_executed_with_provenance += 1;
    }
    const g = c.independence_group;
    if (g) {
      if (!diag.groups_seen[g]) diag.groups_seen[g] = [];
      diag.groups_seen[g].push(c);
    }
    if (c.source_ref) diag.bounded_paths += 1; else diag.missing_source_ref.push(c.claim_id);
    if (c.semantic_rule === SEMANTIC_RULES.EXECUTED && !c.artifact_hash) diag.executed_without_artifact_hash.push(c.claim_id);
    if (c.worksheet_present) diag.worksheet_present += 1; else diag.worksheet_absent.push(c.claim_id);
    if (c.redaction_safe) diag.redaction_safe_claims += 1;
    else diag.sanitisation_leaks += 1;
    if (c.blockers.some((b) => b.code.includes('LAUNCH-GO-ATTEMPT'))) {
      diag.launch_go_attempts += 1;
      diag.prohibited_verdicts.push(c.claim_id);
    }
  }
  for (const [g, list] of Object.entries(diag.groups_seen)) {
    if (list.length > 1) {
      const execs = list.filter((c) => c.semantic_rule === SEMANTIC_RULES.EXECUTED);
      if (execs.length > 1) {
        const hashes = new Set(execs.map((c) => c.artifact_hash).filter(Boolean));
        if (hashes.size > 1) diag.reused_groups.push(g);
        else diag.shared_artifact_hash_pairs.push(g);
      }
    }
  }
  if (provisional && provisional.launch && (provisional.launch === 'GO' || provisional.launch === 'PASS_AUTOMATIC')) {
    diag.launch_go_attempts += 1;
    diag.prohibited_verdicts.push('dimension:launch');
  }

  // HG1 — semantic_rule compliance: every claim canonical, no shape violations
  const shapeViolations = classifications.filter((c) => c.status === 'rejected').length;
  const hg1 = shapeViolations === 0 && classifications.every((c) => Object.values(SEMANTIC_RULES).includes(c.semantic_rule))
    ? 'pass' : 'fail_closed';
  // HG2 — provenance integrity: well-formed provenance on EXECUTED, no provenance on others
  const hg2Fail = classifications.some((c) => c.status === 'rejected' && c.blockers.some((b) =>
    b.code === BLOCKER_CODES.EXECUTED_MISSING_PROVENANCE(c.claim_id)
    || b.code === BLOCKER_CODES.EXECUTED_PROVENANCE_MALFORMED(c.claim_id)
    || b.code === BLOCKER_CODES.NON_EXECUTED_WITH_PROVENANCE(c.claim_id)
  ));
  const hg2 = (hg2Fail || diag.non_executed_with_provenance > 0) ? 'fail_closed' : 'pass';
  // HG3 — independence group isolation:
  //   pass: every claim has a unique independence_group (or all shared groups carry identical hash AND no conflict detected)
  //   not_proven: some independence_groups are shared with consistent artifact_hash — independence not yet established
  //   fail_closed: independence_groups are shared with conflicting artifact_hashes (structural violation)
  let hg3;
  if (diag.reused_groups.length > 0) hg3 = 'fail_closed';
  else if (diag.shared_artifact_hash_pairs.length > 0) hg3 = 'not_proven';
  else hg3 = 'pass';
  // HG4 — artifact binding: bounded paths + artifact_hash on EXECUTED
  const hg4 = (diag.missing_source_ref.length === 0 && diag.executed_without_artifact_hash.length === 0) ? 'pass' : 'fail_closed';
  // HG5 — worksheet integrity: no WORKSHEET_INCOMPLETE blocker
  const hg5 = classifications.every((c) => !c.blockers.some((b) => b.code === BLOCKER_CODES.WORKSHEET_INCOMPLETE(c.claim_id))) ? 'pass' : 'fail_closed';
  // HG6 — verdict derivation bounded: no GO attempts, no sanitisation leaks
  const hg6 = (diag.launch_go_attempts === 0 && diag.sanitisation_leaks === 0) ? 'pass' : 'fail_closed';

  return {
    gates: {
      HG1_SEMANTIC_RULE_COMPLIANCE: hg1,
      HG2_PROVENANCE_INTEGRITY: hg2,
      HG3_INDEPENDENCE_GROUP_ISOLATION: hg3,
      HG4_ARTIFACT_BINDING: hg4,
      HG5_WORKSHEET_INTEGRITY: hg5,
      HG6_VERDICT_DERIVATION_BOUNDED: hg6,
    },
    diagnostics: {
      hg1_semantic_rule_compliance: { total_claims: diag.total_claims, rule_distribution: diag.rule_distribution, shape_violations: shapeViolations },
      hg2_provenance_integrity: { executed_count: diag.executed_count, native_run_count: diag.native_run_count, non_executed_with_provenance: diag.non_executed_with_provenance, exit_code_nonzero: diag.exit_code_nonzero },
      hg3_independence_group_isolation: { groups_seen: Object.fromEntries(Object.entries(diag.groups_seen).map(([k, v]) => [k, v.length])), reused_groups: diag.reused_groups, shared_artifact_hash_pairs: diag.shared_artifact_hash_pairs },
      hg4_artifact_binding: { bounded_paths: diag.bounded_paths, missing_source_ref: diag.missing_source_ref, executed_without_artifact_hash: diag.executed_without_artifact_hash },
      hg5_worksheet_integrity: { total_claims: diag.total_claims, worksheet_present: diag.worksheet_present, worksheet_absent: diag.worksheet_absent },
      hg6_verdict_derivation_bounded: { launch_go_attempts: diag.launch_go_attempts, prohibited_verdicts: diag.prohibited_verdicts, redaction_safe_claims: diag.redaction_safe_claims, sanitisation_leaks: diag.sanitisation_leaks },
    },
  };
}

// ---------------------------------------------------------------------------
// Verdict derivation
// ---------------------------------------------------------------------------

function _gateKey(floor) { return 'HG' + floor.slice(2) + (floor === 'HG1' ? '_SEMANTIC_RULE_COMPLIANCE' : floor === 'HG2' ? '_PROVENANCE_INTEGRITY' : floor === 'HG3' ? '_INDEPENDENCE_GROUP_ISOLATION' : floor === 'HG4' ? '_ARTIFACT_BINDING' : floor === 'HG5' ? '_WORKSHEET_INTEGRITY' : floor === 'HG6' ? '_VERDICT_DERIVATION_BOUNDED' : ''); }

function _dimensionVerdict(dimension, classifications, gates) {
  const rule = VERDICT_DERIVATION_RULES[dimension];
  if (!rule) return { verdict: VERDICT_VALUES.NOT_PROVEN, reason: 'unknown dimension' };
  for (const floor of (rule.gate_floor || [])) {
    if (gates[_gateKey(floor)] === 'fail_closed') {
      return { verdict: VERDICT_VALUES.NOT_PROVEN, reason: `${floor} failed closed` };
    }
  }
  const dim = classifications.filter((c) => c.verdict_dimension === dimension && c.status !== 'rejected');
  const executed = dim.filter((c) => c.semantic_rule === SEMANTIC_RULES.EXECUTED);
  const native = executed.filter((c) => c.provenance_promotion && c.provenance_promotion.promotes === true);

  if (dimension === VERDICT_DIMENSIONS.ORCHESTRATION) {
    const okGates = gates.HG1_SEMANTIC_RULE_COMPLIANCE === 'pass' && gates.HG2_PROVENANCE_INTEGRITY === 'pass' && gates.HG3_INDEPENDENCE_GROUP_ISOLATION === 'pass';
    if (!okGates) {
      if (gates.HG1_SEMANTIC_RULE_COMPLIANCE === 'pass' && dim.some((c) => c.semantic_rule === SEMANTIC_RULES.OBSERVED)) {
        return { verdict: VERDICT_VALUES.PARTIAL, reason: 'orchestration: HG1 pass but only observed claims' };
      }
      return { verdict: VERDICT_VALUES.NOT_PROVEN, reason: 'orchestration gate floor failed' };
    }
    if (native.length >= 1 && executed.length >= 1 && executed.every((c) => c.worksheet_present)) {
      return { verdict: VERDICT_VALUES.PASS, reason: 'orchestration: native_run EXECUTED + HG1+HG2+HG3 pass + worksheet present' };
    }
    if (native.length >= 1) return { verdict: VERDICT_VALUES.PARTIAL, reason: 'orchestration: native_run EXECUTED present but worksheet incomplete' };
    if (dim.some((c) => c.semantic_rule === SEMANTIC_RULES.OBSERVED)) return { verdict: VERDICT_VALUES.PARTIAL, reason: 'orchestration: only OBSERVED claims available' };
    return { verdict: VERDICT_VALUES.NOT_PROVEN, reason: 'orchestration: no claims available' };
  }
  if (dimension === VERDICT_DIMENSIONS.EVIDENCE) {
    const required = ['HG1_SEMANTIC_RULE_COMPLIANCE', 'HG2_PROVENANCE_INTEGRITY', 'HG3_INDEPENDENCE_GROUP_ISOLATION', 'HG4_ARTIFACT_BINDING', 'HG5_WORKSHEET_INTEGRITY'];
    for (const g of required) if (gates[g] === 'fail_closed') return { verdict: VERDICT_VALUES.NOT_PROVEN, reason: `evidence: ${g} failed closed` };
    const h3np = gates.HG3_INDEPENDENCE_GROUP_ISOLATION === 'not_proven';
    const h5np = gates.HG5_WORKSHEET_INTEGRITY === 'not_proven';
    const h6np = gates.HG6_VERDICT_DERIVATION_BOUNDED === 'not_proven';
    if (native.length >= 2 && !h3np && !h5np && native.every((c) => c.worksheet_present)) {
      return { verdict: VERDICT_VALUES.PASS, reason: 'evidence: ≥2 native_run EXECUTED + HG1..HG5 pass' };
    }
    if (native.length >= 1) return { verdict: VERDICT_VALUES.PARTIAL, reason: 'evidence: only 1 native_run EXECUTED' };
    if (h5np) return { verdict: VERDICT_VALUES.PARTIAL, reason: 'evidence: HG5 worksheet partial' };
    if (h3np) return { verdict: VERDICT_VALUES.PARTIAL, reason: 'evidence: HG3 independence reuse partial' };
    if (h6np) return { verdict: VERDICT_VALUES.PARTIAL, reason: 'evidence: HG6 sanitisation partial' };
    return { verdict: VERDICT_VALUES.NOT_PROVEN, reason: 'evidence: insufficient claims' };
  }
  if (dimension === VERDICT_DIMENSIONS.LAUNCH) {
    const required = ['HG1_SEMANTIC_RULE_COMPLIANCE', 'HG2_PROVENANCE_INTEGRITY', 'HG3_INDEPENDENCE_GROUP_ISOLATION', 'HG4_ARTIFACT_BINDING', 'HG5_WORKSHEET_INTEGRITY', 'HG6_VERDICT_DERIVATION_BOUNDED'];
    for (const g of required) if (gates[g] === 'fail_closed') return { verdict: VERDICT_VALUES.NOT_PROVEN, reason: `launch: ${g} failed closed` };
    const hasNativeReadback = native.some((c) => /^[a-f0-9]{64}$/.test(c.artifact_hash || '') && c.worksheet_present);
    if (hasNativeReadback && gates.HG1_SEMANTIC_RULE_COMPLIANCE === 'pass' && gates.HG2_PROVENANCE_INTEGRITY === 'pass' && gates.HG3_INDEPENDENCE_GROUP_ISOLATION === 'pass' && gates.HG4_ARTIFACT_BINDING === 'pass' && gates.HG5_WORKSHEET_INTEGRITY === 'pass' && gates.HG6_VERDICT_DERIVATION_BOUNDED === 'pass') {
      return { verdict: VERDICT_VALUES.PREPARATION_ONLY, reason: 'launch: native_readback present but capped at PREPARATION_ONLY by historical evidence rule' };
    }
    if (native.length >= 1 && gates.HG1_SEMANTIC_RULE_COMPLIANCE === 'pass' && gates.HG2_PROVENANCE_INTEGRITY === 'pass') {
      return { verdict: VERDICT_VALUES.PREPARATION_ONLY, reason: 'launch: native_run EXECUTED present but no native_readback_hash' };
    }
    return { verdict: VERDICT_VALUES.NOT_PROVEN, reason: 'launch: insufficient native_run evidence' };
  }
  return { verdict: VERDICT_VALUES.NOT_PROVEN, reason: 'unhandled dimension' };
}

function deriveVerdicts(gates, classifications, options) {
  const dimDiag = {};
  const verdicts = {};
  for (const dim of Object.values(VERDICT_DIMENSIONS)) {
    const v = _dimensionVerdict(dim, classifications, gates);
    verdicts[dim] = v.verdict;
    dimDiag[dim] = v;
  }
  if (verdicts.launch === 'GO' || verdicts.launch === 'PASS_AUTOMATIC') {
    verdicts.launch = VERDICT_VALUES.NOT_PROVEN;
    dimDiag.launch = { verdict: VERDICT_VALUES.NOT_PROVEN, reason: 'launch dimension forbidden verdict demoted to NOT_PROVEN' };
  }
  return { verdicts, dimension_diagnostics: dimDiag };
}

// ---------------------------------------------------------------------------
// Blocker compiler
// ---------------------------------------------------------------------------

function compileClassificationBlockers(gates, classifications, verdicts) {
  const blockers = [];
  const gateMap = {
    HG1_SEMANTIC_RULE_COMPLIANCE: 'semantic_rule_compliance_pass',
    HG2_PROVENANCE_INTEGRITY: 'provenance_integrity_pass',
    HG3_INDEPENDENCE_GROUP_ISOLATION: 'independence_group_isolation_pass',
    HG4_ARTIFACT_BINDING: 'artifact_binding_pass',
    HG5_WORKSHEET_INTEGRITY: 'worksheet_integrity_pass',
    HG6_VERDICT_DERIVATION_BOUNDED: 'verdict_derivation_bounded_pass',
  };
  for (const [key, label] of Object.entries(gateMap)) {
    if (gates[key] === 'fail_closed') {
      blockers.push({ code: BLOCKER_CODES.HG_GATE_FAIL_CLOSED(key.split('_')[0], label), severity: 'blocking', gate_id: key, reason: `${label} failed closed` });
    } else if (gates[key] === 'not_proven') {
      blockers.push({ code: BLOCKER_CODES.HG_GATE_NOT_PROVEN(key.split('_')[0], label), severity: 'advisory', gate_id: key, reason: `${label} not proven` });
    }
  }
  for (const c of classifications) {
    for (const b of c.blockers) {
      blockers.push({ code: b.code, severity: b.severity, claim_id: c.claim_id, reason: b.reason });
    }
  }
  return blockers;
}

// ---------------------------------------------------------------------------
// Evidence builders
// ---------------------------------------------------------------------------

function _nowIso() { return new Date().toISOString(); }
function _countBy(list, key) {
  const out = {};
  for (const item of list) {
    const k = item[key] || '<null>';
    out[k] = (out[k] || 0) + 1;
  }
  return out;
}
function _perDimensionSummary(classifications, verdicts) {
  const out = {};
  for (const dim of Object.values(VERDICT_DIMENSIONS)) {
    const dimClaims = classifications.filter((c) => c.verdict_dimension === dim);
    out[dim] = {
      verdict: verdicts[dim] || VERDICT_VALUES.NOT_PROVEN,
      claim_count: dimClaims.length,
      executed_native_run_count: dimClaims.filter((c) => c.semantic_rule === SEMANTIC_RULES.EXECUTED && c.provenance_promotion && c.provenance_promotion.promotes === true).length,
      worksheet_present_count: dimClaims.filter((c) => c.worksheet_present).length,
      rejected_count: dimClaims.filter((c) => c.status === 'rejected').length,
    };
  }
  return out;
}

function buildProtocolEvidence({ classifications, gates, verdicts, blockers, paths, options }) {
  const opts = options || {};
  const pathsOut = paths || {};
  return {
    $schema: 'gsd/m016-s01-classification-protocol-v1',
    milestone: 'M016-txa3vu',
    slice: 'S01',
    task: 'T02',
    generated: _nowIso(),
    status: opts.status || 'protocol_recorded',
    hard_gate_ids: [...HARD_GATE_IDS],
    hard_gate_labels: { ...HARD_GATE_LABELS },
    gates: { ...gates },
    verdicts: { ...verdicts },
    classification_count: classifications.length,
    semantic_rule_distribution: _countBy(classifications, 'semantic_rule'),
    dimension_distribution: _countBy(classifications, 'verdict_dimension'),
    independence_groups_seen: new Set(classifications.map((c) => c.independence_group).filter(Boolean)).size,
    blocker_codes: blockers.map((b) => b.code),
    blockers_count: blockers.length,
    paths: {
      input_evidence: pathsOut.input || null,
      schema: pathsOut.schema || DEFAULTS.schema_path,
      output_dir: pathsOut.output_dir || DEFAULTS.output_dir,
      protocol_output: pathsOut.protocol || DEFAULTS.protocol_output,
      verification_output: pathsOut.verification || DEFAULTS.verification_output,
      validation_output: pathsOut.validation || DEFAULTS.validation_output,
    },
    redaction: { full_ids: false, credentials: false, xiaomi_endpoint_reuse: false, synthetic_bos: false, redaction_bounds_loaded: !!REDACTION_BOUNDS.uuid },
    options: { accept_safe_block: !!(opts.acceptSafeBlock), max_claim_diagnostics: opts.maxClaimDiagnostics || 16 },
  };
}

function buildVerificationEvidence({ classifications, gates, verdicts, blockers, gateDiagnostics, paths, options }) {
  const opts = options || {};
  const pathsOut = paths || {};
  return {
    $schema: 'gsd/m016-s01-classification-verification-v1',
    milestone: 'M016-txa3vu',
    slice: 'S01',
    task: 'T02',
    generated: _nowIso(),
    status: opts.status || 'verification_recorded',
    hard_gate_ids: [...HARD_GATE_IDS],
    hard_gate_labels: { ...HARD_GATE_LABELS },
    gates: { ...gates },
    diagnostics: gateDiagnostics || {},
    verdicts: { ...verdicts },
    per_claim_classification: classifications.map((c) => ({
      claim_id: c.claim_id,
      semantic_rule: c.semantic_rule,
      verdict_dimension: c.verdict_dimension,
      independence_group: c.independence_group,
      status: c.status,
      max_verdict: c.max_verdict,
      worksheet_present: c.worksheet_present,
      artifact_hash: c.artifact_hash,
      redaction_safe: c.redaction_safe,
      blocker_codes: c.blockers.map((b) => b.code),
    })),
    blockers,
    paths: {
      input_evidence: pathsOut.input || null,
      schema: pathsOut.schema || DEFAULTS.schema_path,
      output_dir: pathsOut.output_dir || DEFAULTS.output_dir,
      protocol_output: pathsOut.protocol || DEFAULTS.protocol_output,
      verification_output: pathsOut.verification || DEFAULTS.verification_output,
      validation_output: pathsOut.validation || DEFAULTS.validation_output,
    },
    redaction: { full_ids: false, credentials: false, xiaomi_endpoint_reuse: false, synthetic_bos: false, redaction_bounds_loaded: !!REDACTION_BOUNDS.uuid },
  };
}

function buildValidationEvidence({ classifications, gates, verdicts, blockers, gateDiagnostics, paths, options, regressionFixture }) {
  const opts = options || {};
  const pathsOut = paths || {};
  return {
    $schema: 'gsd/m016-s01-classification-validation-v1',
    milestone: 'M016-txa3vu',
    slice: 'S01',
    task: 'T02',
    generated: _nowIso(),
    status: opts.status || 'validation_recorded',
    hard_gate_ids: [...HARD_GATE_IDS],
    hard_gate_labels: { ...HARD_GATE_LABELS },
    gates: { ...gates },
    verdicts: { ...verdicts },
    per_claim_count: classifications.length,
    per_dimension_summary: _perDimensionSummary(classifications, verdicts),
    blockers,
    gate_diagnostics: gateDiagnostics || {},
    regression: regressionFixture || null,
    paths: {
      input_evidence: pathsOut.input || null,
      schema: pathsOut.schema || DEFAULTS.schema_path,
      output_dir: pathsOut.output_dir || DEFAULTS.output_dir,
      protocol_output: pathsOut.protocol || DEFAULTS.protocol_output,
      verification_output: pathsOut.verification || DEFAULTS.verification_output,
      validation_output: pathsOut.validation || DEFAULTS.validation_output,
    },
    redaction: { full_ids: false, credentials: false, xiaomi_endpoint_reuse: false, synthetic_bos: false, redaction_bounds_loaded: !!REDACTION_BOUNDS.uuid },
    runner_status: opts.runnerStatus || 'PASS',
    runner_exit_code: opts.runnerExitCode != null ? opts.runnerExitCode : EXIT_CODES.CLASSIFICATION_PASS,
  };
}

// ---------------------------------------------------------------------------
// Top-level orchestrator
// ---------------------------------------------------------------------------

function evaluateClassificationContract(input) {
  const inData = input || {};
  const claims = inData.claims;
  const schemaValidate = inData.schema && inData.schema.validate ? inData.schema.validate : null;
  const fail = (code, runnerStatus, runnerExitCode, reason) => ({
    runner_status: runnerStatus, runner_exit_code: runnerExitCode,
    blockers: [{ code, severity: 'blocking', reason }],
    gates: {}, classifications: [], verdicts: {}, diagnostics: {},
  });
  if (claims === undefined || claims === null) return fail(BLOCKER_CODES.CLAIMS_INPUT_MISSING, 'FAIL', EXIT_CODES.CLASSIFICATION_REJECTED_FAIL_CLOSED, 'claims input missing');
  if (!Array.isArray(claims)) return fail(BLOCKER_CODES.CLAIMS_INPUT_NOT_ARRAY, 'FAIL', EXIT_CODES.CLASSIFICATION_REJECTED_MALFORMED, 'claims input is not an array');
  if (claims.length === 0) return fail(BLOCKER_CODES.CLAIMS_EMPTY, 'FAIL', EXIT_CODES.CLASSIFICATION_REJECTED_FAIL_CLOSED, 'claims array empty');

  const classifications = claims.map((claim) => classifyClaim(claim, { schemaValidate }));
  const hgResult = evaluateHardGates(classifications, {});
  const gates = hgResult.gates;
  const gateDiagnostics = hgResult.diagnostics;
  const verdictResult = deriveVerdicts(gates, classifications, {});
  const verdicts = verdictResult.verdicts;
  const dimensionDiagnostics = verdictResult.dimension_diagnostics;
  const blockers = compileClassificationBlockers(gates, classifications, verdicts);

  const sanitisationSummary = {
    redaction_bounds_loaded: !!REDACTION_BOUNDS.uuid,
    redaction_safe_claims: classifications.filter((c) => c.redaction_safe).length,
    redaction_unsafe_claims: classifications.filter((c) => !c.redaction_safe).map((c) => c.claim_id),
    sanitisation_applied: true,
  };

  let runnerStatus, runnerExitCode;
  if (gates.HG1_SEMANTIC_RULE_COMPLIANCE === 'fail_closed' || gates.HG2_PROVENANCE_INTEGRITY === 'fail_closed') {
    runnerStatus = 'REJECTED_MALFORMED'; runnerExitCode = EXIT_CODES.CLASSIFICATION_REJECTED_MALFORMED;
  } else if (gates.HG3_INDEPENDENCE_GROUP_ISOLATION === 'fail_closed' || gates.HG4_ARTIFACT_BINDING === 'fail_closed') {
    runnerStatus = 'REJECTED_FAIL_CLOSED'; runnerExitCode = EXIT_CODES.CLASSIFICATION_REJECTED_FAIL_CLOSED;
  } else if (gates.HG5_WORKSHEET_INTEGRITY === 'fail_closed') {
    runnerStatus = 'GATE_NOT_PROVEN'; runnerExitCode = EXIT_CODES.CLASSIFICATION_GATE_NOT_PROVEN;
  } else if (gates.HG6_VERDICT_DERIVATION_BOUNDED === 'fail_closed') {
    runnerStatus = 'REJECTED_FAIL_CLOSED'; runnerExitCode = EXIT_CODES.CLASSIFICATION_REJECTED_FAIL_CLOSED;
  } else {
    runnerStatus = 'PASS'; runnerExitCode = EXIT_CODES.CLASSIFICATION_PASS;
  }

  return {
    runner_status: runnerStatus,
    runner_exit_code: runnerExitCode,
    gates, diagnostics: gateDiagnostics, classifications, verdicts,
    dimension_diagnostics: dimensionDiagnostics,
    blockers, sanitisation_summary: sanitisationSummary,
    schema_ok: !!schemaValidate,
  };
}

module.exports = {
  ROOT,
  BLOCKER_CODES, EXIT_CODES, DEFAULTS, REDACTION_BOUNDS,
  HARD_GATE_IDS, HARD_GATE_LABELS, VERDICT_DIMENSIONS, VERDICT_VALUES,
  SEMANTIC_RULES, PROVENANCE_KINDS, WORKSHEET_CONTRACT,
  IDENTITY_KIND, CANONICAL_AGENT_NAMES: data.CANONICAL_AGENT_NAMES, AGENT_NAMES_SET,
  VERDICT_DERIVATION_RULES, INDEPENDENCE_GROUPS: data.INDEPENDENCE_GROUPS,
  loadSchema, classifyClaim, validateClaimShape,
  evaluateHardGates, deriveVerdicts, compileClassificationBlockers,
  evaluateClassificationContract,
  buildProtocolEvidence, buildVerificationEvidence, buildValidationEvidence,
  sanitizeString, checkRedactionSafety, assertWriteSafe,
  _checkSourceRef, _checkProvenance, _checkWorksheet, _checkObservedRefs, _checkDiagnostic,
  _dimensionVerdict,
};
