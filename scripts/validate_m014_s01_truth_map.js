#!/usr/bin/env node
/**
 * M014 S01 — Runtime Truth Map Validator
 *
 * Validates the machine-readable truth map artifact produced by T02
 * (`runtime-evidence/M014-S01-runtime-truth-map.json`) so that downstream
 * slices (S02-S05) consume a fail-closed map of runtime identities,
 * capability surfaces, governance risks, and VPS forensic targets.
 *
 * Validator classes (mirror truth map downstream_handoff.S01_T03_validator
 * .validator_classes, see `gsd/m014-s01-runtime-truth-map-v1`):
 *   01. doctrine_fields
 *   02. runtime_identity_provisional
 *   03. stale_id_must_appear
 *   04. hermes_promotion_requires
 *   05. gsdpi_promotion_requires
 *   06. bounded_promotable_surfaces
 *   07. blocked_surfaces
 *   08. governance_gates
 *   09. health_endpoint_not_proof
 *   10. vps_targets_present
 *   11. scripts_to_harden_present
 *
 * Failure modes covered (Q5):
 *   - input is not a JSON object: aggregated "truth map must be a JSON object"
 *   - missing required top-level keys: aggregated per-section "missing required
 *     top-level key: X"
 *   - missing R026 boundary patch: aggregated
 *   - canonical company claim not flagged fresh_readback_required: aggregated
 *   - any of the 6 known-stale UUID prefixes (R3) missing from
 *     runtime_identity_claims: aggregated
 *   - Hermes/GSD-Pi surface promoted past fail-closed, or promotion_requires
 *     emptied: aggregated (fail-closed)
 *   - bounded promotable set missing issue/document/comment: aggregated
 *   - expected blocked surface missing (approval/plugin-registration/ui/data/
 *     action/tool): aggregated
 *   - governance_risks empty or missing required fields: aggregated
 *   - health_endpoint_policy.promotion_state not "not-runtime-proof":
 *     aggregated
 *   - vps_targets missing required fields: aggregated
 *   - scripts_to_harden empty or missing hardening_target: aggregated
 *   - no_promotion_ledger.keys missing Hermes or GSD-Pi guard keys: aggregated
 *
 * Run as a test suite:
 *   node --test scripts/validate_m014_s01_truth_map.js
 *
 * Run as a CLI gate (exit 0 = pass, 1 = validation errors, 2 = load errors):
 *   node scripts/validate_m014_s01_truth_map.js
 *
 * The validator never mutates state, never opens network sockets, and never
 * imports anything from `runtime-evidence/` other than the two read-only
 * artifacts produced by T01 and T02. Synthetic fixtures are co-located in
 * this file so the suite can be run in any clone.
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');

const ROOT = path.resolve(__dirname, '..');
const TRUTH_MAP_JSON = path.join(
  ROOT,
  'runtime-evidence',
  'M014-S01-runtime-truth-map.json'
);
const TRUTH_MAP_MD = path.join(
  ROOT,
  'runtime-evidence',
  'M014-S01-runtime-truth-map.md'
);
const SOURCE_INVENTORY = path.join(
  ROOT,
  'runtime-evidence',
  'M014-S01-source-inventory.md'
);

/**
 * Required top-level keys the validator checks for presence.
 * Matches the 11 validator_classes documented in downstream_handoff.
 */
const REQUIRED_TOP_KEYS = [
  'doctrine',
  'runtime_identity_claims',
  'auth_status',
  'runtime_surfaces',
  'health_endpoint_policy',
  'scripts_to_harden',
  'governance_risks',
  'proof_gaps',
  'vps_targets',
  'no_promotion_ledger',
];

/**
 * Six stale UUID prefixes (R3 in .gsd/KNOWLEDGE.md, 2026-07-08 dead IDs).
 * The truth map stores these truncated with `…`; we match by prefix to
 * remain robust against the truncation while still flagging absences.
 */
const STALE_ID_PREFIXES = [
  '9feb4c22', // M012 canonical /BOS
  '43c74adb', // M002 /BOS v1.4.1 creation era
  '1a194762', // runtime-gate /BOSA
  '7595fd85',
  '7eede16c',
  '8233ea7b',
];

/**
 * Bounded surfaces that the truth map must explicitly authorize for native
 * create+readback promotion. Anything outside this set is blocked.
 */
const BOUNDED_PROMOTABLE_SURFACES = ['issue', 'document', 'comment'];

/**
 * Blocked surfaces that the truth map must explicitly mark as
 * do-not-promote. Names use the canonical truth map surface name field.
 */
const REQUIRED_BLOCKED_SURFACES = [
  'approval',
  'plugin-registration',
  'ui-surface',
  'data-surface',
  'action-surface',
  'tool-surface',
];

