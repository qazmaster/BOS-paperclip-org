#!/usr/bin/env node
/**
 * M012-S07 Aggregate Closeout Validator
 *
 * Comprehensive validation suite for S07 (Formal Re-Scope Decision and Closeout):
 * 1. M012-S07-rescope-decision.json schema and content checks
 * 2. M012-S07-requirement-update-evidence.json presence and validity
 * 3. No forbidden overclaiming phrases in S07 artifacts
 * 4. Re-runs S06 closeout validator to ensure no regression
 * 5. Secret leak scan over runtime-evidence/ and S07 task summaries
 *
 * Writes runtime-evidence/M012-S07-closeout-gate.json with verdict and evidence.
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const RUNTIME_DIR = path.join(__dirname, '..', 'runtime-evidence');
const SCRIPTS_DIR = __dirname;
const S07_DIR = path.join(__dirname, '..', '.gsd', 'milestones', 'M012-ihd2ez', 'slices', 'S07');

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
// 1. Rescope Decision JSON
// ============================================================
console.log('\n=== 1. Rescope Decision JSON ===');
const rescopePath = path.join(RUNTIME_DIR, 'M012-S07-rescope-decision.json');

check('rescope-decision: file exists and is valid JSON', () => {
  readJson(rescopePath);
});

check('rescope-decision: schema_version matches', () => {
  const d = readJson(rescopePath);
  failIf(d.schema_version !== 'm012-s07-rescope-decision/v1',
    `Expected schema_version m012-s07-rescope-decision/v1, got ${d.schema_version}`);
});

check('rescope-decision: decision_type is milestone-criterion-rescope', () => {
  const d = readJson(rescopePath);
  failIf(d.decision_type !== 'milestone-criterion-rescope',
    `Expected decision_type milestone-criterion-rescope, got ${d.decision_type}`);
});

check('rescope-decision: constraint field present', () => {
  const d = readJson(rescopePath);
  failIf(!d.constraint || typeof d.constraint !== 'string' || d.constraint.length < 10,
    `Expected non-empty constraint, got ${JSON.stringify(d.constraint)}`);
});

check('rescope-decision: blocked_paths is non-empty array', () => {
  const d = readJson(rescopePath);
  failIf(!Array.isArray(d.blocked_paths) || d.blocked_paths.length === 0,
    `Expected non-empty blocked_paths array, got ${JSON.stringify(d.blocked_paths)}`);
});

check('rescope-decision: selected_path is Path C', () => {
  const d = readJson(rescopePath);
  failIf(!d.selected_path || !d.selected_path.includes('Path C'),
    `Expected selected_path to contain "Path C", got ${JSON.stringify(d.selected_path)}`);
});

check('rescope-decision: re_scoped_criterion is non-empty', () => {
  const d = readJson(rescopePath);
  failIf(!d.re_scoped_criterion || typeof d.re_scoped_criterion !== 'string' || d.re_scoped_criterion.length < 50,
    `Expected substantive re_scoped_criterion, got length ${d.re_scoped_criterion?.length}`);
});

check('rescope-decision: canonical_company_id matches', () => {
  const d = readJson(rescopePath);
  failIf(d.canonical_company_id !== CANONICAL_COMPANY_ID,
    `Expected canonical_company_id ${CANONICAL_COMPANY_ID}, got ${d.canonical_company_id}`);
});

check('rescope-decision: issue_identifier is BOS-3', () => {
  const d = readJson(rescopePath);
  failIf(d.issue_identifier !== 'BOS-3',
    `Expected issue_identifier BOS-3, got ${d.issue_identifier}`);
});

check('rescope-decision: deviation_preserved is true', () => {
  const d = readJson(rescopePath);
  failIf(d.deviation_preserved !== true,
    `Expected deviation_preserved=true, got ${d.deviation_preserved}`);
});

check('rescope-decision: deviation_note present and non-empty', () => {
  const d = readJson(rescopePath);
  failIf(!d.deviation_note || typeof d.deviation_note !== 'string' || d.deviation_note.length < 20,
    `Expected substantive deviation_note, got ${JSON.stringify(d.deviation_note)}`);
});

check('rescope-decision: safety.read_only is true', () => {
  const d = readJson(rescopePath);
  failIf(d.safety?.read_only !== true,
    `Expected safety.read_only=true, got ${d.safety?.read_only}`);
});

check('rescope-decision: re_scoped_criterion mentions "explicit user confirmation"', () => {
  const d = readJson(rescopePath);
  failIf(!d.re_scoped_criterion.toLowerCase().includes('explicit user confirmation'),
    're_scoped_criterion must reference the original "explicit user confirmation" criterion');
});

// ============================================================
// 2. Requirement Update Evidence JSON
// ============================================================
console.log('\n=== 2. Requirement Update Evidence JSON ===');
const reqPath = path.join(RUNTIME_DIR, 'M012-S07-requirement-update-evidence.json');

check('req-update: file exists and is valid JSON', () => {
  readJson(reqPath);
});

check('req-update: schema_version matches', () => {
  const d = readJson(reqPath);
  failIf(d.schema_version !== 'm012-s07-requirement-update-evidence/v1',
    `Expected schema_version m012-s07-requirement-update-evidence/v1, got ${d.schema_version}`);
});

check('req-update: planned_updates is non-empty array', () => {
  const d = readJson(reqPath);
  failIf(!Array.isArray(d.planned_updates) || d.planned_updates.length === 0,
    `Expected non-empty planned_updates array, got ${JSON.stringify(d.planned_updates)}`);
});

check('req-update: planned_updates reference R022', () => {
  const d = readJson(reqPath);
  const hasR022 = d.planned_updates.some(u => u.requirement_id === 'R022');
  failIf(!hasR022, 'Expected at least one planned_update referencing R022');
});

check('req-update: planned_updates reference R023', () => {
  const d = readJson(reqPath);
  const hasR023 = d.planned_updates.some(u => u.requirement_id === 'R023');
  failIf(!hasR023, 'Expected at least one planned_update referencing R023');
});

check('req-update: safety.read_only is true', () => {
  const d = readJson(reqPath);
  failIf(d.safety?.read_only !== true,
    `Expected safety.read_only=true, got ${d.safety?.read_only}`);
});

check('req-update: safety.planned_changes_only is true', () => {
  const d = readJson(reqPath);
  failIf(d.safety?.planned_changes_only !== true,
    `Expected safety.planned_changes_only=true, got ${d.safety?.planned_changes_only}`);
});

check('req-update: milestone_id is M012-ihd2ez', () => {
  const d = readJson(reqPath);
  failIf(d.milestone_id !== 'M012-ihd2ez',
    `Expected milestone_id M012-ihd2ez, got ${d.milestone_id}`);
});

// ============================================================
// 3. Forbidden Overclaiming Phrases
// ============================================================
console.log('\n=== 3. Forbidden Overclaiming Phrases ===');

// Phrases that would falsely claim user confirmation or proven E2E lifecycle.
// S07 explicitly documents that no user confirmation occurred and E2E lifecycle remains unproven.
const FORBIDDEN_PHRASES = [
  { phrase: 'user confirmed', reason: 'No user confirmation occurred in auto-mode' },
  { phrase: 'explicitly confirmed by user', reason: 'No user confirmation occurred in auto-mode' },
  { phrase: 'user approved', reason: 'No user approval occurred in auto-mode' },
  { phrase: 'human confirmed', reason: 'No human confirmation occurred in auto-mode' },
  { phrase: 'E2E proven', reason: 'Full E2E mission lifecycle remains unproven' },
  { phrase: 'E2E validated', reason: 'Full E2E mission lifecycle remains unproven' },
  { phrase: 'full lifecycle validated', reason: 'Full lifecycle not validated' },
  { phrase: 'full lifecycle proven', reason: 'Full lifecycle not proven' },
  { phrase: 'mission cycle proven', reason: 'Mission cycle not proven' },
  { phrase: 'mission cycle validated', reason: 'Mission cycle not validated' },
  { phrase: 'HITL gate exercised', reason: 'HITL gate was not exercised; it was documented as blocked' },
  { phrase: 'HITL gate passed', reason: 'HITL gate was not exercised' },
];

function collectScanFiles() {
  const files = [];

  // runtime-evidence/M012-S07-*
  if (fs.existsSync(RUNTIME_DIR)) {
    for (const entry of fs.readdirSync(RUNTIME_DIR)) {
      if (entry.startsWith('M012-S07-')) {
        files.push(path.join(RUNTIME_DIR, entry));
      }
    }
  }

  // .gsd/milestones/M012-ihd2ez/slices/S07/**/*
  function walkDir(dir) {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walkDir(fullPath);
      } else if (entry.name.endsWith('.md') || entry.name.endsWith('.json') || entry.name.endsWith('.txt')) {
        files.push(fullPath);
      }
    }
  }
  walkDir(S07_DIR);

  return files;
}

