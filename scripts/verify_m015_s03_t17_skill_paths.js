#!/usr/bin/env node
// M015-S03 T17 verifier — confirms every required relative skill path exists
// and is readable inside the active checkout, without relying on external
// user-source checkouts. Mirrors T07/T13 discipline (project-local stubs)
// and extends it to the 16 new skill paths required by T17's contract.
//
// Scope: only the 16 skill files explicitly listed in T17's Files list.
// T17 does NOT require re-validation of the 8 T13-inherited paths
// (e2e-testing-patterns, audit-v2, zero-trust, verify-before-complete at
// .agents/skills/ + .gsd/agent/skills/) — those were accepted as
// "approved in-checkout equivalents" by T13 and remain in place.
//
// Each of the 16 required paths lives inside the active checkout:
//   .agents/skills/<skill>/SKILL.md    (10 skills, copy from /home/qazanik/.agents/skills/)
//   .gsd/agent/skills/<skill>/SKILL.md (6 skills, copy from /home/qazanik/.gsd/agent/skills/)
//
// Emits canonical "VERIFICATION_PASS" line on full success, exit 0.
'use strict';

const fs = require('fs');
const path = require('path');

// T17's two-mirror design: skills that live under /home/qazanik/.agents/skills/
// are mirrored into .agents/skills/; skills that live under
// /home/qazanik/.gsd/agent/skills/ are mirrored into .gsd/agent/skills/.
// Both halves must exist as project-local in-checkout equivalents.
const AGENTS_SKILLS = Object.freeze([
  'android-development',
  'android-performance',
  'android-qa',
  'expo-mobile',
  'go-linter-specialist',
  'grpc-patterns',
  'nodejs-best-practices',
  'parallel-agents',
  'rust-pro',
  'vercel',
]);
const GSD_SKILLS = Object.freeze([
  'handoff',
  'observability',
  'review',
  'security-review',
  'test',
  'write-docs',
]);

const cwd = process.cwd();
const evidence = {
  schema: 'https://gsd.local/schemas/runtime-evidence/m015-s03-t17-skill-paths.v1.json',
  generatedAt: new Date().toISOString(),
  cwd,
  required_paths: [],
  failures: [],
  verdict: 'PASS',
};

let observed = 0;
let expectedTotal = 0;

// 1. .agents/skills/ mirror — 10 paths from T17's Files list.
for (const skill of AGENTS_SKILLS) {
  const rel = `.agents/skills/${skill}/SKILL.md`;
  expectedTotal += 1;
  const entry = checkPath(rel, skill);
  evidence.required_paths.push(entry);
  if (entry.ok) observed += 1;
  else { evidence.verdict = 'FAIL'; evidence.failures.push(entry.failure); }
}

// 2. .gsd/agent/skills/ mirror — 6 paths from T17's Files list.
for (const skill of GSD_SKILLS) {
  const rel = `.gsd/agent/skills/${skill}/SKILL.md`;
  expectedTotal += 1;
  const entry = checkPath(rel, skill);
  evidence.required_paths.push(entry);
  if (entry.ok) observed += 1;
  else { evidence.verdict = 'FAIL'; evidence.failures.push(entry.failure); }
}

evidence.observed = observed;
evidence.expectedTotal = expectedTotal;
evidence.complete = observed === expectedTotal;

const evidenceDir = path.resolve(cwd, 'runtime-evidence');
fs.mkdirSync(evidenceDir, { recursive: true });
const evidencePath = path.resolve(evidenceDir, 'M015-S03-t17-skill-paths.json');
fs.writeFileSync(evidencePath, JSON.stringify(evidence, null, 2));

if (evidence.verdict === 'PASS') {
  process.stdout.write(`VERIFICATION_PASS observed=${observed}/${expectedTotal}\n`);
  process.exit(0);
}
process.stdout.write(`VERIFICATION_FAIL observed=${observed}/${expectedTotal}\n`);
process.exit(1);

// ---------------------------------------------------------------------------
function checkPath(rel, expectedName) {
  const abs = path.resolve(cwd, rel);
  let exists = false;
  let readable = false;
  let sizeBytes = 0;
  let frontmatterName = null;
  let frontmatterMatches = null;
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
        if (nameMatch) {
          frontmatterName = nameMatch[1].trim();
          frontmatterMatches = frontmatterName === expectedName;
        }
      }
    }
  } catch (err) {
    error = err && err.code ? err.code : String(err);
  }

  const ok = exists && readable && frontmatterMatches === true;
  if (!ok && !error) {
    if (!exists) error = 'missing';
    else if (!readable) error = 'unreadable';
    else if (frontmatterMatches === false) error = 'frontmatter_name_mismatch';
    else if (frontmatterName === null) error = 'frontmatter_missing';
  }

  return {
    relativePath: rel,
    expectedName,
    exists,
    readable,
    sizeBytes,
    frontmatterName,
    frontmatterMatches,
    ok,
    error,
    failure: ok ? null : { path: rel, reason: error || 'missing_or_unreadable' },
  };
}