/**
 * Required fields on every governance_risks entry. The map is a governance
 * gate, so each entry must be self-citing.
 */
const REQUIRED_GOVERNANCE_RISK_FIELDS = ['id', 'title', 'rule', 'evidence'];

/**
 * Required fields on the vps_targets object. Each field is consumed by at
 * least one downstream slice (S02 read-only forensics, S04 persistence
 * canary).
 */
const REQUIRED_VPS_TARGET_FIELDS = [
  'vps_ip',
  'sandbox_path',
  'container_name',
  'forbidden_commands',
  'read_only_commands_acceptable',
  'safe_restart_command',
];

/**
 * Required fields on every scripts_to_harden entry. The S03 hardening slice
 * depends on `hardening_target` being non-empty.
 */
const REQUIRED_SCRIPT_HARDEN_FIELDS = [
  'script',
  'hardcoded_company_id',
  'hardening_target',
];

/**
 * Required keys in the no_promotion_ledger.keys array. The two capability
 * surfaces that have caused repeated drift (Hermes xiaomi + gsdpi_local)
 * must be guarded.
 */
const REQUIRED_NO_PROMOTION_KEYS = [
  'runtime_surfaces.surfaces[Hermes execution].promotion_state',
  'runtime_surfaces.surfaces[GSD-Pi execution].promotion_state',
];

/**
 * Load and parse the truth map JSON. Throws on missing/unparseable file so
 * the test harness sees the load failure distinctly from validation errors.
 */
function loadTruthMap(absPath) {
  const raw = fs.readFileSync(absPath, 'utf8');
  return JSON.parse(raw);
}

/**
 * Validate a truth map object. Returns an array of human-readable error
 * strings (empty array means the artifact is valid). Never throws; never
 * mutates the input.
 *
 * The function intentionally does NOT short-circuit on the first error so
 * that a single test run exposes the full set of structural problems.
 */
