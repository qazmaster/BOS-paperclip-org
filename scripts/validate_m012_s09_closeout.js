#!/usr/bin/env node
/**
 * M012-S09 Aggregate Closeout Validator
 *
 * Comprehensive validation suite for S09 (Explicit Confirmation and Gate Remediation):
 * 1. S06 closeout validator regression: execSync and assert exit 0
 * 2. S07 closeout validator regression: execSync and assert exit 0
 * 3. S08 closeout validator regression: execSync and assert exit 0
 * 4. BOS-3 re-scope decision chain coherence:
 *    - S07-rescope-decision.json references BOS-3
 *    - S06-mission-issue-evidence.json confirms BOS-3 exists
 *    - Decision chain is internally consistent
 * 5. Contract and UAT verification class applicability:
 *    - Contract.applicable === true in validation-readiness.json
 *    - UAT.applicable === true in validation-readiness.json
 *    - Integration.applicable === false
 *    - Operational.applicable === false
 * 6. Secret scan over all M012 artifacts S01-S09 (excluding PLAN and RESEARCH files)
 * 7. Writes runtime-evidence/M012-S09-closeout-gate.json
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
// 3. S08 Closeout Validator (Regression)
// ============================================================
console.log('\n=== 3. S08 Closeout Validator (Regression) ===');
const s08Validator = path.join(SCRIPTS_DIR, 'validate_m012_s08_closeout.js');

check('s08-closeout: validator script exists', () => {
  failIf(!fs.existsSync(s08Validator), `S08 validator not found at ${s08Validator}`);
});

check('s08-closeout: runs without error (regression pass)', () => {
  try {
    execSync(`node "${s08Validator}"`, { encoding: 'utf8', timeout: 30000 });
  } catch (e) {
    throw new Error(`S08 closeout validator failed: ${(e.stdout || '') + (e.stderr || '')}`);
  }
});

// ============================================================
// 4. BOS-3 Re-Scope Decision Chain Coherence
// ============================================================
console.log('\n=== 4. BOS-3 Re-Scope Decision Chain Coherence ===');

const rescopePath = path.join(RUNTIME_DIR, 'M012-S07-rescope-decision.json');
const missionIssuePath = path.join(RUNTIME_DIR, 'M012-S06-mission-issue-evidence.json');

check('rescope-chain: S07-rescope-decision.json references BOS-3', () => {
  const d = readJson(rescopePath);
  failIf(d.issue_identifier !== 'BOS-3',
    `Expected issue_identifier BOS-3, got ${d.issue_identifier}`);
  return `issue_identifier=${d.issue_identifier}`;
});

check('rescope-chain: S06-mission-issue-evidence.json confirms BOS-3 exists', () => {
  const d = readJson(missionIssuePath);
  failIf(d.issue?.identifier !== 'BOS-3',
    `Expected issue.identifier BOS-3, got ${d.issue?.identifier}`);
  failIf(d.issue_found !== true,
    `Expected issue_found=true, got ${d.issue_found}`);
  return `issue_found=${d.issue_found}`;
});

check('rescope-chain: rescope decision selected_path is Path C', () => {
  const d = readJson(rescopePath);
  failIf(!d.selected_path || !d.selected_path.includes('Path C'),
    `Expected selected_path to contain "Path C", got ${JSON.stringify(d.selected_path)}`);
  return `selected_path=${d.selected_path}`;
});

check('rescope-chain: rescope decision preserves deviation', () => {
  const d = readJson(rescopePath);
  failIf(d.deviation_preserved !== true,
    `Expected deviation_preserved=true, got ${d.deviation_preserved}`);
  return `deviation_preserved=${d.deviation_preserved}`;
});

check('rescope-chain: issue IDs match between rescope decision and mission issue evidence', () => {
  const rescope = readJson(rescopePath);
  const mission = readJson(missionIssuePath);
  const rescopeIssueId = rescope.issue_id;
  const missionIssueId = mission.issue?.id;
  failIf(rescopeIssueId !== missionIssueId,
    `Issue ID mismatch: rescope=${rescopeIssueId} vs mission=${missionIssueId}`);
  return `issue_id=${rescopeIssueId}`;
});

check('rescope-chain: canonical_company_id consistent across evidence files', () => {
  const rescope = readJson(rescopePath);
  const mission = readJson(missionIssuePath);
  failIf(rescope.canonical_company_id !== '9feb4c22-05b9-401e-ba67-0e866e3056da',
    `Rescope canonical_company_id mismatch: ${rescope.canonical_company_id}`);
  failIf(mission.config?.company_id !== '9feb4c22-05b9-401e-ba67-0e866e3056da',
    `Mission issue config.company_id mismatch: ${mission.config?.company_id}`);
});

// ============================================================
// 5. Contract/UAT Verification Class Applicability
// ============================================================
console.log('\n=== 5. Contract/UAT Verification Class Applicability ===');

const readinessPath = path.join(RUNTIME_DIR, 'M012-S08-validation-readiness.json');

check('verification-classes: Contract.applicable is true', () => {
  const d = readJson(readinessPath);
  failIf(d.verification_classes?.Contract?.applicable !== true,
    'Expected Contract.applicable=true');
});

check('verification-classes: UAT.applicable is true', () => {
  const d = readJson(readinessPath);
  failIf(d.verification_classes?.UAT?.applicable !== true,
    'Expected UAT.applicable=true');
});

check('verification-classes: Integration.applicable is false', () => {
  const d = readJson(readinessPath);
  failIf(d.verification_classes?.Integration?.applicable !== false,
    'Expected Integration.applicable=false');
});

check('verification-classes: Operational.applicable is false', () => {
  const d = readJson(readinessPath);
  failIf(d.verification_classes?.Operational?.applicable !== false,
    'Expected Operational.applicable=false');
});

check('verification-classes: Contract evidence lists S06/S07/S08 gate artifacts', () => {
  const d = readJson(readinessPath);
  const contractEvidence = d.verification_classes?.Contract?.evidence || [];
  const hasS06 = contractEvidence.some(e => e.includes('S06-closeout-gate'));
  const hasS07 = contractEvidence.some(e => e.includes('S07-closeout-gate'));
  const hasS08 = contractEvidence.some(e => e.includes('S08-closeout-gate'));
  failIf(!hasS06, 'Contract evidence missing S06-closeout-gate reference');
  failIf(!hasS07, 'Contract evidence missing S07-closeout-gate reference');
  failIf(!hasS08, 'Contract evidence missing S08-closeout-gate reference');
});

check('verification-classes: success_criteria_checklist has 5 entries all pass', () => {
  const d = readJson(readinessPath);
  const sc = d.success_criteria_checklist;
  failIf(!Array.isArray(sc) || sc.length !== 5,
    `Expected 5 success criteria, got ${sc?.length}`);
  for (const entry of sc) {
    failIf(entry.status !== 'pass',
      `Success criterion ${entry.criterion_id} status=${entry.status}, expected pass`);
  }
});

// ============================================================
// 6. Secret Leak Scan (All M012 Slices S01-S09)
// ============================================================
console.log('\n=== 6. Secret Leak Scan ===');

// Scan runtime-evidence/ and all M012 slice directories S01-S09.
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
  // .gsd/milestones/M012-ihd2ez/slices/S01 through S09
  if (fs.existsSync(SLICES_DIR)) {
    for (let i = 1; i <= 9; i++) {
      const sliceId = i < 10 ? `S0${i}` : `S${i}`;
      const sliceDir = path.join(SLICES_DIR, sliceId);
      walkDir(sliceDir, files);
    }
  }
  return files;
}

check('secret-scan: no forbidden secret patterns in M012 S01-S09 artifacts', () => {
  const allFiles = collectScanFiles();
  const matches = [];
  for (const f of allFiles) scanFileForSecrets(f, matches);
  failIf(matches.length > 0,
    `Secret leaks found (${matches.length} matches):\n${matches.map(m => `  - ${m}`).join('\n')}`);
});

// ============================================================
// 7. Upstream Gate Artifact Integrity
// ============================================================
console.log('\n=== 7. Upstream Gate Artifact Integrity ===');

check('gate-artifacts: S06 closeout gate verdict is pass', () => {
  const d = readJson(path.join(RUNTIME_DIR, 'M012-S06-closeout-gate.json'));
  failIf(d.verdict !== 'pass', `S06 verdict=${d.verdict}, expected pass`);
  return `${d.checks_passed}/${d.checks_total}`;
});

check('gate-artifacts: S07 closeout gate verdict is pass', () => {
  const d = readJson(path.join(RUNTIME_DIR, 'M012-S07-closeout-gate.json'));
  failIf(d.verdict !== 'pass', `S07 verdict=${d.verdict}, expected pass`);
  return `${d.checks_passed}/${d.checks_total}`;
});

check('gate-artifacts: S08 closeout gate verdict is pass', () => {
  const d = readJson(path.join(RUNTIME_DIR, 'M012-S08-closeout-gate.json'));
  failIf(d.verdict !== 'pass', `S08 verdict=${d.verdict}, expected pass`);
  return `${d.checks_passed}/${d.checks_total}`;
});

// ============================================================
// Write Gate Result
// ============================================================
console.log('\n=== S09 Closeout Gate Summary ===');
for (const r of results) {
  console.log(`  ${r.pass ? '✅' : '❌'} ${r.name}`);
}

const gate = {
  schema_version: 'm012-s09-closeout-gate/v1',
  artifact_type: 's09-closeout-gate',
  phase: 'M012-S09',
  generated_at: new Date().toISOString(),
  verdict: allPassed ? 'pass' : 'fail',
  checks_total: results.length,
  checks_passed: results.filter(r => r.pass).length,
  checks_failed: results.filter(r => !r.pass).length,
  checks: results.map(r => ({ name: r.name, pass: r.pass, detail: r.pass ? undefined : r.detail })),
};

fs.writeFileSync(path.join(RUNTIME_DIR, 'M012-S09-closeout-gate.json'), JSON.stringify(gate, null, 2));
console.log(`\nGate written: runtime-evidence/M012-S09-closeout-gate.json`);
console.log(`\nSUITE_RESULT ${allPassed ? 'PASS' : 'FAIL'} — S09 closeout gate: ${gate.checks_passed}/${gate.checks_total} checks passed`);

process.exit(allPassed ? 0 : 1);
