# S04: End-to-End Validation

**Goal:** Validate the full BOS Light plugin integration by proving that all subsystems wired in S01-S03 work together through a single cohesive end-to-end workflow. Exercise the dist/worker.js tool chain through activate() with three Cynefin scenarios (CLEAR, COMPLEX, CHAOTIC) that demonstrate tools, grant policy, issue lifecycle hooks, Cynefin routing, and multi-division packet delivery as one integrated unit.
**Demo:** Full BOS Light workflow tested end-to-end

## Must-Haves

- All 3 Cynefin scenarios (CLEAR, COMPLEX, CHAOTIC) exercise the full tool chain through a single activate() registration
- Grant policy enforcement verified in the context of the full workflow (not just isolated unit tests)
- Evidence artifact runtime-evidence/M010-S04-e2e-workflow.json validates with overall_verdict=pass
- Full test suite passes without regressions after E2E test addition

## Proof Level

- This slice proves: integration

## Integration Closure

Upstream surfaces consumed: dist/worker.js activate() function, all 6 tool handlers, IssueLifecycleHookManager, createValidatedToolWrapper, getRoutingDecisionLog/getPacketsForIssue/getRoutingPacketSummary. New wiring: single E2E test file exercising full tool chain through one activate() call. What remains before milestone is truly usable: nothing (S04 is the final validation slice).

## Verification

- Runtime signals: tool invocation audit trail, routing decision log, grant denial log. Inspection surfaces: runtime-evidence/M010-S04-e2e-workflow.json with per-scenario verdicts. Failure visibility: per-scenario pass/fail verdicts with detailed audit trail. Redaction constraints: none.

## Tasks

- [x] **T01: E2E Workflow Integration Test** `est:2h`
  Create plugin-bos-light/tests/e2eWorkflow.test.ts with three Cynefin scenarios (CLEAR, COMPLEX, CHAOTIC) that exercise the full tool chain through a single activate() call.
  - Files: `plugin-bos-light/tests/e2eWorkflow.test.ts`
  - Verify: cd plugin-bos-light && npx vitest run tests/e2eWorkflow.test.ts

- [x] **T02: Evidence Artifact Generation and Verification** `est:1h`
  Create scripts/verify-s04-e2e-workflow.js that runs the E2E test suite, captures results, and writes runtime-evidence/M010-S04-e2e-workflow.json. Create verification assertions for the evidence artifact schema.
  - Files: `scripts/verify-s04-e2e-workflow.js`, `runtime-evidence/M010-S04-e2e-workflow.json`
  - Verify: node scripts/verify-s04-e2e-workflow.js

- [x] **T03: Full Regression and Slice Evidence** `est:30m`
  Run the complete BOS Light test suite to confirm zero regressions from S04 changes. Record evidence artifact and verification.
  - Files: `runtime-evidence/M010-S04-e2e-workflow.json`
  - Verify: cd plugin-bos-light && npx vitest run

## Files Likely Touched

- plugin-bos-light/tests/e2eWorkflow.test.ts
- scripts/verify-s04-e2e-workflow.js
- runtime-evidence/M010-S04-e2e-workflow.json
