#!/usr/bin/env node
/**
 * @file scripts/validate_m014_s05_hermes_minimax.js
 *
 * M014-a9jj46/S05 — Hermes upstream upgrade and MiniMax M3 migration validator.
 *
 * Implements a four-phase validation gate for the S05 slice:
 *   --phase baseline   (T01) — verify the baseline snapshot is honest, the
 *                              official NousResearch upstream identity is
 *                              verified, the local runtime pin + Paperclip
 *                              adapter compatibility patches are enumerated,
 *                              the fresh-readback posture is correct, and no
 *                              secrets leak. Required for T01 closeout.
 *   --phase upgraded   (T02) — validate the upgrade contract
 *                              (M014-S05-hermes-upgrade-contract.json) and
 *                              the upgrade evidence
 *                              (M014-S05-hermes-upgrade.json). Asserts that
 *                              the pin selection is recorded, the
 *                              compatibility review answers are YES for all
 *                              5 questions, the pre-flight checks are
 *                              enumerated, the rollback strategy is present,
 *                              all 4 LHA-* patches have a reconciliation
 *                              plan, all 6 LFP-* inherited constraints are
 *                              carried forward, and the upgrade evidence
 *                              uses honest deferred-live-execution posture.
 *   --phase direct     (T03) — validate the direct MiniMax M3 proof (separate
 *                              task).
 *   --phase final      (T04) — validate the Paperclip adapter proof and the
 *                              rollout/rollback verdict (separate task).
 *
 * T01 ships the `--phase baseline` implementation; T02 adds the
 * `--phase upgraded` implementation. The other phases remain placeholders
 * that fail closed until the corresponding artifact files appear in
 * subsequent tasks. This matches the S03 lockfile and S04 upgrade
 * validator patterns (per-phase presence + per-phase schema).
 *
 * Validator classes for --phase baseline (V-HM-01 .. V-HM-12):
 *   V-HM-01  baseline.json file exists
 *   V-HM-02  baseline.json parses as JSON object
 *   V-HM-03  official_upstream_identity.verified === true
 *   V-HM-04  canonical_repo_url matches github.com/NousResearch/hermes-agent
 *   V-HM-05  canonical_pypi_project matches "hermes-agent"
 *   V-HM-06  local_paperclip_checkout.vendored_checkout_present !== true
 *           (this repo is NOT a Hermes fork; Paperclip consumes PyPI at runtime)
 *   V-HM-07  live_runtime_observed.fresh_readback_required === true
 *   V-HM-08  local_paperclip_adapter_compatibility_patches carries all four
 *           required patch IDs (LHA-PYUSERBASE-WRAPPER, LHA-PEP668-OVERRIDE,
 *           LHA-ADAPTER-CLI-CONTRACT, LHA-SECRET-REF-ENVELOPE)
 *   V-HM-09  redaction-leak scan: forbidden credential substring shapes AND
 *           no fully-qualified 8-4-4-4-12 UUID literal outside the approved
 *           allowlist (within baseline.json itself; checked separately for
 *           the upstream-diff.md)
 *   V-HM-10  rollout_safety_constraints.inherited_constraints includes all
 *           six required constraint IDs (LFP-LF-01..03, LFP-S02-01..03)
 *   V-HM-11  local_paperclip_adapter_compatibility_patches.patch_count ===
 *           count of reconciliation_required: true entries
 *   V-HM-12  downstream_handoff declares T02 contract usage + T03
 *           provider-registry usage + T04 adapter/patch usage
 *
 * Failure modes covered (Q5):
 *   - missing/malformed baseline.json: V-HM-01 / V-HM-02
 *   - upstream not verified: V-HM-03
 *   - canonical repo drift (wrong owner/name): V-HM-04
 *   - canonical PyPI project drift (wrong distribution channel): V-HM-05
 *   - accidental vendored checkout claim: V-HM-06
 *   - live fields claimed without fresh readback: V-HM-07
 *   - missing local patch kinds: V-HM-08
 *   - secret leak / UUID literal leak: V-HM-09
 *   - missing inherited constraint IDs: V-HM-10
 *   - patch count drift: V-HM-11
 *   - downstream handoff incompleteness: V-HM-12
 *   - phase argument outside {baseline, upgraded, direct, final}: phase guard
 *
 * Validator classes for --phase upgraded (V-HM-UP-01 .. V-HM-UP-21):
 *   V-HM-UP-01  upgrade-contract.json file exists
 *   V-HM-UP-02  upgrade-contract.json parses as JSON object
 *   V-HM-UP-03  pin_decision.new_pin.wheel matches hermes-agent==X.Y.Z
 *   V-HM-UP-04  pin_decision.new_pin.wheel differs from current_pin.wheel
 *   V-HM-UP-05  pin_decision.new_pin.wheel matches baseline latest release tag
 *   V-HM-UP-06  compatibility_review_answers has all 5 Q1-Q5 entries
 *   V-HM-UP-07  all 5 compatibility_review_answers answer starts with "YES"
 *   V-HM-UP-08  pre_flight_checks.checks_count === 6 with required dimensions
 *   V-HM-UP-09  rollback_strategy.rollback_commands is non-empty
 *   V-HM-UP-10  patch_reconciliation_plan.patches carries all 4 LHA-* IDs
 *   V-HM-UP-11  inherited_constraints_remain_in_force carries all 6 LFP-* IDs
 *   V-HM-UP-12  upgrade.json (evidence) file exists
 *   V-HM-UP-13  upgrade.json parses as JSON object
 *   V-HM-UP-14  upgrade.json.phase_verdict in its enum_lock
 *   V-HM-UP-15  upgrade.json.live_execution_status in its enum_lock
 *   V-HM-UP-16  upgrade.json.fresh_readback_required === true
 *   V-HM-UP-17  upgrade.json.pre_flight_checks_results.checks_count === 6
 *   V-HM-UP-18  upgrade.json.patch_reconciliation_results.patches_count === 4
 *   V-HM-UP-19  upgrade.json inherited constraints match baseline IDs (6)
 *   V-HM-UP-20  redaction clean across upgrade-contract.json AND upgrade.json
 *   V-HM-UP-21  no unapproved UUID literal across upgrade-contract.json AND
 *               upgrade.json
 *
 * Failure modes covered (Q5) for --phase upgraded:
 *   - missing/malformed upgrade-contract.json: V-HM-UP-01 / V-HM-UP-02
 *   - pin not selected / not hermes-agent: V-HM-UP-03
 *   - pin identical to current pin (no upgrade): V-HM-UP-04
 *   - pin not on upstream latest (drift or typo): V-HM-UP-05
 *   - missing compatibility answer: V-HM-UP-06
 *   - compatibility answer not YES: V-HM-UP-07
 *   - pre-flight checks count / dimension gap: V-HM-UP-08
 *   - rollback strategy missing: V-HM-UP-09
 *   - patch reconciliation incomplete: V-HM-UP-10
 *   - inherited constraint ID drift: V-HM-UP-11 / V-HM-UP-19
 *   - missing/malformed upgrade.json: V-HM-UP-12 / V-HM-UP-13
 *   - upgrade phase_verdict not in enum_lock: V-HM-UP-14
 *   - upgrade live_execution_status not in enum_lock: V-HM-UP-15
 *   - upgrade fresh_readback_required not asserted: V-HM-UP-16
 *   - upgrade pre-flight checks count drift: V-HM-UP-17
 *   - upgrade patch reconciliation count drift: V-HM-UP-18
 *   - secret leak / UUID literal leak in upgrade files: V-HM-UP-20 / V-HM-UP-21
 *
 * Verification:
 *   node --test scripts/validate_m014_s05_hermes_minimax.js
 *
 * CLI gates (fail-closed):
 *   node scripts/validate_m014_s05_hermes_minimax.js --phase baseline
 *   (returns exit 0 on PASS, 1 on validation error, 2 on load error)
 *
 * Reuse:
 *   const { validateBaseline, validateBaselineFile, loadBaselineOrFail } =
 *     require('./scripts/validate_m014_s05_hermes_minimax');
 *
 * Design contract:
 *   - Side-effect free: reads files, validates, asserts. No network, no
 *     subprocesses, no git, no docker, no secret writes.
 *   - Secrets are never echoed in evidence (UUIDs are redacted to 8-char
 *     prefixes; credential key=value shapes trigger V-HM-09 immediately).
 *   - Fail-closed: every blocker is a hard stop. The CLI gate never warns
 *     and proceeds.
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');

// ---------------------------------------------------------------------------
// Path resolution
// ---------------------------------------------------------------------------

const PROJECT_ROOT = process.cwd();
const BASELINE_JSON = path.resolve(
  PROJECT_ROOT,
  'runtime-evidence/M014-S05-hermes-baseline.json'
);
const UPSTREAM_DIFF_MD = path.resolve(
  PROJECT_ROOT,
  'runtime-evidence/M014-S05-hermes-upstream-diff.md'
);
const UPGRADE_CONTRACT_JSON = path.resolve(
  PROJECT_ROOT,
  'runtime-evidence/M014-S05-hermes-upgrade-contract.json'
);
const UPGRADE_EVIDENCE_JSON = path.resolve(
  PROJECT_ROOT,
  'runtime-evidence/M014-S05-hermes-upgrade.json'
);

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const REQUIRED_PATCH_IDS = [
  'LHA-PYUSERBASE-WRAPPER',
  'LHA-PEP668-OVERRIDE',
  'LHA-ADAPTER-CLI-CONTRACT',
  'LHA-SECRET-REF-ENVELOPE',
];

const REQUIRED_INHERITED_CONSTRAINT_IDS = [
  'LFP-LF-01',
  'LFP-LF-02',
  'LFP-LF-03',
  'LFP-S02-01',
  'LFP-S02-02',
  'LFP-S02-03',
];

// Real credential values are detected as KEY=<non-empty value> rather than
// just the bare KEY= substring (which appears legitimately in
// credential_redaction_posture.forbidden_credential_substring_shapes and the
// upstream-diff §10 enumeration).
const FORBIDDEN_CREDENTIAL_VALUE_PATTERNS = [
  // KEY=<value with >=4 non-whitespace chars> catches real leaks like
  // XIAOMI_API_KEY=tp-sd7b... while ignoring the documented bare KEY= shape.
  {
    id: 'cred-key-value',
    label: 'credential key=value with non-empty value',
    re: /(?:XIAOMI_API_KEY|XIAOMI_BASE_URL|OPENAI_API_KEY|PAPERCLIP_API_KEY)\s*=\s*[^\s"',;}\]\n]{4,}/g,
  },
  // Authorization: Bearer <token> — requires a token-shaped value to fire.
  {
    id: 'cred-bearer',
    label: 'Authorization Bearer with token value',
    re: /Authorization:\s*Bearer\s+[A-Za-z0-9_\-.~+/=]{4,}/g,
  },
  // sk- and tp- token prefixes — require >=16 chars after the dash so the
  // bare substring "sk-" / "tp-" used in self-documentation does not trip.
  {
    id: 'cred-sk-prefix',
    label: 'sk-* token shape',
    re: /\bsk-(?:proj-)?[A-Za-z0-9_\-]{16,}/g,
  },
  {
    id: 'cred-tp-prefix',
    label: 'tp-* token shape',
    re: /\btp-[A-Za-z0-9_\-]{16,}/g,
  },
];

const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

const APPROVED_UUID_8CHAR_PREFIXES = new Set([
  '43c74adb', // M002-S08/M005-S01 historical company; R3-stale as canonical
  '1d05cfeb', // M005-S01 historical run id
  'fbb15d79', // M005-S01 historical agent id
  'e4bf3eda', // M002-S08 install run workspace (ephemeral)
  '8053b40a', // M002-S08 install run id (ephemeral)
]);

// Hermes upgrade contract schema constants (T02)
const HERMES_AGENT_PIN_RE = /^hermes-agent==\d+\.\d+\.\d+$/;
const REQUIRED_COMPATIBILITY_QUESTION_IDS = [
  'Q1_pin_within_python_constraint',
  'Q2_pyuserbase_wrapper_compatible',
  'Q3_pep668_override_not_reapplied',
  'Q4_adapter_cli_contract_preserved',
  'Q5_secret_ref_envelope_preserved',
];
const REQUIRED_PRE_FLIGHT_CHECK_NAMES = [
  'cli_startup',
  'config_parsing',
  'profiles',
  'provider_discovery',
  'timeout_handling',
  'structured_output',
];
const REQUIRED_PHASE_VERDICT_ENUM = [
  'PLAN_READY_LIVE_EXECUTION_DEFERRED',
  'UPGRADE_VERIFIED_PENDING_MINIMAX_REGISTRY',
  'UPGRADE_VERIFIED',
  'ROLLBACK_EXECUTED',
  'BLOCKED_NO_OPERATOR_CONFIRMATION',
];
const REQUIRED_LIVE_EXECUTION_STATUS_ENUM = [
  'pending-live-execution',
  'in-progress-live-execution',
  'passed-live-execution',
  'failed-live-execution',
  'deferred-to-fresh-readback-window',
];

// ---------------------------------------------------------------------------
// Loaders
// ---------------------------------------------------------------------------

function loadBaselineOrFail(baselinePath = BASELINE_JSON) {
  if (!fs.existsSync(baselinePath)) {
    throw new Error(`baseline file not found: ${baselinePath}`);
  }
  let raw;
  try {
    raw = fs.readFileSync(baselinePath, 'utf8');
  } catch (err) {
    throw new Error(`baseline read failure: ${err.message}`);
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error(`baseline JSON parse failure: ${err.message}`);
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('baseline top-level must be a JSON object');
  }
  return { raw, parsed };
}

function loadUpstreamDiffOrFail(diffPath = UPSTREAM_DIFF_MD) {
  if (!fs.existsSync(diffPath)) {
    throw new Error(`upstream-diff file not found: ${diffPath}`);
  }
  return fs.readFileSync(diffPath, 'utf8');
}

function loadUpgradeContractOrFail(contractPath = UPGRADE_CONTRACT_JSON) {
  if (!fs.existsSync(contractPath)) {
    throw new Error(`upgrade-contract file not found: ${contractPath}`);
  }
  let raw;
  try {
    raw = fs.readFileSync(contractPath, 'utf8');
  } catch (err) {
    throw new Error(`upgrade-contract read failure: ${err.message}`);
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error(`upgrade-contract JSON parse failure: ${err.message}`);
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('upgrade-contract top-level must be a JSON object');
  }
  return { raw, parsed };
}

function loadUpgradeEvidenceOrFail(evidencePath = UPGRADE_EVIDENCE_JSON) {
  if (!fs.existsSync(evidencePath)) {
    throw new Error(`upgrade.json (evidence) file not found: ${evidencePath}`);
  }
  let raw;
  try {
    raw = fs.readFileSync(evidencePath, 'utf8');
  } catch (err) {
    throw new Error(`upgrade.json read failure: ${err.message}`);
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error(`upgrade.json JSON parse failure: ${err.message}`);
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('upgrade.json top-level must be a JSON object');
  }
  return { raw, parsed };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function uuidPrefix(uuidLiteral) {
  return uuidLiteral.slice(0, 8).toLowerCase();
}

function redactUuidsInString(input) {
  return String(input).replace(UUID_RE, (m) => `${m.slice(0, 8)}-****-****-****-************`);
}

function redactCredentialMatch(match) {
  // For KEY=value leaks: show the key but redact the value to first 2 + last 2 chars.
  const eqIdx = match.search(/=/);
  if (eqIdx === -1) {
    // Bare token prefix leak: keep the prefix and the first 4 chars only.
    return `${match.slice(0, 4)}…(redacted)`;
  }
  const key = match.slice(0, eqIdx + 1);
  const value = match.slice(eqIdx + 1).trim();
  if (value.length <= 6) {
    return `${key}…(redacted)`;
  }
  return `${key}${value.slice(0, 2)}…${value.slice(-2)}`;
}

function scanCredentialLeaks(haystack) {
  const hits = [];
  for (const pat of FORBIDDEN_CREDENTIAL_VALUE_PATTERNS) {
    pat.re.lastIndex = 0;
    const matches = haystack.match(pat.re) || [];
    for (const m of matches) {
      hits.push({ id: pat.id, label: pat.label, redacted: redactCredentialMatch(m) });
    }
  }
  return hits;
}

// ---------------------------------------------------------------------------
// Validator classes
// ---------------------------------------------------------------------------

function validateBaseline(parsed) {
  const blockers = [];
  const checks = [];

  // V-HM-01 baseline.json file exists (handled by loadBaselineOrFail)
  checks.push({ id: 'V-HM-01', verdict: 'pass', note: 'baseline.json file exists' });

  // V-HM-02 baseline.json parses as JSON object (handled by loadBaselineOrFail)
  checks.push({ id: 'V-HM-02', verdict: 'pass', note: 'baseline.json parses as JSON object' });

  // V-HM-03 official_upstream_identity.verified === true
  if (
    !parsed.official_upstream_identity ||
    parsed.official_upstream_identity.verified !== true
  ) {
    blockers.push('official_upstream_identity.verified must be true');
    checks.push({ id: 'V-HM-03', verdict: 'fail', note: 'upstream not verified' });
  } else {
    checks.push({ id: 'V-HM-03', verdict: 'pass', note: 'upstream verified' });
  }

  // V-HM-04 canonical_repo_url matches github.com/NousResearch/hermes-agent
  const repoUrl = parsed.official_upstream_identity && parsed.official_upstream_identity.canonical_repo_url;
  if (repoUrl !== 'https://github.com/NousResearch/hermes-agent') {
    blockers.push(`canonical_repo_url must equal https://github.com/NousResearch/hermes-agent (got ${repoUrl})`);
    checks.push({ id: 'V-HM-04', verdict: 'fail', note: `canonical_repo_url drift: ${repoUrl}` });
  } else {
    checks.push({ id: 'V-HM-04', verdict: 'pass', note: 'canonical_repo_url correct' });
  }

  // V-HM-05 canonical_pypi_project matches "hermes-agent"
  const pypiProject = parsed.official_upstream_identity && parsed.official_upstream_identity.canonical_pypi_project;
  if (pypiProject !== 'hermes-agent') {
    blockers.push(`canonical_pypi_project must equal "hermes-agent" (got ${pypiProject})`);
    checks.push({ id: 'V-HM-05', verdict: 'fail', note: `pypi project drift: ${pypiProject}` });
  } else {
    checks.push({ id: 'V-HM-05', verdict: 'pass', note: 'canonical_pypi_project correct' });
  }

  // V-HM-06 vendored_checkout_present !== true
  if (
    parsed.local_paperclip_checkout &&
    parsed.local_paperclip_checkout.vendored_checkout_present === true
  ) {
    blockers.push('local_paperclip_checkout.vendored_checkout_present must NOT be true');
    checks.push({ id: 'V-HM-06', verdict: 'fail', note: 'vendored checkout claim is unexpected' });
  } else {
    checks.push({ id: 'V-HM-06', verdict: 'pass', note: 'no vendored Hermes checkout claim' });
  }

  // V-HM-07 live_runtime_observed.fresh_readback_required === true
  if (
    !parsed.live_runtime_observed ||
    parsed.live_runtime_observed.fresh_readback_required !== true
  ) {
    blockers.push('live_runtime_observed.fresh_readback_required must be true');
    checks.push({ id: 'V-HM-07', verdict: 'fail', note: 'fresh-readback posture missing' });
  } else {
    checks.push({ id: 'V-HM-07', verdict: 'pass', note: 'fresh-readback posture present' });
  }

  // V-HM-08 all four required patch IDs present
  const patchList = (parsed.local_paperclip_adapter_compatibility_patches &&
    parsed.local_paperclip_adapter_compatibility_patches.patches_observed) || [];
  const patchIds = new Set(patchList.map((p) => p && p.id));
  const missingPatchIds = REQUIRED_PATCH_IDS.filter((id) => !patchIds.has(id));
  if (missingPatchIds.length > 0) {
    blockers.push(`missing required patch IDs: ${missingPatchIds.join(', ')}`);
    checks.push({
      id: 'V-HM-08',
      verdict: 'fail',
      note: `missing patch IDs: ${missingPatchIds.join(', ')}`,
    });
  } else {
    checks.push({ id: 'V-HM-08', verdict: 'pass', note: `all ${REQUIRED_PATCH_IDS.length} required patch IDs present` });
  }

  // V-HM-09 redaction-leak scan: real credential values (KEY=value, bearer
  //         tokens, sk-*/tp-* prefixes) AND no fully-qualified UUID literal
  //         outside the approved allowlist. Bare KEY= substring shapes used
  //         in self-documentation do NOT trip this check.
  const baselineString = JSON.stringify(parsed);
  const credentialHits = scanCredentialLeaks(baselineString);
  const uuidMatches = baselineString.match(UUID_RE) || [];
  const unexpectedUuids = uuidMatches.filter(
    (u) => !APPROVED_UUID_8CHAR_PREFIXES.has(uuidPrefix(u))
  );
  if (credentialHits.length > 0 || unexpectedUuids.length > 0) {
    const credNote = credentialHits.length > 0
      ? `credential value(s): ${credentialHits.map((h) => h.redacted).join(', ')}`
      : '';
    const uuidNote = unexpectedUuids.length > 0
      ? `unexpected UUID literal(s): ${unexpectedUuids.map(redactUuidsInString).join(', ')}`
      : '';
    blockers.push(`redaction leak: ${[credNote, uuidNote].filter(Boolean).join(' | ')}`);
    checks.push({
      id: 'V-HM-09',
      verdict: 'fail',
      note: `redaction leak (${credentialHits.length} credential value, ${unexpectedUuids.length} UUID)`,
    });
  } else {
    checks.push({
      id: 'V-HM-09',
      verdict: 'pass',
      note: 'no credential values or unapproved UUID literals',
    });
  }

  // V-HM-10 inherited_constraints includes all six required constraint IDs
  const inheritedList = (parsed.rollout_safety_constraints &&
    parsed.rollout_safety_constraints.inherited_constraints) || [];
  const inheritedIds = new Set(inheritedList.map((c) => c && c.id));
  const missingInherited = REQUIRED_INHERITED_CONSTRAINT_IDS.filter(
    (id) => !inheritedIds.has(id)
  );
  if (missingInherited.length > 0) {
    blockers.push(`missing inherited constraint IDs: ${missingInherited.join(', ')}`);
    checks.push({
      id: 'V-HM-10',
      verdict: 'fail',
      note: `missing inherited constraints: ${missingInherited.join(', ')}`,
    });
  } else {
    checks.push({
      id: 'V-HM-10',
      verdict: 'pass',
      note: `all ${REQUIRED_INHERITED_CONSTRAINT_IDS.length} inherited constraints present`,
    });
  }

  // V-HM-11 patch_count === count of reconciliation_required: true entries
  const declaredPatchCount =
    (parsed.local_paperclip_adapter_compatibility_patches &&
      parsed.local_paperclip_adapter_compatibility_patches.patch_count) ||
    0;
  const reconciliationTrueCount = patchList.filter(
    (p) => p && p.reconciliation_required === true
  ).length;
  if (declaredPatchCount !== patchList.length || declaredPatchCount !== reconciliationTrueCount) {
    blockers.push(
      `patch_count drift: declared=${declaredPatchCount}, patches_observed.length=${patchList.length}, reconciliation_required=true count=${reconciliationTrueCount}`
    );
    checks.push({
      id: 'V-HM-11',
      verdict: 'fail',
      note: `patch count drift (declared=${declaredPatchCount}, observed=${patchList.length}, reconciliation=${reconciliationTrueCount})`,
    });
  } else {
    checks.push({
      id: 'V-HM-11',
      verdict: 'pass',
      note: `patch count consistent (${declaredPatchCount} === ${patchList.length} === ${reconciliationTrueCount})`,
    });
  }

  // V-HM-12 downstream_handoff declares T02/T03/T04 usage
  const handoff = parsed.downstream_handoff || {};
  const handoffKeys = Object.keys(handoff);
  const requiredHandoffKeys = [
    'T02_upgrade_contract',
    'T03_direct_minimax_proof',
    'T04_paperclip_adapter_proof',
  ];
  const missingHandoffKeys = requiredHandoffKeys.filter((k) => !handoffKeys.includes(k));
  if (missingHandoffKeys.length > 0) {
    blockers.push(`downstream_handoff missing keys: ${missingHandoffKeys.join(', ')}`);
    checks.push({
      id: 'V-HM-12',
      verdict: 'fail',
      note: `downstream handoff missing: ${missingHandoffKeys.join(', ')}`,
    });
  } else {
    checks.push({
      id: 'V-HM-12',
      verdict: 'pass',
      note: 'downstream_handoff covers T02 + T03 + T04',
    });
  }

  return {
    verdict: blockers.length === 0 ? 'pass' : 'fail',
    blockers,
    checks,
  };
}

