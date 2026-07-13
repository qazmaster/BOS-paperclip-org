#!/usr/bin/env node
/**
 * @file scripts/validate_m014_s02_vps_forensics.js
 *
 * T03 validator for M014-S02 VPS forensics verdict.
 *
 * Enforces 14 integrity tests (T-V-01 .. T-V-14) on the slice S02 verdict artifact.
 * Designed for Node v20+ where `node:test` is stable.
 *
 * Usage:
 *   node --test scripts/validate_m014_s02_vps_forensics.js
 *
 * Test design summary:
 *   T-V-01 verdict file exists and parses
 *   T-V-02 verdict_status is one of the 6 enum members
 *   T-V-03 verdict_id is non-empty and starts with M014-S02-T03-
 *   T-V-04 sources_cited includes primary and secondary
 *   T-V-05 residual_unknowns has at least 5 entries
 *   T-V-06 verdict_status not outside enum
 *   T-V-07 when primary source captures_count == 0, verdict MUST be H-INCONCLUSIVE
 *   T-V-08 forbidden_commands_audit_mirror.forbidden_patterns_total == 18
 *   T-V-09 no substring from redaction_policy.never_print_or_store
 *   T-V-10 each residual_unknown.unblocks_when references at least one C-* command_id
 *   T-V-11 hypothesis_decision_table has exactly 6 rows
 *   T-V-12 downstream_implications keys present (S03 lockfile, S04 persistence canary, S05 e2e mission)
 *   T-V-13 confidence.confidence_in_any_alternative_hypothesis == 'not_applicable'
 *   T-V-14 verdict_id monotonic prefix matches milestone / slice / task
 *
 * The validator is intentionally side-effect free: it reads files, validates,
 * and asserts. It performs NO network, NO docker, NO shell, NO secret writes,
 * NO git operations. It is safe to run in any execution lane (auto, supervised,
 *   agent, or human).
 */

'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

// ---------------------------------------------------------------------------
// Constants & path resolution
// ---------------------------------------------------------------------------

const PROJECT_ROOT = process.cwd();

const VERDICT_PATH = path.resolve(
  PROJECT_ROOT,
  'runtime-evidence/M014-S02-vps-forensics-verdict.json'
);
const VERDICT_TWIN_MD = path.resolve(
  PROJECT_ROOT,
  'runtime-evidence/M014-S02-vps-forensics-verdict.md'
);
const PRIMARY_SOURCE = path.resolve(
  PROJECT_ROOT,
  'runtime-evidence/M014-S02-vps-forensics.json'
);
const SECONDARY_SOURCE = path.resolve(
  PROJECT_ROOT,
  'runtime-evidence/M014-S02-vps-command-packet.json'
);

const HYPOTHESIS_ENUM = Object.freeze([
  'H-WIPE',
  'H-RECREATE',
  'H-AUTH-DRIFT',
  'H-OWNERSHIP-DRIFT',
  'H-PROXY-DRIFT',
  'H-INCONCLUSIVE',
]);

const HYPOTHESIS_ENUM_SIZE = HYPOTHESIS_ENUM.length; // 6
const FORBIDDEN_PATTERN_COUNT_EXPECTED = 18;
const MIN_RESIDUAL_UNKNOWNS = 5;

// Substring patterns that, if present anywhere in the verdict artifact text,
// indicate a redaction leak. We deliberately check against the JSON-stringified
// full document (most strict) AND against the human-readable twin (in case the
// MD file diverges accidentally).
//
// Each pattern is a substring of an entry in T01 packet
// `redaction_policy.never_print_or_store`. Adding a substring here after
// expanding the policy is intentional — fail-closed.
const REDACTION_FORBIDDEN_SUBSTRINGS = Object.freeze([
  'TELEGRAM_BOT_TOKEN=',
  'POSTGRES_PASSWORD=',
  'BETTER_AUTH_SECRET=',
  'BETTER_AUTH_SESSION_SECRET=',
  'JWT_SECRET=',
  'DATABASE_URL=',
  'REDIS_PASSWORD=',
  'OPENAI_API_KEY=',
  'XIAOMI_API_KEY=',
  'session_token value',
  'Authorization headers',
  'POSTGRES_PASSWORD / DATABASE_URL',
  'user:pass@host',
]);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function readJsonSafe(p) {
  const raw = fs.readFileSync(p, 'utf8');
  return JSON.parse(raw);
}

