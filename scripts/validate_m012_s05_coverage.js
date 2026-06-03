#!/usr/bin/env node
/**
 * M012-S05 Validator: Coverage Remediation
 * 
 * Validates that the coverage remediation artifact has entries for
 * R009, R010, and R014 with appropriate M012 corroboration notes.
 */
const fs = require('fs');
const path = require('path');

const RUNTIME_EVIDENCE = path.join(__dirname, '..', 'runtime-evidence');
const COVERAGE_ARTIFACT = path.join(RUNTIME_EVIDENCE, 'M012-S05-coverage-remediation.json');
const REQUIREMENTS_MD = path.join(__dirname, '..', '.gsd', 'REQUIREMENTS.md');

const REQUIRED_REQUIREMENTS = ['R009', 'R010', 'R014'];

let exitCode = 0;

function fail(msg) {
  console.error(`FAIL: ${msg}`);
  exitCode = 1;
}

function pass(msg) {
  console.log(`PASS: ${msg}`);
}

// 1. Check coverage remediation artifact exists and is valid JSON
if (!fs.existsSync(COVERAGE_ARTIFACT)) {
  fail(`Coverage remediation artifact missing: ${COVERAGE_ARTIFACT}`);
} else {
  try {
    const coverage = JSON.parse(fs.readFileSync(COVERAGE_ARTIFACT, 'utf8'));
    
    if (coverage.schema_version !== 'm012-s05-coverage-remediation/v1') {
      fail(`Unexpected schema_version: ${coverage.schema_version}`);
    } else {
      pass('Coverage artifact has correct schema_version');
    }
    
    if (!Array.isArray(coverage.coverage_entries)) {
      fail('coverage_entries is not an array');
    } else {
      const entryIds = coverage.coverage_entries.map(e => e.requirement);
      
      for (const req of REQUIRED_REQUIREMENTS) {
        if (entryIds.includes(req)) {
          pass(`Coverage entry exists for ${req}`);
        } else {
          fail(`Coverage entry missing for ${req}`);
        }
      }
      
      // Check each entry has m012_evidence and validation_status_unchanged
      for (const entry of coverage.coverage_entries) {
        if (!entry.m012_evidence || entry.m012_evidence.length < 20) {
          fail(`${entry.requirement}: m012_evidence is missing or too short`);
        } else {
          pass(`${entry.requirement}: m012_evidence present (${entry.m012_evidence.length} chars)`);
        }
        if (entry.validation_status_unchanged !== true) {
          fail(`${entry.requirement}: validation_status_unchanged is not true`);
        } else {
          pass(`${entry.requirement}: validation_status_unchanged is true`);
        }
      }
    }
  } catch (e) {
    fail(`Coverage remediation artifact is not valid JSON: ${e.message}`);
  }
}

// 2. Check REQUIREMENTS.md for M012 coverage notes
if (!fs.existsSync(REQUIREMENTS_MD)) {
  fail(`REQUIREMENTS.md not found: ${REQUIREMENTS.md}`);
} else {
  const reqContent = fs.readFileSync(REQUIREMENTS_MD, 'utf8');
  
  const m012R009Phrase = 'M012 S03 local flow exercises eval gate';
  const m012R010Phrase = 'M012 S03 local flow records circuit_breaker_state';
  const m012R014Phrase = 'M012 S03 local flow processes local production artifacts';
  
  if (reqContent.includes(m012R009Phrase)) {
    pass(`REQUIREMENTS.md contains R009 M012 corroboration note`);
  } else {
    fail(`REQUIREMENTS.md missing R009 M012 corroboration note: "${m012R009Phrase}"`);
  }
  
  if (reqContent.includes(m012R010Phrase)) {
    pass(`REQUIREMENTS.md contains R010 M012 corroboration note`);
  } else {
    fail(`REQUIREMENTS.md missing R010 M012 corroboration note: "${m012R010Phrase}"`);
  }
  
  if (reqContent.includes(m012R014Phrase)) {
    pass(`REQUIREMENTS.md contains R014 M012 corroboration note`);
  } else {
    fail(`REQUIREMENTS.md missing R014 M012 corroboration note: "${m012R014Phrase}"`);
  }
  
  // Verify statuses remain validated
  const r009Section = reqContent.substring(reqContent.indexOf('### R009'));
  const r010Section = reqContent.substring(reqContent.indexOf('### R010'));
  const r014Section = reqContent.substring(reqContent.indexOf('### R014'));
  
  if (r009Section.includes('- Status: validated')) {
    pass('R009 status remains validated');
  } else {
    fail('R009 status is no longer validated');
  }
  
  if (r010Section.includes('- Status: validated')) {
    pass('R010 status remains validated');
  } else {
    fail('R010 status is no longer validated');
  }
  
  if (r014Section.includes('- Status: validated')) {
    pass('R014 status remains validated');
  } else {
    fail('R014 status is no longer validated');
  }
}

// 3. Check coverage remediation markdown exists
const coverageMd = path.join(RUNTIME_EVIDENCE, 'M012-S05-coverage-remediation.md');
if (fs.existsSync(coverageMd)) {
  const mdContent = fs.readFileSync(coverageMd, 'utf8');
  if (mdContent.includes('R009') && mdContent.includes('R010') && mdContent.includes('R014')) {
    pass('Coverage remediation markdown contains R009, R010, R014 sections');
  } else {
    fail('Coverage remediation markdown missing one or more requirement sections');
  }
} else {
  fail(`Coverage remediation markdown missing: ${coverageMd}`);
}

if (exitCode === 0) {
  console.log('\nSUITE_RESULT PASS — Coverage remediation validated');
} else {
  console.error('\nSUITE_RESULT FAIL — Coverage remediation has issues');
}

process.exit(exitCode);
