/**
 * verify-t03-slice-evidence.js
 *
 * Validates runtime-evidence/M010-S02-routing-config.json against the
 * T03 acceptance criteria:
 *   - routing_rules_tested === 12
 *   - All rule_results have verdict === "pass"
 *   - cross_validation.dist_vs_src_match === true
 *   - overall_verdict === "pass"
 *
 * Usage: node scripts/verify-t03-slice-evidence.js
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const evidencePath = path.join(__dirname, '..', 'runtime-evidence', 'M010-S02-routing-config.json');

// Assert file exists
assert.ok(fs.existsSync(evidencePath), `Evidence file missing: ${evidencePath}`);

const evidence = JSON.parse(fs.readFileSync(evidencePath, 'utf-8'));

// Assert milestone/slice identity
assert.strictEqual(evidence.milestone, 'M010', `Expected milestone="M010", got "${evidence.milestone}"`);
assert.strictEqual(evidence.slice, 'S02', `Expected slice="S02", got "${evidence.slice}"`);

// Assert routing_rules_tested === 12
assert.strictEqual(evidence.routing_rules_tested, 12, `Expected routing_rules_tested=12, got ${evidence.routing_rules_tested}`);

// Assert packet_types_tested === 14
assert.strictEqual(evidence.packet_types_tested, 14, `Expected packet_types_tested=14, got ${evidence.packet_types_tested}`);

// Assert rule_results is array with correct length
assert.ok(Array.isArray(evidence.rule_results), 'rule_results must be an array');
assert.strictEqual(evidence.rule_results.length, 14, `Expected 14 rule_results, got ${evidence.rule_results.length}`);

// Assert all rule_results have verdict === "pass"
for (const rr of evidence.rule_results) {
  assert.strictEqual(rr.verdict, 'pass', `Rule "${rr.rule}" expected verdict="pass", got "${rr.verdict}"`);
}

// Assert cross_validation.dist_vs_src_match === true
assert.ok(evidence.cross_validation, 'cross_validation must exist');
assert.strictEqual(evidence.cross_validation.dist_vs_src_match, true, `Expected cross_validation.dist_vs_src_match=true, got ${evidence.cross_validation.dist_vs_src_match}`);

// Assert no mismatches
assert.ok(Array.isArray(evidence.cross_validation.mismatches), 'mismatches must be array');
assert.strictEqual(evidence.cross_validation.mismatches.length, 0, `Expected 0 mismatches, got ${evidence.cross_validation.mismatches.length}`);

// Assert overall_verdict === "pass"
assert.strictEqual(evidence.overall_verdict, 'pass', `Expected overall_verdict="pass", got "${evidence.overall_verdict}"`);

// Assert timestamp is valid ISO
assert.ok(evidence.timestamp, 'timestamp required');
const ts = new Date(evidence.timestamp);
assert.ok(!isNaN(ts.getTime()), `Invalid timestamp: ${evidence.timestamp}`);

// Assert all 12 named routing rules are represented
const NAMED_ROUTING_RULES = [
  "requires_executive_decision",
  "backlog_shaping",
  "budget_capacity",
  "implementation",
  "qa_security_review",
  "external_io_request",
  "paid_credentialed_external_io_request",
  "multi_division_workflow",
  "complex_safe_to_fail",
  "chaotic_incident_flow",
  "complicated_expert_review",
  "standard_operational",
];

const rulesFound = new Set(evidence.rule_results.map(r => r.rule));
for (const rule of NAMED_ROUTING_RULES) {
  assert.ok(rulesFound.has(rule), `Named routing rule "${rule}" not found in rule_results`);
}

console.log('T03 slice evidence verification passed');
console.log(`  routing_rules_tested: ${evidence.routing_rules_tested}`);
console.log(`  packet_types_tested: ${evidence.packet_types_tested}`);
console.log(`  all verdicts: pass`);
console.log(`  cross_validation.dist_vs_src_match: ${evidence.cross_validation.dist_vs_src_match}`);
console.log(`  overall_verdict: ${evidence.overall_verdict}`);
process.exit(0);
