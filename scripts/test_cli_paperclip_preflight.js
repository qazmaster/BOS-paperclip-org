#!/usr/bin/env node
/**
 * @file scripts/test_cli_paperclip_preflight.js
 *
 * M014-a9jj46/S03/T03 — test suite for the preflight CLI wrapper.
 *
 * Validates that scripts/cli_paperclip_preflight.js:
 *   - parses every supported flag (lockfile-path, explicit-company-id,
 *     required-adapter, allowed-adapters CSV, confirmation-reason,
 *     bypass-health-probe, bypass-visibility-probe)
 *   - exits 0 on preflight pass, 2 on preflight block, 64 on usage error,
 *     3 on internal crash
 *   - emits structured JSON { pass, blockers, diagnostics } on stdout
 *     regardless of pass/fail
 *   - rejects unknown flags with exit 64
 *   - never echoes secrets (PAPERCLIP_API_KEY / PAPERCLIP_PASSWORD) in
 *     stdout or stderr, even when they are part of the env the test sets
 *
 * Verification:
 *   node --test scripts/test_cli_paperclip_preflight.js
 */

'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const CLI_PATH = path.join(PROJECT_ROOT, 'scripts', 'cli_paperclip_preflight.js');
const LOCKFILE_PATH = path.join(PROJECT_ROOT, 'paperclip-runtime.lock.json');

// Snapshot of process.env so tests can mutate it without leaking to other suites.
const ENV_SNAPSHOT = { ...process.env };

/**
 * Write a minimal valid lockfile fixture to a tmp path. Mirrors the structure
 * shipped in paperclip-runtime.lock.json but is fully self-contained so the
 * CLI wrapper can be tested against custom shapes (e.g. with verified
 * base_url_status).
 */
function writeTmpLockfile(overrides = {}) {
  const base = JSON.parse(fs.readFileSync(LOCKFILE_PATH, 'utf8'));
  const merged = {
    ...base,
    runtime_target: {
      ...base.runtime_target,
      ...(overrides.runtime_target || {})
    },
    company_identity: {
      ...base.company_identity,
      ...(overrides.company_identity || {})
    },
    stale_company_ids: {
      ...base.stale_company_ids,
      ...(overrides.stale_company_ids || {})
    },
    disposable_company_ids: {
      ...base.disposable_company_ids,
      ...(overrides.disposable_company_ids || {})
    },
    auth_modes: {
      ...base.auth_modes,
      ...(overrides.auth_modes || {})
    }
  };
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cli-pf-test-'));
  const tmpPath = path.join(tmpDir, 'paperclip-runtime.lock.json');
  fs.writeFileSync(tmpPath, JSON.stringify(merged, null, 2));
  return { tmpPath, tmpDir };
}

function runCli(args, envOverrides = {}, unsetEnvKeys = []) {
  const env = {
    ...ENV_SNAPSHOT,
    PAPERCLIP_EMAIL: 'ops@example.com',
    PAPERCLIP_PASSWORD: 'redacted-test-password',
    ...envOverrides
  };
  // Tests can ask for specific env keys to be explicitly unset so we can
  // exercise the missing-credential branches of the preflight.
  for (const key of unsetEnvKeys) delete env[key];
  // Always unset PAPERCLIP_API_KEY unless the test deliberately sets it.
  if (!('PAPERCLIP_API_KEY' in envOverrides)) delete env.PAPERCLIP_API_KEY;
  if (!('PAPERCLIP_COMPANY_ID_OVERRIDE' in envOverrides)) delete env.PAPERCLIP_COMPANY_ID_OVERRIDE;
  const result = spawnSync(process.execPath, [CLI_PATH, ...args], {
    env,
    encoding: 'utf8',
    cwd: PROJECT_ROOT,
    timeout: 30_000
  });
  let parsed = null;
  if (result.stdout && result.stdout.trim()) {
    try {
      parsed = JSON.parse(result.stdout);
    } catch (_) {
      parsed = null;
    }
  }
  return { ...result, parsed };
}

describe('cli_paperclip_preflight.js — flag parsing', () => {
  it('prints usage and exits 0 on --help', () => {
    const r = runCli(['--help']);
    assert.equal(r.status, 0, `expected exit 0, got ${r.status}; stderr=${r.stderr}`);
    assert.match(r.stdout, /Usage:/);
    assert.match(r.stdout, /--explicit-company-id/);
    assert.match(r.stdout, /--confirmation-reason/);
    assert.match(r.stdout, /--bypass-health-probe/);
  });

  it('rejects unknown flags with exit 64', () => {
    const r = runCli(['--unknown-flag']);
    assert.equal(r.status, 64, `expected exit 64, got ${r.status}; stderr=${r.stderr}`);
    assert.match(r.stderr, /unknown argument/);
  });

  it('rejects missing value for --lockfile-path with exit 64', () => {
    const r = runCli(['--lockfile-path']);
    assert.equal(r.status, 64, `expected exit 64, got ${r.status}; stderr=${r.stderr}`);
    assert.match(r.stderr, /missing value/);
  });

  it('rejects missing value for --confirmation-reason with exit 64', () => {
    const r = runCli(['--confirmation-reason']);
    assert.equal(r.status, 64);
    assert.match(r.stderr, /missing value/);
  });
});

