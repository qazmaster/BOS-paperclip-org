#!/usr/bin/env node
/**
 * M012-S06 Validator: Requirement Updates with Honest BOS-3 Evidence
 * 
 * Validates that:
 * 1. The M012-S04-requirement-outcomes.md R022 row reflects S06 BOS-3 evidence
 * 2. The .gsd/REQUIREMENTS.md R022 section includes honest BOS-3 framing
 * 3. No forbidden overclaiming phrases are present in either file
 * 4. The evidence JSON artifact exists and is valid
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const RUNTIME_EVIDENCE = path.join(ROOT, 'runtime-evidence');
const GSD_DIR = path.join(ROOT, '.gsd');

const REQUIREMENT_OUTCOMES = path.join(RUNTIME_EVIDENCE, 'M012-S04-requirement-outcomes.md');
const REQUIREMENTS_MD = path.join(GSD_DIR, 'REQUIREMENTS.md');
const EVIDENCE_JSON = path.join(RUNTIME_EVIDENCE, 'M012-S06-requirement-update-evidence.json');

// Forbidden overclaiming phrases that must not appear in R022 context
const FORBIDDEN_PHRASES = [
  'S02 created native',
  'created native issues',
  'native issue creation confirmed',
  'user confirmed BOS-3',
  'user confirmed issue creation',
  'explicitly confirmed by user',
  'user approved issue creation',
];

// Required honest phrases that must appear
const REQUIRED_PHRASES_OUTCOMES = [
  'S06 confirmed BOS-3 exists as a live Paperclip issue',
  'without explicit user confirmation',
  'authenticated session readback',
];

const REQUIRED_PHRASES_REQUIREMENTS = [
  'BOS-3',
  'authenticated',
  'without explicit user confirmation',
];

let exitCode = 0;

function fail(msg) {
  console.error(`FAIL: ${msg}`);
  exitCode = 1;
}

function pass(msg) {
  console.log(`PASS: ${msg}`);
}

// 1. Check evidence JSON artifact exists and is valid
if (!fs.existsSync(EVIDENCE_JSON)) {
  fail(`Evidence artifact missing: ${EVIDENCE_JSON}`);
} else {
  try {
    const evidence = JSON.parse(fs.readFileSync(EVIDENCE_JSON, 'utf8'));
    if (evidence.schema_version !== 'm012-s06-requirement-update-evidence/v1') {
      fail(`Unexpected schema_version: ${evidence.schema_version}`);
    } else {
      pass('Evidence JSON has correct schema_version');
    }
    if (!Array.isArray(evidence.changes) || evidence.changes.length === 0) {
      fail('changes array is empty or missing');
    } else {
      pass(`Evidence JSON has ${evidence.changes.length} change entries`);
    }
    if (evidence.validation_status !== 'updated') {
      fail(`validation_status is not 'updated': ${evidence.validation_status}`);
    } else {
      pass('validation_status is updated');
    }
    if (!evidence.deviation_acknowledged) {
      fail('deviation_acknowledged is not true');
    } else {
      pass('deviation_acknowledged is true');
    }
  } catch (e) {
    fail(`Evidence artifact is not valid JSON: ${e.message}`);
  }
}

// 2. Check requirement outcomes file
if (!fs.existsSync(REQUIREMENT_OUTCOMES)) {
  fail(`Requirement outcomes file missing: ${REQUIREMENT_OUTCOMES}`);
} else {
  const content = fs.readFileSync(REQUIREMENT_OUTCOMES, 'utf8');
  
  // Check for forbidden phrases in R022 context
  for (const phrase of FORBIDDEN_PHRASES) {
    if (content.toLowerCase().includes(phrase.toLowerCase())) {
      fail(`Forbidden phrase present in M012-S04-requirement-outcomes.md: "${phrase}"`);
    }
  }
  pass('No forbidden overclaiming phrases in requirement outcomes');
  
  // Check required honest phrases
  for (const phrase of REQUIRED_PHRASES_OUTCOMES) {
    if (!content.includes(phrase)) {
      fail(`Required phrase missing from requirement outcomes: "${phrase}"`);
    } else {
      pass(`Required phrase present in outcomes: "${phrase}"`);
    }
  }
}

// 3. Check REQUIREMENTS.md
if (!fs.existsSync(REQUIREMENTS_MD)) {
  fail(`REQUIREMENTS.md missing: ${REQUIREMENTS_MD}`);
} else {
  const content = fs.readFileSync(REQUIREMENTS_MD, 'utf8');
  
  // Find R022 section - check for forbidden phrases near R022
  const r022Index = content.indexOf('### R022');
  if (r022Index === -1) {
    fail('R022 detailed section not found in REQUIREMENTS.md');
  } else {
    pass('R022 detailed section found in REQUIREMENTS.md');
    
    // Extract R022 section (up to next ### or end)
    const nextSection = content.indexOf('### R023', r022Index);
    const r022Section = nextSection !== -1 
      ? content.substring(r022Index, nextSection)
      : content.substring(r022Index);
    
    // Check for forbidden phrases in R022 section
    for (const phrase of FORBIDDEN_PHRASES) {
      if (r022Section.toLowerCase().includes(phrase.toLowerCase())) {
        fail(`Forbidden phrase in R022 section of REQUIREMENTS.md: "${phrase}"`);
      }
    }
    pass('No forbidden overclaiming phrases in R022 section');
    
    // Check required phrases
    for (const phrase of REQUIRED_PHRASES_REQUIREMENTS) {
      if (!r022Section.includes(phrase)) {
        fail(`Required phrase missing from R022 section: "${phrase}"`);
      } else {
        pass(`Required phrase present in R022 section: "${phrase}"`);
      }
    }
    
    // Check Notes field exists
    if (!r022Section.includes('- Notes:')) {
      fail('R022 section missing Notes field');
    } else {
      pass('R022 section has Notes field with BOS-3 framing');
    }
  }
  
  // Check R022 table row
  const tableRow = content.split('\n').find(line => line.startsWith('| R022 |'));
  if (!tableRow) {
    fail('R022 table row not found in REQUIREMENTS.md');
  } else {
    pass('R022 table row found');
    if (!tableRow.includes('BOS-3 confirmed live')) {
      fail('R022 table row does not contain BOS-3 evidence');
    } else {
      pass('R022 table row includes BOS-3 evidence');
    }
    if (!tableRow.includes('without explicit user confirmation')) {
      fail('R022 table row does not note unconfirmed creation');
    } else {
      pass('R022 table row notes unconfirmed creation');
    }
  }
}

if (exitCode === 0) {
  console.log('\nSUITE_RESULT PASS — Requirement updates with honest BOS-3 evidence validated');
} else {
  console.error('\nSUITE_RESULT FAIL — Requirement updates have issues');
}

process.exit(exitCode);
