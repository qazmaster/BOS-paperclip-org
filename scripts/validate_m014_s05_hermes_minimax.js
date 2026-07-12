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
 *   --phase upgraded   (T02) — validate the upgrade contract (separate task).
 *   --phase direct     (T03) — validate the direct MiniMax M3 proof (separate
 *                              task).
 *   --phase final      (T04) — validate the Paperclip adapter proof and the
 *                              rollout/rollback verdict (separate task).
 *
 * T01 ships ONLY the `--phase baseline` implementation; the other phases are
 * placeholders that fail closed until the corresponding artifact files appear
 * in subsequent tasks. This matches the S03 lockfile and S04 upgrade
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

  if (phase !== 'baseline') {
    // Fail-closed placeholder for not-yet-implemented phases (mirrors S04
    // validator behavior for upgraded/deployed/final).
    process.stderr.write(
      `FAIL: --phase ${phase} is reserved for T0${({ baseline: 1, upgraded: 2, direct: 3, final: 4 }[phase])} (not implemented in T01).\n` +
      `This validator only ships --phase baseline. Run the S05 T0${({ baseline: 1, upgraded: 2, direct: 3, final: 4 }[phase])} task to produce the corresponding artifact, then re-run with --phase ${phase}.\n`
    );
    process.exit(1);
  }

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

  const allChecks = baselineResult.checks.concat(diffResult.checks);
  const allBlockers = baselineResult.blockers.concat(diffResult.blockers);

  const summary = {
    phase,
    artifact: path.relative(PROJECT_ROOT, BASELINE_JSON),
    companion: path.relative(PROJECT_ROOT, UPSTREAM_DIFF_MD),
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
  loadBaselineOrFail,
  loadUpstreamDiffOrFail,
  scanCredentialLeaks,
  REQUIRED_PATCH_IDS,
  REQUIRED_INHERITED_CONSTRAINT_IDS,
  FORBIDDEN_CREDENTIAL_VALUE_PATTERNS,
  UUID_RE,
  APPROVED_UUID_8CHAR_PREFIXES,
  BASELINE_JSON,
  UPSTREAM_DIFF_MD,
};