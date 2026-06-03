#!/usr/bin/env node
/**
 * M012-S01: Validate Cleanup Gate Artifact
 *
 * Validates the cleanup gate artifact for:
 * 1. No plaintext secrets in JSON or markdown
 * 2. No direct DB mutation recorded
 * 3. Safety flags are correct (read-only, GET only, zero mutations)
 * 4. BOS-1 uses canonical company ID
 * 5. BOS-2 uses stale sandbox ID
 * 6. Cleanup status is one of: deferred, pending_confirmation, completed
 * 7. If cleanup is deferred, mutation count must be 0
 * 8. Schema structure is valid
 * 9. Stale sandbox not used as target
 * 10. No confirmation bypass when mutation occurred
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const JSON_PATH = path.join(ROOT, 'runtime-evidence', 'M012-S01-cleanup-gate.json');
const MD_PATH = path.join(ROOT, 'runtime-evidence', 'M012-S01-cleanup-gate.md');

const CANONICAL_COMPANY_ID = '9feb4c22-05b9-401e-ba67-0e866e3056da';
const STALE_SANDBOX_ID = '43c74adb-b194-44d1-8f8e-ba142544bb9d';
const VALID_CLEANUP_STATUSES = ['deferred', 'pending_confirmation', 'completed', 'skipped'];

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

  // 1. Files exist
  if (!fs.existsSync(JSON_PATH)) {
    fail(`JSON artifact not found: ${JSON_PATH}`);
    process.exit(1);
  }
  if (!fs.existsSync(MD_PATH)) {
    fail(`Markdown artifact not found: ${MD_PATH}`);
    process.exit(1);
  }

  const jsonText = fs.readFileSync(JSON_PATH, 'utf8');
  const mdText = fs.readFileSync(MD_PATH, 'utf8');

  let artifact;
  try {
    artifact = JSON.parse(jsonText);
  } catch (err) {
    fail(`JSON artifact is malformed: ${err.message}`);
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

  // 4. Schema structure
  const requiredTopFields = ['schema_version', 'artifact_type', 'phase', 'generated_at', 'classification', 'cleanup_gate', 'safety'];
  for (const field of requiredTopFields) {
    if (!(field in artifact)) {
      allPassed = fail(`Missing required top-level field: ${field}`) && allPassed;
    } else {
      pass(`Required field present: ${field}`);
    }
  }

  // 5. Classification structure
  if (artifact.classification) {
    if (!artifact.classification.bos1) {
      allPassed = fail('Missing classification.bos1') && allPassed;
    } else {
      pass('classification.bos1 present');
      // BOS-1 company ID must be canonical
      if (artifact.classification.bos1.company_id !== CANONICAL_COMPANY_ID) {
        allPassed = fail(`BOS-1 company_id is not canonical: ${artifact.classification.bos1.company_id}`) && allPassed;
      } else {
        pass(`BOS-1 company_id is canonical: ${CANONICAL_COMPANY_ID}`);
      }
      // BOS-1 must be marked canonical
      if (artifact.classification.bos1.is_canonical !== true) {
        allPassed = fail('BOS-1 is_canonical is not true') && allPassed;
      } else {
        pass('BOS-1 is_canonical is true');
      }
    }

    if (!artifact.classification.bos2) {
      allPassed = fail('Missing classification.bos2') && allPassed;
    } else {
      pass('classification.bos2 present');
      // BOS-2 company ID must be stale sandbox
      if (artifact.classification.bos2.company_id !== STALE_SANDBOX_ID) {
        allPassed = fail(`BOS-2 company_id is not stale sandbox: ${artifact.classification.bos2.company_id}`) && allPassed;
      } else {
        pass(`BOS-2 company_id is stale sandbox: ${STALE_SANDBOX_ID}`);
      }
      // BOS-2 must be marked stale
      if (artifact.classification.bos2.is_stale !== true) {
        allPassed = fail('BOS-2 is_stale is not true') && allPassed;
      } else {
        pass('BOS-2 is_stale is true');
      }
      // BOS-2 cleanup status must be valid
      if (!VALID_CLEANUP_STATUSES.includes(artifact.classification.bos2.cleanup_status)) {
        allPassed = fail(`BOS-2 cleanup_status is invalid: ${artifact.classification.bos2.cleanup_status}`) && allPassed;
      } else {
        pass(`BOS-2 cleanup_status is valid: ${artifact.classification.bos2.cleanup_status}`);
      }
    }
  }

  // 6. Cleanup gate structure
  if (artifact.cleanup_gate) {
    const gate = artifact.cleanup_gate;

    // Cleanup status must be valid
    if (!VALID_CLEANUP_STATUSES.includes(gate.cleanup_status)) {
      allPassed = fail(`cleanup_gate.cleanup_status is invalid: ${gate.cleanup_status}`) && allPassed;
    } else {
      pass(`cleanup_gate.cleanup_status is valid: ${gate.cleanup_status}`);
    }

    // If deferred, mutation count must be 0
    if (gate.cleanup_status === 'deferred' && gate.mutation_count !== 0) {
      allPassed = fail(`Cleanup is deferred but mutation_count is ${gate.mutation_count}, expected 0`) && allPassed;
    } else if (gate.cleanup_status === 'deferred') {
      pass('Cleanup is deferred with mutation_count=0');
    }

    // If no mutation, mutation_executed must be false
    if (gate.mutation_count === 0 && gate.mutation_executed !== false) {
      allPassed = fail('mutation_count is 0 but mutation_executed is not false') && allPassed;
    } else if (gate.mutation_count === 0) {
      pass('mutation_count=0 and mutation_executed=false');
    }

    // If mutation was executed, confirmation must have been received
    if (gate.mutation_executed === true && gate.explicit_confirmation_received !== true) {
      allPassed = fail('Mutation executed but explicit_confirmation_received is not true') && allPassed;
    } else if (gate.mutation_executed === true) {
      pass('Mutation executed with explicit confirmation');
    }

    // Deferral reason must be present when deferred
    if (gate.cleanup_status === 'deferred' && (!gate.cleanup_deferral_reason || gate.cleanup_deferral_reason.trim() === '')) {
      allPassed = fail('Cleanup is deferred but cleanup_deferral_reason is empty') && allPassed;
    } else if (gate.cleanup_status === 'deferred') {
      pass('Cleanup deferral reason is present');
    }
  }

  // 7. Safety flags
  if (artifact.safety) {
    if (artifact.safety.direct_db_mutation === true) {
      allPassed = fail('direct_db_mutation is true') && allPassed;
    } else {
      pass('direct_db_mutation is false');
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

    if (artifact.safety.external_mutations !== 0) {
      allPassed = fail(`external_mutations is ${artifact.safety.external_mutations}, expected 0`) && allPassed;
    } else {
      pass('external_mutations is 0');
    }

    if (artifact.safety.plaintext_secrets_logged === true) {
      allPassed = fail('plaintext_secrets_logged is true') && allPassed;
    } else {
      pass('plaintext_secrets_logged is false');
    }

    if (artifact.safety.stale_sandbox_used_as_target === true) {
      allPassed = fail('stale_sandbox_used_as_target is true') && allPassed;
    } else {
      pass('stale_sandbox_used_as_target is false');
    }

    // Confirmation bypass: if mutation was executed, confirmation_bypassed must be false
    if (artifact.cleanup_gate && artifact.cleanup_gate.mutation_executed === true && artifact.safety.confirmation_bypassed === true) {
      allPassed = fail('Mutation executed but confirmation_bypassed is true') && allPassed;
    } else {
      pass('No confirmation bypass detected');
    }
  } else {
    allPassed = fail('Missing safety block') && allPassed;
  }

  // 8. Source readback reference
  if (!artifact.source_readback) {
    allPassed = fail('Missing source_readback reference') && allPassed;
  } else {
    pass('source_readback reference present');
    if (!artifact.source_readback.generated_at) {
      allPassed = fail('source_readback.generated_at is missing') && allPassed;
    } else {
      pass('source_readback.generated_at present');
    }
  }

  console.log('');
  console.log(allPassed ? '=== ALL CHECKS PASSED ===' : '=== SOME CHECKS FAILED ===');
  process.exit(allPassed ? 0 : 1);
}

validate();
