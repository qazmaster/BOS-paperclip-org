#!/usr/bin/env node
/**
 * @file scripts/cli_paperclip_preflight.js
 *
 * M014-a9jj46/S03/T03 — CLI wrapper around `paperclip-preflight`.
 *
 * Lets any caller (Python, shell, curl-style script) invoke the S03/T02
 * fail-closed preflight contract via a subprocess and receive a structured
 * JSON envelope. The wrapper is the SINGLE chokepoint that mutation-capable
 * scripts must use before any POST/PUT/PATCH/DELETE; the S03/T04 audit
 * enforces that no ad hoc fetch/curl POST/PUT/PATCH/DELETE call exists
 * outside this gate.
 *
 * Exit codes (must remain stable; downstream scripts depend on them):
 *   0  preflight passed (paperclip may be mutated)
 *   2  preflight blocked (paperclip MUST NOT be mutated; stdout has JSON blockers)
 *   3  preflight runner crashed (caller MUST treat as a hard block)
 *   64 usage error (bad flags)
 *
 * Usage:
 *   node scripts/cli_paperclip_preflight.js \
 *     [--lockfile-path PATH] \
 *     [--explicit-company-id UUID] \
 *     [--required-adapter TYPE] \
 *     [--allowed-adapters TYPE1,TYPE2,...] \
 *     [--confirmation-reason "operator-acknowledged reason"] \
 *     [--bypass-health-probe] \
 *     [--bypass-visibility-probe]
 *
 * The wrapper reads PAPERCLIP_EMAIL / PAPERCLIP_PASSWORD /
 * PAPERCLIP_COMPANY_ID_OVERRIDE / PAPERCLIP_API_KEY directly from
 * process.env (via the preflight's default env reader), so callers do
 * NOT pass credentials on the command line.
 *
 * Output: JSON object { pass: bool, blockers: [...], diagnostics: {...} } on
 * stdout, regardless of pass/fail. Stderr is reserved for usage errors.
 */

'use strict';

const path = require('node:path');

const {
  runPreflight,
  DEFAULT_LOCKFILE_PATH
} = require('./lib/paperclip-preflight');

/**
 * Parse argv into the preflight option bag. Unknown flags produce a usage
 * error (exit 64). This wrapper intentionally does NOT validate the values
 * beyond types; the preflight itself enforces the contract.
 */
function parseArgs(argv) {
  const opts = {
    lockfilePath: DEFAULT_LOCKFILE_PATH,
    explicitCompanyId: null,
    requiredAdapter: null,
    allowedAdapters: [],
    confirmation: null,
    bypassHealthProbe: false,
    bypassVisibilityProbe: false
  };
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    let value;
    if (arg === '--lockfile-path') value = argv[++i];
    else if (arg === '--explicit-company-id') value = argv[++i];
    else if (arg === '--required-adapter') value = argv[++i];
    else if (arg === '--allowed-adapters') value = argv[++i];
    else if (arg === '--confirmation-reason') value = argv[++i];
    else if (arg === '--bypass-health-probe') {
      opts.bypassHealthProbe = true;
      continue;
    } else if (arg === '--bypass-visibility-probe') {
      opts.bypassVisibilityProbe = true;
      continue;
    } else if (arg === '--help' || arg === '-h') {
      process.stdout.write(USAGE);
      process.exit(0);
    } else {
      process.stderr.write(`cli_paperclip_preflight: unknown argument: ${arg}\n${USAGE}`);
      process.exit(64);
    }
    if (value === undefined) {
      process.stderr.write(`cli_paperclip_preflight: missing value for ${arg}\n`);
      process.exit(64);
    }
    if (arg === '--lockfile-path') opts.lockfilePath = path.resolve(value);
    else if (arg === '--explicit-company-id') opts.explicitCompanyId = value;
    else if (arg === '--required-adapter') opts.requiredAdapter = value;
    else if (arg === '--allowed-adapters') {
      opts.allowedAdapters = String(value)
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
    } else if (arg === '--confirmation-reason') {
      opts.confirmation = { explicit: true, reason: value };
    }
  }
  return opts;
}

const USAGE = `Usage: node scripts/cli_paperclip_preflight.js [options]

Options:
  --lockfile-path PATH            Path to paperclip-runtime.lock.json
                                  (default: <cwd>/paperclip-runtime.lock.json)
  --explicit-company-id UUID      Explicit companyId (triggers V-PF-09 override path)
  --required-adapter TYPE         Adapter required by this mutation (e.g. hermes_local)
  --allowed-adapters A,B,C        Comma-separated adapter types known to be supported
  --confirmation-reason "..."     Operator-acknowledged reason for the mutation
                                  (required when override is in use)
  --bypass-health-probe           Skip /api/health probe (dry-run only)
  --bypass-visibility-probe       Skip /api/companies/{id} HEAD probe (dry-run only)
  -h, --help                      Show this message

Environment (read by preflight directly):
  PAPERCLIP_EMAIL                 session-cookie username (required)
  PAPERCLIP_PASSWORD              session-cookie password (required)
  PAPERCLIP_COMPANY_ID_OVERRIDE   must be "allow" when explicitCompanyId is supplied
  PAPERCLIP_API_KEY               MUST NOT be set (rejected by V-PF-04)

Exit codes:
  0   preflight passed
  2   preflight blocked (stdout has structured JSON blockers)
  3   preflight runner crashed
  64  usage error
`;

async function main() {
  const opts = parseArgs(process.argv);
  const result = await runPreflight(opts);
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  process.exit(result.pass ? 0 : 2);
}

main().catch((err) => {
  const message = err && err.message ? err.message : String(err);
  const stack = err && err.stack ? err.stack : null;
  const payload = {
    pass: false,
    blockers: [
      {
        code: 'V-PF-CLI-CRASH',
        kind: 'schema',
        where: 'cli_paperclip_preflight.js',
        message: `preflight runner crashed: ${message}`,
        evidence: { error_name: err && err.name ? err.name : 'unknown' },
        remediation:
          'Treat as a hard block. Do NOT retry the mutation until the underlying error is investigated.'
      }
    ],
    diagnostics: { crashed: true, stack }
  };
  process.stdout.write(JSON.stringify(payload, null, 2) + '\n');
  process.stderr.write(`cli_paperclip_preflight: uncaught error: ${message}\n`);
  process.exit(3);
});