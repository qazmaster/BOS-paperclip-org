# S02: Division Routing Configuration

**Goal:** Division routing configured and packets routed correctly
**Demo:** Division routing configured and packets routed correctly

## Must-Haves

- All 12 named routing rules produce correct division targets
- bos-route-packet tool in dist/worker.js covers all routing rule paths
- Evidence artifact proves routing works across all paths
- Two-pass routing with DecisionDelegated verified

## Proof Level

- This slice proves: contract

## Integration Closure

S02 extends the dist/worker.js bos-route-packet tool surface from 5 hardcoded packet types to a full routing table covering all 12 named rules. It also validates the full src/ routing pipeline (missionRouter → decision → packetRouter) via integration tests. The evidence artifact provides auditable proof that all routing paths work. S03 (Agent Integration) can consume this verified routing surface.

## Verification

- Routing decision log entries and packet delivery records provide observability into which divisions received work and why.

## Tasks

- [x] **T01: Expand bos-route-packet tool routing table in dist/worker.js** `est:30m`
  ## Why
  - Files: `plugin-bos-light/dist/worker.js`
  - Verify: cd plugin-bos-light && npx vitest run tests/distWorkerTools.test.ts

- [x] **T02: Add comprehensive routing integration tests covering all 12 rules** `est:40m`
  ## Why
  - Files: `plugin-bos-light/tests/routingIntegration.test.ts`
  - Verify: cd plugin-bos-light && npx vitest run tests/routingIntegration.test.ts

- [x] **T03: Create routing evidence artifact and verification script** `est:25m`
  ## Why
  - Files: `runtime-evidence/M010-S02-routing-config.json`, `scripts/verify-t02-routing-evidence.js`, `scripts/verify-t03-slice-evidence.js`
  - Verify: node scripts/verify-t03-slice-evidence.js

## Files Likely Touched

- plugin-bos-light/dist/worker.js
- plugin-bos-light/tests/routingIntegration.test.ts
- runtime-evidence/M010-S02-routing-config.json
- scripts/verify-t02-routing-evidence.js
- scripts/verify-t03-slice-evidence.js