function validateTruthMap(map) {
  const errors = [];

  if (!map || typeof map !== 'object' || Array.isArray(map)) {
    errors.push('truth map must be a JSON object');
    return errors;
  }

  // ----- 01 doctrine_fields -----
  if (!map.doctrine || typeof map.doctrine !== 'object') {
    errors.push('doctrine section missing or not an object');
  } else {
    if (!map.doctrine.baseline || typeof map.doctrine.baseline !== 'object') {
      errors.push('doctrine.baseline missing');
    }
    if (!Array.isArray(map.doctrine.patches) || map.doctrine.patches.length === 0) {
      errors.push('doctrine.patches must be a non-empty array');
    } else {
      const r026 = map.doctrine.patches.find((p) => p && p.id === 'R026-boundary');
      if (!r026) {
        errors.push('R026-boundary patch missing from doctrine.patches');
      } else {
        if (r026.status !== 'authoritative') {
          errors.push(
            `R026-boundary patch must have status "authoritative" (got "${r026.status}")`
          );
        }
        if (typeof r026.invariant !== 'string' || r026.invariant.length < 20) {
          errors.push('R026-boundary patch.invariant missing or too short');
        }
      }
    }
  }

  // ----- 02 runtime_identity_provisional -----
  if (
    !map.runtime_identity_claims ||
    typeof map.runtime_identity_claims !== 'object'
  ) {
    errors.push('runtime_identity_claims section missing or not an object');
  } else {
    if (
      typeof map.runtime_identity_claims.policy !== 'string' ||
      !/provisional/i.test(map.runtime_identity_claims.policy)
    ) {
      errors.push(
        'runtime_identity_claims.policy must declare "provisional" status'
      );
    }
    const companies = map.runtime_identity_claims.companies;
    if (!Array.isArray(companies) || companies.length === 0) {
      errors.push(
        'runtime_identity_claims.companies must be a non-empty array'
      );
    } else {
      for (const c of companies) {
        if (!c || typeof c !== 'object') {
          errors.push('runtime_identity_claims.companies contains non-object entry');
          continue;
        }
        if (c.fresh_readback_required !== true) {
          errors.push(
            `runtime_identity_claims company "${c.candidate_id || '<unknown>'}" not marked fresh_readback_required: true`
          );
        }
      }
    }
  }

  // ----- 03 stale_id_must_appear -----
  if (
    map.runtime_identity_claims &&
    typeof map.runtime_identity_claims === 'object'
  ) {
    const coverageIds = new Set();
    const companies = Array.isArray(map.runtime_identity_claims.companies)
      ? map.runtime_identity_claims.companies
      : [];
    for (const c of companies) {
      if (c && typeof c.candidate_id === 'string') {
        coverageIds.add(c.candidate_id);
      }
    }
    const additional = Array.isArray(
      map.runtime_identity_claims.additional_stale_ids_r3
    )
      ? map.runtime_identity_claims.additional_stale_ids_r3
      : [];
    for (const id of additional) {
      if (typeof id === 'string') coverageIds.add(id);
    }
    for (const prefix of STALE_ID_PREFIXES) {
      const present = Array.from(coverageIds).some((id) => id.startsWith(prefix));
      if (!present) {
        errors.push(
          `stale UUID prefix ${prefix}… not classified in runtime_identity_claims (R3)` +
            ' (must appear in runtime_identity_claims.companies[].candidate_id' +
            ' or runtime_identity_claims.additional_stale_ids_r3)'
        );
      }
    }
  }

  // ----- 04 hermes_promotion_requires + 05 gsdpi_promotion_requires -----
  if (map.runtime_surfaces && Array.isArray(map.runtime_surfaces.surfaces)) {
    const hermes = map.runtime_surfaces.surfaces.filter((s) =>
      typeof (s && s.name) === 'string' && /hermes/i.test(s.name)
    );
    const gsdpi = map.runtime_surfaces.surfaces.filter((s) =>
      typeof (s && s.name) === 'string' &&
      (/gsd[\s_-]?pi/i.test(s.name) || /gsdpi/i.test(s.name))
    );

    if (hermes.length === 0) {
      errors.push('Hermes execution surface missing from runtime_surfaces.surfaces');
    }
    if (gsdpi.length === 0) {
      errors.push('GSD-Pi execution surface missing from runtime_surfaces.surfaces');
    }

    for (const surface of hermes) {
      if (surface.promotion_state !== 'fail-closed' && surface.promotion_state !== 'blocked') {
        errors.push(
          `Hermes surface "${surface.name}" promoted past fail-closed (promotion_state="${surface.promotion_state}")`
        );
      }
      if (!Array.isArray(surface.promotion_requires) || surface.promotion_requires.length === 0) {
        errors.push(
          `Hermes surface "${surface.name}" has empty promotion_requires (must enumerate proof fields)`
        );
      }
    }
    for (const surface of gsdpi) {
      if (surface.promotion_state !== 'fail-closed' && surface.promotion_state !== 'blocked') {
        errors.push(
          `GSD-Pi surface "${surface.name}" promoted past fail-closed (promotion_state="${surface.promotion_state}")`
        );
      }
      if (!Array.isArray(surface.promotion_requires) || surface.promotion_requires.length === 0) {
        errors.push(
          `GSD-Pi surface "${surface.name}" has empty promotion_requires (must enumerate proof fields)`
        );
      }
    }
  } else if (map.runtime_surfaces) {
    errors.push('runtime_surfaces.surfaces must be an array');
  }

  // ----- 06 bounded_promotable_surfaces -----
  if (map.runtime_surfaces && typeof map.runtime_surfaces === 'object') {
    const promotable = map.runtime_surfaces.promotable_via_native_evidence_only;
    if (!Array.isArray(promotable)) {
      errors.push(
        'runtime_surfaces.promotable_via_native_evidence_only must be an array'
      );
    } else {
      for (const required of BOUNDED_PROMOTABLE_SURFACES) {
        if (!promotable.includes(required)) {
          errors.push(
            `bounded promotable surface "${required}" missing from promotable_via_native_evidence_only`
          );
        }
      }
    }
  }

  // ----- 07 blocked_surfaces -----
  if (map.runtime_surfaces && Array.isArray(map.runtime_surfaces.surfaces)) {
    const blockedNames = new Set(
      map.runtime_surfaces.surfaces
        .filter((s) => s && s.promotion_state === 'blocked')
        .map((s) => s.name)
    );
    for (const required of REQUIRED_BLOCKED_SURFACES) {
      if (!blockedNames.has(required)) {
        errors.push(
          `expected blocked surface "${required}" missing from runtime_surfaces.surfaces (or not marked blocked)`
        );
      }
    }
  }

  // ----- 08 governance_gates -----
  if (!Array.isArray(map.governance_risks)) {
    errors.push('governance_risks must be an array');
  } else if (map.governance_risks.length < 3) {
    errors.push(
      `governance_risks must have at least 3 entries (has ${map.governance_risks.length})`
    );
  } else {
    for (const gr of map.governance_risks) {
      if (!gr || typeof gr !== 'object') {
        errors.push('governance_risks contains non-object entry');
        continue;
      }
      const missingFields = REQUIRED_GOVERNANCE_RISK_FIELDS.filter(
        (f) => !gr[f]
      );
      if (missingFields.length > 0) {
        errors.push(
          `governance_risks entry "${gr.id || '<no-id>'}" missing fields: ${missingFields.join(', ')}`
        );
      }
    }
  }

  // ----- 09 health_endpoint_not_proof -----
  if (!map.health_endpoint_policy || typeof map.health_endpoint_policy !== 'object') {
    errors.push('health_endpoint_policy section missing or not an object');
  } else {
    if (map.health_endpoint_policy.promotion_state !== 'not-runtime-proof') {
      errors.push(
        `health_endpoint_policy.promotion_state must be "not-runtime-proof" (got "${map.health_endpoint_policy.promotion_state}")`
      );
    }
    if (
      typeof map.health_endpoint_policy.rule !== 'string' ||
      !/not\s+(a\s+)?runtime\s+persistence\s+proof/i.test(
        map.health_endpoint_policy.rule
      )
    ) {
      errors.push(
        'health_endpoint_policy.rule must explicitly deny /api/health as runtime persistence proof'
      );
    }
  }

  // ----- 10 vps_targets_present -----
  if (!map.vps_targets || typeof map.vps_targets !== 'object') {
    errors.push('vps_targets section missing or not an object');
  } else {
    for (const field of REQUIRED_VPS_TARGET_FIELDS) {
      if (!(field in map.vps_targets)) {
        errors.push(`vps_targets missing required field: ${field}`);
      }
    }
    if (
      Array.isArray(map.vps_targets.forbidden_commands) &&
      map.vps_targets.forbidden_commands.length === 0
    ) {
      errors.push('vps_targets.forbidden_commands must be non-empty');
    }
    if (
      Array.isArray(map.vps_targets.read_only_commands_acceptable) &&
      map.vps_targets.read_only_commands_acceptable.length === 0
    ) {
      errors.push('vps_targets.read_only_commands_acceptable must be non-empty');
    }
  }

  // ----- 11 scripts_to_harden_present -----
  if (!Array.isArray(map.scripts_to_harden)) {
    errors.push('scripts_to_harden must be an array');
  } else if (map.scripts_to_harden.length === 0) {
    errors.push('scripts_to_harden must have at least one entry');
  } else {
    for (const s of map.scripts_to_harden) {
      if (!s || typeof s !== 'object') {
        errors.push('scripts_to_harden contains non-object entry');
        continue;
      }
      const missingFields = REQUIRED_SCRIPT_HARDEN_FIELDS.filter((f) => !s[f]);
      if (missingFields.length > 0) {
        errors.push(
          `scripts_to_harden entry missing fields: ${missingFields.join(', ')} (entry: ${JSON.stringify(s).slice(0, 120)})`
        );
      }
    }
  }

  // ----- 10b no_promotion_ledger (cross-check) -----
  if (
    !map.no_promotion_ledger ||
    typeof map.no_promotion_ledger !== 'object' ||
    !Array.isArray(map.no_promotion_ledger.keys)
  ) {
    errors.push('no_promotion_ledger.keys must be an array');
  } else {
    for (const key of REQUIRED_NO_PROMOTION_KEYS) {
      if (!map.no_promotion_ledger.keys.includes(key)) {
        errors.push(`no_promotion_ledger.keys missing "${key}"`);
      }
    }
  }

  return errors;
}

