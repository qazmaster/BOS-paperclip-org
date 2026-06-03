#!/usr/bin/env node
/**
 * M012-S05 Validator: Requirement Outcomes Correction
 * 
 * Validates that the S04 requirement outcomes file no longer contains
 * forbidden overclaiming phrases about native issue creation.
 */
const fs = require('fs');
const path = require('path');

const RUNTIME_EVIDENCE = path.join(__dirname, '..', 'runtime-evidence');

const FORBIDDEN_PHRASES = [
  'S02 created native',
  'created native issues',
  'native issue creation',
];

const CORRECTION_ARTIFACT = path.join(RUNTIME_EVIDENCE, 'M012-S05-requirement-outcomes-correction.json');
const REQUIREMENT_OUTCOMES = path.join(RUNTIME_EVIDENCE, 'M012-S04-requirement-outcomes.md');

let exitCode = 0;

function fail(msg) {
  console.error(`FAIL: ${msg}`);
  exitCode = 1;
}

function pass(msg) {
  console.log(`PASS: ${msg}`);
}

// 1. Check correction artifact exists and is valid JSON
if (!fs.existsSync(CORRECTION_ARTIFACT)) {
  fail(`Correction artifact missing: ${CORRECTION_ARTIFACT}`);
} else {
  try {
    const correction = JSON.parse(fs.readFileSync(CORRECTION_ARTIFACT, 'utf8'));
    if (correction.schema_version !== 'm012-s05-correction/v1') {
      fail(`Unexpected schema_version: ${correction.schema_version}`);
    } else {
      pass('Correction artifact has correct schema_version');
    }
    if (!Array.isArray(correction.corrected_outcomes) || correction.corrected_outcomes.length === 0) {
      fail('corrected_outcomes array is empty or missing');
    } else {
      pass(`corrected_outcomes has ${correction.corrected_outcomes.length} entries`);
    }
    if (correction.validation_status !== 'corrected') {
      fail(`validation_status is not 'corrected': ${correction.validation_status}`);
    } else {
      pass('validation_status is corrected');
    }
  } catch (e) {
    fail(`Correction artifact is not valid JSON: ${e.message}`);
  }
}

// 2. Check requirement outcomes file exists
if (!fs.existsSync(REQUIREMENT_OUTCOMES)) {
  fail(`Requirement outcomes file missing: ${REQUIREMENT_OUTCOMES}`);
} else {
  const content = fs.readFileSync(REQUIREMENT_OUTCOMES, 'utf8');
  
  // Check for forbidden phrases
  for (const phrase of FORBIDDEN_PHRASES) {
    if (content.toLowerCase().includes(phrase.toLowerCase())) {
      fail(`Forbidden phrase still present in M012-S04-requirement-outcomes.md: "${phrase}"`);
    }
  }
  
  // Verify corrected language is present
  if (content.includes('S02 produced validated blocker evidence')) {
    pass('Corrected R022 row contains "S02 produced validated blocker evidence"');
  } else {
    fail('Corrected R022 row does not contain expected "S02 produced validated blocker evidence"');
  }
  
  if (content.includes('validated blocker states')) {
    pass('Summary contains corrected "validated blocker states" language');
  } else {
    fail('Summary does not contain "validated blocker states"');
  }
}

// 3. Check S04-SUMMARY.md for forbidden phrases
const s04Summary = path.join(__dirname, '..', '.gsd', 'milestones', 'M012-ihd2ez', 'slices', 'S04', 'S04-SUMMARY.md');
if (fs.existsSync(s04Summary)) {
  const summaryContent = fs.readFileSync(s04Summary, 'utf8');
  for (const phrase of FORBIDDEN_PHRASES) {
    if (summaryContent.toLowerCase().includes(phrase.toLowerCase())) {
      fail(`Forbidden phrase still present in S04-SUMMARY.md: "${phrase}"`);
    }
  }
  if (summaryContent.includes('blocker evidence (auth-blocked')) {
    pass('S04-SUMMARY.md R022 line contains corrected blocker evidence language');
  } else {
    fail('S04-SUMMARY.md R022 line does not contain expected blocker evidence language');
  }
} else {
  fail(`S04-SUMMARY.md not found: ${s04Summary}`);
}

if (exitCode === 0) {
  console.log('\nSUITE_RESULT PASS — Requirement outcomes correction validated');
} else {
  console.error('\nSUITE_RESULT FAIL — Requirement outcomes correction has issues');
}

process.exit(exitCode);