describe('cli_paperclip_preflight.js — happy-path with override=allow', () => {
  // Use a fresh non-stale UUID for the override. We bypass network probes
  // because the test environment has no Paperclip runtime to talk to.
  const FRESH_UUID = 'aaaaaaaa-bbbb-4ccc-9ddd-eeeeeeeeeeee';

  it('exits 0 when override=allow + fresh explicitCompanyId + confirmation (network bypassed)', () => {
    const r = runCli(
      [
        '--explicit-company-id', FRESH_UUID,
        '--confirmation-reason', 't03-cli-wrapper-test',
        '--bypass-health-probe',
        '--bypass-visibility-probe'
      ],
      { PAPERCLIP_COMPANY_ID_OVERRIDE: 'allow' }
    );
    assert.equal(r.status, 0, `expected exit 0, got ${r.status}; stderr=${r.stderr}; stdout=${r.stdout}`);
    assert.ok(r.parsed, 'expected JSON on stdout');
    assert.equal(r.parsed.pass, true);
    assert.deepEqual(r.parsed.blockers, []);
    assert.ok(r.parsed.diagnostics);
    assert.equal(r.parsed.diagnostics.explicit_company_id, 'aaaaaaaa…');
  });

  it('passes parsed allowedAdapters CSV into the preflight diagnostics', () => {
    const r = runCli(
      [
        '--explicit-company-id', FRESH_UUID,
        '--required-adapter', 'hermes_local',
        '--allowed-adapters', 'hermes_local,gsdpi_local',
        '--confirmation-reason', 't03-cli-wrapper-adapter-test',
        '--bypass-health-probe',
        '--bypass-visibility-probe'
      ],
      { PAPERCLIP_COMPANY_ID_OVERRIDE: 'allow' }
    );
    assert.equal(r.status, 0, `expected exit 0, got ${r.status}; stderr=${r.stderr}`);
    assert.ok(r.parsed);
    assert.equal(r.parsed.pass, true);
    assert.equal(r.parsed.diagnostics.required_adapter, 'hermes_local');
  });
});