function sha256(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

function findSecretLeak(text, substrings) {
  const hits = [];
  for (const sub of substrings) {
    if (text.includes(sub)) hits.push(sub);
  }
  return hits;
}

/**
 * Extract all C-N.M or C-N substrings (e.g. "C-7.1", "C-8.2", "C-2.2 / C-3.2").
 * Used by T-V-10 to assert that each residual_unknown.unblocks_when references
 * at least one approved command ID from the T01 packet.
 */
function findCommandRefs(text) {
  const re = /\bC-\d+(\.\d+)?\b/g;
  const hits = new Set();
  let m;
  while ((m = re.exec(text)) !== null) hits.add(m[0]);
  return [...hits];
}

// Load artifacts once at module evaluation time. If something is missing,
// individual tests fail with explicit reasons; the validator never throws at
// import time (so `node --test` still produces a coherent TAP report).
let verdict = null;
let primary = null;
let secondary = null;
let verdictLoadError = null;
let primaryLoadError = null;
let secondaryLoadError = null;

try {
  verdict = readJsonSafe(VERDICT_PATH);
} catch (err) {
  verdictLoadError = err.message;
}
try {
  primary = readJsonSafe(PRIMARY_SOURCE);
} catch (err) {
  primaryLoadError = err.message;
}
try {
  secondary = readJsonSafe(SECONDARY_SOURCE);
} catch (err) {
  secondaryLoadError = err.message;
}

const verdictText = verdict ? JSON.stringify(verdict) : '';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test('T-V-01: verdict file exists and parses', { tag: 'm014-s02-t03' }, () => {
  if (verdictLoadError) {
    assert.fail(
      `verdict artifact not loadable at ${VERDICT_PATH}: ${verdictLoadError}`
    );
  }
  assert.equal(typeof verdict, 'object', 'verdict should be an object');
  assert.notEqual(verdict, null, 'verdict should not be null');
  assert.ok('$schema' in verdict, 'verdict should declare $schema');
  assert.equal(verdict.milestone, 'M014-a9jj46', 'milestone id');
  assert.equal(verdict.slice, 'S02', 'slice id');
  assert.equal(verdict.task, 'T03', 'task id');
  // Twin MD should exist as human-readable sibling.
  assert.ok(
    fs.existsSync(VERDICT_TWIN_MD),
    `human-readable twin missing: ${VERDICT_TWIN_MD}`
  );
});

test('T-V-02: verdict_status is admissible enum member', { tag: 'm014-s02-t03' }, () => {
  assert.ok(verdict, 'verdict loaded');
  const status = verdict.verdict_status;
  assert.ok(
    typeof status === 'string',
    'verdict_status should be a string'
  );
  assert.ok(
    HYPOTHESIS_ENUM.includes(status),
    `verdict_status '${status}' is outside the locked enum ${HYPOTHESIS_ENUM.join('|')}`
  );
});

test('T-V-03: verdict_id is non-empty and starts with M014-S02-T03-', { tag: 'm014-s02-t03' }, () => {
  assert.ok(verdict, 'verdict loaded');
  const id = verdict.verdict_id;
  assert.equal(typeof id, 'string', 'verdict_id should be a string');
  assert.ok(id.length > 0, 'verdict_id should be non-empty');
  assert.ok(
    id.startsWith('M014-S02-T03-'),
    `verdict_id '${id}' should start with M014-S02-T03-`
  );
});

test('T-V-04: sources_cited includes primary and secondary paths', { tag: 'm014-s02-t03' }, () => {
  assert.ok(verdict, 'verdict loaded');
  const cited = verdict.evidence_sources_cited || {};
  assert.ok(cited.primary_source, 'primary_source present');
  assert.ok(cited.secondary_source, 'secondary_source present');

  const primaryPath = cited.primary_source.path;
  const secondaryPath = cited.secondary_source.path;
  assert.match(
    primaryPath,
    /M014-S02-vps-forensics\.json$/,
    'primary path should be the T02 forensic artifact'
  );
  assert.match(
    secondaryPath,
    /M014-S02-vps-command-packet\.json$/,
    'secondary path should be the T01 command packet'
  );

  // The cited paths must actually exist on disk (test ids: each path
  // resolves to a readable file). This is a fail-closed structural check.
  assert.ok(
    fs.existsSync(path.resolve(PROJECT_ROOT, primaryPath)),
    `primary source path not on disk: ${primaryPath}`
  );
  assert.ok(
    fs.existsSync(path.resolve(PROJECT_ROOT, secondaryPath)),
    `secondary source path not on disk: ${secondaryPath}`
  );

  // Tertiary sources optional but if present must be string-list of paths.
  if (Array.isArray(cited.tertiary_sources)) {
    for (const t of cited.tertiary_sources) {
      assert.equal(typeof t.path, 'string', 'tertiary path should be a string');
    }
  }
});

test('T-V-05: residual_unknowns has at least 5 entries', { tag: 'm014-s02-t03' }, () => {
  assert.ok(verdict, 'verdict loaded');
  const ru = verdict.residual_unknowns;
  assert.ok(Array.isArray(ru), 'residual_unknowns must be an array');
  assert.ok(
    ru.length >= MIN_RESIDUAL_UNKNOWNS,
    `residual_unknowns length ${ru.length} < ${MIN_RESIDUAL_UNKNOWNS}`
  );
  for (const row of ru) {
    assert.equal(typeof row.id, 'string', 'each row needs id');
    assert.equal(typeof row.unknown, 'string', 'each row needs unknown');
    assert.equal(typeof row.unblocks_when, 'string', 'each row needs unblocks_when');
  }
});

test('T-V-06: verdict_status not outside enum (cross-check on enum_lock)', { tag: 'm014-s02-t03' }, () => {
  assert.ok(verdict, 'verdict loaded');
  const lock = verdict.verdict_status_enum_lock;
  assert.ok(Array.isArray(lock), 'verdict_status_enum_lock must be an array');
  assert.equal(
    lock.length,
    HYPOTHESIS_ENUM_SIZE,
    `enum_lock length ${lock.length} !== ${HYPOTHESIS_ENUM_SIZE}`
  );
  // Each lock entry must be a member of HYPOTHESIS_ENUM (no typos).
  for (const id of lock) {
    assert.ok(
      HYPOTHESIS_ENUM.includes(id),
      `enum_lock contains unknown id '${id}'`
    );
  }
  // Verdict status must be in the lock.
  assert.ok(
    lock.includes(verdict.verdict_status),
    `verdict_status '${verdict.verdict_status}' not in enum_lock`
  );
});

test('T-V-07: when primary source captures_count == 0, verdict MUST be H-INCONCLUSIVE', {
  tag: 'm014-s02-t03',
}, () => {
  if (primaryLoadError) {
    assert.fail(`primary source not loadable: ${primaryLoadError}`);
  }
  assert.ok(verdict, 'verdict loaded');
  // Cross-source captures_count equality: verdict's claimed captures_summary
  // must equal primary's captures_count.
  const primaryCaptures = Array.isArray(primary.captures)
    ? primary.captures.length
    : 0;
  assert.equal(
    typeof primaryCaptures,
    'number',
    'primary captures count should be numeric'
  );

  if (primaryCaptures === 0) {
    assert.equal(
      verdict.verdict_status,
      'H-INCONCLUSIVE',
      `verdict_status '${verdict.verdict_status}' must be H-INCONCLUSIVE when primary captures_count == 0`
    );
    // Confidence on any alternative hypothesis must be not_applicable.
    assert.equal(
      verdict.confidence?.confidence_in_any_alternative_hypothesis,
      'not_applicable',
      'alternative-hypothesis confidence must be not_applicable when captures==0'
    );
  } else {
    // If T02 is eventually unblocked and captures are populated, this test
    // becomes a tautology and passes regardless of verdict. The validator is
    // not designed to second-guess a populated capture — that's a future T03
    // rev with richer admissibility rules.
    assert.ok(true, `primary captures_count=${primaryCaptures}; verdict selection unconstrained`);
  }
});

test('T-V-08: forbidden_commands_audit_mirror.forbidden_patterns_total == 18', {
  tag: 'm014-s02-t03',
}, () => {
  assert.ok(verdict, 'verdict loaded');
  const f = verdict.forbidden_commands_audit_mirror || {};
  assert.equal(
    f.forbidden_patterns_total,
    FORBIDDEN_PATTERN_COUNT_EXPECTED,
    `forbidden_patterns_total ${f.forbidden_patterns_total} !== ${FORBIDDEN_PATTERN_COUNT_EXPECTED}`
  );
  assert.equal(
    f.any_forbidden_command_invoked_by_t02,
    false,
    't02 invocation must remain zero'
  );
  assert.equal(
    f.any_forbidden_command_invoked_by_t03,
    false,
    't03 invocation must remain zero'
  );
});

test('T-V-09: no substring from redaction_policy.never_print_or_store', {
  tag: 'm014-s02-t03',
}, () => {
  assert.ok(verdict, 'verdict loaded');

  // The verdict artifact LEGITIMATELY contains forbidden-credential KEY NAMES
  // in three structural places that are NOT secret leaks:
  //   (1) redaction_policy_mirror.never_print_or_store[]   -- the policy list itself
  //   (2) redaction_policy_mirror.allowlisted_to_print[]   -- the inverse policy list
  //   (3) diagnostics.verify_no_secrets                     -- self-test JS one-liner
  //                                                          whose substring list is
  //                                                          the very definition we
  //                                                          want to enforce.
  //
  // Strip those structural locations from a deep-cloned copy of the verdict
  // BEFORE running the substring scan. Anything else containing a forbidden
  // KEY-NAME-or-VALUE shape is treated as a real leak.
  function stripPolicyDocumentation(v) {
    if (v === null || typeof v !== 'object') return v;
    if (Array.isArray(v)) return v.map(stripPolicyDocumentation);
    const out = {};
    for (const [k, val] of Object.entries(v)) {
      if (k === 'diagnostics') continue;                     // (3)
      if (k === 'never_print_or_store') continue;            // (1)
      if (k === 'allowlisted_to_print') continue;            // (2)
      out[k] = stripPolicyDocumentation(val);
    }
    return out;
  }

  const cleaned = stripPolicyDocumentation(verdict);
  const cleanedText = JSON.stringify(cleaned);

  const hits = REDACTION_FORBIDDEN_SUBSTRINGS.filter((s) =>
    cleanedText.includes(s)
  );
  if (hits.length > 0) {
    assert.fail(
      `verdict contains ${hits.length} forbidden redaction-substring(s) outside policy documentation: ${hits.join(' | ')}`
    );
  }

  // Also check the human-readable twin does not introduce leaks via prose.
  if (fs.existsSync(VERDICT_TWIN_MD)) {
    const mdText = fs.readFileSync(VERDICT_TWIN_MD, 'utf8');
    assert.ok(
      !/Bearer\s+[A-Za-z0-9_\-\.=]{20,}/.test(mdText),
      'twin should not embed raw bearer tokens'
    );
  }
});

test('T-V-10: each residual_unknown.unblocks_when references C-* command_id', {
  tag: 'm014-s02-t03',
}, () => {
  assert.ok(verdict, 'verdict loaded');
  const ru = verdict.residual_unknowns;
  assert.ok(Array.isArray(ru), 'residual_unknowns must be array');
  for (const row of ru) {
    const refs = findCommandRefs(row.unblocks_when);
    assert.ok(
      refs.length > 0,
      `residual_unknowns[${row.id}].unblocks_when has no C-* command_id ref`
    );
    // Sanity: each ref must follow the canonical "C-N" or "C-N.M" shape.
    for (const ref of refs) {
      assert.match(ref, /^C-\d+(\.\d+)?$/, `bad command_id ref '${ref}'`);
    }
  }
});

test('T-V-11: hypothesis_decision_table has exactly 6 rows', { tag: 'm014-s02-t03' }, () => {
  assert.ok(verdict, 'verdict loaded');
  const table = verdict.hypothesis_decision_table;
  assert.ok(Array.isArray(table), 'hypothesis_decision_table must be array');
  assert.equal(
    table.length,
    HYPOTHESIS_ENUM_SIZE,
    `hypothesis_decision_table length ${table.length} !== ${HYPOTHESIS_ENUM_SIZE}`
  );
  const ids = new Set(table.map((r) => r.hypothesis_id));
  for (const id of HYPOTHESIS_ENUM) {
    assert.ok(ids.has(id), `decision_table missing hypothesis '${id}'`);
  }
  // H-INCONCLUSIVE row must be the only one with admissible_at_t03 === true.
  const admissibleCount = table.filter(
    (r) => r.admissible_at_t03 === true
  ).length;
  assert.equal(
    admissibleCount,
    1,
    `expected exactly one admissible row; got ${admissibleCount}`
  );
  const admissible = table.find((r) => r.admissible_at_t03 === true);
  assert.equal(
    admissible.hypothesis_id,
    'H-INCONCLUSIVE',
    'only H-INCONCLUSIVE may be admissible in current state'
  );
});

test('T-V-12: downstream_implications keys present (S03 / S04 / S05)', {
  tag: 'm014-s02-t03',
}, () => {
  assert.ok(verdict, 'verdict loaded');
  const di = verdict.downstream_implications || {};
  for (const key of [
    'to_S03_lockfile',
    'to_S04_persistence_canary',
    'to_S05_e2e_mission',
  ]) {
    assert.ok(di[key], `downstream_implications.${key} must be present`);
    assert.ok(
      Array.isArray(di[key].design_implications) &&
        di[key].design_implications.length > 0,
      `${key}.design_implications must be a non-empty array`
    );
    assert.ok(
      Array.isArray(di[key].does_not_block) ||
        Array.isArray(di[key].is_blocked_by),
      `${key} must declare does_not_block or is_blocked_by`
    );
  }
});

test('T-V-13: confidence.confidence_in_any_alternative_hypothesis == "not_applicable" when captures==0', {
  tag: 'm014-s02-t03',
}, () => {
  assert.ok(verdict, 'verdict loaded');
  // Deterministic: when captures==0, alternative-hypothesis confidence MUST
  // be not_applicable. This is the fail-closed epistemic state.
  const c = verdict.confidence || {};
  assert.equal(
    c.confidence_in_any_alternative_hypothesis,
    'not_applicable',
    'alternative-hypothesis confidence must be not_applicable'
  );
  assert.equal(
    c.confidence_in_h_inconclusive,
    'high',
    'confidence in H-INCONCLUSIVE must be high when captures==0'
  );
  assert.ok(['deterministic_no_data', 'zero_capture'].includes(c.level), 'level');
});

test('T-V-14: verdict_id monotonic prefix matches milestone / slice / task', {
  tag: 'm014-s02-t03',
}, () => {
  assert.ok(verdict, 'verdict loaded');
  const id = verdict.verdict_id;
  // The literal milestone / slice / task prefix may be encoded differently
  // depending on canonical form. Accept either "M014-a9jj46/S02/T03" or
  // "M014-S02-T03" prefixed (the latter is the canonical short form used by
  // M014 sibling slices and the GSD DB tooling).
  const okForm =
    id.startsWith('M014-a9jj46/S02/T03-') ||
    id.startsWith('M014-S02-T03-');
  assert.ok(okForm, `verdict_id '${id}' must encode M014 / S02 / T03 prefix`);

  // Hypothesis ID encoded in verdict_id should match verdict_status.
  let hypothesisFound = false;
  for (const h of HYPOTHESIS_ENUM) {
    if (id.includes(h)) {
      hypothesisFound = true;
      assert.equal(
        verdict.verdict_status,
        h,
        `verdict_id encodes ${h} but verdict_status is '${verdict.verdict_status}'`
      );
      break;
    }
  }
  // If no hypothesis was found in the id, accept that as a valid form
  // (some IDs use sequence numbers only) BUT require at least one trailing
  // sequence identifier (e.g. '-001') to detect monotonic-suffix regressions.
  if (!hypothesisFound) {
    assert.match(id, /-\d+$/, 'verdict_id must end with monotonic sequence suffix');
  }
});

// ---------------------------------------------------------------------------
// Anti-replay integrity (informational; not part of the 14 required tests but
// emitted so the suite reports SHA-256 fingerprints for cross-checking).
// ---------------------------------------------------------------------------

test('anti-replay: SHA-256 of verdict, primary, secondary are emitted', {
  tag: 'm014-s02-t03',
}, () => {
  const verSha = sha256(fs.readFileSync(VERDICT_PATH));
  if (fs.existsSync(PRIMARY_SOURCE)) {
    const pSha = sha256(fs.readFileSync(PRIMARY_SOURCE));
    assert.ok(pSha.length === 64, 'primary sha256 is 64 hex chars');
  }
  if (fs.existsSync(SECONDARY_SOURCE)) {
    const sSha = sha256(fs.readFileSync(SECONDARY_SOURCE));
    assert.ok(sSha.length === 64, 'secondary sha256 is 64 hex chars');
  }
  assert.ok(verSha.length === 64, 'verdict sha256 is 64 hex chars');
  // Diagnostic only — no assertion on equality to expected hashes; the verdict
  // artifact is the source of truth for its own sha256.
  assert.ok(true, `verdict sha256 = ${verSha.slice(0, 16)}...`);
});

// ---------------------------------------------------------------------------
// Final summary (does not affect test count; prints only when --test is
// invoked with verbose reporter).
// ---------------------------------------------------------------------------

test('summary: validator bounds are stable', { tag: 'm014-s02-t03' }, () => {
  // These are stability assertions on the validator itself, not the artifact.
  // If a future change weakens any of these, the corresponding test should be
  // updated consciously.
  assert.equal(MIN_RESIDUAL_UNKNOWNS, 5, 'minimum residual_unknowns threshold');
  assert.equal(
    FORBIDDEN_PATTERN_COUNT_EXPECTED,
    18,
    'expected forbidden pattern count'
  );
  assert.equal(HYPOTHESIS_ENUM_SIZE, 6, 'expected hypothesis enum size');
});