function isMetaContext(line, phrase) {
  const lower = line.toLowerCase();
  // Skip lines where the phrase appears in backtick quotes (meta-reference)
  const backtickPattern = new RegExp('`[^`]*' + phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '[^`]*`', 'i');
  if (backtickPattern.test(line)) return true;
  // Skip lines with negation/meta context markers
  const metaMarkers = [
    'forbidden', 'no ', 'not ', 'must not', 'absent', 'check that', 'check for',
    'verify', 'unless', 'do not', "don't", 'overclaiming', 'would falsely',
    'e.g.', 'such as', 'phrases like', 'phrases such as',
  ];
  for (const marker of metaMarkers) {
    if (lower.includes(marker) && lower.indexOf(marker) < lower.indexOf(phrase.toLowerCase())) {
      return true;
    }
  }
  return false;
}

check('forbidden-phrases: no overclaiming phrases in S07 artifacts', () => {
  const files = collectScanFiles();
  const violations = [];
  for (const filePath of files) {
    let content;
    try { content = fs.readFileSync(filePath, 'utf8'); } catch { continue; }
    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      for (const fp of FORBIDDEN_PHRASES) {
        if (line.toLowerCase().includes(fp.phrase.toLowerCase())) {
          if (isMetaContext(line, fp.phrase)) continue;
          const relPath = path.relative(path.join(__dirname, '..'), filePath);
          violations.push(`${relPath}:${i + 1}: "${fp.phrase}" — ${fp.reason}`);
        }
      }
    }
  }
  failIf(violations.length > 0,
    `Forbidden phrases found (${violations.length} matches):\n${violations.map(v => `  - ${v}`).join('\n')}`);
});

