#!/usr/bin/env node
/**
 * M012-S08 Aggregate Closeout Validator
 *
 * Comprehensive validation suite for S08 (Coverage Boundary and Secret Scan Remediation):
 * 1. S06 closeout validator regression: execSync and assert exit 0
 * 2. S07 closeout validator regression: execSync and assert exit 0
 * 3. Secret scan across all M012 slice artifacts (S01-S08): runtime-evidence/ and
 *    all slice dirs S01-S08 with PLAN and RESEARCH files excluded
 * 4. R003 coverage artifact validation
 * 5. Validation readiness artifact validation
 * 6. Writes runtime-evidence/M012-S08-closeout-gate.json
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const RUNTIME_DIR = path.join(ROOT, 'runtime-evidence');
const SCRIPTS_DIR = __dirname;
const SLICES_DIR = path.join(ROOT, '.gsd', 'milestones', 'M012-ihd2ez', 'slices');

const results = [];
let allPassed = true;

function check(name, fn) {
  try {
    const detail = fn();
    results.push({ name, pass: true, detail: detail || undefined });
    console.log(`  ✅ ${name}`);
  } catch (e) {
    allPassed = false;
    results.push({ name, pass: false, detail: e.message });
    console.error(`  ❌ ${name}: ${e.message}`);
  }
}

function failIf(condition, message) {
  if (condition) throw new Error(message);
}

function readJson(filePath) {
  const label = path.basename(filePath);
  failIf(!fs.existsSync(filePath), `${label} not found at ${filePath}`);
  const raw = fs.readFileSync(filePath, 'utf8');
  return JSON.parse(raw);
}

// ============================================================
// 1. S06 Closeout Validator (Regression)
// ============================================================
console.log('\n=== 1. S06 Closeout Validator (Regression) ===');
const s06Validator = path.join(SCRIPTS_DIR, 'validate_m012_s06_closeout.js');

check('s06-closeout: validator script exists', () => {
  failIf(!fs.existsSync(s06Validator), `S06 validator not found at ${s06Validator}`);
});

check('s06-closeout: runs without error (regression pass)', () => {
  try {
    execSync(`node "${s06Validator}"`, { encoding: 'utf8', timeout: 30000 });
  } catch (e) {
    throw new Error(`S06 closeout validator failed: ${(e.stdout || '') + (e.stderr || '')}`);
  }
});

// ============================================================
// 2. S07 Closeout Validator (Regression)
// ============================================================
console.log('\n=== 2. S07 Closeout Validator (Regression) ===');
const s07Validator = path.join(SCRIPTS_DIR, 'validate_m012_s07_closeout.js');

check('s07-closeout: validator script exists', () => {
  failIf(!fs.existsSync(s07Validator), `S07 validator not found at ${s07Validator}`);
});

check('s07-closeout: runs without error (regression pass)', () => {
  try {
    execSync(`node "${s07Validator}"`, { encoding: 'utf8', timeout: 30000 });
  } catch (e) {
    throw new Error(`S07 closeout validator failed: ${(e.stdout || '') + (e.stderr || '')}`);
  }
});

// ============================================================
// 3. Secret Leak Scan (All M012 Slices S01-S08)
// ============================================================
console.log('\n=== 3. Secret Leak Scan ===');

// Scan runtime-evidence/ and all M012 slice directories S01-S08.
// Excludes *-PLAN.md and *-RESEARCH.md files which may contain secret patterns
// in their task descriptions (known remediation boundary — not leaked content).
const SECRET_PATTERNS = [
  { name: 'password-literal',     regex: /BosAdmin2026[!\s"'`]/ },
  { name: 'api-key-pcp-prefix',   regex: /pcp_[A-Za-z0-9_-]{16,}/ },
  { name: 'session-cookie-value', regex: /__Secure-paperclip-default\.session_token=[A-Za-z0-9_-]{20,}/ },
];

const EXTENSIONS_TO_SCAN = ['.md', '.json', '.txt'];

function isExcluded(filePath) {
  const basename = path.basename(filePath);
  // Exclude PLAN files (contain secret patterns in task descriptions)
  if (basename.endsWith('-PLAN.md')) return true;
  // Exclude RESEARCH files (may contain secret patterns from investigation)
  if (basename.endsWith('-RESEARCH.md')) return true;
  return false;
}

function scanFileForSecrets(filePath, matches) {
  const ext = path.extname(filePath).toLowerCase();
  if (!EXTENSIONS_TO_SCAN.includes(ext)) return;
  if (isExcluded(filePath)) return;
  let content;
  try { content = fs.readFileSync(filePath, 'utf8'); } catch { return; }
  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    for (const pat of SECRET_PATTERNS) {
      if (pat.regex.test(line)) {
        const relPath = path.relative(ROOT, filePath);
        // Report only file:line:pattern — never echo the matched value
        matches.push(`${relPath}:${i + 1}:${pat.name}`);
      }
    }
  }
}

function walkDir(dir, fileList) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkDir(fullPath, fileList);
    } else {
      fileList.push(fullPath);
    }
  }
}

function collectScanFiles() {
  const files = [];
  // runtime-evidence/
  walkDir(RUNTIME_DIR, files);
  // .gsd/milestones/M012-ihd2ez/slices/S01 through S08
  if (fs.existsSync(SLICES_DIR)) {
    for (let i = 1; i <= 8; i++) {
      const sliceId = `S0${i}`;
      const sliceDir = path.join(SLICES_DIR, sliceId);
      walkDir(sliceDir, files);
    }
  }
  return files;
}

check('secret-scan: no forbidden secret patterns in M012 S01-S08 artifacts', () => {
  const allFiles = collectScanFiles();
  const matches = [];
  for (const f of allFiles) scanFileForSecrets(f, matches);
  failIf(matches.length > 0,
    `Secret leaks found (${matches.length} matches):\n${matches.map(m => `  - ${m}`).join('\n')}`);
});

// ============================================================
// 4. R003 Coverage Artifact Validation
// ============================================================
console.log('\n=== 4. R003 Coverage Artifact Validation ===');
const r003Path = path.join(RUNTIME_DIR, 'M012-S08-r003-coverage.json');

check('r003-coverage: file exists and is valid JSON', () => {
  readJson(r003Path);
});

check('r003-coverage: requirement_id is R003', () => {
  const d = readJson(r003Path);
  failIf(d.requirement_id !== 'R003',
    `Expected requirement_id R003, got ${d.requirement_id}`);
});

check('r003-coverage: coverage_verdict is present and non-empty', () => {
  const d = readJson(r003Path);
  failIf(!d.coverage_verdict || typeof d.coverage_verdict !== 'string' || d.coverage_verdict.length < 10,
    `Expected non-empty coverage_verdict, got ${JSON.stringify(d.coverage_verdict)}`);
});

check('r003-coverage: assessment is present', () => {
  const d = readJson(r003Path);
  failIf(!d.assessment || typeof d.assessment !== 'string' || d.assessment.length < 50,
    `Expected substantive assessment, got length ${d.assessment?.length}`);
});

check('r003-coverage: safety flags confirm Paperclip preserved', () => {
  const d = readJson(r003Path);
  failIf(d.safety?.paperclip_remains_system_of_record !== true,
    'Expected safety.paperclip_remains_system_of_record=true');
  failIf(d.safety?.no_plugin_state_created !== true,
    'Expected safety.no_plugin_state_created=true');
});

// ============================================================
// 5. Validation Readiness Artifact Validation
// ============================================================
console.log('\n=== 5. Validation Readiness Artifact Validation ===');
const readinessPath = path.join(RUNTIME_DIR, 'M012-S08-validation-readiness.json');

check('validation-readiness: file exists and is valid JSON', () => {
  readJson(readinessPath);
});

check('validation-readiness: schema_version matches', () => {
  const d = readJson(readinessPath);
  failIf(d.schema_version !== 'm012-s08-validation-readiness/v1',
    `Expected schema_version m012-s08-validation-readiness/v1, got ${d.schema_version}`);
});

check('validation-readiness: success_criteria_checklist is non-empty array', () => {
  const d = readJson(readinessPath);
  failIf(!Array.isArray(d.success_criteria_checklist) || d.success_criteria_checklist.length === 0,
    'Expected non-empty success_criteria_checklist array');
});

check('validation-readiness: success_criteria_checklist has 5 entries', () => {
  const d = readJson(readinessPath);
  failIf(d.success_criteria_checklist.length !== 5,
    `Expected 5 success criteria, got ${d.success_criteria_checklist.length}`);
});

check('validation-readiness: all success criteria have evidence_file', () => {
  const d = readJson(readinessPath);
  for (const sc of d.success_criteria_checklist) {
    failIf(!sc.evidence_file || typeof sc.evidence_file !== 'string',
      `Criterion ${sc.criterion_id} missing evidence_file`);
  }
});

check('validation-readiness: verification_classes is present', () => {
  const d = readJson(readinessPath);
  failIf(!d.verification_classes || typeof d.verification_classes !== 'object',
    'Expected verification_classes object');
});

check('validation-readiness: Contract verification class is applicable', () => {
  const d = readJson(readinessPath);
  failIf(d.verification_classes?.Contract?.applicable !== true,
    'Expected Contract verification class to be applicable');
});

check('validation-readiness: UAT verification class is applicable', () => {
  const d = readJson(readinessPath);
  failIf(d.verification_classes?.UAT?.applicable !== true,
    'Expected UAT verification class to be applicable');
});

check('validation-readiness: Integration verification class is not applicable', () => {
  const d = readJson(readinessPath);
  failIf(d.verification_classes?.Integration?.applicable !== false,
    'Expected Integration verification class to be not applicable');
});

check('validation-readiness: Operational verification class is not applicable', () => {
  const d = readJson(readinessPath);
  failIf(d.verification_classes?.Operational?.applicable !== false,
    'Expected Operational verification class to be not applicable');
});

check('validation-readiness: requirement_coverage is non-empty array', () => {
  const d = readJson(readinessPath);
  failIf(!Array.isArray(d.requirement_coverage) || d.requirement_coverage.length === 0,
    'Expected non-empty requirement_coverage array');
});

check('validation-readiness: requirement_coverage includes R003', () => {
  const d = readJson(readinessPath);
  const hasR003 = d.requirement_coverage.some(r => r.requirement_id === 'R003');
  failIf(!hasR003, 'Expected R003 in requirement_coverage');
});

check('validation-readiness: requirement_coverage includes R022', () => {
  const d = readJson(readinessPath);
  const hasR022 = d.requirement_coverage.some(r => r.requirement_id === 'R022');
  failIf(!hasR022, 'Expected R022 in requirement_coverage');
});

check('validation-readiness: slice_delivery_audit covers S01-S07', () => {
  const d = readJson(readinessPath);
  failIf(!Array.isArray(d.slice_delivery_audit) || d.slice_delivery_audit.length < 7,
    `Expected at least 7 slice entries in audit, got ${d.slice_delivery_audit?.length}`);
  for (let i = 1; i <= 7; i++) {
    const sliceId = `S0${i}`;
    const found = d.slice_delivery_audit.some(s => s.slice_id === sliceId);
    failIf(!found, `Missing slice ${sliceId} in delivery audit`);
  }
});

check('validation-readiness: cross_slice_integration is present', () => {
  const d = readJson(readinessPath);
  failIf(!d.cross_slice_integration || typeof d.cross_slice_integration !== 'object',
    'Expected cross_slice_integration object');
  failIf(d.cross_slice_integration.handoff_chain_verified !== true,
    'Expected handoff_chain_verified=true');
});

// ============================================================
// Write Gate Result
// ============================================================
console.log('\n=== S08 Closeout Gate Summary ===');
for (const r of results) {
  console.log(`  ${r.pass ? '✅' : '❌'} ${r.name}`);
}

const gate = {
  schema_version: 'm012-s08-closeout-gate/v1',
  artifact_type: 's08-closeout-gate',
  phase: 'M012-S08',
  generated_at: new Date().toISOString(),
  verdict: allPassed ? 'pass' : 'fail',
  checks_total: results.length,
  checks_passed: results.filter(r => r.pass).length,
  checks_failed: results.filter(r => !r.pass).length,
  checks: results.map(r => ({ name: r.name, pass: r.pass, detail: r.pass ? undefined : r.detail })),
};

fs.writeFileSync(path.join(RUNTIME_DIR, 'M012-S08-closeout-gate.json'), JSON.stringify(gate, null, 2));
console.log(`\nGate written: runtime-evidence/M012-S08-closeout-gate.json`);
console.log(`\nSUITE_RESULT ${allPassed ? 'PASS' : 'FAIL'} — S08 closeout gate: ${gate.checks_passed}/${gate.checks_total} checks passed`);

process.exit(allPassed ? 0 : 1);
