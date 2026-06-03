/**
 * test_m012_s07_t02.js
 * 
 * Validates that T02 updates to canonical requirement and roadmap artifacts
 * include required honest phrases and exclude forbidden overclaiming phrases.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');

const REQUIREMENTS_PATH = resolve(ROOT, '.gsd/REQUIREMENTS.md');
const OUTCOMES_PATH = resolve(ROOT, 'runtime-evidence/M012-S04-requirement-outcomes.md');
const ROADMAP_PATH = resolve(ROOT, '.gsd/milestones/M012-ihd2ez/M012-ihd2ez-ROADMAP.md');

// Forbidden overclaiming phrases
const FORBIDDEN_PHRASES = [
  'user confirmed',
  'explicitly confirmed by user',
  'user explicitly confirmed',
  'confirmed by the user',
  'user authorized',
];

function readFile(path) {
  return readFileSync(path, 'utf8');
}

describe('T02: Update canonical requirement and roadmap artifacts', () => {
  describe('REQUIREMENTS.md', () => {
    const content = readFile(REQUIREMENTS_PATH);

    it('R022 notes include "auto-mode constraint"', () => {
      assert.ok(
        content.includes('auto-mode constraint'),
        'R022 notes must mention auto-mode constraint'
      );
    });

    it('R022 notes include "re-scoped" language', () => {
      // Check for "RE-SCOPED" or "re-scoped" near R022 section
      const r022Section = content.split('### R022')[1]?.split('### R023')[0] ?? '';
      assert.ok(
        r022Section.toLowerCase().includes('re-scoped'),
        'R022 notes must include re-scoped language'
      );
    });

    it('R023 notes reflect re-scope rather than live HITL confirmation', () => {
      const r023Section = content.split('### R023')[1]?.split('### R024')[0] ?? '';
      assert.ok(
        r023Section.toLowerCase().includes('re-scoped'),
        'R023 notes must include re-scoped language'
      );
      assert.ok(
        r023Section.includes('auto-mode'),
        'R023 notes must mention auto-mode constraint'
      );
    });

    it('R022 traceability row updated with re-scope language', () => {
      const traceRow = content.split('\n').find(l => l.startsWith('| R022 |'));
      assert.ok(traceRow, 'R022 traceability row must exist');
      assert.ok(
        traceRow.toLowerCase().includes('re-scoped'),
        'R022 traceability row must include re-scoped language'
      );
    });

    it('R023 traceability row updated with re-scope language', () => {
      const traceRow = content.split('\n').find(l => l.startsWith('| R023 |'));
      assert.ok(traceRow, 'R023 traceability row must exist');
      assert.ok(
        traceRow.toLowerCase().includes('re-scoped'),
        'R023 traceability row must include re-scoped language'
      );
    });

    it('No forbidden overclaiming phrases in R022/R023 sections', () => {
      const r022Section = content.split('### R022')[1]?.split('### R024')[0] ?? '';
      for (const phrase of FORBIDDEN_PHRASES) {
        assert.ok(
          !r022Section.toLowerCase().includes(phrase.toLowerCase()),
          `R022/R023 sections must not contain forbidden phrase: "${phrase}"`
        );
      }
    });
  });

  describe('requirement-outcomes.md', () => {
    const content = readFile(OUTCOMES_PATH);

    it('R022 row includes re-scope language', () => {
      const lines = content.split('\n');
      const r022Row = lines.find(l => l.includes('R022') && l.startsWith('|'));
      assert.ok(r022Row, 'R022 row must exist in outcomes table');
      assert.ok(
        r022Row.toLowerCase().includes('re-scoped'),
        'R022 row must include re-scoped language'
      );
    });

    it('R022 row includes auto-mode constraint', () => {
      const lines = content.split('\n');
      const r022Row = lines.find(l => l.includes('R022') && l.startsWith('|'));
      assert.ok(r022Row, 'R022 row must exist');
      assert.ok(
        r022Row.includes('auto-mode constraint'),
        'R022 row must mention auto-mode constraint'
      );
    });

    it('R023 row includes re-scope language', () => {
      const lines = content.split('\n');
      const r023Row = lines.find(l => l.includes('R023') && l.startsWith('|'));
      assert.ok(r023Row, 'R023 row must exist in outcomes table');
      assert.ok(
        r023Row.toLowerCase().includes('re-scoped'),
        'R023 row must include re-scoped language'
      );
    });

    it('Summary section reflects re-scope', () => {
      const summarySection = content.split('## Summary')[1] ?? '';
      assert.ok(
        summarySection.toLowerCase().includes('re-scoped'),
        'Summary must mention re-scope'
      );
    });

    it('No forbidden overclaiming phrases anywhere in outcomes', () => {
      for (const phrase of FORBIDDEN_PHRASES) {
        assert.ok(
          !content.toLowerCase().includes(phrase.toLowerCase()),
          `Outcomes file must not contain forbidden phrase: "${phrase}"`
        );
      }
    });
  });

  describe('ROADMAP.md', () => {
    const content = readFile(ROADMAP_PATH);

    it('S07 demo text reflects re-scoped success criterion', () => {
      const lines = content.split('\n');
      const s07DemoLine = lines.find(l => l.includes('re-scoped') || l.includes('authenticated readback'));
      assert.ok(s07DemoLine, 'S07 demo text must mention re-scope or authenticated readback');
    });

    it('S07 demo text mentions auto-mode constraint', () => {
      const lines = content.split('\n');
      // Find the S07 demo line and nearby lines
      const s07Idx = lines.findIndex(l => l.includes('S07'));
      if (s07Idx >= 0) {
        const context = lines.slice(s07Idx, s07Idx + 3).join('\n');
        assert.ok(
          context.includes('auto-mode constraint'),
          'S07 demo context must mention auto-mode constraint'
        );
      }
    });

    it('No forbidden overclaiming phrases in S07 area', () => {
      const lines = content.split('\n');
      const s07Idx = lines.findIndex(l => l.includes('S07'));
      if (s07Idx >= 0) {
        const context = lines.slice(s07Idx, s07Idx + 5).join('\n');
        for (const phrase of FORBIDDEN_PHRASES) {
          assert.ok(
            !context.toLowerCase().includes(phrase.toLowerCase()),
            `S07 area must not contain forbidden phrase: "${phrase}"`
          );
        }
      }
    });
  });
});