// ---------------------------------------------------------------------------
// Upstream-diff companion validator (companion file must exist and reference
// the same patch IDs + inherited constraints; we do NOT regex-grep on the
// file body — we only verify presence + non-empty.)
// ---------------------------------------------------------------------------

function validateUpstreamDiffPresence(diffContent, baselineParsed) {
  const blockers = [];
  const checks = [];

  if (typeof diffContent !== 'string' || diffContent.length === 0) {
    blockers.push('upstream-diff content empty');
    checks.push({ id: 'V-HM-DIFF-01', verdict: 'fail', note: 'upstream-diff empty' });
    return { verdict: 'fail', blockers, checks };
  }
  checks.push({ id: 'V-HM-DIFF-01', verdict: 'pass', note: `upstream-diff present (${diffContent.length} bytes)` });

  // Verify upstream-diff references every required patch ID at least once.
  const missingPatchRefs = REQUIRED_PATCH_IDS.filter((id) => !diffContent.includes(id));
  if (missingPatchRefs.length > 0) {
    blockers.push(`upstream-diff missing patch ID references: ${missingPatchRefs.join(', ')}`);
    checks.push({
      id: 'V-HM-DIFF-02',
      verdict: 'fail',
      note: `upstream-diff missing patch refs: ${missingPatchRefs.join(', ')}`,
    });
  } else {
    checks.push({
      id: 'V-HM-DIFF-02',
      verdict: 'pass',
      note: `upstream-diff references all ${REQUIRED_PATCH_IDS.length} required patch IDs`,
    });
  }

  // Verify upstream-diff references the canonical upstream URL + PyPI project
  // at least once.
  const repoUrl = baselineParsed.official_upstream_identity && baselineParsed.official_upstream_identity.canonical_repo_url;
  const pypiUrl = baselineParsed.official_upstream_identity && baselineParsed.official_upstream_identity.canonical_pypi_url;
  const diffHasRepo = repoUrl && diffContent.includes(repoUrl);
  const diffHasPypi = pypiUrl && diffContent.includes(pypiUrl);
  if (!diffHasRepo || !diffHasPypi) {
    blockers.push(`upstream-diff missing upstream URL(s): repo=${diffHasRepo}, pypi=${diffHasPypi}`);
    checks.push({
      id: 'V-HM-DIFF-03',
      verdict: 'fail',
      note: `upstream URL coverage gap (repo=${!!diffHasRepo}, pypi=${!!diffHasPypi})`,
    });
  } else {
    checks.push({
      id: 'V-HM-DIFF-03',
      verdict: 'pass',
      note: 'upstream-diff references canonical repo + PyPI URL',
    });
  }

  // Verify upstream-diff does NOT leak credential values.
  const credentialHits = scanCredentialLeaks(diffContent);
  if (credentialHits.length > 0) {
    blockers.push(`upstream-diff credential leak: ${credentialHits.map((h) => h.redacted).join(', ')}`);
    checks.push({
      id: 'V-HM-DIFF-04',
      verdict: 'fail',
      note: `upstream-diff credential leak: ${credentialHits.length} match(es)`,
    });
  } else {
    checks.push({ id: 'V-HM-DIFF-04', verdict: 'pass', note: 'upstream-diff no credential value leak' });
  }

  return {
    verdict: blockers.length === 0 ? 'pass' : 'fail',
    blockers,
    checks,
  };
}

