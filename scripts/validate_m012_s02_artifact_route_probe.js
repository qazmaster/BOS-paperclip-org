#!/usr/bin/env node
/**
 * Validator for M012-S02 artifact route probe JSON.
 *
 * Exit 0 if valid; exit 1 with error details if invalid.
 *
 * Rules:
 *  - schema_version must be "m012-s02-artifact-route-probe/v1"
 *  - routes must exist and be a non-empty array
 *  - Each route must have: name, status, reason
 *  - Document and comment routes MUST NOT claim "working" or "supported" status
 *  - unsupportedRoutes must be a non-empty array
 *  - writeCount must be 0
 *  - readbackStatus must be "not-applicable"
 *  - capabilityPromotionStatus must be "none"
 *  - fallbackReport must be true
 *  - blockerCodes must include "plugin_routes_not_found" and "tool_routes_not_found"
 */

const fs = require("fs");
const path = require("path");

const PROBE_PATH = path.resolve(
  __dirname,
  "..",
  "runtime-evidence",
  "M012-S02-artifact-route-probe.json"
);

function fail(msg) {
  console.error(`VALIDATION FAILED: ${msg}`);
  process.exit(1);
}

function pass(msg) {
  console.log(`VALIDATION PASSED: ${msg}`);
}

// --- Load ---
let raw;
try {
  raw = fs.readFileSync(PROBE_PATH, "utf-8");
} catch (err) {
  fail(`Cannot read probe file: ${err.message}`);
}

let data;
try {
  data = JSON.parse(raw);
} catch (err) {
  fail(`Probe file is not valid JSON: ${err.message}`);
}

// --- schema_version ---
if (data.schema_version !== "m012-s02-artifact-route-probe/v1") {
  fail(
    `Expected schema_version "m012-s02-artifact-route-probe/v1", got "${data.schema_version}"`
  );
}

// --- routes ---
if (!Array.isArray(data.routes) || data.routes.length === 0) {
  fail("routes must be a non-empty array");
}
for (const r of data.routes) {
  if (!r.name) fail("Every route must have a 'name'");
  if (!r.status) fail(`Route "${r.name}" must have a 'status'`);
  if (!r.reason) fail(`Route "${r.name}" must have a 'reason'`);
}

// Critical gate: document and comment routes must NOT be marked as working/supported
const forbiddenWorking = ["working", "supported", "confirmed", "available"];
for (const r of data.routes) {
  const nameLower = (r.name || "").toLowerCase();
  if (
    (nameLower.includes("document") || nameLower.includes("comment")) &&
    forbiddenWorking.includes((r.status || "").toLowerCase())
  ) {
    fail(
      `Route "${r.name}" claims status "${r.status}" but document/comment routes are NOT confirmed working in this probe. This is a fatal validation error.`
    );
  }
}

// --- unsupportedRoutes ---
if (!Array.isArray(data.unsupportedRoutes) || data.unsupportedRoutes.length === 0) {
  fail("unsupportedRoutes must be a non-empty array");
}

// --- writeCount ---
if (data.writeCount !== 0) {
  fail(`writeCount must be 0, got ${data.writeCount}`);
}

// --- readbackStatus ---
if (data.readbackStatus !== "not-applicable") {
  fail(`readbackStatus must be "not-applicable", got "${data.readbackStatus}"`);
}

// --- capabilityPromotionStatus ---
if (data.capabilityPromotionStatus !== "none") {
  fail(
    `capabilityPromotionStatus must be "none", got "${data.capabilityPromotionStatus}"`
  );
}

// --- fallbackReport ---
if (data.fallbackReport !== true) {
  fail(`fallbackReport must be true, got ${data.fallbackReport}`);
}

// --- blockerCodes ---
if (!Array.isArray(data.blockerCodes)) {
  fail("blockerCodes must be an array");
}
const requiredBlockers = ["plugin_routes_not_found", "tool_routes_not_found"];
for (const rb of requiredBlockers) {
  if (!data.blockerCodes.includes(rb)) {
    fail(`blockerCodes must include "${rb}"`);
  }
}

// --- All checks passed ---
pass("M012-S02 artifact route probe JSON is valid and correctly marks document/comment routes as unsupported.");
process.exit(0);
