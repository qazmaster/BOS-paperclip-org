#!/usr/bin/env node
/**
 * verify-s04-e2e-workflow.js
 *
 * Runs the E2E workflow integration test suite (e2eWorkflow.test.ts),
 * captures results, writes runtime-evidence/M010-S04-e2e-workflow.json,
 * and validates the evidence artifact schema.
 *
 * Exits 0 on success, 1 on failure.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { join, dirname } from "path";
import { execSync } from "child_process";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = join(__dirname, "..");
const PLUGIN_DIR = join(ROOT, "plugin-bos-light");

// ---------------------------------------------------------------------------
// Run the E2E test suite
// ---------------------------------------------------------------------------

console.log("=== S04 E2E Workflow Verification ===\n");
console.log("Running E2E test suite...\n");

const TEST_FILE = "tests/e2eWorkflow.test.ts";
const TEST_CMD = `npx vitest run ${TEST_FILE} --reporter=json`;

let testOutput;
let testExitCode = 0;
let testResults;

try {
  testOutput = execSync(TEST_CMD, {
    cwd: PLUGIN_DIR,
    encoding: "utf-8",
    stdio: ["pipe", "pipe", "pipe"],
    timeout: 120_000,
  });
} catch (err) {
  testExitCode = err.status || 1;
  testOutput = err.stdout || "";
  // Vitest JSON output is still in stdout even on failure
}

// Parse vitest JSON output
try {
  testResults = JSON.parse(testOutput);
} catch (parseErr) {
  console.error(`FAIL: Could not parse vitest JSON output: ${parseErr.message}`);
  console.error("Raw output (first 2000 chars):", testOutput.slice(0, 2000));
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Extract test metrics from vitest JSON
// ---------------------------------------------------------------------------

const numTotalTests = testResults.numTotalTests || 0;
const numPassedTests = testResults.numPassedTests || 0;
const numFailedTests = testResults.numFailedTests || 0;
const testSuccess = numFailedTests === 0 && numTotalTests > 0;

console.log(`Tests: ${numTotalTests} total, ${numPassedTests} passed, ${numFailedTests} failed`);
console.log(`Exit code: ${testExitCode}`);

// ---------------------------------------------------------------------------
// Extract per-scenario results from test suite
// ---------------------------------------------------------------------------

const testFiles = testResults.testResults || [];
const e2eFile = testFiles.find((f) => f.name?.includes("e2eWorkflow"));

const scenarios = [];

// Parse test results into scenarios
if (e2eFile) {
  const assertions = e2eFile.assertionResults || [];

  // Group by describe block (parent titles)
  const scenarioGroups = {
    CLEAR: assertions.filter((a) => a.ancestorTitles?.some((t) => t.includes("CLEAR"))),
    COMPLEX: assertions.filter((a) => a.ancestorTitles?.some((t) => t.includes("COMPLEX"))),
    CHAOTIC: assertions.filter((a) => a.ancestorTitles?.some((t) => t.includes("CHAOTIC"))),
    "Grant Policy": assertions.filter((a) => a.ancestorTitles?.some((t) => t.includes("grant policy"))),
    "Cross-Scenario": assertions.filter((a) => a.ancestorTitles?.some((t) => t.includes("cross-scenario"))),
  };

  // CLEAR scenario
  const clearTests = scenarioGroups.CLEAR;
  scenarios.push({
    scenario: "CLEAR",
    description: "Routine implementation task (BOS-T1-style)",
    cynefin_domain: "CLEAR",
    routing_mode: "single-pass",
    primary_division: "Div4.Production",
    routing_rule: "implementation",
    tools_exercised: [
      "bos-dispatch-event",
      "bos-bpi-score",
      "bos-blueprint-gen",
      "bos-eval-gate",
      "bos-circuit-breaker",
      "bos-decide",
      "bos-route-packet",
    ],
    verdict: clearTests.length > 0 && clearTests.every((t) => t.status === "passed") ? "pass" : "fail",
    tests: clearTests.length,
  });

  // COMPLEX scenario
  const complexTests = scenarioGroups.COMPLEX;
  scenarios.push({
    scenario: "COMPLEX",
    description: "Strategy/experiment task (BOS-T2-style)",
    cynefin_domain: "COMPLICATED",
    routing_mode: "two-pass (Div7 executive decision)",
    decision_delegated_mode: "probe",
    routing_rule: "complicated_expert_review",
    target_divisions: ["Div2.MasterPlanner", "Div4.Production", "Div5.QualificationsLibraryLearning"],
    tools_exercised: ["bos-dispatch-event", "bos-route-packet"],
    verdict: complexTests.length > 0 && complexTests.every((t) => t.status === "passed") ? "pass" : "fail",
    tests: complexTests.length,
  });

  // CHAOTIC scenario
  const chaoticTests = scenarioGroups.CHAOTIC;
  scenarios.push({
    scenario: "CHAOTIC",
    description: "Critical incident task (BOS-T3-style)",
    cynefin_domain: "CHAOTIC",
    routing_mode: "two-pass (Div7 executive decision)",
    decision_delegated_mode: "act",
    routing_rule: "chaotic_incident_flow",
    target_divisions: ["Div1.HCO", "Div3.Treasury", "Div5.QualificationsLibraryLearning"],
    tools_exercised: ["bos-dispatch-event", "bos-circuit-breaker", "bos-decide", "bos-eval-gate"],
    verdict: chaoticTests.length > 0 && chaoticTests.every((t) => t.status === "passed") ? "pass" : "fail",
    tests: chaoticTests.length,
  });

  // Grant Policy
  const grantTests = scenarioGroups["Grant Policy"];
  scenarios.push({
    scenario: "Grant Policy Cross-Division Enforcement",
    description: "Verify createValidatedToolWrapper deny/allow behavior across divisions",
    verdict: grantTests.length > 0 && grantTests.every((t) => t.status === "passed") ? "pass" : "fail",
    tests: grantTests.length,
  });

  // Cross-Scenario
  const crossTests = scenarioGroups["Cross-Scenario"];
  scenarios.push({
    scenario: "Cross-Scenario Integration",
    description: "All three Cynefin domains through one activate() call",
    verdict: crossTests.length > 0 && crossTests.every((t) => t.status === "passed") ? "pass" : "fail",
    tests: crossTests.length,
  });
}

// ---------------------------------------------------------------------------
// Compute overall verdict
// ---------------------------------------------------------------------------

const allScenariosPass = scenarios.every((s) => s.verdict === "pass");
const overallVerdict = testSuccess && allScenariosPass ? "pass" : "fail";

// ---------------------------------------------------------------------------
// Build evidence artifact
// ---------------------------------------------------------------------------

const evidence = {
  artifact: "M010-S04-e2e-workflow",
  generated_at: new Date().toISOString(),
  test_file: TEST_FILE,
  total_tests: numTotalTests,
  passed: numPassedTests,
  failed: numFailedTests,
  scenarios,
  verification_command: `cd plugin-bos-light && npx vitest run ${TEST_FILE}`,
  verification_exit_code: testExitCode,
  overall_verdict: overallVerdict,
};

// ---------------------------------------------------------------------------
// Validate evidence artifact schema
// ---------------------------------------------------------------------------

const schemaErrors = [];

// Required top-level fields
const requiredFields = ["artifact", "generated_at", "test_file", "total_tests", "passed", "failed", "scenarios", "overall_verdict"];
for (const field of requiredFields) {
  if (evidence[field] === undefined || evidence[field] === null) {
    schemaErrors.push(`Missing required field: ${field}`);
  }
}

// Timestamp format (ISO 8601)
if (evidence.generated_at && !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(evidence.generated_at)) {
  schemaErrors.push(`Invalid timestamp format: ${evidence.generated_at}`);
}

// overall_verdict must be "pass" or "fail"
if (!["pass", "fail"].includes(evidence.overall_verdict)) {
  schemaErrors.push(`Invalid overall_verdict value: ${evidence.overall_verdict}`);
}

// scenarios must be a non-empty array
if (!Array.isArray(evidence.scenarios) || evidence.scenarios.length === 0) {
  schemaErrors.push("scenarios must be a non-empty array");
}

// Each scenario must have required fields
for (let i = 0; i < evidence.scenarios.length; i++) {
  const s = evidence.scenarios[i];
  if (!s.scenario) schemaErrors.push(`scenarios[${i}]: missing 'scenario' field`);
  if (!s.verdict) schemaErrors.push(`scenarios[${i}]: missing 'verdict' field`);
  if (!["pass", "fail"].includes(s.verdict)) {
    schemaErrors.push(`scenarios[${i}]: invalid verdict value: ${s.verdict}`);
  }
  if (s.tests !== undefined && typeof s.tests !== "number") {
    schemaErrors.push(`scenarios[${i}]: 'tests' must be a number`);
  }
}

// total_tests must match sum of scenario tests (when available)
const scenarioTestSum = scenarios.reduce((sum, s) => sum + (s.tests || 0), 0);
if (scenarioTestSum > 0 && scenarioTestSum !== numTotalTests) {
  // This is a soft check — log but don't fail
  console.warn(`WARN: Scenario test sum (${scenarioTestSum}) != total_tests (${numTotalTests})`);
}

// ---------------------------------------------------------------------------
// Write evidence artifact
// ---------------------------------------------------------------------------

const OUTPUT_DIR = join(PLUGIN_DIR, "runtime-evidence");
mkdirSync(OUTPUT_DIR, { recursive: true });

const OUTPUT_PATH = join(OUTPUT_DIR, "M010-S04-e2e-workflow.json");
writeFileSync(OUTPUT_PATH, JSON.stringify(evidence, null, 2) + "\n");

// ---------------------------------------------------------------------------
// Console output
// ---------------------------------------------------------------------------

console.log(`\nOutput: ${OUTPUT_PATH}\n`);

console.log("Schema validation:");
if (schemaErrors.length === 0) {
  console.log("  All checks: PASS");
} else {
  for (const err of schemaErrors) {
    console.log(`  FAIL: ${err}`);
  }
}

console.log("\nPer-scenario verdicts:");
for (const s of scenarios) {
  const status = s.verdict === "pass" ? "PASS" : "FAIL";
  console.log(`  ${status}  ${s.scenario}  tests=${s.tests}`);
}

console.log(`\nOverall verdict: ${overallVerdict.toUpperCase()}`);

if (overallVerdict === "fail" || schemaErrors.length > 0) {
  console.error("\nVerification FAILED");
  process.exit(1);
}

console.log("\nVerification PASSED — all scenarios pass with valid evidence artifact");
process.exit(0);
