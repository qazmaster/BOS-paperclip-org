const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const evidencePath = path.join(__dirname, '..', 'runtime-evidence', 'M010-S01-plugin-tool-test.json');

// Assert file exists
assert.ok(fs.existsSync(evidencePath), `Evidence file missing: ${evidencePath}`);

const evidence = JSON.parse(fs.readFileSync(evidencePath, 'utf-8'));

// Assert tools_tested === 6
assert.strictEqual(evidence.tools_tested, 6, `Expected tools_tested=6, got ${evidence.tools_tested}`);

// Assert overall_verdict === "pass"
assert.strictEqual(evidence.overall_verdict, 'pass', `Expected overall_verdict="pass", got "${evidence.overall_verdict}"`);

// Assert tool_results is array of length 6
assert.ok(Array.isArray(evidence.tool_results), 'tool_results must be an array');
assert.strictEqual(evidence.tool_results.length, 6, `Expected 6 tool_results, got ${evidence.tool_results.length}`);

// Assert each tool has verdict "pass"
for (const tool of evidence.tool_results) {
  assert.strictEqual(tool.verdict, 'pass', `Tool ${tool.name} expected verdict="pass", got "${tool.verdict}"`);
}

console.log('T03 evidence verification passed');
process.exit(0);
