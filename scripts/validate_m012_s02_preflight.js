#!/usr/bin/env node
/**
 * validate_m012_s02_preflight.js
 *
 * Validates that runtime-evidence/M012-S02-native-mission-preflight.json
 * contains all required fields for the M012-S02 mission preflight contract.
 *
 * Exit 0 on success, exit 1 on failure.
 */

const fs = require("fs");
const path = require("path");

const PREFLIGHT_PATH = path.join(
  __dirname,
  "..",
  "runtime-evidence",
  "M012-S02-native-mission-preflight.json"
);

const REQUIRED_TOP_LEVEL = [
  "schema_version",
  "artifact_type",
  "generated_at",
  "source_gate",
  "target",
  "missionTitle",
  "missionPosture",
  "safetyConstraints",
  "allowedRoutes",
  "blockedSurfaces",
  "confirmationWording",
  "outOfScope",
  "currentBlockers",
  "proposedFlow",
];

const REQUIRED_TARGET_FIELDS = ["companyId", "companyName", "canonicalPath"];

const EXPECTED_SCHEMA_VERSION = "m012-s02-native-mission-preflight/v1";

let errors = [];

function fail(msg) {
  errors.push(msg);
}

function check(condition, msg) {
  if (!condition) fail(msg);
}

try {
  const raw = fs.readFileSync(PREFLIGHT_PATH, "utf-8");
  let data;
  try {
    data = JSON.parse(raw);
  } catch (e) {
    console.error("FAIL: Could not parse preflight JSON:", e.message);
    process.exit(1);
  }

  // Top-level required fields
  for (const field of REQUIRED_TOP_LEVEL) {
    check(
      data[field] !== undefined,
      `Missing required top-level field: ${field}`
    );
  }

  // Schema version
  check(
    data.schema_version === EXPECTED_SCHEMA_VERSION,
    `schema_version should be "${EXPECTED_SCHEMA_VERSION}", got "${data.schema_version}"`
  );

  // Target fields
  if (data.target) {
    for (const field of REQUIRED_TARGET_FIELDS) {
      check(
        data.target[field] !== undefined && data.target[field] !== "",
        `Missing or empty target.${field}`
      );
    }
    check(
      data.target.companyId === "/BOS",
      `target.companyId should be "/BOS", got "${data.target.companyId}"`
    );
  }

  // missionTitle
  check(
    typeof data.missionTitle === "string" && data.missionTitle.length > 0,
    "missionTitle must be a non-empty string"
  );

  // safetyConstraints — must be non-empty array
  check(
    Array.isArray(data.safetyConstraints) && data.safetyConstraints.length > 0,
    "safetyConstraints must be a non-empty array"
  );

  // allowedRoutes — must be non-empty array with id fields
  check(
    Array.isArray(data.allowedRoutes) && data.allowedRoutes.length > 0,
    "allowedRoutes must be a non-empty array"
  );
  if (Array.isArray(data.allowedRoutes)) {
    for (const route of data.allowedRoutes) {
      check(
        route.id && typeof route.id === "string",
        "Each allowedRoute must have an id"
      );
      check(
        route.mode && typeof route.mode === "string",
        `allowedRoute "${route.id}" missing mode`
      );
      check(
        route.action && typeof route.action === "string",
        `allowedRoute "${route.id}" missing action`
      );
    }
  }

  // blockedSurfaces — must be non-empty array with id and reason
  check(
    Array.isArray(data.blockedSurfaces) && data.blockedSurfaces.length > 0,
    "blockedSurfaces must be a non-empty array"
  );
  if (Array.isArray(data.blockedSurfaces)) {
    for (const surface of data.blockedSurfaces) {
      check(
        surface.id && typeof surface.id === "string",
        "Each blockedSurface must have an id"
      );
      check(
        surface.reason && typeof surface.reason === "string",
        `blockedSurface "${surface.id}" missing reason`
      );
    }
  }

  // confirmationWording — must be non-empty array
  check(
    Array.isArray(data.confirmationWording) &&
      data.confirmationWording.length > 0,
    "confirmationWording must be a non-empty array"
  );
  if (Array.isArray(data.confirmationWording)) {
    for (const conf of data.confirmationWording) {
      check(
        conf.id && typeof conf.id === "string",
        "Each confirmationWording entry must have an id"
      );
      check(
        conf.when && typeof conf.when === "string",
        `confirmationWording "${conf.id}" missing when`
      );
      check(
        conf.wording && typeof conf.wording === "string",
        `confirmationWording "${conf.id}" missing wording`
      );
    }
  }

  // outOfScope — must be non-empty array with surface and reason
  check(
    Array.isArray(data.outOfScope) && data.outOfScope.length > 0,
    "outOfScope must be a non-empty array"
  );
  if (Array.isArray(data.outOfScope)) {
    for (const item of data.outOfScope) {
      check(
        item.surface && typeof item.surface === "string",
        "Each outOfScope entry must have a surface"
      );
      check(
        item.reason && typeof item.reason === "string",
        `outOfScope "${item.surface}" missing reason`
      );
    }
  }

  // Validate specific out-of-scope surfaces are present
  if (Array.isArray(data.outOfScope)) {
    const surfaces = data.outOfScope.map((o) => o.surface.toLowerCase());
    const requiredOutOfScope = [
      "plugin",
      "hermes",
      "gsd-pi",
      "github",
      "telegram",
      "unsupported document/comment",
    ];
    for (const keyword of requiredOutOfScope) {
      check(
        surfaces.some((s) => s.includes(keyword)),
        `outOfScope must include an entry mentioning "${keyword}"`
      );
    }
  }

  // currentBlockers — must be array
  check(
    Array.isArray(data.currentBlockers),
    "currentBlockers must be an array"
  );

  // proposedFlow — must be non-empty array
  check(
    Array.isArray(data.proposedFlow) && data.proposedFlow.length > 0,
    "proposedFlow must be a non-empty array"
  );

  // Report
  if (errors.length > 0) {
    console.error(`FAIL: ${errors.length} validation error(s):`);
    for (const err of errors) {
      console.error(`  - ${err}`);
    }
    process.exit(1);
  } else {
    console.log(
      "PASS: M012-S02 native mission preflight artifact is valid."
    );
    console.log(`  Schema version: ${data.schema_version}`);
    console.log(`  Target: ${data.target.companyId}`);
    console.log(`  Mission: ${data.missionTitle}`);
    console.log(`  Allowed routes: ${data.allowedRoutes.length}`);
    console.log(`  Blocked surfaces: ${data.blockedSurfaces.length}`);
    console.log(`  Confirmations: ${data.confirmationWording.length}`);
    console.log(`  Out of scope entries: ${data.outOfScope.length}`);
    console.log(`  Safety constraints: ${data.safetyConstraints.length}`);
    process.exit(0);
  }
} catch (err) {
  if (err.code === "ENOENT") {
    console.error(
      `FAIL: Preflight artifact not found at ${PREFLIGHT_PATH}`
    );
    process.exit(1);
  }
  throw err;
}