/* ============================================================================
 * Synthetic fixtures
 *
 * `makeValidFixture()` returns a truth-map-shaped object that satisfies every
 * validator class. Negative fixtures mutate a single dimension of the valid
 * fixture so each `it` block exercises exactly one failure path.
 * ========================================================================= */

function makeValidFixture() {
  const staleCompanyEntries = STALE_ID_PREFIXES.slice(0, 3).map((prefix) => ({
    candidate_id: `${prefix}-…`,
    company_label: `/fixture-${prefix}`,
    last_authoritative_epoch: 'fixture',
    evidence_files: [],
    classification: 'fixture-stale',
    promotion_state: 'fallback-only',
    fresh_readback_required: true,
    notes: 'fixture entry',
  }));

  return {
    $schema: 'gsd/m014-s01-runtime-truth-map-v1',
    milestone: 'M014-a9jj46',
    slice: 'S01',
    task: 'T03-fixture',
    doctrine: {
      baseline: {
        id: 'fixture-baseline',
        status: 'authoritative',
        sources: [],
        core_one_liner: 'fixture',
        non_negotiable_rule_count: 0,
      },
      patches: [
        {
          id: 'R026-boundary',
          version: 'fixture-v1',
          status: 'authoritative',
          invariant:
            'Div7 decision output is not an operational terminal route ' +
            '(fixture invariant for validator self-test).',
          sources: [],
        },
      ],
    },
    runtime_identity_claims: {
      policy:
        'all canonical-company claims are provisional until fresh authenticated readback (fixture)',
      companies: staleCompanyEntries,
      additional_stale_ids_r3: STALE_ID_PREFIXES.slice(3).map((p) => `${p}-…`),
      r3_rule: 'fixture',
    },
    auth_status: { default_mode: 'fixture', auth_modes: [] },
    runtime_surfaces: {
      promotable_via_native_evidence_only: ['issue', 'document', 'comment'],
      surfaces: [
        ...BOUNDED_PROMOTABLE_SURFACES.map((name) => ({
          name,
          scope: 'create + readback',
          status: 'bounded-promotable',
          promotion_state: 'confirmed-surface',
        })),
        ...REQUIRED_BLOCKED_SURFACES.map((name) => ({
          name,
          scope: 'any',
          status: 'do-not-promote',
          promotion_state: 'blocked',
        })),
        {
          name: 'state-event-activity',
          scope: 'any',
          status: 'do-not-promote',
          promotion_state: 'blocked',
        },
        {
          name: 'Hermes execution',
          scope: 'any',
          status: 'do-not-promote',
          promotion_state: 'fail-closed',
          promotion_requires: [
            'live terminal run status (exit 0)',
            'resultJson.bos readback with non-empty payload',
            'explicit adapter identity validation',
          ],
        },
        {
          name: 'GSD-Pi execution',
          scope: 'any',
          status: 'do-not-promote',
          promotion_state: 'fail-closed',
          promotion_requires: [
            'registry readback confirming gsdpi_local',
            'passing testEnvironment',
            'BosAdapterResult execution proof',
          ],
        },
      ],
    },
    health_endpoint_policy: {
      endpoint: '/api/health',
      promotion_state: 'not-runtime-proof',
      rule: '/api/health is NOT a runtime persistence proof (fixture).',
      rationale: 'fixture',
    },
    failure_window_evidence: { window: 'fixture', key_artifacts: [] },
    m002_fail_closed_anchors: { policy: 'fixture', files: [] },
    scripts_to_harden: [
      {
        script: 'scripts/fixture-script-a.py',
        hardcoded_company_id: '9feb4c22-…',
        epoch: 'fixture',
        risk_class: 'fixture',
        hardening_target: 'fixture S03 hardening target',
      },
    ],
    governance_risks: [
      { id: 'GR-001', title: 'fixture-a', rule: 'fixture rule a', evidence: 'fixture evidence a' },
      { id: 'GR-002', title: 'fixture-b', rule: 'fixture rule b', evidence: 'fixture evidence b' },
      { id: 'GR-003', title: 'fixture-c', rule: 'fixture rule c', evidence: 'fixture evidence c' },
    ],
    proof_gaps: [],
    vps_targets: {
      vps_ip: '0.0.0.0',
      sandbox_path: '/fixture',
      container_name: 'fixture-container',
      forbidden_commands: ['fixture forbid a'],
      read_only_commands_acceptable: ['fixture read a'],
      safe_restart_command: 'fixture restart',
    },
    memorandum_provenance: { rules: {}, memory_ids: [] },
    canonical_decision_posture: { verdict: 'fixture', option_selected: 'fixture', anti_goals: [] },
    no_promotion_ledger: {
      policy: 'fixture',
      keys: [
        'runtime_surfaces.surfaces[Hermes execution].promotion_state',
        'runtime_surfaces.surfaces[GSD-Pi execution].promotion_state',
      ],
    },
  };
}

