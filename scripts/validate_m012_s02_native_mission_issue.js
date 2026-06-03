#!/usr/bin/env node
/**
 * Validation script for M012-S02 native mission issue artifact.
 * Checks that the JSON artifact has required fields and that
 * when mutationAttempted is false, a blockerReason is present.
 *
 * Exit 0 on success, exit 1 on failure.
 */

const fs = require('fs');
const path = require('path');

const ARTIFACT_PATH = path.join(__dirname, '..', 'runtime-evidence', 'M012-S02-native-mission-issue.json');

const REQUIRED_FIELDS = [
  'schema_version',
  'confirmationStatus',
  'mutationAttempted',
  'blockerCodes',
  'blockerReason',
  'redactionFlags',
  'unsupportedRoutes',
];

const NUMERIC_FIELDS = ['mutationCount'];

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
  const raw = fs.readFileSync(ARTIFACT_PATH, 'utf-8');
  const data = JSON.parse(raw);

  // 1. Check schema version
  if (data.schema_version === 'm012-s02-native-mission-issue/v1') {
    pass('schema_version matches expected value');
  } else {
    fail(`schema_version is "${data.schema_version}", expected "m012-s02-native-mission-issue/v1"`);
  }

  // 2. Check required fields exist
  for (const field of REQUIRED_FIELDS) {
    if (field in data) {
      pass(`required field "${field}" present`);
    } else {
      fail(`required field "${field}" missing`);
    }
  }

  // 3. Check numeric fields
  for (const field of NUMERIC_FIELDS) {
    if (field in data) {
      if (typeof data[field] === 'number') {
        pass(`field "${field}" is numeric`);
      } else {
        fail(`field "${field}" should be numeric, got ${typeof data[field]}`);
      }
    }
  }

  // 4. Check confirmationStatus is a known value
  const validConfirmationStatuses = ['absent', 'confirmed', 'denied'];
  if (validConfirmationStatuses.includes(data.confirmationStatus)) {
    pass(`confirmationStatus "${data.confirmationStatus}" is valid`);
  } else {
    fail(`confirmationStatus "${data.confirmationStatus}" not in ${JSON.stringify(validConfirmationStatuses)}`);
  }

  // 5. Core rule: if mutationAttempted is false, blockerReason must be present
  if (data.mutationAttempted === false) {
    pass('mutationAttempted is false');
    if (typeof data.blockerReason === 'string' && data.blockerReason.length > 0) {
      pass('blockerReason is present when mutationAttempted is false');
    } else {
      fail('blockerReason must be a non-empty string when mutationAttempted is false');
    }
    if (Array.isArray(data.blockerCodes) && data.blockerCodes.length > 0) {
      pass('blockerCodes is a non-empty array when mutationAttempted is false');
    } else {
      fail('blockerCodes must be a non-empty array when mutationAttempted is false');
    }
  } else if (data.mutationAttempted === true) {
    pass('mutationAttempted is true — readback fields expected');
    // If mutation was attempted, route and readbackStatus should exist
    if (data.route === null || typeof data.route === 'string') {
      pass(`route field present (value: ${JSON.stringify(data.route)})`);
    } else {
      fail('route must be null or a string');
    }
  } else {
    fail(`mutationAttempted must be boolean, got ${typeof data.mutationAttempted}`);
  }

  // 6. Check unsupportedRoutes is an array
  if (Array.isArray(data.unsupportedRoutes)) {
    pass(`unsupportedRoutes is an array with ${data.unsupportedRoutes.length} entries`);
  } else {
    fail('unsupportedRoutes must be an array');
  }

  // 7. Check redactionFlags
  if (typeof data.redactionFlags === 'object' && data.redactionFlags !== null) {
    if (data.redactionFlags.plaintext_secrets === false) {
      pass('redactionFlags.plaintext_secrets is false (safe)');
    } else {
      fail('redactionFlags.plaintext_secrets should be false');
    }
  } else {
    fail('redactionFlags must be an object');
  }

  // 8. Check liveIssueId is null when mutation not attempted
  if (data.mutationAttempted === false && data.liveIssueId === null) {
    pass('liveIssueId is null when mutation not attempted');
  } else if (data.mutationAttempted === false && data.liveIssueId !== null) {
    fail('liveIssueId should be null when mutationAttempted is false');
  }

} catch (err) {
  if (err.code === 'ENOENT') {
    fail(`Artifact not found at ${ARTIFACT_PATH}`);
  } else if (err instanceof SyntaxError) {
    fail(`Artifact is not valid JSON: ${err.message}`);
  } else {
    fail(`Unexpected error: ${err.message}`);
  }
}

// Report
console.log('\n--- Validation Results ---');
if (errors.length > 0) {
  console.log(`\n❌ FAILED with ${errors.length} error(s):`);
  for (const e of errors) {
    console.log(`  ❌ ${e}`);
  }
} else {
  console.log('\n✅ All checks passed.');
}

console.log(`\nExit code: ${exitCode}`);
process.exit(exitCode);