check('rescope-decision.md: documents deviation honestly', () => {
  const mdPath = path.join(RUNTIME_DIR, 'M012-S07-rescope-decision.md');
  const content = readFile(mdPath);
  failIf(!content.includes('NOT created with explicit user confirmation'),
    'Rescope decision MD must include honest deviation language');
});

check('rescope-decision.md: documents what remains unproven', () => {
  const mdPath = path.join(RUNTIME_DIR, 'M012-S07-rescope-decision.md');
  const content = readFile(mdPath);
  failIf(!content.toLowerCase().includes('unproven'),
    'Rescope decision MD must document what remains unproven');
});

// ============================================================
// 4. S06 Closeout Validator (Regression)
// ============================================================
console.log('\n=== 4. S06 Closeout Validator (Regression) ===');
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
// 5. Secret Leak Scan
// ============================================================
console.log('\n=== 5. Secret Leak Scan ===');

// Scan directories for forbidden secret patterns.
// Reports only file:line:pattern metadata; never echoes secret values.
const SCAN_DIRS = [
  path.join(RUNTIME_DIR),
  S07_DIR,
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

check('secret-scan: no forbidden secret patterns in S07 artifacts', () => {
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
console.log('\n=== S07 Closeout Gate Summary ===');
for (const r of results) {
  console.log(`  ${r.pass ? '✅' : '❌'} ${r.name}`);
}

const gate = {
  schema_version: 'm012-s07-closeout-gate/v1',
  artifact_type: 's07-closeout-gate',
  phase: 'M012-S07',
  generated_at: new Date().toISOString(),
  verdict: allPassed ? 'pass' : 'fail',
  checks_total: results.length,
  checks_passed: results.filter(r => r.pass).length,
  checks_failed: results.filter(r => !r.pass).length,
  checks: results.map(r => ({ name: r.name, pass: r.pass, detail: r.pass ? undefined : r.detail })),
};

fs.writeFileSync(path.join(RUNTIME_DIR, 'M012-S07-closeout-gate.json'), JSON.stringify(gate, null, 2));
console.log(`\nGate written: runtime-evidence/M012-S07-closeout-gate.json`);
console.log(`\nSUITE_RESULT ${allPassed ? 'PASS' : 'FAIL'} — S07 closeout gate: ${gate.checks_passed}/${gate.checks_total} checks passed`);

process.exit(allPassed ? 0 : 1);
