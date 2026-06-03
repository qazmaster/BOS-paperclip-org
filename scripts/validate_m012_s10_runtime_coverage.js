#!/usr/bin/env node
/**
 * M012-S10 Runtime Coverage Validator
 *
 * Validates S10 descoping artifacts and generates closeout gate:
 * 1. S08 validation-readiness JSON: R017/R019 not listed as active in requirement_coverage
 * 2. REQUIREMENTS.md: R017 and R019 entries mention M012 non-addressal
 * 3. S10 coverage JSON and MD exist and are structurally valid
 * 4. No forbidden secret-like literals in S10 artifacts
 * 5. Writes runtime-evidence/M012-S10-closeout-gate.json
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const RUNTIME_DIR = path.join(ROOT, 'runtime-evidence');

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

function readFile(filePath) {
  const label = path.basename(filePath);
  failIf(!fs.existsSync(filePath), `${label} not found at ${filePath}`);
  return fs.readFileSync(filePath, 'utf8');
}

// ============================================================
// 1. S08 Validation-Readiness: R017/R019 not active
// ============================================================
console.log('\n=== 1. S08 Validation-Readiness: R017/R019 Descoped ===');

const readinessPath = path.join(RUNTIME_DIR, 'M012-S08-validation-readiness.json');

check('readiness: S08 validation-readiness JSON exists', () => {
  failIf(!fs.existsSync(readinessPath), 'M012-S08-validation-readiness.json not found');
});

check('readiness: R017 listed with m012_status=descoped', () => {
  const d = readJson(readinessPath);
  const r017 = d.requirement_coverage?.find(r => r.requirement_id === 'R017');
  failIf(!r017, 'R017 not found in requirement_coverage');
  failIf(r017.m012_status !== 'descoped',
    `R017 m012_status=${r017.m012_status}, expected descoped`);
  return `m012_status=${r017.m012_status}`;
});

check('readiness: R019 listed with m012_status=descoped', () => {
  const d = readJson(readinessPath);
  const r019 = d.requirement_coverage?.find(r => r.requirement_id === 'R019');
  failIf(!r019, 'R019 not found in requirement_coverage');
  failIf(r019.m012_status !== 'descoped',
    `R019 m012_status=${r019.m012_status}, expected descoped`);
  return `m012_status=${r019.m012_status}`;
});

check('readiness: R017 status_change is descoped-from-m012', () => {
  const d = readJson(readinessPath);
  const r017 = d.requirement_coverage?.find(r => r.requirement_id === 'R017');
  failIf(r017.status_change !== 'descoped-from-m012',
    `R017 status_change=${r017.status_change}, expected descoped-from-m012`);
});

check('readiness: R019 status_change is descoped-from-m012', () => {
  const d = readJson(readinessPath);
  const r019 = d.requirement_coverage?.find(r => r.requirement_id === 'R019');
  failIf(r019.status_change !== 'descoped-from-m012',
    `R019 status_change=${r019.status_change}, expected descoped-from-m012`);
});

// ============================================================
// 2. REQUIREMENTS.md: R017/R019 M012 non-addressal notes
// ============================================================
console.log('\n=== 2. REQUIREMENTS.md: R017/R019 M012 Non-Addressal Notes ===');

const reqPath = path.join(ROOT, '.gsd', 'REQUIREMENTS.md');

check('requirements-md: REQUIREMENTS.md exists', () => {
  failIf(!fs.existsSync(reqPath), 'REQUIREMENTS.md not found');
});

check('requirements-md: R017 entry mentions M012 non-addressal', () => {
  const content = readFile(reqPath);
  // Find R017 section
  const r017Match = content.match(/### R017[\s\S]*?(?=### R\d|$)/);
  failIf(!r017Match, 'R017 section not found in REQUIREMENTS.md');
  failIf(!r017Match[0].includes('M012 non-addressal'),
    'R017 section does not mention M012 non-addressal');
  return 'R017 section has M012 non-addressal note';
});

check('requirements-md: R019 entry mentions M012 non-addressal', () => {
  const content = readFile(reqPath);
  const r019Match = content.match(/### R019[\s\S]*?(?=### R\d|$)/);
  failIf(!r019Match, 'R019 section not found in REQUIREMENTS.md');
  failIf(!r019Match[0].includes('M012 non-addressal'),
    'R019 section does not mention M012 non-addressal');
  return 'R019 section has M012 non-addressal note';
});

check('requirements-md: R017 note mentions descoped from M012 milestone scope', () => {
  const content = readFile(reqPath);
  const r017Match = content.match(/### R017[\s\S]*?(?=### R\d|$)/);
  failIf(!r017Match, 'R017 section not found');
  failIf(!r017Match[0].includes('Descoped from M012'),
    'R017 note does not mention "Descoped from M012"');
});

check('requirements-md: R019 note mentions descoped from M012 milestone scope', () => {
  const content = readFile(reqPath);
  const r019Match = content.match(/### R019[\s\S]*?(?=### R\d|$)/);
  failIf(!r019Match, 'R019 section not found');
  failIf(!r019Match[0].includes('Descoped from M012'),
    'R019 note does not mention "Descoped from M012"');
});

// ============================================================
// 3. S10 Coverage JSON and MD exist and are valid
// ============================================================
console.log('\n=== 3. S10 Coverage Artifacts Validity ===');

const coverageJsonPath = path.join(RUNTIME_DIR, 'M012-S10-runtime-requirement-coverage.json');
const coverageMdPath = path.join(RUNTIME_DIR, 'M012-S10-runtime-requirement-coverage.md');

check('coverage: S10 JSON exists', () => {
  failIf(!fs.existsSync(coverageJsonPath), 'M012-S10-runtime-requirement-coverage.json not found');
});

check('coverage: S10 MD exists', () => {
  failIf(!fs.existsSync(coverageMdPath), 'M012-S10-runtime-requirement-coverage.md not found');
});

check('coverage: JSON has correct schema_version', () => {
  const d = readJson(coverageJsonPath);
  failIf(d.schema_version !== 'm012-s10-runtime-requirement-coverage/v1',
    `schema_version=${d.schema_version}, expected m012-s10-runtime-requirement-coverage/v1`);
});

check('coverage: JSON has correct artifact_type', () => {
  const d = readJson(coverageJsonPath);
  failIf(d.artifact_type !== 'runtime-requirement-coverage',
    `artifact_type=${d.artifact_type}, expected runtime-requirement-coverage`);
});

check('coverage: JSON has correct phase', () => {
  const d = readJson(coverageJsonPath);
  failIf(d.phase !== 'M012-S10',
    `phase=${d.phase}, expected M012-S10`);
});

check('coverage: JSON descoping_entries contains R017', () => {
  const d = readJson(coverageJsonPath);
  const r017 = d.descoping_entries?.find(e => e.requirement_id === 'R017');
  failIf(!r017, 'R017 not found in descoping_entries');
  failIf(r017.new_status !== 'deferred',
    `R017 new_status=${r017.new_status}, expected deferred`);
  return `new_status=${r017.new_status}`;
});

check('coverage: JSON descoping_entries contains R019', () => {
  const d = readJson(coverageJsonPath);
  const r019 = d.descoping_entries?.find(e => e.requirement_id === 'R019');
  failIf(!r019, 'R019 not found in descoping_entries');
  failIf(r019.new_status !== 'deferred',
    `R019 new_status=${r019.new_status}, expected deferred`);
  return `new_status=${r019.new_status}`;
});

check('coverage: JSON descoping_entries has correct count (2)', () => {
  const d = readJson(coverageJsonPath);
  failIf(d.descoping_entries?.length !== 2,
    `descoping_entries length=${d.descoping_entries?.length}, expected 2`);
});

check('coverage: JSON coverage_summary lists R017/R019 in descoped_ids', () => {
  const d = readJson(coverageJsonPath);
  const ids = d.coverage_summary?.descoped_ids || [];
  failIf(!ids.includes('R017'), 'R017 not in descoped_ids');
  failIf(!ids.includes('R019'), 'R019 not in descoped_ids');
  return `descoped_ids=[${ids.join(', ')}]`;
});

check('coverage: JSON safety_attestation flags all true', () => {
  const d = readJson(coverageJsonPath);
  const att = d.safety_attestation;
  failIf(!att, 'safety_attestation missing');
  failIf(att.no_capability_promotion !== true, 'no_capability_promotion not true');
  failIf(att.no_live_mutation !== true, 'no_live_mutation not true');
  failIf(att.no_unsupported_api_use !== true, 'no_unsupported_api_use not true');
  failIf(att.descoping_is_honest_disposition !== true, 'descoping_is_honest_disposition not true');
  failIf(att.all_blockers_cited_from_probe_artifacts !== true, 'all_blockers_cited_from_probe_artifacts not true');
});

check('coverage: MD mentions R017 and R019', () => {
  const content = readFile(coverageMdPath);
  failIf(!content.includes('R017'), 'MD does not mention R017');
  failIf(!content.includes('R019'), 'MD does not mention R019');
});

check('coverage: MD mentions deferred', () => {
  const content = readFile(coverageMdPath);
  failIf(!content.toLowerCase().includes('deferred'),
    'MD does not mention deferred');
});

// ============================================================
// 4. Secret Scan of S10 Artifacts
// ============================================================
console.log('\n=== 4. Secret Scan of S10 Artifacts ===');

const SECRET_PATTERNS = [
  { name: 'password-literal',     regex: /BosAdmin2026[!\s"'`]/ },
  { name: 'api-key-pcp-prefix',   regex: /pcp_[A-Za-z0-9_-]{16,}/ },
  { name: 'session-cookie-value', regex: /__Secure-paperclip-default\.session_token=[A-Za-z0-9_-]{20,}/ },
];

check('secret-scan: no forbidden secret patterns in S10 artifacts', () => {
  const files = [
    coverageJsonPath,
    coverageMdPath,
  ];
  const matches = [];
  for (const filePath of files) {
    if (!fs.existsSync(filePath)) continue;
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      for (const pat of SECRET_PATTERNS) {
        if (pat.regex.test(lines[i])) {
          matches.push(`${path.basename(filePath)}:${i + 1}:${pat.name}`);
        }
      }
    }
  }
  failIf(matches.length > 0,
    `Secret patterns found (${matches.length} matches):\n${matches.map(m => `  - ${m}`).join('\n')}`);
});

check('secret-scan: no forbidden secret patterns in S10 slice directory', () => {
  const sliceDir = path.join(ROOT, '.gsd', 'milestones', 'M012-ihd2ez', 'slices', 'S10');
  const matches = [];
  if (fs.existsSync(sliceDir)) {
    const walk = (dir) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) { walk(full); continue; }
        const ext = path.extname(entry.name).toLowerCase();
        if (!['.md', '.json', '.txt'].includes(ext)) continue;
        if (entry.name.endsWith('-PLAN.md') || entry.name.endsWith('-RESEARCH.md')) continue;
        const content = fs.readFileSync(full, 'utf8');
        const lines = content.split('\n');
        for (let i = 0; i < lines.length; i++) {
          for (const pat of SECRET_PATTERNS) {
            if (pat.regex.test(lines[i])) {
              matches.push(`S10/${path.relative(sliceDir, full)}:${i + 1}:${pat.name}`);
            }
          }
        }
      }
    };
    walk(sliceDir);
  }
  failIf(matches.length > 0,
    `Secret patterns in S10 slice dir (${matches.length} matches):\n${matches.map(m => `  - ${m}`).join('\n')}`);
});

// ============================================================
// Write Gate Result
// ============================================================
console.log('\n=== S10 Closeout Gate Summary ===');
for (const r of results) {
  console.log(`  ${r.pass ? '✅' : '❌'} ${r.name}`);
}

const gate = {
  schema_version: 'm012-s10-closeout-gate/v1',
  artifact_type: 's10-closeout-gate',
  phase: 'M012-S10',
  generated_at: new Date().toISOString(),
  verdict: allPassed ? 'pass' : 'fail',
  checks_total: results.length,
  checks_passed: results.filter(r => r.pass).length,
  checks_failed: results.filter(r => !r.pass).length,
  checks: results.map(r => ({ name: r.name, pass: r.pass, detail: r.pass ? undefined : r.detail })),
};

fs.writeFileSync(path.join(RUNTIME_DIR, 'M012-S10-closeout-gate.json'), JSON.stringify(gate, null, 2));
console.log(`\nGate written: runtime-evidence/M012-S10-closeout-gate.json`);
console.log(`\nSUITE_RESULT ${allPassed ? 'PASS' : 'FAIL'} — S10 closeout gate: ${gate.checks_passed}/${gate.checks_total} checks passed`);

process.exit(allPassed ? 0 : 1);
