# S02: Read Only Paperclip Auth Reprobe

**Goal:** Run a safe read-only live Paperclip probe and classify missing credentials as blockers rather than failed capability.
**Demo:** After this: a fresh probe records current Paperclip health, auth-dependent company visibility when credentials exist, and plugin route status without remote mutation.

## Must-Haves

- Probe attempts only GET/read-only routes and records route statuses.
- Secret values are never printed or persisted.
- If auth is absent or invalid, artifact records fail-closed blocker codes.
- Plugin host routes remain unpromoted unless observed through supported readback.

## Proof Level

- This slice proves: Operational read-only live probe.

## Integration Closure

Consumes S01 route/capability targets and produces fresh live state for S03 reconciliation.

## Verification

- Probe artifact records route, status, ok flag, blocker codes, redaction flag, and timestamp.

## Tasks

- [x] **T01: Implement read-only Paperclip reprobe script** `est:45m`
  Create a Node.js script that reads non-secret config from environment or defaults, loads .env without printing values, and probes only GET routes for health, company visibility, agents/divisions, issue listing, plugin status, plugin tools, and tool registry discovery. It must write runtime-evidence/M011-S02-paperclip-readonly-reprobe.json and record missing or invalid auth as blocker codes with redacted diagnostics.
  - Files: `scripts/m011_s02_paperclip_readonly_reprobe.js`, `runtime-evidence/M011-S02-paperclip-readonly-reprobe.json`
  - Verify: node scripts/m011_s02_paperclip_readonly_reprobe.js

- [x] **T02: Validate reprobe safety and classification** `est:30m`
  Create a validator that checks the S02 reprobe artifact is read-only, has no secret values, records route statuses, classifies auth/plugin blockers, and does not promote plugin host or piko tools unless supported route readback is actually observed. Run the reprobe and validator.
  - Files: `scripts/validate_m011_s02_reprobe.js`, `runtime-evidence/M011-S02-paperclip-readonly-reprobe.json`
  - Verify: node scripts/validate_m011_s02_reprobe.js

## Files Likely Touched

- scripts/m011_s02_paperclip_readonly_reprobe.js
- runtime-evidence/M011-S02-paperclip-readonly-reprobe.json
- scripts/validate_m011_s02_reprobe.js
