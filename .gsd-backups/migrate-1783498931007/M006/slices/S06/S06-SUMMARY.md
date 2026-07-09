---
id: S06
parent: M006
milestone: M006
provides:
  - Div5 quarantine module (verifyAndQuarantine) available for downstream S07 consumption
  - Structured QuarantineVerdict and SanitizedRepoSnapshot types for Div4.Production handoff
  - SECRET_PATTERNS export for cross-module secret scanning
  - Parsed metadata pipeline from Div6 ls-remote output to Div5 quarantine input
  - Packet emission paths: gate_decision → Div4.Production, escalation/status_update → Div1.HCO
requires:
  []
affects:
  []
key_files:
  - plugin-bos-light/src/div5Quarantine.ts
  - plugin-bos-light/tests/div5Quarantine.test.ts
  - plugin-bos-light/src/contracts.ts
  - plugin-bos-light/src/gitOperations.ts
  - plugin-bos-light/src/div6ExternalGateway.ts
  - plugin-bos-light/src/index.ts
key_decisions:
  - QuarantineVerdict uses string[] for branch_inventory, ref_inventory, commit_shas for serializability
  - SanitizedRepoSnapshot includes approved_for_division: 'Div4.Production' as typed literal
  - parsed_metadata on ExternalGitEvidence is optional for backward compatibility
  - GitCommandEvidence.metadata only populated for ls-remote; parsing occurs before redaction/hashing
  - SECRET_PATTERNS exported from gitOperations.ts for cross-module reuse
  - Rejection emits escalation + status_update to Div1.HCO; approval emits gate_decision to Div4.Production + status_update to Div1.HCO
patterns_established:
  - Div5 quarantine module enforces strict caller identity (Div5.QualificationsLibraryLearning only), validates untrusted ExternalGitEvidence, scans with SECRET_PATTERNS, and emits gate_decision to Div4.Production on approval or escalation to Div1.HCO on rejection. SanitizedRepoSnapshot uses typed literal approved_for_division: 'Div4.Production' to enforce the handoff boundary at compile time.
  - GitCommandEvidence.metadata is only auto-populated for ls-remote operations, and parsing occurs on raw stdout before redaction/hashing to preserve actual commit SHAs in structured metadata. parsed_metadata on ExternalGitEvidence is optional to preserve backward compatibility with existing Div6 evidence producers.
observability_surfaces:
  - none
drill_down_paths:
  []
duration: ""
verification_result: passed
completed_at: 2026-06-01T09:52:50.413Z
blocker_discovered: false
---

# S06: Div5 Quarantine and Verification

**Implemented Div5 quarantine module with strict caller auth, secret scanning, structured verdict/snapshot emission, and comprehensive test coverage.**

## What Happened

S06 delivered the Div5 QualificationsLibraryLearning quarantine module across five tasks. T01 added contract types (Div5QuarantineUnauthorized, QuarantineVerdict, SanitizedRepoSnapshot) and wired qaReview exports through index.ts. T02 extended GitCommandEvidence with optional metadata, auto-populating it for ls-remote by parsing raw stdout before redaction/hashing, and added non-breaking test assertions. T03 implemented verifyAndQuarantine() with strict caller identity enforcement (Div5.QualificationsLibraryLearning only), completion_report retrieval, evidence validation (trust_level, git_evidence, grant_id), immediate rejection on git failure, SECRET_PATTERNS scanning of redacted_diagnostics and parsed_metadata, verified_refs construction, SanitizedRepoSnapshot generation, and packet emission (gate_decision to Div4.Production on approval; escalation + status_update to Div1.HCO on rejection). T04 extended the test suite to 24 tests covering missing git_evidence, snapshot sanitization correctness, and all auth/validation/scan/emission paths. T05 confirmed export wiring and ran full regression: zero type errors, 455 passing tests across 29 test files.

## Verification

TypeScript compilation passes with zero errors (npx tsc --noEmit, exit 0). Full vitest regression on plugin-bos-light passes with 455 tests across 29 test files, zero failures (npx vitest run, exit 0). Div5-specific tests (24 tests in div5Quarantine.test.ts) verify caller auth rejection for all non-Div5 divisions, missing completion_report handling, evidence validation failures, secret scan detection/pass, snapshot trust_level correctness, and packet emission paths (gate_decision, escalation, status_update). Related module tests (divisionPacketRouter, gitOperations, div6ExternalGateway) show no regressions.

## Requirements Advanced

- R022 — Div5 quarantine implements the Eval Gate step in the E2E mission cycle, producing structured verdicts and sanitized snapshots as visible artifacts for downstream divisions.
- R020 — Div5 verifies ExternalGitEvidence from Div6 (local git CLI output), validating trust level, scanning for secrets, and recording branch/ref/commit inventory before approving for Div4 production.
- R025 — Div5 quarantine implements eval-gate-like behavior with structured pass/fail verdicts, secret-leak scanning, and escalation on rejection, supporting the circuit-breaker quality control flow.

## Requirements Validated

None.

## New Requirements Surfaced

None.

## Requirements Invalidated or Re-scoped

None.

## Operational Readiness

None.

## Deviations

None.

## Known Limitations

None.

## Follow-ups

None.

## Files Created/Modified

- `plugin-bos-light/src/contracts.ts` — Added Div5QuarantineUnauthorized, QuarantineVerdict, SanitizedRepoSnapshot contract types
- `plugin-bos-light/src/div6ExternalGateway.ts` — Extended ExternalGitEvidence with optional parsed_metadata field
- `plugin-bos-light/src/index.ts` — Wired export * from './qaReview' and export * from './div5Quarantine'
- `plugin-bos-light/src/gitOperations.ts` — Added optional metadata to GitCommandEvidence, parseLsRemoteOutput, exported SECRET_PATTERNS
- `plugin-bos-light/tests/div6ExternalGateway.test.ts` — Added 4 non-breaking assertions for parsed_metadata on ls-remote success/failure and clone/fetch absence
- `plugin-bos-light/src/div5Quarantine.ts` — Implemented verifyAndQuarantine with caller auth, evidence validation, secret scanning, verdict/snapshot emission
- `plugin-bos-light/tests/div5Quarantine.test.ts` — 24 comprehensive tests covering auth, validation, secret scan, snapshot correctness, packet emission paths