function makeFixtureMissingRequiredSections() {
  const fixture = makeValidFixture();
  delete fixture.runtime_identity_claims;
  delete fixture.health_endpoint_policy;
  delete fixture.vps_targets;
  return fixture;
}

function makeFixtureMissingStaleIds() {
  const fixture = makeValidFixture();
  fixture.runtime_identity_claims.companies = fixture.runtime_identity_claims.companies.slice(0, 1);
  fixture.runtime_identity_claims.additional_stale_ids_r3 = [];
  return fixture;
}

function makeFixtureHermesPromotedWithoutProof() {
  const fixture = makeValidFixture();
  for (const surface of fixture.runtime_surfaces.surfaces) {
    if (surface.name === 'Hermes execution') {
      surface.promotion_state = 'confirmed-surface';
      surface.promotion_requires = [];
      break;
    }
  }
  return fixture;
}

function makeFixtureGsdpiPromotedWithoutProof() {
  const fixture = makeValidFixture();
  for (const surface of fixture.runtime_surfaces.surfaces) {
    if (surface.name === 'GSD-Pi execution') {
      surface.promotion_state = 'confirmed-surface';
      surface.promotion_requires = [];
      break;
    }
  }
  return fixture;
}

function makeFixtureMissingR026Patch() {
  const fixture = makeValidFixture();
  // Keep patches non-empty but remove the R026-boundary entry so the
  // R026-specific check (rather than the empty-array check) is what fails.
  fixture.doctrine.patches = [
    {
      id: 'fixture-other-patch',
      version: 'fixture-v0',
      status: 'authoritative',
      invariant: 'fixture other invariant — does not replace R026.',
      sources: [],
    },
  ];
  return fixture;
}

