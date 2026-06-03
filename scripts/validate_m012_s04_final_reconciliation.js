#!/usr/bin/env node
/**
 * M012-S04 Final Reconciliation Validator
 *
 * Validates:
 * 1. Schema structure (required fields present)
 * 2. promotion_guard items are NOT in confirmed array
 * 3. validation_status is "pass"
 *
 * Exit 0 on pass, non-zero on fail.
 */

const fs = require("fs");
const path = require("path");

const ARTIFACT_PATH = path.join(
  __dirname,
  "..",
  "runtime-evidence",
  "M012-S04-final-reconciliation.json"
);

let exitCode = 0;
const errors = [];

function fail(msg) {
  errors.push(msg);
  exitCode = 1;
}

function pass(msg) {
  console.log(`  ✅ ${msg}`);
}

try {
  const raw = fs.readFileSync(ARTIFACT_PATH, "utf8");
  const artifact = JSON.parse(raw);

  // --- Schema validation ---
  console.log("Schema validation:");

  const requiredFields = [
    "schema_version",
    "artifact_type",
    "phase",
    "generated_at",
    "inputs",
    "capability_summary",
    "m012_evidence_summary",
    "blocker_inventory",
    "promotion_guard",
    "promotion_guard_rationale",
    "validation_status",
    "validation_details",
  ];

  for (const field of requiredFields) {
    if (artifact[field] === undefined) {
      fail(`Missing required field: ${field}`);
    } else {
      pass(`Field present: ${field}`);
    }
  }

  // Check schema_version
  if (artifact.schema_version === "m012-s04-final-reconciliation/v1") {
    pass(`schema_version correct: ${artifact.schema_version}`);
  } else {
    fail(
      `schema_version incorrect: expected "m012-s04-final-reconciliation/v1", got "${artifact.schema_version}"`
    );
  }

  // Check artifact_type
  if (artifact.artifact_type === "m012-final-reconciliation") {
    pass(`artifact_type correct: ${artifact.artifact_type}`);
  } else {
    fail(
      `artifact_type incorrect: expected "m012-final-reconciliation", got "${artifact.artifact_type}"`
    );
  }

  // Check phase
  if (artifact.phase === "M012-S04") {
    pass(`phase correct: ${artifact.phase}`);
  } else {
    fail(`phase incorrect: expected "M012-S04", got "${artifact.phase}"`);
  }

  // Check inputs is array
  if (Array.isArray(artifact.inputs)) {
    pass(`inputs is array with ${artifact.inputs.length} entries`);
  } else {
    fail(`inputs is not an array`);
  }

  // Check capability_summary structure
  const capSummary = artifact.capability_summary;
  if (capSummary) {
    for (const key of ["confirmed", "local_only", "fallback_only", "blocked"]) {
      if (Array.isArray(capSummary[key])) {
        pass(`capability_summary.${key} is array (${capSummary[key].length} items)`);
      } else {
        fail(`capability_summary.${key} is not an array`);
      }
    }
  }

  // Check promotion_guard is array
  if (Array.isArray(artifact.promotion_guard)) {
    pass(`promotion_guard is array (${artifact.promotion_guard.length} items)`);
  } else {
    fail(`promotion_guard is not an array`);
  }

  // Check blocker_inventory is array
  if (Array.isArray(artifact.blocker_inventory)) {
    pass(`blocker_inventory is array (${artifact.blocker_inventory.length} items)`);
  } else {
    fail(`blocker_inventory is not an array`);
  }

  // --- Promotion guard validation ---
  console.log("\nPromotion guard validation:");

  const promotionGuard = artifact.promotion_guard || [];
  const confirmed = (artifact.capability_summary || {}).confirmed || [];

  let guardViolations = 0;
  for (const guarded of promotionGuard) {
    if (confirmed.includes(guarded)) {
      fail(`PROMOTION VIOLATION: "${guarded}" is in promotion_guard but also in confirmed array`);
      guardViolations++;
    } else {
      pass(`"${guarded}" correctly absent from confirmed`);
    }
  }

  if (guardViolations === 0) {
    pass("All promotion_guard items are absent from confirmed array");
  }

  // --- Validation status check ---
  console.log("\nValidation status check:");

  if (artifact.validation_status === "pass") {
    pass(`validation_status is "pass"`);
  } else {
    fail(
      `validation_status is "${artifact.validation_status}" (expected "pass")`
    );
  }

  // --- Summary ---
  console.log("\n" + "=".repeat(60));
  if (exitCode === 0) {
    console.log("RESULT: ALL CHECKS PASSED");
    console.log(
      "Promotion guard is respected. No unproven capabilities promoted to confirmed."
    );
  } else {
    console.log("RESULT: VALIDATION FAILED");
    console.log(`Errors (${errors.length}):`);
    for (const err of errors) {
      console.log(`  ❌ ${err}`);
    }
  }

  process.exit(exitCode);
} catch (err) {
  console.error(`FATAL: ${err.message}`);
  process.exit(1);
}