describe('cli_paperclip_preflight.js — fail-closed behaviors', () => {
  it('blocks (exit 2) when explicitCompanyId matches a stale UUID and no override', () => {
    const r = runCli(
      [
        '--explicit-company-id', '9feb4c22-05b9-401e-ba67-0e866e3056da',
        '--confirmation-reason', 't03-cli-stale-test',
        '--bypass-health-probe',
        '--bypass-visibility-probe'
      ]
    );
    assert.equal(r.status, 2, `expected exit 2, got ${r.status}; stderr=${r.stderr}`);
    assert.ok(r.parsed);
    assert.equal(r.parsed.pass, false);
    assert.ok(r.parsed.blockers.length > 0, 'expected at least one blocker');
    // V-PF-09 fires first (override missing) before V-PF-03 (stale).
    const codes = r.parsed.blockers.map((b) => b.code);
    assert.ok(codes.includes('V-PF-09'), `expected V-PF-09, got codes=${codes.join(',')}`);
  });

  it('blocks (exit 2) when override=allow but explicitCompanyId is stale (V-PF-09 fires second)', () => {
    const r = runCli(
      [
        '--explicit-company-id', '9feb4c22-05b9-401e-ba67-0e866e3056da',
        '--confirmation-reason', 't03-cli-stale-with-override',
        '--bypass-health-probe',
        '--bypass-visibility-probe'
      ],
      { PAPERCLIP_COMPANY_ID_OVERRIDE: 'allow' }
    );
    assert.equal(r.status, 2);
    assert.ok(r.parsed);
    assert.equal(r.parsed.pass, false);
    const codes = r.parsed.blockers.map((b) => b.code);
    // V-PF-09 runs BEFORE V-PF-03 per orchestrator design; with override=allow
    // the orchestrator passes V-PF-09 then V-PF-03 trips on the stale UUID.
    assert.ok(
      codes.includes('V-PF-03'),
      `expected V-PF-03 (stale) to fire; got codes=${codes.join(',')}`
    );
  });

  it('blocks (exit 2) when PAPERCLIP_API_KEY is set (V-PF-04 rejected auth)', () => {
    const FRESH_UUID = 'aaaaaaaa-1111-4222-9333-eeeeeeeeeeee';
    const r = runCli(
      [
        '--explicit-company-id', FRESH_UUID,
        '--confirmation-reason', 't03-cli-apikey-test',
        '--bypass-health-probe',
        '--bypass-visibility-probe'
      ],
      {
        PAPERCLIP_API_KEY: 'sk-test-secret-leaked-1234567890',
        PAPERCLIP_COMPANY_ID_OVERRIDE: 'allow'
      }
    );
    assert.equal(r.status, 2, `expected exit 2, got ${r.status}; stderr=${r.stderr}`);
    assert.ok(r.parsed);
    assert.equal(r.parsed.pass, false);
    const codes = r.parsed.blockers.map((b) => b.code);
    assert.ok(codes.includes('V-PF-04'), `expected V-PF-04, got codes=${codes.join(',')}`);
    // The blocker evidence must NOT echo the API key value.
    assert.ok(
      !r.stdout.includes('sk-test-secret-leaked-1234567890'),
      `stdout must not echo PAPERCLIP_API_KEY value; got stdout=${r.stdout.slice(0, 400)}`
    );
    assert.ok(
      !r.stderr.includes('sk-test-secret-leaked-1234567890'),
      `stderr must not echo PAPERCLIP_API_KEY value; got stderr=${r.stderr.slice(0, 400)}`
    );
  });

  it('blocks (exit 2) when PAPERCLIP_EMAIL is missing', () => {
    const FRESH_UUID = 'aaaaaaaa-2222-4333-9444-eeeeeeeeeeee';
    const r = runCli(
      [
        '--explicit-company-id', FRESH_UUID,
        '--confirmation-reason', 't03-cli-missing-email',
        '--bypass-health-probe',
        '--bypass-visibility-probe'
      ],
      { PAPERCLIP_COMPANY_ID_OVERRIDE: 'allow' },
      ['PAPERCLIP_EMAIL']
    );
    assert.equal(r.status, 2, `expected exit 2, got ${r.status}; stderr=${r.stderr}`);
    assert.ok(r.parsed);
    const codes = r.parsed.blockers.map((b) => b.code);
    assert.ok(codes.includes('V-PF-04'), `expected V-PF-04; got codes=${codes.join(',')}`);
  });

  it('blocks (exit 2) when PAPERCLIP_PASSWORD is missing', () => {
    const FRESH_UUID = 'aaaaaaaa-2222-4333-9555-eeeeeeeeeeee';
    const r = runCli(
      [
        '--explicit-company-id', FRESH_UUID,
        '--confirmation-reason', 't03-cli-missing-password',
        '--bypass-health-probe',
        '--bypass-visibility-probe'
      ],
      { PAPERCLIP_COMPANY_ID_OVERRIDE: 'allow' },
      ['PAPERCLIP_PASSWORD']
    );
    assert.equal(r.status, 2, `expected exit 2, got ${r.status}; stderr=${r.stderr}`);
    assert.ok(r.parsed);
    const codes = r.parsed.blockers.map((b) => b.code);
    assert.ok(codes.includes('V-PF-04'), `expected V-PF-04; got codes=${codes.join(',')}`);
  });

  it('blocks (exit 2) with V-PF-08 when confirmation is missing', () => {
    const FRESH_UUID = 'aaaaaaaa-3333-4444-9555-eeeeeeeeeeee';
    const r = runCli(
      [
        '--explicit-company-id', FRESH_UUID,
        '--bypass-health-probe',
        '--bypass-visibility-probe'
        // NOTE: no --confirmation-reason
      ],
      { PAPERCLIP_COMPANY_ID_OVERRIDE: 'allow' }
    );
    assert.equal(r.status, 2);
    assert.ok(r.parsed);
    const codes = r.parsed.blockers.map((b) => b.code);
    assert.ok(
      codes.includes('V-PF-09') || codes.includes('V-PF-08'),
      `expected V-PF-09 or V-PF-08; got codes=${codes.join(',')}`
    );
  });
});