function makeFixtureHealthEndpointPromotedAsProof() {
  const fixture = makeValidFixture();
  fixture.health_endpoint_policy.promotion_state = 'confirmed';
  return fixture;
}

/* ============================================================================
 * Test suites
 * ========================================================================= */

describe('M014 S01 truth map validator — canonical artifact (T02 output)', () => {
  let map;
  let errors;

  before(() => {
    if (!fs.existsSync(TRUTH_MAP_JSON)) {
      throw new Error(
        `Truth map JSON not found at ${TRUTH_MAP_JSON} — run T02 first.`
      );
    }
    map = loadTruthMap(TRUTH_MAP_JSON);
    errors = validateTruthMap(map);
  });

  it('truth map JSON file exists and is parseable', () => {
    assert.ok(fs.existsSync(TRUTH_MAP_JSON));
    assert.equal(typeof map, 'object');
    assert.ok(map);
  });

  it('aggregated validation produces zero errors', () => {
    if (errors.length > 0) {
      throw new assert.AssertionError({
        message:
          'Canonical truth map produced ' +
          errors.length +
          ' validation error(s):\n  - ' +
          errors.join('\n  - '),
        actual: errors,
        expected: [],
        operator: 'deepEqual',
      });
    }
    assert.deepEqual(errors, []);
  });

  it('has every required top-level key', () => {
    for (const key of REQUIRED_TOP_KEYS) {
      assert.ok(key in map, `missing required top-level key: ${key}`);
    }
  });

  it('doctrine declares authoritative baseline + R026 patch', () => {
    assert.ok(map.doctrine.baseline);
    assert.equal(map.doctrine.baseline.status, 'authoritative');
    const r026 = map.doctrine.patches.find((p) => p && p.id === 'R026-boundary');
    assert.ok(r026, 'R026-boundary patch must be present');
    assert.equal(r026.status, 'authoritative');
    assert.ok(typeof r026.invariant === 'string' && r026.invariant.length > 20);
  });

  it('every company claim is marked fresh_readback_required: true', () => {
    const companies = map.runtime_identity_claims.companies;
    for (const c of companies) {
      assert.equal(
        c.fresh_readback_required,
        true,
        `company "${c.candidate_id}" missing fresh_readback_required: true`
      );
    }
  });

  it('every R3 stale UUID prefix is classified', () => {
    const ids = new Set();
    for (const c of map.runtime_identity_claims.companies) {
      ids.add(c.candidate_id);
    }
    for (const id of map.runtime_identity_claims.additional_stale_ids_r3 || []) {
      ids.add(id);
    }
    for (const prefix of STALE_ID_PREFIXES) {
      const present = Array.from(ids).some((id) => id.startsWith(prefix));
      assert.ok(present, `stale UUID prefix ${prefix}… not classified`);
    }
  });

  it('Hermes and GSD-Pi surfaces are fail-closed with non-empty promotion_requires', () => {
    const hermes = map.runtime_surfaces.surfaces.find((s) => /hermes/i.test(s.name));
    const gsdpi = map.runtime_surfaces.surfaces.find(
      (s) => /gsd[\s_-]?pi/i.test(s.name) || /gsdpi/i.test(s.name)
    );
    assert.ok(hermes, 'Hermes surface must exist');
    assert.ok(gsdpi, 'GSD-Pi surface must exist');
    assert.equal(hermes.promotion_state, 'fail-closed');
    assert.equal(gsdpi.promotion_state, 'fail-closed');
    assert.ok(Array.isArray(hermes.promotion_requires) && hermes.promotion_requires.length > 0);
    assert.ok(Array.isArray(gsdpi.promotion_requires) && gsdpi.promotion_requires.length > 0);
  });

  it('bounded promotable set contains issue, document, comment', () => {
    const promotable = map.runtime_surfaces.promotable_via_native_evidence_only;
    for (const required of BOUNDED_PROMOTABLE_SURFACES) {
      assert.ok(promotable.includes(required), `bounded surface "${required}" missing`);
    }
  });

  it('every required blocked surface is present', () => {
    const blocked = new Set(
      map.runtime_surfaces.surfaces
        .filter((s) => s && s.promotion_state === 'blocked')
        .map((s) => s.name)
    );
    for (const required of REQUIRED_BLOCKED_SURFACES) {
      assert.ok(blocked.has(required), `blocked surface "${required}" missing`);
    }
  });

  it('governance_risks entries have id, title, rule, evidence', () => {
    assert.ok(Array.isArray(map.governance_risks) && map.governance_risks.length >= 3);
    for (const gr of map.governance_risks) {
      for (const field of REQUIRED_GOVERNANCE_RISK_FIELDS) {
        assert.ok(gr[field], `governance_risks entry "${gr.id || '<no-id>'}" missing "${field}"`);
      }
    }
  });

  it('health_endpoint_policy explicitly denies /api/health as proof', () => {
    assert.equal(map.health_endpoint_policy.promotion_state, 'not-runtime-proof');
    assert.ok(
      /not\s+(a\s+)?runtime\s+persistence\s+proof/i.test(map.health_endpoint_policy.rule),
      'health_endpoint_policy.rule must explicitly deny health endpoint as proof'
    );
  });

  it('vps_targets carries every required field', () => {
    for (const field of REQUIRED_VPS_TARGET_FIELDS) {
      assert.ok(field in map.vps_targets, `vps_targets missing field: ${field}`);
    }
    assert.ok(map.vps_targets.forbidden_commands.length > 0);
    assert.ok(map.vps_targets.read_only_commands_acceptable.length > 0);
  });

  it('scripts_to_harden entries carry script, hardcoded_company_id, hardening_target', () => {
    assert.ok(Array.isArray(map.scripts_to_harden) && map.scripts_to_harden.length > 0);
    for (const s of map.scripts_to_harden) {
      for (const field of REQUIRED_SCRIPT_HARDEN_FIELDS) {
        assert.ok(s[field], `scripts_to_harden entry missing "${field}"`);
      }
    }
  });

  it('no_promotion_ledger keys include Hermes and GSD-Pi guards', () => {
    for (const key of REQUIRED_NO_PROMOTION_KEYS) {
      assert.ok(
        map.no_promotion_ledger.keys.includes(key),
        `no_promotion_ledger.keys missing "${key}"`
      );
    }
  });
});

