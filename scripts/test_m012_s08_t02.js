import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = '/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M012-ihd2ez';

describe('T02: R003 Coverage Evidence and Requirement Reconciliation', () => {
  describe('R003 coverage JSON', () => {
    const coveragePath = join(ROOT, 'runtime-evidence/M012-S08-r003-coverage.json');

    it('exists', () => {
      assert.ok(existsSync(coveragePath), `File not found: ${coveragePath}`);
    });

    it('has required fields', () => {
      const data = JSON.parse(readFileSync(coveragePath, 'utf8'));
      assert.ok(data.requirement_id, 'Missing requirement_id');
      assert.equal(data.requirement_id, 'R003');
      assert.ok(data.assessment, 'Missing assessment');
      assert.ok(typeof data.assessment === 'string' && data.assessment.length > 20, 'assessment too short');
      assert.ok(data.coverage_verdict, 'Missing coverage_verdict');
      assert.ok(typeof data.coverage_verdict === 'string' && data.coverage_verdict.length > 10, 'coverage_verdict too short');
    });

    it('has R003 ownership fields', () => {
      const data = JSON.parse(readFileSync(coveragePath, 'utf8'));
      assert.ok(data.requirement_ownership, 'Missing requirement_ownership');
      assert.equal(data.requirement_ownership.primary, 'M003 S02');
      assert.equal(data.requirement_ownership.status, 'active');
    });

    it('references M012 decision artifacts', () => {
      const data = JSON.parse(readFileSync(coveragePath, 'utf8'));
      assert.ok(Array.isArray(data.m012_decision_artifacts), 'Missing m012_decision_artifacts');
      assert.ok(data.m012_decision_artifacts.length >= 2, 'Expected at least 2 decision artifacts');

      const artifactNames = data.m012_decision_artifacts.map(a => a.artifact);
      assert.ok(artifactNames.includes('D053'), 'Missing D053 artifact reference');
      assert.ok(
        artifactNames.includes('runtime-evidence/M012-S07-rescope-decision.json'),
        'Missing M012-S07-rescope-decision.json reference'
      );
    });

    it('verdict does not change ownership or status', () => {
      const data = JSON.parse(readFileSync(coveragePath, 'utf8'));
      assert.equal(data.status_change, 'none');
      assert.equal(data.ownership_change, 'none');
    });
  });

  describe('REQUIREMENTS.md R003 note', () => {
    const reqPath = join(ROOT, '.gsd/REQUIREMENTS.md');

    it('contains M012 S08 coverage evidence note', () => {
      const content = readFileSync(reqPath, 'utf8');
      assert.ok(
        content.includes('M012 S08 coverage evidence'),
        'REQUIREMENTS.md missing M012 S08 coverage evidence note'
      );
    });

    it('references the R003 coverage artifact', () => {
      const content = readFileSync(reqPath, 'utf8');
      assert.ok(
        content.includes('runtime-evidence/M012-S08-r003-coverage.json'),
        'REQUIREMENTS.md missing reference to R003 coverage artifact'
      );
    });

    it('R003 status remains active', () => {
      const content = readFileSync(reqPath, 'utf8');
      // Find the R003 section and verify status
      const r003Section = content.split('### R003')[1]?.split('### R008')[0] || '';
      assert.ok(r003Section.includes('Status: active'), 'R003 status should remain active');
    });
  });

  describe('Requirement outcomes R003 row', () => {
    const outcomesPath = join(ROOT, 'runtime-evidence/M012-S04-requirement-outcomes.md');

    it('contains R003 row', () => {
      const content = readFileSync(outcomesPath, 'utf8');
      assert.ok(
        content.includes('R003'),
        'M012-S04-requirement-outcomes.md missing R003 row'
      );
    });

    it('R003 row references S08 coverage artifact', () => {
      const content = readFileSync(outcomesPath, 'utf8');
      assert.ok(
        content.includes('M012-S08-r003-coverage.json'),
        'R003 row missing reference to S08 coverage artifact'
      );
    });

    it('R003 row status is active', () => {
      const content = readFileSync(outcomesPath, 'utf8');
      // Find the R003 row in the table
      const lines = content.split('\n');
      const r003Line = lines.find(l => l.startsWith('| R003'));
      assert.ok(r003Line, 'No R003 row found in requirement outcomes table');
      assert.ok(r003Line.includes('| active |'), 'R003 row should have active status');
    });

    it('R003 row mentions Paperclip as system of record', () => {
      const content = readFileSync(outcomesPath, 'utf8');
      const lines = content.split('\n');
      const r003Line = lines.find(l => l.startsWith('| R003'));
      assert.ok(r003Line, 'No R003 row found');
      assert.ok(
        r003Line.includes('Paperclip') || r003Line.includes('system of record'),
        'R003 row should mention Paperclip as system of record'
      );
    });
  });

  describe('S05/S06/S07 handoff coherence', () => {
    it('S05 summary exists', () => {
      assert.ok(
        existsSync(join(ROOT, '.gsd/milestones/M012-ihd2ez/slices/S05/S05-SUMMARY.md')),
        'S05-SUMMARY.md not found'
      );
    });

    it('S06 summary exists and requires S05', () => {
      const content = readFileSync(join(ROOT, '.gsd/milestones/M012-ihd2ez/slices/S06/S06-SUMMARY.md'), 'utf8');
      assert.ok(content.includes('S05'), 'S06 should reference S05 in requires');
    });

    it('S07 summary exists and requires S06', () => {
      const content = readFileSync(join(ROOT, '.gsd/milestones/M012-ihd2ez/slices/S07/S07-SUMMARY.md'), 'utf8');
      assert.ok(content.includes('S06'), 'S07 should reference S06 in requires');
    });

    it('S07 provides re-scope evidence for S08', () => {
      const content = readFileSync(join(ROOT, '.gsd/milestones/M012-ihd2ez/slices/S07/S07-SUMMARY.md'), 'utf8');
      assert.ok(
        content.includes('S08') || content.includes('re-scope'),
        'S07 should provide re-scope evidence referenced by S08'
      );
    });
  });
});
