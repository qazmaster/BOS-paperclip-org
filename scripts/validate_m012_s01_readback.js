#!/usr/bin/env node
/**
 * M012-S01: Validate Canonical Paperclip Readback
 *
 * Validates the readback artifact for:
 * 1. No plaintext secrets in JSON or markdown
 * 2. No direct DB mutation recorded
 * 3. Company ID is canonical (not stale sandbox)
 * 4. No unsupported surfaces promoted
 * 5. Schema structure is valid
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const JSON_PATH = path.join(ROOT, 'runtime-evidence', 'M012-S01-canonical-paperclip-readback.json');
const MD_PATH = path.join(ROOT, 'runtime-evidence', 'M012-S01-canonical-paperclip-readback.md');

const CANONICAL_COMPANY_ID = '9feb4c22-05b9-401e-ba67-0e866e3056da';
const STALE_SANDBOX_ID = '43c74adb-b194-44d1-8f8e-ba142544bb9d';

const SECRET_RE = /(sk-[A-Za-z0-9_-]{16,}|gh[pousr]_[A-Za-z0-9_]{20,}|Bearer\s+[A-Za-z0-9._-]{10,}|pcp_[A-Za-z0-9_-]{16,}|paperclip_(?:key|token)_[A-Za-z0-9_-]{12,})/;

function fail(message) {
  console.error(`FAIL: ${message}`);
  return false;
}

function pass(message) {
  console.log(`PASS: ${message}`);
  return true;
}

function validate() {
  let allPassed = true;
  const checks = [];

  // 1. Files exist
  if (!fs.existsSync(JSON_PATH)) {
    allPassed = fail(`JSON artifact not found: ${JSON_PATH}`) && allPassed;
    process.exit(1);
  }
  if (!fs.existsSync(MD_PATH)) {
    allPassed = fail(`Markdown artifact not found: ${MD_PATH}`) && allPassed;
    process.exit(1);
  }

  const jsonText = fs.readFileSync(JSON_PATH, 'utf8');
  const mdText = fs.readFileSync(MD_PATH, 'utf8');

  let artifact;
  try {
    artifact = JSON.parse(jsonText);
  } catch (err) {
    allPassed = fail(`JSON artifact is malformed: ${err.message}`) && allPassed;
    process.exit(1);
  }

  // 2. No plaintext secrets in JSON
  if (SECRET_RE.test(jsonText)) {
    allPassed = fail('Plaintext secret pattern detected in JSON artifact') && allPassed;
  } else {
    pass('No plaintext secrets in JSON artifact');
  }

  // 3. No plaintext secrets in markdown
  if (SECRET_RE.test(mdText)) {
    allPassed = fail('Plaintext secret pattern detected in markdown artifact') && allPassed;
  } else {
    pass('No plaintext secrets in markdown artifact');
  }

  // 4. Safety flags
  if (artifact.safety) {
    if (artifact.safety.direct_db_mutation === true) {
      allPassed = fail('direct_db_mutation is true in safety block') && allPassed;
    } else {
      pass('direct_db_mutation is false');
    }
    if (artifact.safety.plaintext_secrets_requested_or_logged === true) {
      allPassed = fail('plaintext_secrets_requested_or_logged is true') && allPassed;
    } else {
      pass('plaintext_secrets_requested_or_logged is false');
    }
    if (artifact.safety.read_only !== true) {
      allPassed = fail('read_only is not true') && allPassed;
    } else {
      pass('read_only is true');
    }
    if (!Array.isArray(artifact.safety.http_methods_used) || !artifact.safety.http_methods_used.every(m => m === 'GET')) {
      allPassed = fail('http_methods_used contains non-GET methods') && allPassed;
    } else {
      pass('http_methods_used is GET only');
    }
  } else {
    allPassed = fail('Missing safety block') && allPassed;
  }

  // 5. Company ID is canonical
  if (artifact.config) {
    if (artifact.config.company_id === STALE_SANDBOX_ID) {
      allPassed = fail(`Company ID is stale sandbox: ${STALE_SANDBOX_ID}`) && allPassed;
    } else if (artifact.config.company_id === CANONICAL_COMPANY_ID) {
      pass(`Company ID is canonical: ${CANONICAL_COMPANY_ID}`);
    } else {
      allPassed = fail(`Company ID is neither canonical nor stale sandbox: ${artifact.config.company_id}`) && allPassed;
    }
  } else {
    allPassed = fail('Missing config block') && allPassed;
  }

  // 6. No unsupported surface promotions
  // Check that confirmed_capabilities or similar promotion fields are absent
  // (this probe is read-only; it should not promote any capability)
  if (artifact.capability_promotions && artifact.capability_promotions.length > 0) {
    allPassed = fail('capability_promotions array is non-empty; unsupported surfaces may have been promoted') && allPassed;
  } else {
    pass('No capability promotions recorded');
  }

  // 7. Schema structure
  const requiredFields = ['schema_version', 'artifact_type', 'phase', 'generated_at', 'safety', 'observations', 'normalized_entities', 'blocker_codes', 'route_inventory'];
  for (const field of requiredFields) {
    if (!(field in artifact)) {
      allPassed = fail(`Missing required field: ${field}`) && allPassed;
    } else {
      pass(`Required field present: ${field}`);
    }
  }

  // 8. Observations are booleans
  if (artifact.observations && typeof artifact.observations === 'object') {
    const boolFields = ['health_ok', 'company_visible', 'agents_visible', 'issues_visible', 'plugin_route_ok', 'piko_tools_observed'];
    for (const field of boolFields) {
      if (field in artifact.observations && typeof artifact.observations[field] !== 'boolean') {
        allPassed = fail(`observations.${field} is not boolean: ${typeof artifact.observations[field]}`) && allPassed;
      }
    }
    pass('Observations structure validated');
  }

  // 9. Route inventory is array
  if (!Array.isArray(artifact.route_inventory)) {
    allPassed = fail('route_inventory is not an array') && allPassed;
  } else {
    pass(`route_inventory has ${artifact.route_inventory.length} routes`);
  }

  // 10. Blocker codes are strings
  if (!Array.isArray(artifact.blocker_codes)) {
    allPassed = fail('blocker_codes is not an array') && allPassed;
  } else {
    pass(`blocker_codes has ${artifact.blocker_codes.length} entries`);
  }

  console.log('');
  console.log(allPassed ? '=== ALL CHECKS PASSED ===' : '=== SOME CHECKS FAILED ===');
  process.exit(allPassed ? 0 : 1);
}

validate();
