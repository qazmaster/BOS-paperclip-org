#!/usr/bin/env node
// M015-S03 T13 verifier — confirms every required relative skill path exists
// and is readable inside the active checkout, without relying on external
// user-source checkouts. Mirrors T07's discipline (project-local stubs) and
// extends it to the .gsd/agent/skills/ path mandated by T13's Files list.
//
// Scope: the four skills referenced by M015-S03 slice work (skills_used in
// T01..T12 of the slice plan): e2e-testing-patterns, audit-v2, zero-trust,
// verify-before-complete. Required at BOTH .agents/skills/ and
// .gsd/agent/skills/ relative paths inside the active checkout.
//
// Emits canonical "VERIFICATION_PASS" line on full success, exit 0.
'use strict';

const fs = require('fs');
const path = require('path');

const REQUIRED_SKILLS = Object.freeze([
  'e2e-testing-patterns',
  'audit-v2',
  'zero-trust',
  'verify-before-complete',
]);

const REQUIRED_RELATIVE_DIRS = Object.freeze([
  '.agents/skills',
  '.gsd/agent/skills',
]);

const cwd = process.cwd();
const evidence = {
  schema: 'https://gsd.local/schemas/runtime-evidence/m015-s03-t13-skill-paths.v1.json',
  generatedAt: new Date().toISOString(),
  cwd,
  requiredSkills: REQUIRED_SKILLS.slice(),
  requiredRelativeDirs: REQUIRED_RELATIVE_DIRS.slice(),
  paths: [],
  failures: [],
  verdict: 'PASS',
};

let observed = 0;
for (const dir of REQUIRED_RELATIVE_DIRS) {
  for (const skill of REQUIRED_SKILLS) {
    const rel = `${dir}/${skill}/SKILL.md`;
    const abs = path.resolve(cwd, rel);
    let exists = false;
    let readable = false;
    let sizeBytes = 0;
    let frontmatterName = null;
    let error = null;
    try {
      const st = fs.statSync(abs);
      exists = st.isFile() && st.size > 0;
      if (exists) {
        sizeBytes = st.size;
        const buf = fs.readFileSync(abs, 'utf8');
        readable = typeof buf === 'string' && buf.length > 0;
        const m = buf.match(/^---\s*\n([\s\S]*?)\n---/);
        if (m) {
          const nameMatch = m[1].match(/^name:\s*([^\s#]+)/m);
          if (nameMatch) frontmatterName = nameMatch[1].trim();
        }
      }
    } catch (err) {
      error = err && err.code ? err.code : String(err);
    }
    const ok = exists && readable;
    if (ok) observed += 1;
    else {
      evidence.failures.push({ path: rel, reason: error || 'missing_or_unreadable' });
      evidence.verdict = 'FAIL';
    }
    evidence.paths.push({
      skill,
      dir,
      relativePath: rel,
      exists,
      readable,
      sizeBytes,
      frontmatterName,
      ok,
      error,
    });
  }
}

const expectedTotal = REQUIRED_RELATIVE_DIRS.length * REQUIRED_SKILLS.length;
evidence.observed = observed;
evidence.expectedTotal = expectedTotal;
evidence.complete = observed === expectedTotal;

const evidenceDir = path.resolve(cwd, 'runtime-evidence');
fs.mkdirSync(evidenceDir, { recursive: true });
const evidencePath = path.resolve(evidenceDir, 'M015-S03-t13-skill-paths.json');
fs.writeFileSync(evidencePath, JSON.stringify(evidence, null, 2));

if (evidence.verdict === 'PASS') {
  process.stdout.write(`VERIFICATION_PASS observed=${observed}/${expectedTotal}\n`);
  process.exit(0);
}
process.stdout.write(`VERIFICATION_FAIL observed=${observed}/${expectedTotal}\n`);
process.exit(1);