const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const JSON_PATH = path.join(ROOT, 'runtime-evidence', 'M012-S08-validation-readiness.json');
const REQ_PATH = path.join(ROOT, '.gsd', 'REQUIREMENTS.md');

describe('M012 S10 T01: R017 and R019 descoping', () => {
  let json;
  let reqMd;

  it('loads validation-readiness JSON', () => {
    json = JSON.parse(fs.readFileSync(JSON_PATH, 'utf8'));
    assert.ok(json.requirement_coverage, 'requirement_coverage array exists');
  });

  it('loads REQUIREMENTS.md', () => {
    reqMd = fs.readFileSync(REQ_PATH, 'utf8');
    assert.ok(reqMd.length > 0, 'REQUIREMENTS.md is non-empty');
  });

  describe('R017 in validation-readiness JSON', () => {
    it('has m012_status = descoped', () => {
      const r017 = json.requirement_coverage.find(r => r.requirement_id === 'R017');
      assert.ok(r017, 'R017 entry found');
      assert.equal(r017.m012_status, 'descoped');
    });

    it('has status_change = descoped-from-m012', () => {
      const r017 = json.requirement_coverage.find(r => r.requirement_id === 'R017');
      assert.equal(r017.status_change, 'descoped-from-m012');
    });

    it('assessment mentions M012 scope boundaries', () => {
      const r017 = json.requirement_coverage.find(r => r.requirement_id === 'R017');
      assert.match(r017.assessment, /M012 scope/i);
      assert.match(r017.assessment, /native Paperclip issue flow/i);
      assert.match(r017.assessment, /local BOS Light orchestration/i);
    });

    it('assessment mentions external blockers', () => {
      const r017 = json.requirement_coverage.find(r => r.requirement_id === 'R017');
      assert.match(r017.assessment, /external blocker/i);
    });
  });

  describe('R019 in validation-readiness JSON', () => {
    it('has m012_status = descoped', () => {
      const r019 = json.requirement_coverage.find(r => r.requirement_id === 'R019');
      assert.ok(r019, 'R019 entry found');
      assert.equal(r019.m012_status, 'descoped');
    });

    it('has status_change = descoped-from-m012', () => {
      const r019 = json.requirement_coverage.find(r => r.requirement_id === 'R019');
      assert.equal(r019.status_change, 'descoped-from-m012');
    });

    it('assessment mentions M012 scope boundaries', () => {
      const r019 = json.requirement_coverage.find(r => r.requirement_id === 'R019');
      assert.match(r019.assessment, /M012 scope/i);
      assert.match(r019.assessment, /local BOS Light orchestration/i);
      assert.match(r019.assessment, /native Paperclip issue flow/i);
    });

    it('assessment mentions external blockers', () => {
      const r019 = json.requirement_coverage.find(r => r.requirement_id === 'R019');
      assert.match(r019.assessment, /external blocker/i);
    });
  });

  describe('R017 in REQUIREMENTS.md', () => {
    it('contains M012 non-addressal note with descoped language', () => {
      const r017Section = reqMd.split('### R017')[1]?.split('### R018')[0] || '';
      assert.match(r017Section, /Descoped from M012/i);
      assert.match(r017Section, /M012 non-addressal/i);
    });

    it('references M012 scope boundaries', () => {
      const r017Section = reqMd.split('### R017')[1]?.split('### R018')[0] || '';
      assert.match(r017Section, /native Paperclip issue flow/i);
      assert.match(r017Section, /local BOS Light orchestration/i);
    });
  });

  describe('R019 in REQUIREMENTS.md', () => {
    it('contains M012 non-addressal note with descoped language', () => {
      const r019Section = reqMd.split('### R019')[1]?.split('### R020')[0] || '';
      assert.match(r019Section, /Descoped from M012/i);
      assert.match(r019Section, /M012 non-addressal/i);
    });

    it('references M012 scope boundaries', () => {
      const r019Section = reqMd.split('### R019')[1]?.split('### R020')[0] || '';
      assert.match(r019Section, /local BOS Light orchestration/i);
      assert.match(r019Section, /native Paperclip issue flow/i);
    });
  });
});