describe('M014 S01 truth map validator — twin artifacts exist', () => {
  it('human-readable markdown twin exists at runtime-evidence/M014-S01-runtime-truth-map.md', () => {
    assert.ok(
      fs.existsSync(TRUTH_MAP_MD),
      `missing markdown twin at ${TRUTH_MAP_MD}`
    );
    const text = fs.readFileSync(TRUTH_MAP_MD, 'utf8');
    assert.ok(text.length > 200, 'markdown twin is suspiciously short');
  });

  it('source inventory from T01 exists at runtime-evidence/M014-S01-source-inventory.md', () => {
    assert.ok(
      fs.existsSync(SOURCE_INVENTORY),
      `missing source inventory at ${SOURCE_INVENTORY}`
    );
  });
});

describe('M014 S01 truth map validator — synthetic fixtures', () => {
  it('valid fixture produces zero validation errors', () => {
    const fixture = makeValidFixture();
    const errs = validateTruthMap(fixture);
    assert.deepEqual(errs, [], `expected zero errors, got: ${JSON.stringify(errs)}`);
  });

  it('non-object input is rejected with a single error', () => {
    for (const bad of [null, undefined, 'string', 42, [], true]) {
      const errs = validateTruthMap(bad);
      assert.ok(errs.length > 0, `non-object input ${JSON.stringify(bad)} must be rejected`);
      assert.ok(/object/i.test(errs[0]), `error message should mention object: ${errs[0]}`);
    }
  });

  it('fixture missing required sections is rejected', () => {
    const fixture = makeFixtureMissingRequiredSections();
    const errs = validateTruthMap(fixture);
    assert.ok(errs.length >= 3, `expected ≥3 errors, got ${errs.length}: ${JSON.stringify(errs)}`);
    assert.ok(
      errs.some((e) => /runtime_identity_claims/.test(e)),
      'should flag missing runtime_identity_claims'
    );
    assert.ok(
      errs.some((e) => /health_endpoint_policy/.test(e)),
      'should flag missing health_endpoint_policy'
    );
    assert.ok(
      errs.some((e) => /vps_targets/.test(e)),
      'should flag missing vps_targets'
    );
  });

  it('fixture missing R3 stale UUIDs is rejected', () => {
    const fixture = makeFixtureMissingStaleIds();
    const errs = validateTruthMap(fixture);
    assert.ok(errs.length > 0, 'missing-stale-IDs fixture must produce errors');
    assert.ok(
      errs.some((e) => /43c74adb/.test(e) || /stale/i.test(e)),
      `should flag missing stale UUID, got: ${JSON.stringify(errs)}`
    );
  });

  it('fixture with Hermes promoted past fail-closed and emptied proof is rejected', () => {
    const fixture = makeFixtureHermesPromotedWithoutProof();
    const errs = validateTruthMap(fixture);
    assert.ok(errs.length > 0, 'Hermes-promoted-without-proof fixture must fail');
    const hermesErrors = errs.filter((e) => /hermes/i.test(e));
    assert.ok(
      hermesErrors.length >= 2,
      `expected ≥2 Hermes errors (state + empty proof), got: ${JSON.stringify(hermesErrors)}`
    );
  });

  it('fixture with GSD-Pi promoted past fail-closed and emptied proof is rejected', () => {
    const fixture = makeFixtureGsdpiPromotedWithoutProof();
    const errs = validateTruthMap(fixture);
    assert.ok(errs.length > 0, 'GSD-Pi-promoted-without-proof fixture must fail');
    const gsdpiErrors = errs.filter((e) => /gsd-pi|gsdpi/i.test(e));
    assert.ok(
      gsdpiErrors.length >= 2,
      `expected ≥2 GSD-Pi errors (state + empty proof), got: ${JSON.stringify(gsdpiErrors)}`
    );
  });

  it('fixture missing R026 patch is rejected', () => {
    const fixture = makeFixtureMissingR026Patch();
    const errs = validateTruthMap(fixture);
    assert.ok(
      errs.some((e) => /R026/.test(e)),
      `should flag missing R026 patch, got: ${JSON.stringify(errs)}`
    );
  });

  it('fixture that promotes /api/health as proof is rejected', () => {
    const fixture = makeFixtureHealthEndpointPromotedAsProof();
    const errs = validateTruthMap(fixture);
    assert.ok(
      errs.some((e) => /health_endpoint/.test(e)),
      `should flag health endpoint promotion, got: ${JSON.stringify(errs)}`
    );
  });
});

