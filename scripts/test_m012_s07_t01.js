const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const BASE = path.resolve(__dirname, '..');

function readJSON(rel) {
  const full = path.join(BASE, rel);
  assert.ok(fs.existsSync(full), `Missing file: ${rel}`);
  return JSON.parse(fs.readFileSync(full, 'utf-8'));
}

function readText(rel) {
  const full = path.join(BASE, rel);
  assert.ok(fs.existsSync(full), `Missing file: ${rel}`);
  return fs.readFileSync(full, 'utf-8');
}

describe('M012-S07-T01 artifact validation', () => {

  describe('M012-S07-rescope-decision.json', () => {
    it('exists and is valid JSON', () => {
      const d = readJSON('runtime-evidence/M012-S07-rescope-decision.json');
      assert.ok(d, 'parsed');
    });

    it('has required schema_version', () => {
      const d = readJSON('runtime-evidence/M012-S07-rescope-decision.json');
      assert.equal(d.schema_version, 'm012-s07-rescope-decision/v1');
    });

    it('has decision_type milestone-criterion-rescope', () => {
      const d = readJSON('runtime-evidence/M012-S07-rescope-decision.json');
      assert.equal(d.decision_type, 'milestone-criterion-rescope');
    });

    it('documents auto-mode constraint', () => {
      const d = readJSON('runtime-evidence/M012-S07-rescope-decision.json');
      assert.ok(d.constraint.includes('auto-mode'), 'constraint mentions auto-mode');
      assert.ok(d.constraint.includes('ask_user_questions'), 'constraint mentions ask_user_questions');
    });

    it('lists exactly two blocked paths', () => {
      const d = readJSON('runtime-evidence/M012-S07-rescope-decision.json');
      assert.ok(Array.isArray(d.blocked_paths), 'blocked_paths is array');
      assert.equal(d.blocked_paths.length, 2);
      assert.ok(d.blocked_paths[0].includes('Path A'), 'first is Path A');
      assert.ok(d.blocked_paths[1].includes('Path B'), 'second is Path B');
    });

    it('selects Path C', () => {
      const d = readJSON('runtime-evidence/M012-S07-rescope-decision.json');
      assert.equal(d.selected_path, 'Path C: formal re-scope');
    });

    it('has re_scoped_criterion', () => {
      const d = readJSON('runtime-evidence/M012-S07-rescope-decision.json');
      assert.ok(typeof d.re_scoped_criterion === 'string', 're_scoped_criterion is string');
      assert.ok(d.re_scoped_criterion.length > 50, 're_scoped_criterion is substantive');
    });

    it('has canonical_company_id matching S06 evidence', () => {
      const d = readJSON('runtime-evidence/M012-S07-rescope-decision.json');
      assert.equal(d.canonical_company_id, '9feb4c22-05b9-401e-ba67-0e866e3056da');
    });

    it('has issue_id matching S06 evidence', () => {
      const d = readJSON('runtime-evidence/M012-S07-rescope-decision.json');
      assert.equal(d.issue_id, 'b9d9ab93-70ee-4562-b28c-0be62f18db60');
    });

    it('has issue_identifier BOS-3', () => {
      const d = readJSON('runtime-evidence/M012-S07-rescope-decision.json');
      assert.equal(d.issue_identifier, 'BOS-3');
    });

    it('preserves deviation note', () => {
      const d = readJSON('runtime-evidence/M012-S07-rescope-decision.json');
      assert.equal(d.deviation_preserved, true);
      assert.ok(d.deviation_note.length > 20, 'deviation_note is substantive');
    });

    it('does not contain plaintext secrets', () => {
      const raw = fs.readFileSync(path.join(BASE, 'runtime-evidence/M012-S07-rescope-decision.json'), 'utf-8');
      assert.ok(!raw.includes('password'), 'no password in artifact');
      assert.ok(!raw.includes('sk-'), 'no API key prefix in artifact');
    });
  });

  describe('M012-S07-rescope-decision.md', () => {
    it('exists and is non-empty', () => {
      const md = readText('runtime-evidence/M012-S07-rescope-decision.md');
      assert.ok(md.length > 100, 'markdown is substantive');
    });

    it('documents all three paths', () => {
      const md = readText('runtime-evidence/M012-S07-rescope-decision.md');
      assert.ok(md.includes('Path A'), 'documents Path A');
      assert.ok(md.includes('Path B'), 'documents Path B');
      assert.ok(md.includes('Path C'), 'documents Path C');
    });

    it('references BOS-3', () => {
      const md = readText('runtime-evidence/M012-S07-rescope-decision.md');
      assert.ok(md.includes('BOS-3'), 'references BOS-3');
    });

    it('does not contain plaintext secrets', () => {
      const md = readText('runtime-evidence/M012-S07-rescope-decision.md');
      assert.ok(!md.includes('password'), 'no password in artifact');
      assert.ok(!md.match(/sk-[a-zA-Z0-9]{20,}/), 'no API key in artifact');
    });
  });

  describe('M012-S07-requirement-update-evidence.json', () => {
    it('exists and is valid JSON', () => {
      const d = readJSON('runtime-evidence/M012-S07-requirement-update-evidence.json');
      assert.ok(d, 'parsed');
    });

    it('has required schema_version', () => {
      const d = readJSON('runtime-evidence/M012-S07-requirement-update-evidence.json');
      assert.equal(d.schema_version, 'm012-s07-requirement-update-evidence/v1');
    });

    it('documents R022 changes', () => {
      const d = readJSON('runtime-evidence/M012-S07-requirement-update-evidence.json');
      const r022 = d.planned_updates.find(u => u.requirement_id === 'R022');
      assert.ok(r022, 'R022 update present');
      assert.equal(r022.class, 'primary-user-loop');
      assert.equal(r022.status_before, 'active');
      assert.equal(r022.status_after, 'active');
      assert.ok(r022.fields_to_update.notes.length > 50, 'R022 notes substantive');
    });

    it('documents R023 changes', () => {
      const d = readJSON('runtime-evidence/M012-S07-requirement-update-evidence.json');
      const r023 = d.planned_updates.find(u => u.requirement_id === 'R023');
      assert.ok(r023, 'R023 update present');
      assert.equal(r023.class, 'differentiator');
      assert.equal(r023.status_before, 'active');
      assert.equal(r023.status_after, 'active');
      assert.ok(r023.fields_to_update.notes.length > 50, 'R023 notes substantive');
    });

    it('does not contain plaintext secrets', () => {
      const raw = fs.readFileSync(path.join(BASE, 'runtime-evidence/M012-S07-requirement-update-evidence.json'), 'utf-8');
      assert.ok(!raw.includes('password'), 'no password in artifact');
      assert.ok(!raw.includes('sk-'), 'no API key prefix in artifact');
    });
  });

  describe('Cross-artifact consistency', () => {
    it('company ID matches across rescope decision and S06 evidence', () => {
      const rescope = readJSON('runtime-evidence/M012-S07-rescope-decision.json');
      const s06 = readJSON('runtime-evidence/M012-S06-mission-issue-evidence.json');
      assert.equal(rescope.canonical_company_id, s06.config.canonical_company_id);
    });

    it('issue ID matches across rescope decision and S06 evidence', () => {
      const rescope = readJSON('runtime-evidence/M012-S07-rescope-decision.json');
      const s06 = readJSON('runtime-evidence/M012-S06-mission-issue-evidence.json');
      assert.equal(rescope.issue_id, s06.issue.id);
    });

    it('issue_identifier matches across rescope decision and S06 evidence', () => {
      const rescope = readJSON('runtime-evidence/M012-S07-rescope-decision.json');
      const s06 = readJSON('runtime-evidence/M012-S06-mission-issue-evidence.json');
      assert.equal(rescope.issue_identifier, s06.issue.identifier);
    });
  });
});
