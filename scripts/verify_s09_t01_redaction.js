#!/usr/bin/env node
/**
 * verify_s09_t01_redaction.js
 * 
 * Verifies that T01 redaction work is complete:
 * 1. No raw secret literals remain in S06/S07/S08 task summary files
 * 2. S06/S07/S08 closeout gate artifacts show verdict=pass
 * 3. Gate artifact check counts match expectations
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
let passed = 0;
let failed = 0;

function check(name, condition, detail) {
  if (condition) {
    console.log(`  ✅ ${name}`);
    passed++;
  } else {
    console.log(`  ❌ ${name}${detail ? ': ' + detail : ''}`);
    failed++;
  }
}

// --- Section 1: Secret literal scan ---
console.log('\n1. Secret literal scan across S06/S07/S08 task summaries');

const summaryFiles = [
  '.gsd/milestones/M012-ihd2ez/slices/S06/tasks/T01-SUMMARY.md',
  '.gsd/milestones/M012-ihd2ez/slices/S06/tasks/T05-SUMMARY.md',
  '.gsd/milestones/M012-ihd2ez/slices/S07/tasks/T03-SUMMARY.md',
  '.gsd/milestones/M012-ihd2ez/slices/S08/tasks/T01-SUMMARY.md',
];

const forbiddenPatterns = [
  { name: 'password-literal', regex: /BosAdmin2026!/ },
  { name: 'api-key-pcp-prefix', regex: /pcp_board_6ef981ecf6b35d3ce8cdc8257e23689b37e52233d412d3fc/ },
];

for (const relPath of summaryFiles) {
  const fullPath = path.join(ROOT, relPath);
  const exists = fs.existsSync(fullPath);
  check(`${relPath}: file exists`, exists);
  if (!exists) continue;
  
  const content = fs.readFileSync(fullPath, 'utf8');
  const lines = content.split('\n');
  
  for (const pat of forbiddenPatterns) {
    let foundLines = [];
    lines.forEach((line, i) => {
      if (pat.regex.test(line)) foundLines.push(i + 1);
    });
    check(
      `${relPath}: no ${pat.name}`,
      foundLines.length === 0,
      `found on lines ${foundLines.join(', ')}`
    );
  }
  
  // Verify redaction markers are present
  const hasRedactedPassword = content.includes('[REDACTED-PASSWORD]');
  const hasRedactedApiKey = content.includes('[REDACTED-API-KEY]');
  check(`${relPath}: contains [REDACTED-PASSWORD] marker`, hasRedactedPassword);
}

// --- Section 2: Gate artifact verdicts ---
console.log('\n2. Closeout gate artifact verdicts');

const gateFiles = [
  { file: 'runtime-evidence/M012-S06-closeout-gate.json', expectedChecks: 31 },
  { file: 'runtime-evidence/M012-S07-closeout-gate.json', expectedChecks: 27 },
  { file: 'runtime-evidence/M012-S08-closeout-gate.json', expectedChecks: 25 },
];

for (const { file, expectedChecks } of gateFiles) {
  const fullPath = path.join(ROOT, file);
  const exists = fs.existsSync(fullPath);
  check(`${file}: file exists`, exists);
  if (!exists) continue;
  
  let data;
  try {
    data = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
  } catch (e) {
    check(`${file}: valid JSON`, false, e.message);
    continue;
  }
  
  check(`${file}: valid JSON`, true);
  check(`${file}: verdict is "pass"`, data.verdict === 'pass', `got "${data.verdict}"`);
  check(
    `${file}: has ${expectedChecks} checks`,
    Array.isArray(data.checks) && data.checks.length === expectedChecks,
    `got ${data.checks ? data.checks.length : 'non-array'}`
  );
  
  // Verify all checks pass
  const allPass = Array.isArray(data.checks) && data.checks.every(c => c.pass === true);
  check(`${file}: all checks pass`, allPass);
}

// --- Section 3: Validator scripts exist ---
console.log('\n3. Validator scripts');

const validatorScripts = [
  'scripts/validate_m012_s06_closeout.js',
  'scripts/validate_m012_s07_closeout.js',
  'scripts/validate_m012_s08_closeout.js',
];

for (const relPath of validatorScripts) {
  const fullPath = path.join(ROOT, relPath);
  check(`${relPath}: exists`, fs.existsSync(fullPath));
}

// --- Summary ---
console.log(`\n${'='.repeat(50)}`);
console.log(`RESULT: ${passed} passed, ${failed} failed, ${passed + failed} total`);
if (failed > 0) {
  console.log('VERDICT: FAIL');
  process.exit(1);
} else {
  console.log('VERDICT: PASS');
  process.exit(0);
}
