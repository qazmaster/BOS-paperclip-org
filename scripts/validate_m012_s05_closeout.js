#!/usr/bin/env node
/**
 * M012-S05 Closeout Validator
 * 
 * Aggregate validator that runs S05 requirement outcomes and coverage
 * validators as subprocesses, collects exit codes, and reports a single
 * SUITE_RESULT PASS or FAIL.
 * 
 * Also confirms S04 validators still pass after markdown corrections.
 */
const { execSync } = require('child_process');
const path = require('path');

const SCRIPTS_DIR = __dirname;

const VALIDATORS = [
  { name: 'S05 Requirement Outcomes', script: 'validate_m012_s05_requirement_outcomes.js' },
  { name: 'S05 Coverage Remediation', script: 'validate_m012_s05_coverage.js' },
  { name: 'S04 Final Reconciliation', script: 'validate_m012_s04_final_reconciliation.js' },
  { name: 'S04 Closeout Gate', script: 'validate_m012_closeout.js' },
];

let allPassed = true;
const results = [];

for (const validator of VALIDATORS) {
  const scriptPath = path.join(SCRIPTS_DIR, validator.script);
  try {
    const stdout = execSync(`node "${scriptPath}"`, { encoding: 'utf8', timeout: 30000 });
    const pass = stdout.includes('SUITE_RESULT PASS') || stdout.includes('PASS');
    results.push({ name: validator.name, exitCode: 0, pass, output: stdout.trim() });
    console.log(`PASS: ${validator.name} — exit 0`);
  } catch (e) {
    allPassed = false;
    const exitCode = e.status || 1;
    const output = (e.stdout || '') + (e.stderr || '');
    results.push({ name: validator.name, exitCode, pass: false, output: output.trim() });
    console.error(`FAIL: ${validator.name} — exit ${exitCode}`);
    console.error(output.trim());
  }
}

// Summary
console.log('\n--- S05 Closeout Summary ---');
for (const r of results) {
  console.log(`  ${r.pass ? '✅' : '❌'} ${r.name} (exit ${r.exitCode})`);
}

if (allPassed) {
  console.log('\nSUITE_RESULT PASS — S05 closeout: all S05 and S04 validators pass');
} else {
  console.error('\nSUITE_RESULT FAIL — S05 closeout: one or more validators failed');
}

process.exit(allPassed ? 0 : 1);
