#!/usr/bin/env node
/**
 * M012-S06 Aggregate Closeout Validator
 *
 * Comprehensive validation suite for S06 (Live Paperclip Proof Remediation):
 * 1. M012-S06-session-auth-readback.json schema and content checks
 * 2. M012-S06-mission-issue-evidence.json schema and content checks
 * 3. M012-S06-requirement-update-evidence.json presence and correctness
 * 4. M012-S04-requirement-outcomes.md has no forbidden phrases
 * 5. Re-runs S05 closeout validator to ensure no regression
 * 6. Secret leak scan over runtime-evidence/ and S06 task summaries
 *
 * Writes runtime-evidence/M012-S06-closeout-gate.json with verdict and evidence.
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const RUNTIME_DIR = path.join(__dirname, '..', 'runtime-evidence');
const SCRIPTS_DIR = __dirname;

const CANONICAL_COMPANY_ID = '9feb4c22-05b9-401e-ba67-0e866e3056da';

const results = [];
let allPassed = true;

function check(name, fn) {
  try {
    const detail = fn();
    results.push({ name, pass: true, detail });
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

function readFile(filePath) {
  const label = path.basename(filePath);
  failIf(!fs.existsSync(filePath), `${label} not found at ${filePath}`);
  return fs.readFileSync(filePath, 'utf8');
}

// ============================================================
// 1. Session Auth Readback JSON
// ============================================================
console.log('\n=== 1. Session Auth Readback JSON ===');
const authPath = path.join(RUNTIME_DIR, 'M012-S06-session-auth-readback.json');

check('auth-readback: file exists and is valid JSON', () => {
  readJson(authPath);
});

check('auth-readback: schema_version matches', () => {
  const d = readJson(authPath);
  failIf(d.schema_version !== 'm012-s06-session-auth-readback/v1',
    `Expected schema_version m012-s06-session-auth-readback/v1, got ${d.schema_version}`);
});

check('auth-readback: passing is true', () => {
  const d = readJson(authPath);
  failIf(d.passing !== true, `Expected passing=true, got ${d.passing}`);
});

check('auth-readback: company_visible is true', () => {
  const d = readJson(authPath);
  failIf(d.observations?.company_visible !== true,
    `Expected observations.company_visible=true, got ${d.observations?.company_visible}`);
});

check('auth-readback: issues_visible is true', () => {
  const d = readJson(authPath);
  failIf(d.observations?.issues_visible !== true,
    `Expected observations.issues_visible=true, got ${d.observations?.issues_visible}`);
});

check('auth-readback: company_id matches canonical', () => {
  const d = readJson(authPath);
  failIf(d.config?.company_id !== CANONICAL_COMPANY_ID,
    `Expected company_id ${CANONICAL_COMPANY_ID}, got ${d.config?.company_id}`);
});

check('auth-readback: session_auth.success is true', () => {
  const d = readJson(authPath);
  failIf(d.session_auth?.success !== true,
    `Expected session_auth.success=true, got ${d.session_auth?.success}`);
});

check('auth-readback: safety.read_only is true', () => {
  const d = readJson(authPath);
  failIf(d.safety?.read_only !== true,
    `Expected safety.read_only=true, got ${d.safety?.read_only}`);
});

// ============================================================
// 2. Mission Issue Evidence JSON
// ============================================================
console.log('\n=== 2. Mission Issue Evidence JSON ===');
const issuePath = path.join(RUNTIME_DIR, 'M012-S06-mission-issue-evidence.json');

check('mission-issue: file exists and is valid JSON', () => {
  readJson(issuePath);
});

check('mission-issue: schema_version matches', () => {
  const d = readJson(issuePath);
  failIf(d.schema_version !== 'm012-s06-mission-issue-evidence/v1',
    `Expected schema_version m012-s06-mission-issue-evidence/v1, got ${d.schema_version}`);
});

check('mission-issue: passing is true', () => {
  const d = readJson(issuePath);
  failIf(d.passing !== true, `Expected passing=true, got ${d.passing}`);
});

check('mission-issue: issue.id is non-null UUID', () => {
  const d = readJson(issuePath);
  failIf(!d.issue?.id || typeof d.issue.id !== 'string' || d.issue.id.length < 10,
    `Expected issue.id to be a non-null UUID string, got ${JSON.stringify(d.issue?.id)}`);
});

check('mission-issue: issue.identifier is BOS-3', () => {
  const d = readJson(issuePath);
  failIf(d.issue?.identifier !== 'BOS-3',
    `Expected issue.identifier=BOS-3, got ${d.issue?.identifier}`);
});

check('mission-issue: deviation_note is present and non-empty', () => {
  const d = readJson(issuePath);
  failIf(!d.deviation_note || typeof d.deviation_note !== 'string' || d.deviation_note.length < 10,
    `Expected non-empty deviation_note, got ${JSON.stringify(d.deviation_note)}`);
});

check('mission-issue: deviation_note mentions explicit user confirmation issue', () => {
  const d = readJson(issuePath);
  failIf(!d.deviation_note.toLowerCase().includes('explicit user confirmation'),
    'deviation_note must mention "explicit user confirmation"');
});

check('mission-issue: issue_found is true', () => {
  const d = readJson(issuePath);
  failIf(d.issue_found !== true, `Expected issue_found=true, got ${d.issue_found}`);
});

check('mission-issue: safety.read_only is true', () => {
  const d = readJson(issuePath);
  failIf(d.safety?.read_only !== true,
    `Expected safety.read_only=true, got ${d.safety?.read_only}`);
});

// ============================================================
// 3. Requirement Update Evidence JSON
// ============================================================
console.log('\n=== 3. Requirement Update Evidence JSON ===');
const reqPath = path.join(RUNTIME_DIR, 'M012-S06-requirement-update-evidence.json');

check('req-update: file exists and is valid JSON', () => {
  readJson(reqPath);
});

check('req-update: schema_version matches', () => {
  const d = readJson(reqPath);
  failIf(d.schema_version !== 'm012-s06-requirement-update-evidence/v1',
    `Expected schema_version m012-s06-requirement-update-evidence/v1, got ${d.schema_version}`);
});

check('req-update: changes array is non-empty', () => {
  const d = readJson(reqPath);
  failIf(!Array.isArray(d.changes) || d.changes.length === 0,
    `Expected non-empty changes array, got ${JSON.stringify(d.changes)}`);
});

check('req-update: validation_status is updated', () => {
  const d = readJson(reqPath);
  failIf(d.validation_status !== 'updated',
    `Expected validation_status=updated, got ${d.validation_status}`);
});

check('req-update: deviation_acknowledged is true', () => {
  const d = readJson(reqPath);
  failIf(d.deviation_acknowledged !== true,
    `Expected deviation_acknowledged=true, got ${d.deviation_acknowledged}`);
});

check('req-update: changes reference R022', () => {
  const d = readJson(reqPath);
  const hasR022 = d.changes.some(c =>
    (c.section && c.section.includes('R022')) ||
    (c.new_text && c.new_text.includes('R022'))
  );
  failIf(!hasR022, 'Expected at least one change referencing R022');
});

// ============================================================
// 4. Requirement Outcomes - Forbidden Phrases
// ============================================================
console.log('\n=== 4. Requirement Outcomes - Forbidden Phrases ===');
const outcomesPath = path.join(RUNTIME_DIR, 'M012-S04-requirement-outcomes.md');

check('outcomes: file exists', () => {
  readFile(outcomesPath);
});

// Forbidden phrases that overstate the M012 evidence for R022.
// R022 status is "active", not "validated". BOS-3 was created without
// explicit user confirmation. These phrases would falsely claim otherwise.
const FORBIDDEN_PHRASES = [
  { phrase: 'E2E proven', reason: 'R022 is active, not proven' },
  { phrase: 'E2E validated', reason: 'R022 is active, not validated' },
  { phrase: 'full lifecycle validated', reason: 'R022 lifecycle not validated' },
  { phrase: 'full lifecycle proven', reason: 'R022 lifecycle not proven' },
  { phrase: 'user confirmed the creation', reason: 'Creation was without explicit user confirmation' },
  { phrase: 'user confirmed creation', reason: 'Creation was without explicit user confirmation' },
  { phrase: 'user-confirmed issue', reason: 'Creation was without explicit user confirmation' },
  // Note: 'human-confirmed issue lifecycle' is intentionally NOT forbidden here because
  // it appears in honest context ('is not yet proven') in the outcomes file.
  { phrase: 'mission cycle proven', reason: 'Mission cycle not proven' },
  { phrase: 'mission cycle validated', reason: 'Mission cycle not validated' },
  { phrase: 'R022 validated', reason: 'R022 status is active, not validated' },
  { phrase: 'R022 proven', reason: 'R022 status is active, not proven' },
];

check('outcomes: no forbidden phrases overstate R022 evidence', () => {
  const content = readFile(outcomesPath);
  const violations = [];
  for (const fp of FORBIDDEN_PHRASES) {
    if (content.toLowerCase().includes(fp.phrase.toLowerCase())) {
      violations.push(`"${fp.phrase}" — ${fp.reason}`);
    }
  }
  failIf(violations.length > 0,
    `Forbidden phrases found:\n${violations.map(v => `  - ${v}`).join('\n')}`);
});

check('outcomes: R022 row includes BOS-3 S06 evidence', () => {
  const content = readFile(outcomesPath);
  failIf(!content.includes('S06 confirmed BOS-3'),
    'R022 M012 Evidence column must reference S06 BOS-3 confirmation');
});

check('outcomes: R022 row includes honest deviation note', () => {
  const content = readFile(outcomesPath);
  // Check for deviation language in the R022 row
  const hasDeviation = content.includes('without explicit user confirmation') ||
    content.includes('unconfirmed');
  failIf(!hasDeviation,
    'R022 row must include deviation language about unconfirmed creation');
});

check('outcomes: summary includes S06 evidence', () => {
  const content = readFile(outcomesPath);
  failIf(!content.includes('verified BOS-3 exists as a live Paperclip issue'),
    'Summary must reference S06 live Paperclip evidence');
});

// ============================================================
// 5. S05 Closeout Validator (Regression)
// ============================================================
console.log('\n=== 5. S05 Closeout Validator (Regression) ===');
const s05Validator = path.join(SCRIPTS_DIR, 'validate_m012_s05_closeout.js');

check('s05-closeout: validator script exists', () => {
  failIf(!fs.existsSync(s05Validator), `S05 validator not found at ${s05Validator}`);
});

check('s05-closeout: runs without error (regression pass)', () => {
  try {
    execSync(`node "${s05Validator}"`, { encoding: 'utf8', timeout: 30000 });
  } catch (e) {
    throw new Error(`S05 closeout validator failed: ${(e.stdout || '') + (e.stderr || '')}`);
  }
});

// ============================================================
// 6. Secret Leak Scan
// ============================================================
console.log('\n=== 6. Secret Leak Scan ===');

// Scan directories for forbidden secret patterns.
// Reports only file:line:pattern metadata; never echoes secret values.
const SCAN_DIRS = [
  path.join(RUNTIME_DIR),
  path.join(__dirname, '..', '.gsd', 'milestones', 'M012-ihd2ez', 'slices', 'S06'),
];

// Patterns that match credential-like literals (passwords, API keys, session cookie values).
// Each entry: { name, regex } — the regex must NOT contain the actual secret value.
const SECRET_PATTERNS = [
  { name: 'password-literal',        regex: /BosAdmin2026[!\s"'`]/ },
  { name: 'api-key-pcp-prefix',      regex: /pcp_[A-Za-z0-9_-]{16,}/ },
  { name: 'session-cookie-value',    regex: /__Secure-paperclip-default\.session_token=[A-Za-z0-9_-]{20,}/ },
];

const EXTENSIONS_TO_SCAN = ['.md', '.json', '.txt'];

function scanFileForSecrets(filePath, results) {
  const ext = path.extname(filePath).toLowerCase();
  if (!EXTENSIONS_TO_SCAN.includes(ext)) return;
  let content;
  try { content = fs.readFileSync(filePath, 'utf8'); } catch { return; }
  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    for (const pat of SECRET_PATTERNS) {
      if (pat.regex.test(line)) {
        const relPath = path.relative(path.join(__dirname, '..'), filePath);
        // Report only file:line:pattern — never echo the matched value
        results.push(`${relPath}:${i + 1}:${pat.name}`);
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

check('secret-scan: no forbidden secret patterns in S06 artifacts', () => {
  const allFiles = [];
  for (const dir of SCAN_DIRS) walkDir(dir, allFiles);
  const matches = [];
  for (const f of allFiles) scanFileForSecrets(f, matches);
  failIf(matches.length > 0,
    `Secret leaks found (${matches.length} matches):\n${matches.map(m => `  - ${m}`).join('\n')}`);
});

// ============================================================
// Write Gate Result
// ============================================================
console.log('\n=== S06 Closeout Gate Summary ===');
for (const r of results) {
  console.log(`  ${r.pass ? '✅' : '❌'} ${r.name}`);
}

const gate = {
  schema_version: 'm012-s06-closeout-gate/v1',
  artifact_type: 's06-closeout-gate',
  phase: 'M012-S06',
  generated_at: new Date().toISOString(),
  verdict: allPassed ? 'pass' : 'fail',
  checks_total: results.length,
  checks_passed: results.filter(r => r.pass).length,
  checks_failed: results.filter(r => !r.pass).length,
  checks: results.map(r => ({ name: r.name, pass: r.pass, detail: r.pass ? undefined : r.detail })),
};

fs.writeFileSync(path.join(RUNTIME_DIR, 'M012-S06-closeout-gate.json'), JSON.stringify(gate, null, 2));
console.log(`\nGate written: runtime-evidence/M012-S06-closeout-gate.json`);
console.log(`\nSUITE_RESULT ${allPassed ? 'PASS' : 'FAIL'} — S06 closeout gate: ${gate.checks_passed}/${gate.checks_total} checks passed`);

process.exit(allPassed ? 0 : 1);
