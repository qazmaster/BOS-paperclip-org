#!/usr/bin/env node
'use strict';

/**
 * scripts/verify_m015_s05_t05_remediation_evidence.js
 *
 * T05 verify harness for runtime-evidence/M015-S05-remediation-evidence.json.
 * Mirrors the inline verify command from the T05 task plan:
 *   - status in {ADMITTED, FAIL_CLOSED_UPSTREAM_FIX_REQUIRED}
 *   - if ADMITTED: admission.business_mutations_recorded === 0
 *   - also asserts S05-disposition cross-checks (no do_not_promote_s04=false
 *     when admission is BLOCKED; admission business_mutations_recorded=0).
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const EVIDENCE = path.join(ROOT, 'runtime-evidence/M015-S05-remediation-evidence.json');

if (!fs.existsSync(EVIDENCE)) {
  process.stderr.write(`M015_S05_T05_VERIFY=FAIL evidence missing at ${path.relative(ROOT, EVIDENCE)}\n`);
  process.exit(2);
}

const e = JSON.parse(fs.readFileSync(EVIDENCE, 'utf8'));

if (!['ADMITTED', 'FAIL_CLOSED_UPSTREAM_FIX_REQUIRED'].includes(e.status)) {
  process.stderr.write(`M015_S05_T05_VERIFY=FAIL status='${e.status}' not in {ADMITTED, FAIL_CLOSED_UPSTREAM_FIX_REQUIRED}\n`);
  process.exit(1);
}

if (e.status === 'ADMITTED') {
  if (!e.admission || e.admission.business_mutations_recorded !== 0) {
    process.stderr.write(`M015_S05_T05_VERIFY=FAIL status=ADMITTED but admission.business_mutations_recorded=${e.admission && e.admission.business_mutations_recorded} (must be 0)\n`);
    process.exit(1);
  }
}

// Cross-checks for S05 honesty
if (!e.admission) {
  process.stderr.write('M015_S05_T05_VERIFY=FAIL admission object missing\n');
  process.exit(1);
}
if (e.admission.business_mutations_recorded !== 0) {
  process.stderr.write(`M015_S05_T05_VERIFY=FAIL admission.business_mutations_recorded=${e.admission.business_mutations_recorded} (must be 0)\n`);
  process.exit(1);
}
if (e.admission.status === 'ADMITTED' && e.do_not_promote_s04 !== false) {
  process.stderr.write('M015_S05_T05_VERIFY=FAIL admission=ADMITTED but do_not_promote_s04 not false\n');
  process.exit(1);
}
if (e.admission.status !== 'ADMITTED' && e.do_not_promote_s04 !== true) {
  process.stderr.write(`M015_S05_T05_VERIFY=FAIL admission=${e.admission.status} but do_not_promote_s04=${e.do_not_promote_s04} (must be true)\n`);
  process.exit(1);
}

// Summary
const gatesPass = Object.entries(e.admission.gates).filter(([k, v]) => k.endsWith('_pass') && v === true).length;
const gatesFail = Object.entries(e.admission.gates).filter(([k, v]) => k.endsWith('_pass') && v === false).length;
const c7prime = e.s05_diagnostics && e.s05_diagnostics.per_agent_results &&
  Object.values(e.s05_diagnostics.per_agent_results).every((r) => r.t03_c7_prime_provenance_agreement === true);

process.stdout.write(
  `M015_S05_T05_VERIFY=PASS ` +
  `status=${e.status} ` +
  `admission=${e.admission.status} ` +
  `gates_pass=${gatesPass}/4 ` +
  `gates_fail=${gatesFail}/4 ` +
  `business_mutations=${e.admission.business_mutations_recorded} ` +
  `c7_prime_all_7=${c7prime} ` +
  `do_not_promote_s04=${e.do_not_promote_s04} ` +
  `per_agent_invokability_proven=${e.disposition && e.disposition.per_agent_invokability_proven}\n`,
);
process.exit(0);