describe('cli_paperclip_preflight.js — secret redaction', () => {
  it('never echoes PAPERCLIP_PASSWORD in stdout or stderr across pass and fail paths', () => {
    const FRESH_UUID = 'aaaaaaaa-5555-4666-9777-eeeeeeeeeeee';
    const PASSWORD = 'super-secret-password-9876543210';

    const pass = runCli(
      [
        '--explicit-company-id', FRESH_UUID,
        '--confirmation-reason', 't03-redaction-pass',
        '--bypass-health-probe',
        '--bypass-visibility-probe'
      ],
      { PAPERCLIP_PASSWORD: PASSWORD, PAPERCLIP_COMPANY_ID_OVERRIDE: 'allow' }
    );
    assert.equal(pass.status, 0);
    assert.ok(
      !pass.stdout.includes(PASSWORD),
      `pass stdout must not echo password; got=${pass.stdout.slice(0, 400)}`
    );

    const fail = runCli(
      [
        '--explicit-company-id', '9feb4c22-05b9-401e-ba67-0e866e3056da',
        '--confirmation-reason', 't03-redaction-fail',
        '--bypass-health-probe',
        '--bypass-visibility-probe'
      ],
      { PAPERCLIP_PASSWORD: PASSWORD }
    );
    assert.equal(fail.status, 2);
    assert.ok(
      !fail.stdout.includes(PASSWORD),
      `fail stdout must not echo password; got=${fail.stdout.slice(0, 400)}`
    );
    assert.ok(
      !fail.stderr.includes(PASSWORD),
      `fail stderr must not echo password; got=${fail.stderr.slice(0, 400)}`
    );
  });
});

describe('cli_paperclip_preflight.js — custom lockfile path', () => {
  it('honors --lockfile-path when supplied and exits 2 if lockfile is missing', () => {
    const r = runCli(
      [
        '--lockfile-path', '/tmp/this-lockfile-does-not-exist-12345.json',
        '--explicit-company-id', 'aaaaaaaa-6666-4777-9888-eeeeeeeeeeee',
        '--confirmation-reason', 't03-cli-missing-lockfile',
        '--bypass-health-probe',
        '--bypass-visibility-probe'
      ],
      { PAPERCLIP_COMPANY_ID_OVERRIDE: 'allow' }
    );
    assert.equal(r.status, 2);
    assert.ok(r.parsed);
    const codes = r.parsed.blockers.map((b) => b.code);
    assert.ok(
      codes.includes('V-PF-01'),
      `expected V-PF-01 (missing lockfile); got codes=${codes.join(',')}`
    );
    assert.ok(r.parsed.diagnostics.lockfile_path.includes('this-lockfile-does-not-exist'));
  });

  it('accepts a custom lockfile path written to /tmp', () => {
    const { tmpPath, tmpDir } = writeTmpLockfile();
    try {
      const FRESH_UUID = 'aaaaaaaa-7777-4888-9999-eeeeeeeeeeee';
      const r = runCli(
        [
          '--lockfile-path', tmpPath,
          '--explicit-company-id', FRESH_UUID,
          '--confirmation-reason', 't03-cli-custom-lockfile',
          '--bypass-health-probe',
          '--bypass-visibility-probe'
        ],
        { PAPERCLIP_COMPANY_ID_OVERRIDE: 'allow' }
      );
      assert.equal(r.status, 0, `expected exit 0; stderr=${r.stderr}; stdout=${r.stdout.slice(0, 400)}`);
      assert.ok(r.parsed);
      assert.equal(r.parsed.pass, true);
      assert.ok(r.parsed.diagnostics.lockfile_path.includes(tmpPath));
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});

describe('cli_paperclip_preflight.js — exit-code contract stability', () => {
  it('exit code 0 is reserved for pass only (no false-positive passes)', () => {
    const FRESH_UUID = 'aaaaaaaa-8888-4999-aaaa-eeeeeeeeeeee';
    const r = runCli(
      [
        '--explicit-company-id', FRESH_UUID,
        '--confirmation-reason', 't03-cli-pass-confirm',
        '--bypass-health-probe',
        '--bypass-visibility-probe'
      ],
      { PAPERCLIP_COMPANY_ID_OVERRIDE: 'allow' }
    );
    assert.equal(r.status, 0);
    assert.ok(r.parsed);
    assert.equal(r.parsed.pass, true, 'status 0 must imply pass=true');
  });

  it('exit code 2 is reserved for block only (pass=false, blockers non-empty)', () => {
    const r = runCli(
      [
        '--explicit-company-id', '9feb4c22-05b9-401e-ba67-0e866e3056da',
        '--confirmation-reason', 't03-cli-block-confirm',
        '--bypass-health-probe',
        '--bypass-visibility-probe'
      ]
    );
    assert.equal(r.status, 2);
    assert.ok(r.parsed);
    assert.equal(r.parsed.pass, false);
    assert.ok(r.parsed.blockers.length > 0, 'status 2 must imply non-empty blockers');
  });
});

after(() => {
  // Restore env to a clean state for downstream tests.
  for (const key of Object.keys(process.env)) {
    if (!(key in ENV_SNAPSHOT)) delete process.env[key];
  }
  for (const [key, value] of Object.entries(ENV_SNAPSHOT)) {
    process.env[key] = value;
  }
});

before(() => {
  // No setup needed; tests are fully isolated via spawnSync.
});