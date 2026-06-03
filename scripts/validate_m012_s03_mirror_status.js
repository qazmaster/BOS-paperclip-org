#!/usr/bin/env node
/**
 * Validator for M012-S03 artifact mirror status JSON.
 *
 * Exit 0 if valid; exit 1 with error details if invalid.
 *
 * Rules:
 *  - schema_version must be "m012-s03-artifact-mirror-status/v1"
 *  - mirrorMode must be "repo-local-fallback"
 *  - nativeRouteSupport must exist and have entries for issue.create, document.create, comment.create, issue.read
 *  - document.create and comment.create must NOT be mirrorable
 *  - issue.create must NOT be mirrorable (auth-blocked)
 *  - confirmedBoundedArtifactClasses must be empty
 *  - liveIssueId must be null
 *  - readbackStatus must be "not-applicable"
 *  - unsupportedRouteBlockers must include "plugin_routes_not_found" and "tool_routes_not_found"
 *  - safetyFlags.native_mirroring_attempted must be false
 *  - safetyFlags.native_mirroring_successful must be false
 *  - capabilityGateReference must exist with reconciliationNote
 *  - authState must exist with companyEndpointStatus 401
 */

const fs = require("fs");
const path = require("path");

const MIRROR_STATUS_PATH = path.resolve(
  __dirname,
  "..",
  "runtime-evidence",
  "M012-S03-artifact-mirror-status.json"
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
  raw = fs.readFileSync(MIRROR_STATUS_PATH, "utf-8");
} catch (err) {
  fail(`Cannot read mirror status file: ${err.message}`);
}

let data;
try {
  data = JSON.parse(raw);
} catch (err) {
  fail(`Mirror status file is not valid JSON: ${err.message}`);
}

// --- schema_version ---
if (data.schema_version !== "m012-s03-artifact-mirror-status/v1") {
  fail(
    `Expected schema_version "m012-s03-artifact-mirror-status/v1", got "${data.schema_version}"`
  );
}

// --- mirrorMode ---
if (data.mirrorMode !== "repo-local-fallback") {
  fail(`mirrorMode must be "repo-local-fallback", got "${data.mirrorMode}"`);
}

// --- nativeRouteSupport ---
if (!data.nativeRouteSupport || typeof data.nativeRouteSupport !== "object") {
  fail("nativeRouteSupport must exist and be an object");
}

const requiredRoutes = ["issue.create", "document.create", "comment.create", "issue.read"];
for (const route of requiredRoutes) {
  if (!data.nativeRouteSupport[route]) {
    fail(`nativeRouteSupport must include "${route}"`);
  }
  if (!data.nativeRouteSupport[route].status) {
    fail(`nativeRouteSupport.${route} must have a 'status'`);
  }
  if (!data.nativeRouteSupport[route].reason) {
    fail(`nativeRouteSupport.${route} must have a 'reason'`);
  }
}

// Critical gate: document and comment routes must NOT be mirrorable
for (const route of ["document.create", "comment.create"]) {
  if (data.nativeRouteSupport[route].mirrorable !== false) {
    fail(
      `nativeRouteSupport.${route}.mirrorable must be false (document/comment routes are NOT confirmed working)`
    );
  }
}

// issue.create must NOT be mirrorable (auth-blocked)
if (data.nativeRouteSupport["issue.create"].mirrorable !== false) {
  fail(
    'nativeRouteSupport.issue.create.mirrorable must be false (auth-blocked)'
  );
}

// --- confirmedBoundedArtifactClasses ---
if (!Array.isArray(data.confirmedBoundedArtifactClasses)) {
  fail("confirmedBoundedArtifactClasses must be an array");
}
if (data.confirmedBoundedArtifactClasses.length !== 0) {
  fail(
    `confirmedBoundedArtifactClasses must be empty (no native routes are mirrorable), got ${data.confirmedBoundedArtifactClasses.length} entries`
  );
}

// --- liveIssueId ---
if (data.liveIssueId !== null) {
  fail(`liveIssueId must be null, got ${JSON.stringify(data.liveIssueId)}`);
}

// --- readbackStatus ---
if (data.readbackStatus !== "not-applicable") {
  fail(`readbackStatus must be "not-applicable", got "${data.readbackStatus}"`);
}

// --- unsupportedRouteBlockers ---
if (!Array.isArray(data.unsupportedRouteBlockers)) {
  fail("unsupportedRouteBlockers must be an array");
}
const requiredBlockers = ["plugin_routes_not_found", "tool_routes_not_found"];
for (const rb of requiredBlockers) {
  if (!data.unsupportedRouteBlockers.includes(rb)) {
    fail(`unsupportedRouteBlockers must include "${rb}"`);
  }
}

// --- safetyFlags ---
if (!data.safetyFlags || typeof data.safetyFlags !== "object") {
  fail("safetyFlags must exist and be an object");
}
if (data.safetyFlags.native_mirroring_attempted !== false) {
  fail("safetyFlags.native_mirroring_attempted must be false");
}
if (data.safetyFlags.native_mirroring_successful !== false) {
  fail("safetyFlags.native_mirroring_successful must be false");
}

// --- capabilityGateReference ---
if (!data.capabilityGateReference || typeof data.capabilityGateReference !== "object") {
  fail("capabilityGateReference must exist and be an object");
}
if (!data.capabilityGateReference.reconciliationNote) {
  fail("capabilityGateReference must have a reconciliationNote");
}

// --- authState ---
if (!data.authState || typeof data.authState !== "object") {
  fail("authState must exist and be an object");
}
if (data.authState.companyEndpointStatus !== 401) {
  fail(
    `authState.companyEndpointStatus must be 401, got ${data.authState.companyEndpointStatus}`
  );
}

// --- All checks passed ---
pass(
  "M012-S03 artifact mirror status JSON is valid. Mirror mode is repo-local-fallback. No native routes are mirrorable. Document/comment routes are correctly marked as unsupported."
);
process.exit(0);
