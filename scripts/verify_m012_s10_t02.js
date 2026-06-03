const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const JSON_PATH = path.join(ROOT, 'runtime-evidence', 'M012-S10-runtime-requirement-coverage.json');
const MD_PATH = path.join(ROOT, 'runtime-evidence', 'M012-S10-runtime-requirement-coverage.md');

describe('M012-S10-T02 runtime requirement coverage artifacts', () => {
  it('JSON artifact exists', () => {
    assert.ok(fs.existsSync(JSON_PATH), `File must exist: ${JSON_PATH}`);
  });

  it('Markdown artifact exists', () => {
    assert.ok(fs.existsSync(MD_PATH), `File must exist: ${MD_PATH}`);
  });

  it('JSON artifact parses successfully', () => {
    const raw = fs.readFileSync(JSON_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    assert.ok(parsed, 'Parsed JSON must be truthy');
    assert.equal(parsed.schema_version, 'm012-s10-runtime-requirement-coverage/v1');
    assert.equal(parsed.artifact_type, 'runtime-requirement-coverage');
    assert.equal(parsed.milestone_id, 'M012-ihd2ez');
  });

  it('JSON has descoping entries for R017 and R019', () => {
    const raw = fs.readFileSync(JSON_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    const ids = parsed.descoping_entries.map(e => e.requirement_id);
    assert.ok(ids.includes('R017'), 'Must include R017 descoping entry');
    assert.ok(ids.includes('R019'), 'Must include R019 descoping entry');
    assert.equal(parsed.descoping_entries.length, 2, 'Must have exactly 2 descoping entries');
  });

  it('R017 descoping entry has required fields', () => {
    const raw = fs.readFileSync(JSON_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    const r017 = parsed.descoping_entries.find(e => e.requirement_id === 'R017');
    assert.ok(r017, 'R017 entry must exist');
    assert.ok(r017.requirement_text, 'R017 must have requirement_text');
    assert.equal(r017.previous_status, 'active', 'R017 previous_status must be active');
    assert.equal(r017.new_status, 'deferred', 'R017 new_status must be deferred');
    assert.ok(r017.rationale, 'R017 must have rationale');
    assert.ok(Array.isArray(r017.blocker_citations), 'R017 must have blocker_citations array');
    assert.ok(r017.blocker_citations.length > 0, 'R017 must have at least one blocker citation');
    assert.equal(r017.safety_flags.no_capability_promotion, true, 'R017 no_capability_promotion must be true');
    assert.equal(r017.safety_flags.no_live_mutation, true, 'R017 no_live_mutation must be true');
  });

  it('R019 descoping entry has required fields', () => {
    const raw = fs.readFileSync(JSON_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    const r019 = parsed.descoping_entries.find(e => e.requirement_id === 'R019');
    assert.ok(r019, 'R019 entry must exist');
    assert.ok(r019.requirement_text, 'R019 must have requirement_text');
    assert.equal(r019.previous_status, 'active', 'R019 previous_status must be active');
    assert.equal(r019.new_status, 'deferred', 'R019 new_status must be deferred');
    assert.ok(r019.rationale, 'R019 must have rationale');
    assert.ok(Array.isArray(r019.blocker_citations), 'R019 must have blocker_citations array');
    assert.ok(r019.blocker_citations.length > 0, 'R019 must have at least one blocker citation');
    assert.equal(r019.safety_flags.no_capability_promotion, true, 'R019 no_capability_promotion must be true');
    assert.equal(r019.safety_flags.no_live_mutation, true, 'R019 no_live_mutation must be true');
  });

  it('R017 blocker citations reference M005 plugin probe', () => {
    const raw = fs.readFileSync(JSON_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    const r017 = parsed.descoping_entries.find(e => e.requirement_id === 'R017');
    const hasProbeRef = r017.blocker_citations.some(c =>
      c.artifact && c.artifact.includes('M005-S01-plugin-ui-surface-probe')
    );
    assert.ok(hasProbeRef, 'R017 must cite M005-S01-plugin-ui-surface-probe.json');
  });

  it('R019 blocker citations reference M005 hermes probe', () => {
    const raw = fs.readFileSync(JSON_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    const r019 = parsed.descoping_entries.find(e => e.requirement_id === 'R019');
    const hasProbeRef = r019.blocker_citations.some(c =>
      c.artifact && c.artifact.includes('M005-S01-hermes-xiaomi-runtime-probe')
    );
    assert.ok(hasProbeRef, 'R019 must cite M005-S01-hermes-xiaomi-runtime-probe.json');
  });

  it('JSON safety attestation confirms no promotion and no mutation', () => {
    const raw = fs.readFileSync(JSON_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    assert.equal(parsed.safety_attestation.no_capability_promotion, true);
    assert.equal(parsed.safety_attestation.no_live_mutation, true);
    assert.equal(parsed.safety_attestation.descoping_is_honest_disposition, true);
    assert.equal(parsed.safety_attestation.all_blockers_cited_from_probe_artifacts, true);
  });

  it('Markdown artifact is non-empty', () => {
    const content = fs.readFileSync(MD_PATH, 'utf8');
    assert.ok(content.length > 0, 'Markdown file must be non-empty');
    assert.ok(content.includes('R017'), 'Markdown must mention R017');
    assert.ok(content.includes('R019'), 'Markdown must mention R019');
    assert.ok(content.includes('deferred'), 'Markdown must mention deferred status');
  });

  it('Markdown references blocker probe artifacts', () => {
    const content = fs.readFileSync(MD_PATH, 'utf8');
    assert.ok(content.includes('M005-S01-plugin-ui-surface-probe'), 'Must reference plugin probe');
    assert.ok(content.includes('M005-S01-hermes-xiaomi-runtime-probe'), 'Must reference hermes probe');
  });
});