/* ============================================================================
 * CLI gate (used by S01 closeout, not by `node --test`)
 *
 * The CLI block runs only when this file is the script entry point AND the
 * process was NOT launched via `node --test`. Under `node --test`,
 * `require.main === module` is true for the file under test, so an unguarded
 * auto-invocation would call process.exit() before the test runner could
 * register the describe/it blocks above.
 * ========================================================================= */

function runCli() {
  if (!fs.existsSync(TRUTH_MAP_JSON)) {
    console.error(`FAIL: truth map not found at ${TRUTH_MAP_JSON}`);
    process.exitCode = 2;
    return;
  }
  let map;
  try {
    map = loadTruthMap(TRUTH_MAP_JSON);
  } catch (err) {
    console.error(
      `FAIL: could not parse truth map JSON: ${err && err.message ? err.message : String(err)}`
    );
    process.exitCode = 2;
    return;
  }
  const errors = validateTruthMap(map);
  if (errors.length === 0) {
    console.log(
      'PASS: M014-S01 runtime truth map validates cleanly across all 11 validator classes.'
    );
    process.exitCode = 0;
    return;
  }
  console.error(`FAIL: ${errors.length} validation error(s):`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exitCode = 1;
}

function isLaunchedUnderNodeTest() {
  if (Array.isArray(process.execArgv)) {
    for (const arg of process.execArgv) {
      if (typeof arg === 'string' && arg.includes('--test')) return true;
    }
  }
  if (Array.isArray(process.argv)) {
    for (const arg of process.argv) {
      if (typeof arg === 'string' && arg.includes('--test')) return true;
    }
  }
  return false;
}

if (
  require.main === module &&
  !isLaunchedUnderNodeTest()
) {
  runCli();
}

module.exports = {
  validateTruthMap,
  loadTruthMap,
  makeValidFixture,
  makeFixtureMissingRequiredSections,
  makeFixtureMissingStaleIds,
  makeFixtureHermesPromotedWithoutProof,
  makeFixtureGsdpiPromotedWithoutProof,
  makeFixtureMissingR026Patch,
  makeFixtureHealthEndpointPromotedAsProof,
  REQUIRED_TOP_KEYS,
  STALE_ID_PREFIXES,
  BOUNDED_PROMOTABLE_SURFACES,
  REQUIRED_BLOCKED_SURFACES,
  REQUIRED_GOVERNANCE_RISK_FIELDS,
  REQUIRED_VPS_TARGET_FIELDS,
  REQUIRED_SCRIPT_HARDEN_FIELDS,
  REQUIRED_NO_PROMOTION_KEYS,
};