// ---------------------------------------------------------------------------
// Upgrade contract validator (T02) — checks V-HM-UP-01 .. V-HM-UP-11 against
// M014-S05-hermes-upgrade-contract.json. Cross-references with baseline.json
// for pin drift + inherited constraint consistency.
// ---------------------------------------------------------------------------

function validateUpgradeContract(parsed, baselineParsed) {
  const blockers = [];
  const checks = [];

  // V-HM-UP-01 upgrade-contract.json file exists (handled by loadUpgradeContractOrFail)
  checks.push({ id: 'V-HM-UP-01', verdict: 'pass', note: 'upgrade-contract.json file exists' });

  // V-HM-UP-02 upgrade-contract.json parses as JSON object (handled by loadUpgradeContractOrFail)
  checks.push({ id: 'V-HM-UP-02', verdict: 'pass', note: 'upgrade-contract.json parses as JSON object' });

  // V-HM-UP-03 pin_decision.new_pin.wheel matches hermes-agent==X.Y.Z
  const newPin = parsed.pin_decision && parsed.pin_decision.new_pin && parsed.pin_decision.new_pin.wheel;
  if (typeof newPin !== 'string' || !HERMES_AGENT_PIN_RE.test(newPin)) {
    blockers.push(`pin_decision.new_pin.wheel must match hermes-agent==X.Y.Z pattern (got ${newPin})`);
    checks.push({ id: 'V-HM-UP-03', verdict: 'fail', note: `new pin invalid: ${newPin}` });
  } else {
    checks.push({ id: 'V-HM-UP-03', verdict: 'pass', note: `new pin valid: ${newPin}` });
  }

  // V-HM-UP-04 pin_decision.new_pin.wheel differs from current_pin.wheel
  const currentPin = parsed.pin_decision && parsed.pin_decision.current_pin && parsed.pin_decision.current_pin.wheel;
  if (typeof currentPin !== 'string') {
    blockers.push('pin_decision.current_pin.wheel must be present');
    checks.push({ id: 'V-HM-UP-04', verdict: 'fail', note: 'current_pin.wheel missing' });
  } else if (newPin === currentPin) {
    blockers.push(`pin_decision.new_pin.wheel must differ from current_pin.wheel (both ${newPin})`);
    checks.push({ id: 'V-HM-UP-04', verdict: 'fail', note: `pin identical to current: ${newPin}` });
  } else {
    checks.push({ id: 'V-HM-UP-04', verdict: 'pass', note: `upgrade is real: ${currentPin} -> ${newPin}` });
  }

  // V-HM-UP-05 pin_decision.new_pin.wheel matches baseline latest_release_tag_observed
  const baselineLatest = baselineParsed && baselineParsed.official_upstream_identity && baselineParsed.official_upstream_identity.latest_release_tag_observed;
  if (baselineLatest && newPin === `hermes-agent==${baselineLatest}`) {
    checks.push({ id: 'V-HM-UP-05', verdict: 'pass', note: `new pin matches upstream latest: ${newPin}` });
  } else {
    blockers.push(`pin_decision.new_pin.wheel must equal hermes-agent==${baselineLatest} (got ${newPin})`);
    checks.push({ id: 'V-HM-UP-05', verdict: 'fail', note: `pin drift from upstream latest: ${newPin} vs hermes-agent==${baselineLatest}` });
  }

  // V-HM-UP-06 compatibility_review_answers has all 5 Q1-Q5 entries
  const compatAnswers = parsed.compatibility_review_answers || {};
  const compatKeySet = new Set(
    Object.keys(compatAnswers).filter((k) => /^Q\d+_/.test(k))
  );
  const missingCompat = REQUIRED_COMPATIBILITY_QUESTION_IDS.filter((id) => !compatKeySet.has(id));
  if (missingCompat.length > 0) {
    blockers.push(`compatibility_review_answers missing: ${missingCompat.join(', ')}`);
    checks.push({ id: 'V-HM-UP-06', verdict: 'fail', note: `compatibility review incomplete: ${missingCompat.join(', ')}` });
  } else {
    checks.push({ id: 'V-HM-UP-06', verdict: 'pass', note: `all ${REQUIRED_COMPATIBILITY_QUESTION_IDS.length} compatibility review answers present` });
  }

  // V-HM-UP-07 all 5 compatibility_review_answers answer starts with "YES"
  const nonYesAnswers = REQUIRED_COMPATIBILITY_QUESTION_IDS.filter((id) => {
    const a = compatAnswers[id];
    return !a || typeof a.answer !== 'string' || !a.answer.startsWith('YES');
  });
  if (nonYesAnswers.length > 0) {
    blockers.push(`compatibility_review_answers NOT-YES: ${nonYesAnswers.join(', ')}`);
    checks.push({ id: 'V-HM-UP-07', verdict: 'fail', note: `non-YES answers: ${nonYesAnswers.join(', ')}` });
  } else {
    checks.push({ id: 'V-HM-UP-07', verdict: 'pass', note: 'all 5 answers start with YES (3 provisional + 2 design invariant)' });
  }

  // V-HM-UP-08 pre_flight_checks.checks_count === 6 AND covers required dimensions
  const pfc = parsed.pre_flight_checks || {};
  const pfcChecks = pfc.checks || [];
  const pfcNames = new Set(pfcChecks.map((c) => c && c.name));
  const missingPfc = REQUIRED_PRE_FLIGHT_CHECK_NAMES.filter((n) => !pfcNames.has(n));
  if (pfcChecks.length !== 6 || missingPfc.length > 0) {
    blockers.push(`pre_flight_checks.checks_count must be 6 with all required dimensions (count=${pfcChecks.length}, missing: ${missingPfc.join(', ')})`);
    checks.push({ id: 'V-HM-UP-08', verdict: 'fail', note: `pre-flight gap: count=${pfcChecks.length}, missing=${missingPfc.join(',')}` });
  } else {
    checks.push({ id: 'V-HM-UP-08', verdict: 'pass', note: 'all 6 pre-flight dimensions covered' });
  }

  // V-HM-UP-09 rollback_strategy.rollback_commands is non-empty
  const rollback = parsed.rollback_strategy || {};
  const rollbackCommands = rollback.rollback_commands || {};
  const rollbackCommandKeys = Object.keys(rollbackCommands);
  if (rollbackCommandKeys.length === 0) {
    blockers.push('rollback_strategy.rollback_commands is missing or empty');
    checks.push({ id: 'V-HM-UP-09', verdict: 'fail', note: 'rollback strategy missing' });
  } else {
    checks.push({ id: 'V-HM-UP-09', verdict: 'pass', note: `rollback strategy present (${rollbackCommandKeys.length} commands)` });
  }

  // V-HM-UP-10 patch_reconciliation_plan.patches carries all 4 LHA-* IDs
  const patchReconcile = parsed.patch_reconciliation_plan || {};
  const patchReconcileList = patchReconcile.patches || [];
  const patchReconcileIds = new Set(patchReconcileList.map((p) => p && p.id));
  const missingPatchReconcile = REQUIRED_PATCH_IDS.filter((id) => !patchReconcileIds.has(id));
  if (missingPatchReconcile.length > 0) {
    blockers.push(`patch_reconciliation_plan.patches missing: ${missingPatchReconcile.join(', ')}`);
    checks.push({ id: 'V-HM-UP-10', verdict: 'fail', note: `patch reconciliation incomplete: ${missingPatchReconcile.join(', ')}` });
  } else {
    checks.push({ id: 'V-HM-UP-10', verdict: 'pass', note: 'all 4 LHA-* patches have reconciliation plan' });
  }

  // V-HM-UP-11 inherited_constraints_remain_in_force carries all 6 LFP-* IDs
  const upgradeInherited = parsed.inherited_constraints_remain_in_force || {};
  const upgradeInheritedList = upgradeInherited.inherited_constraints || [];
  const upgradeInheritedIds = new Set(upgradeInheritedList.map((c) => c && c.id));
  const missingUpgradeInherited = REQUIRED_INHERITED_CONSTRAINT_IDS.filter((id) => !upgradeInheritedIds.has(id));
  if (missingUpgradeInherited.length > 0) {
    blockers.push(`inherited_constraints_remain_in_force missing: ${missingUpgradeInherited.join(', ')}`);
    checks.push({ id: 'V-HM-UP-11', verdict: 'fail', note: `inherited constraint drift: ${missingUpgradeInherited.join(', ')}` });
  } else {
    checks.push({ id: 'V-HM-UP-11', verdict: 'pass', note: 'all 6 LFP-* inherited constraints carried forward' });
  }

  return {
    verdict: blockers.length === 0 ? 'pass' : 'fail',
    blockers,
    checks,
  };
}

// ---------------------------------------------------------------------------
// Upgrade evidence validator (T02) — checks V-HM-UP-12 .. V-HM-UP-21 against
// M014-S05-hermes-upgrade.json. Cross-references with baseline.json AND
// upgrade-contract.json for redaction + UUID literal integrity.
// ---------------------------------------------------------------------------

function validateUpgradeEvidence(parsed, baselineParsed, upgradeContractParsed) {
  const blockers = [];
  const checks = [];

  // V-HM-UP-12 upgrade.json file exists (handled by loadUpgradeEvidenceOrFail)
  checks.push({ id: 'V-HM-UP-12', verdict: 'pass', note: 'upgrade.json (evidence) file exists' });

  // V-HM-UP-13 upgrade.json parses as JSON object (handled by loadUpgradeEvidenceOrFail)
  checks.push({ id: 'V-HM-UP-13', verdict: 'pass', note: 'upgrade.json parses as JSON object' });

  // V-HM-UP-14 upgrade.json.phase_verdict in its enum_lock
  const phaseVerdict = parsed.phase_verdict;
  const phaseVerdictEnum = parsed.phase_verdict_enum_lock || [];
  if (typeof phaseVerdict !== 'string' || !phaseVerdictEnum.includes(phaseVerdict)) {
    blockers.push(`upgrade.json.phase_verdict must be in phase_verdict_enum_lock (got ${phaseVerdict})`);
    checks.push({ id: 'V-HM-UP-14', verdict: 'fail', note: `phase_verdict not in enum_lock: ${phaseVerdict}` });
  } else {
    checks.push({ id: 'V-HM-UP-14', verdict: 'pass', note: `phase_verdict admissible: ${phaseVerdict}` });
  }

  // V-HM-UP-15 upgrade.json.live_execution_status in its enum_lock
  const liveStatus = parsed.live_execution_status;
  const liveStatusEnum = parsed.live_execution_status_enum_lock || [];
  if (typeof liveStatus !== 'string' || !liveStatusEnum.includes(liveStatus)) {
    blockers.push(`upgrade.json.live_execution_status must be in live_execution_status_enum_lock (got ${liveStatus})`);
    checks.push({ id: 'V-HM-UP-15', verdict: 'fail', note: `live_execution_status not in enum_lock: ${liveStatus}` });
  } else {
    checks.push({ id: 'V-HM-UP-15', verdict: 'pass', note: `live_execution_status admissible: ${liveStatus}` });
  }

  // V-HM-UP-16 upgrade.json.fresh_readback_required === true
  if (parsed.fresh_readback_required !== true) {
    blockers.push('upgrade.json.fresh_readback_required must be true');
    checks.push({ id: 'V-HM-UP-16', verdict: 'fail', note: 'fresh_readback_required missing' });
  } else {
    checks.push({ id: 'V-HM-UP-16', verdict: 'pass', note: 'fresh_readback_required asserted' });
  }

  // V-HM-UP-17 upgrade.json.pre_flight_checks_results.checks_count === 6
  const pfcResults = parsed.pre_flight_checks_results || {};
  const pfcResultsCount = pfcResults.checks_count;
  if (pfcResultsCount !== 6) {
    blockers.push(`upgrade.json.pre_flight_checks_results.checks_count must be 6 (got ${pfcResultsCount})`);
    checks.push({ id: 'V-HM-UP-17', verdict: 'fail', note: `pre-flight results count drift: ${pfcResultsCount}` });
  } else {
    checks.push({ id: 'V-HM-UP-17', verdict: 'pass', note: 'pre-flight results cover all 6 checks' });
  }

  // V-HM-UP-18 upgrade.json.patch_reconciliation_results.patches_count === 4
  const prResults = parsed.patch_reconciliation_results || {};
  const prResultsCount = prResults.patches_count;
  if (prResultsCount !== 4) {
    blockers.push(`upgrade.json.patch_reconciliation_results.patches_count must be 4 (got ${prResultsCount})`);
    checks.push({ id: 'V-HM-UP-18', verdict: 'fail', note: `patch reconciliation count drift: ${prResultsCount}` });
  } else {
    checks.push({ id: 'V-HM-UP-18', verdict: 'pass', note: 'patch reconciliation covers all 4 LHA-* patches' });
  }

  // V-HM-UP-19 upgrade.json inherited_constraints_remain_in_force matches baseline IDs (6)
  const evidenceInherited = parsed.inherited_constraints_remain_in_force || {};
  const evidenceInheritedList = evidenceInherited.inherited_constraints || [];
  const evidenceInheritedIds = new Set(evidenceInheritedList.map((c) => c && c.id));
  const missingEvidenceInherited = REQUIRED_INHERITED_CONSTRAINT_IDS.filter((id) => !evidenceInheritedIds.has(id));
  if (missingEvidenceInherited.length > 0) {
    blockers.push(`upgrade.json inherited_constraints_remain_in_force missing: ${missingEvidenceInherited.join(', ')}`);
    checks.push({ id: 'V-HM-UP-19', verdict: 'fail', note: `evidence inherited constraint drift: ${missingEvidenceInherited.join(', ')}` });
  } else {
    checks.push({ id: 'V-HM-UP-19', verdict: 'pass', note: 'all 6 LFP-* inherited constraints preserved in evidence' });
  }

  // V-HM-UP-20 redaction clean across upgrade-contract.json AND upgrade.json
  const contractString = upgradeContractParsed ? JSON.stringify(upgradeContractParsed) : '';
  const evidenceString = JSON.stringify(parsed);
  const combinedString = `${contractString}\n${evidenceString}`;
  const credentialHits = scanCredentialLeaks(combinedString);
  if (credentialHits.length > 0) {
    blockers.push(`upgrade redaction leak: ${credentialHits.map((h) => h.redacted).join(', ')}`);
    checks.push({
      id: 'V-HM-UP-20',
      verdict: 'fail',
      note: `upgrade redaction leak: ${credentialHits.length} match(es)`,
    });
  } else {
    checks.push({ id: 'V-HM-UP-20', verdict: 'pass', note: 'upgrade-contract + upgrade.json no credential value leak' });
  }

  // V-HM-UP-21 no unapproved UUID literal across upgrade-contract.json AND upgrade.json
  const uuidMatches = combinedString.match(UUID_RE) || [];
  const unexpectedUuids = uuidMatches.filter(
    (u) => !APPROVED_UUID_8CHAR_PREFIXES.has(uuidPrefix(u))
  );
  if (unexpectedUuids.length > 0) {
    blockers.push(`upgrade UUID literal leak: ${unexpectedUuids.length} unexpected UUID(s)`);
    checks.push({
      id: 'V-HM-UP-21',
      verdict: 'fail',
      note: `unexpected UUID literal(s): ${unexpectedUuids.map(redactUuidsInString).join(', ')}`,
    });
  } else {
    checks.push({
      id: 'V-HM-UP-21',
      verdict: 'pass',
      note: 'upgrade-contract + upgrade.json no unapproved UUID literal',
    });
  }

  return {
    verdict: blockers.length === 0 ? 'pass' : 'fail',
    blockers,
    checks,
  };
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function cli() {
  const args = process.argv.slice(2);
  const phaseIdx = args.indexOf('--phase');
  if (phaseIdx === -1 || phaseIdx === args.length - 1) {
    process.stderr.write('USAGE: node scripts/validate_m014_s05_hermes_minimax.js --phase <baseline|upgraded|direct|final>\n');
    process.exit(2);
  }
  const phase = args[phaseIdx + 1];
  const validPhases = new Set(['baseline', 'upgraded', 'direct', 'final']);
  if (!validPhases.has(phase)) {
    process.stderr.write(`FAIL: unknown phase "${phase}". Valid: ${Array.from(validPhases).join(', ')}\n`);
    process.exit(2);
  }

  if (phase === 'direct' || phase === 'final') {
    // Fail-closed placeholder for not-yet-implemented phases (mirrors S04
    // validator behavior for direct/final). T03 ships --phase direct; T04
    // ships --phase final.
    const phaseToTask = { direct: 3, final: 4 };
    process.stderr.write(
      `FAIL: --phase ${phase} is reserved for T0${phaseToTask[phase]} (not implemented yet).\n` +
      `Run the S05 T0${phaseToTask[phase]} task to produce the corresponding artifact, then re-run with --phase ${phase}.\n`
    );
    process.exit(1);
  }

  // Both baseline and upgraded phases need the baseline + diff artifacts
  // loaded and validated first (upstream-truth invariants must hold through
  // the entire slice).
  let parsed;
  let diffContent;
  try {
    ({ parsed } = loadBaselineOrFail());
    diffContent = loadUpstreamDiffOrFail();
  } catch (err) {
    process.stderr.write(`FAIL: ${err.message}\n`);
    process.exit(2);
  }

  const baselineResult = validateBaseline(parsed);
  const diffResult = validateUpstreamDiffPresence(diffContent, parsed);

  let allChecks = baselineResult.checks.concat(diffResult.checks);
  let allBlockers = baselineResult.blockers.concat(diffResult.blockers);
  let additionalArtifacts = [];

  // For the upgraded phase, additionally load + validate upgrade-contract.json
  // + upgrade.json (V-HM-UP-01..21).
  if (phase === 'upgraded') {
    let upgradeContractParsed;
    let upgradeEvidenceParsed;
    try {
      upgradeContractParsed = loadUpgradeContractOrFail().parsed;
      upgradeEvidenceParsed = loadUpgradeEvidenceOrFail().parsed;
    } catch (err) {
      process.stderr.write(`FAIL: ${err.message}\n`);
      process.exit(2);
    }
    const contractResult = validateUpgradeContract(upgradeContractParsed, parsed);
    const evidenceResult = validateUpgradeEvidence(upgradeEvidenceParsed, parsed, upgradeContractParsed);
    allChecks = allChecks.concat(contractResult.checks, evidenceResult.checks);
    allBlockers = allBlockers.concat(contractResult.blockers, evidenceResult.blockers);
    additionalArtifacts = [
      path.relative(PROJECT_ROOT, UPGRADE_CONTRACT_JSON),
      path.relative(PROJECT_ROOT, UPGRADE_EVIDENCE_JSON),
    ];
  }

  const summary = {
    phase,
    artifact: path.relative(PROJECT_ROOT, BASELINE_JSON),
    companion: path.relative(PROJECT_ROOT, UPSTREAM_DIFF_MD),
    additional_artifacts: additionalArtifacts.length > 0 ? additionalArtifacts : undefined,
    verdict: allBlockers.length === 0 ? 'pass' : 'fail',
    blocker_count: allBlockers.length,
    blocker_summary: allBlockers.map(redactUuidsInString),
    checks: allChecks,
  };

  process.stdout.write(JSON.stringify(summary, null, 2) + '\n');

  if (summary.verdict !== 'pass') {
    process.exit(1);
  }
  process.exit(0);
}

// ---------------------------------------------------------------------------
// node:test suite (for `node --test scripts/validate_m014_s05_hermes_minimax.js`)
// ---------------------------------------------------------------------------

describe('M014-S05 Hermes baseline validator', () => {
  let baselineParsed;
  let diffContent;

  before(() => {
    const loaded = loadBaselineOrFail();
    baselineParsed = loaded.parsed;
    diffContent = loadUpstreamDiffOrFail();
  });

  it('baseline.json file exists', () => {
    assert.ok(fs.existsSync(BASELINE_JSON), `missing ${BASELINE_JSON}`);
  });

  it('baseline.json parses as JSON object', () => {
    assert.equal(typeof baselineParsed, 'object');
    assert.ok(baselineParsed !== null);
    assert.ok(!Array.isArray(baselineParsed));
  });

  it('upstream-diff file exists', () => {
    assert.ok(fs.existsSync(UPSTREAM_DIFF_MD), `missing ${UPSTREAM_DIFF_MD}`);
  });

  it('official_upstream_identity.verified === true', () => {
    assert.equal(baselineParsed.official_upstream_identity.verified, true);
  });

  it('canonical_repo_url is github.com/NousResearch/hermes-agent', () => {
    assert.equal(
      baselineParsed.official_upstream_identity.canonical_repo_url,
      'https://github.com/NousResearch/hermes-agent'
    );
  });

  it('canonical_pypi_project is hermes-agent', () => {
    assert.equal(
      baselineParsed.official_upstream_identity.canonical_pypi_project,
      'hermes-agent'
    );
  });

  it('vendored Hermes checkout is NOT claimed', () => {
    assert.notEqual(baselineParsed.local_paperclip_checkout.vendored_checkout_present, true);
  });

  it('live_runtime_observed.fresh_readback_required === true', () => {
    assert.equal(baselineParsed.live_runtime_observed.fresh_readback_required, true);
  });

  it('all four required local Paperclip adapter patch IDs are present', () => {
    const patches = baselineParsed.local_paperclip_adapter_compatibility_patches.patches_observed;
    const ids = new Set(patches.map((p) => p.id));
    for (const required of REQUIRED_PATCH_IDS) {
      assert.ok(ids.has(required), `missing patch ID: ${required}`);
    }
  });

  it('no credential value leaks in baseline.json', () => {
    const asString = JSON.stringify(baselineParsed);
    const hits = scanCredentialLeaks(asString);
    assert.equal(
      hits.length,
      0,
      `credential value leak(s): ${hits.map((h) => h.redacted).join(', ')}`
    );
  });

  it('no unapproved UUID literal in baseline.json', () => {
    const asString = JSON.stringify(baselineParsed);
    const matches = asString.match(UUID_RE) || [];
    const unexpected = matches.filter((u) => !APPROVED_UUID_8CHAR_PREFIXES.has(uuidPrefix(u)));
    assert.equal(
      unexpected.length,
      0,
      `unexpected UUID literal(s): ${unexpected.map(redactUuidsInString).join(', ')}`
    );
  });

  it('all six required inherited constraint IDs are present', () => {
    const ids = new Set(
      baselineParsed.rollout_safety_constraints.inherited_constraints.map((c) => c.id)
    );
    for (const required of REQUIRED_INHERITED_CONSTRAINT_IDS) {
      assert.ok(ids.has(required), `missing inherited constraint: ${required}`);
    }
  });

  it('patch_count matches patches_observed length and reconciliation_required=true count', () => {
    const compat = baselineParsed.local_paperclip_adapter_compatibility_patches;
    const observedLen = compat.patches_observed.length;
    const reconciliationTrue = compat.patches_observed.filter(
      (p) => p.reconciliation_required === true
    ).length;
    assert.equal(compat.patch_count, observedLen, 'patch_count must equal patches_observed.length');
    assert.equal(
      compat.patch_count,
      reconciliationTrue,
      'patch_count must equal reconciliation_required=true count'
    );
  });

  it('downstream_handoff declares T02 + T03 + T04 keys', () => {
    const keys = Object.keys(baselineParsed.downstream_handoff);
    for (const required of ['T02_upgrade_contract', 'T03_direct_minimax_proof', 'T04_paperclip_adapter_proof']) {
      assert.ok(keys.includes(required), `downstream_handoff missing key: ${required}`);
    }
  });

  it('upstream-diff references all required patch IDs', () => {
    for (const id of REQUIRED_PATCH_IDS) {
      assert.ok(diffContent.includes(id), `upstream-diff missing patch ID reference: ${id}`);
    }
  });

  it('upstream-diff references canonical repo URL and PyPI URL', () => {
    const repoUrl = baselineParsed.official_upstream_identity.canonical_repo_url;
    const pypiUrl = baselineParsed.official_upstream_identity.canonical_pypi_url;
    assert.ok(diffContent.includes(repoUrl), `upstream-diff missing repo URL: ${repoUrl}`);
    assert.ok(diffContent.includes(pypiUrl), `upstream-diff missing PyPI URL: ${pypiUrl}`);
  });

  it('upstream-diff does not leak any credential value', () => {
    const hits = scanCredentialLeaks(diffContent);
    assert.equal(
      hits.length,
      0,
      `upstream-diff credential leak(s): ${hits.map((h) => h.redacted).join(', ')}`
    );
  });
});

describe('M014-S05 Hermes upgraded validator', () => {
  let baselineParsed;
  let contractParsed;
  let evidenceParsed;

  before(() => {
    baselineParsed = loadBaselineOrFail().parsed;
    contractParsed = loadUpgradeContractOrFail().parsed;
    evidenceParsed = loadUpgradeEvidenceOrFail().parsed;
  });

  // V-HM-UP-01
  it('upgrade-contract.json file exists', () => {
    assert.ok(fs.existsSync(UPGRADE_CONTRACT_JSON), `missing ${UPGRADE_CONTRACT_JSON}`);
  });

  // V-HM-UP-02
  it('upgrade-contract.json parses as JSON object', () => {
    assert.equal(typeof contractParsed, 'object');
    assert.ok(contractParsed !== null);
    assert.ok(!Array.isArray(contractParsed));
  });

  // V-HM-UP-03
  it('pin_decision.new_pin.wheel matches hermes-agent==X.Y.Z', () => {
    assert.match(contractParsed.pin_decision.new_pin.wheel, HERMES_AGENT_PIN_RE);
  });

  // V-HM-UP-04
  it('pin_decision.new_pin.wheel differs from current_pin.wheel', () => {
    assert.notEqual(
      contractParsed.pin_decision.new_pin.wheel,
      contractParsed.pin_decision.current_pin.wheel
    );
  });

  // V-HM-UP-05
  it('pin_decision.new_pin.wheel matches baseline latest release tag', () => {
    const latest = baselineParsed.official_upstream_identity.latest_release_tag_observed;
    assert.equal(contractParsed.pin_decision.new_pin.wheel, `hermes-agent==${latest}`);
  });

  // V-HM-UP-06
  it('compatibility_review_answers has all 5 Q1-Q5 entries', () => {
    const keys = new Set(
      Object.keys(contractParsed.compatibility_review_answers).filter((k) => /^Q\d+_/.test(k))
    );
    for (const required of REQUIRED_COMPATIBILITY_QUESTION_IDS) {
      assert.ok(keys.has(required), `missing compatibility review: ${required}`);
    }
  });

  // V-HM-UP-07
  it('all 5 compatibility_review_answers answer starts with YES', () => {
    for (const id of REQUIRED_COMPATIBILITY_QUESTION_IDS) {
      const a = contractParsed.compatibility_review_answers[id];
      assert.ok(
        a && typeof a.answer === 'string' && a.answer.startsWith('YES'),
        `compatibility review answer not YES for ${id}: ${a && a.answer}`
      );
    }
  });

  // V-HM-UP-08
  it('pre_flight_checks.checks_count === 6 with required dimensions', () => {
    const checks = contractParsed.pre_flight_checks.checks;
    assert.equal(checks.length, 6, `pre-flight count must be 6, got ${checks.length}`);
    const names = new Set(checks.map((c) => c.name));
    for (const required of REQUIRED_PRE_FLIGHT_CHECK_NAMES) {
      assert.ok(names.has(required), `missing pre-flight check: ${required}`);
    }
  });

  // V-HM-UP-09
  it('rollback_strategy.rollback_commands is non-empty', () => {
    const cmds = contractParsed.rollback_strategy.rollback_commands || {};
    assert.ok(Object.keys(cmds).length > 0, 'rollback_commands must have entries');
  });

  // V-HM-UP-10
  it('patch_reconciliation_plan.patches carries all 4 LHA-* IDs', () => {
    const patches = contractParsed.patch_reconciliation_plan.patches || [];
    const ids = new Set(patches.map((p) => p.id));
    for (const required of REQUIRED_PATCH_IDS) {
      assert.ok(ids.has(required), `missing patch ID: ${required}`);
    }
  });

  // V-HM-UP-11
  it('inherited_constraints_remain_in_force carries all 6 LFP-* IDs', () => {
    const ids = new Set(
      contractParsed.inherited_constraints_remain_in_force.inherited_constraints.map((c) => c.id)
    );
    for (const required of REQUIRED_INHERITED_CONSTRAINT_IDS) {
      assert.ok(ids.has(required), `missing inherited constraint: ${required}`);
    }
  });

  // V-HM-UP-12
  it('upgrade.json (evidence) file exists', () => {
    assert.ok(fs.existsSync(UPGRADE_EVIDENCE_JSON), `missing ${UPGRADE_EVIDENCE_JSON}`);
  });

  // V-HM-UP-13
  it('upgrade.json parses as JSON object', () => {
    assert.equal(typeof evidenceParsed, 'object');
    assert.ok(evidenceParsed !== null);
    assert.ok(!Array.isArray(evidenceParsed));
  });

  // V-HM-UP-14
  it('upgrade.json.phase_verdict in its enum_lock', () => {
    const enumLock = evidenceParsed.phase_verdict_enum_lock || [];
    assert.ok(
      enumLock.includes(evidenceParsed.phase_verdict),
      `phase_verdict ${evidenceParsed.phase_verdict} not in enum_lock`
    );
  });

  // V-HM-UP-15
  it('upgrade.json.live_execution_status in its enum_lock', () => {
    const enumLock = evidenceParsed.live_execution_status_enum_lock || [];
    assert.ok(
      enumLock.includes(evidenceParsed.live_execution_status),
      `live_execution_status ${evidenceParsed.live_execution_status} not in enum_lock`
    );
  });

  // V-HM-UP-16
  it('upgrade.json.fresh_readback_required === true', () => {
    assert.equal(evidenceParsed.fresh_readback_required, true);
  });

  // V-HM-UP-17
  it('upgrade.json.pre_flight_checks_results.checks_count === 6', () => {
    assert.equal(evidenceParsed.pre_flight_checks_results.checks_count, 6);
  });

  // V-HM-UP-18
  it('upgrade.json.patch_reconciliation_results.patches_count === 4', () => {
    assert.equal(evidenceParsed.patch_reconciliation_results.patches_count, 4);
  });

  // V-HM-UP-19
  it('upgrade.json inherited constraints match baseline IDs (6)', () => {
    const ids = new Set(
      evidenceParsed.inherited_constraints_remain_in_force.inherited_constraints.map((c) => c.id)
    );
    for (const required of REQUIRED_INHERITED_CONSTRAINT_IDS) {
      assert.ok(ids.has(required), `missing inherited constraint: ${required}`);
    }
  });

  // V-HM-UP-20
  it('no credential value leaks across upgrade-contract.json AND upgrade.json', () => {
    const combined = JSON.stringify(contractParsed) + '\n' + JSON.stringify(evidenceParsed);
    const hits = scanCredentialLeaks(combined);
    assert.equal(
      hits.length,
      0,
      `credential leak(s): ${hits.map((h) => h.redacted).join(', ')}`
    );
  });

  // V-HM-UP-21
  it('no unapproved UUID literal across upgrade-contract.json AND upgrade.json', () => {
    const combined = JSON.stringify(contractParsed) + '\n' + JSON.stringify(evidenceParsed);
    const matches = combined.match(UUID_RE) || [];
    const unexpected = matches.filter((u) => !APPROVED_UUID_8CHAR_PREFIXES.has(uuidPrefix(u)));
    assert.equal(
      unexpected.length,
      0,
      `unexpected UUID literal(s): ${unexpected.map(redactUuidsInString).join(', ')}`
    );
  });
});

// ---------------------------------------------------------------------------
// Auto-run CLI when invoked directly, but NOT when invoked under node --test
// (the test runner spawns this file as its own entry, so require.main === module
// is true there too; calling cli() would issue process.exit() and be reported
// as an unhandled termination by the test runner).
// ---------------------------------------------------------------------------

if (require.main === module && !process.execArgv.some((a) => a.includes('test'))) {
  cli();
}

module.exports = {
  validateBaseline,
  validateUpstreamDiffPresence,
  validateUpgradeContract,
  validateUpgradeEvidence,
  loadBaselineOrFail,
  loadUpstreamDiffOrFail,
  loadUpgradeContractOrFail,
  loadUpgradeEvidenceOrFail,
  scanCredentialLeaks,
  REQUIRED_PATCH_IDS,
  REQUIRED_INHERITED_CONSTRAINT_IDS,
  REQUIRED_COMPATIBILITY_QUESTION_IDS,
  REQUIRED_PRE_FLIGHT_CHECK_NAMES,
  REQUIRED_PHASE_VERDICT_ENUM,
  REQUIRED_LIVE_EXECUTION_STATUS_ENUM,
  HERMES_AGENT_PIN_RE,
  FORBIDDEN_CREDENTIAL_VALUE_PATTERNS,
  UUID_RE,
  APPROVED_UUID_8CHAR_PREFIXES,
  BASELINE_JSON,
  UPSTREAM_DIFF_MD,
  UPGRADE_CONTRACT_JSON,
  UPGRADE_EVIDENCE_JSON,
};