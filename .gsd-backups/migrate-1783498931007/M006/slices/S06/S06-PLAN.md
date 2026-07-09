# S06: Div5 Quarantine and Verification

**Goal:** Div5 quarantine module receives completion_report from Div6, verifies ExternalGitEvidence, performs secret-leak scanning, records branch/ref inventory and commit SHAs, and produces SanitizedRepoSnapshot approved for Div4.
**Demo:** Branch/ref/file inventory verified; commit SHA recorded; secret leak scan performed; sanitized repo snapshot approved for Div4.

## Must-Haves

- TypeScript compilation passes with zero errors. All new and existing tests in plugin-bos-light/ pass. Div5 verifyAndQuarantine rejects all non-Div5 callers, validates untrusted evidence, scans for secrets, records verified refs, produces gate_decision to Div4 on approval and escalation to Div1 on rejection, and emits status_update to Div1 in both cases.

## Proof Level

- This slice proves: contract + integration

## Integration Closure

Upstream surfaces consumed: ExternalGitEvidence from div6ExternalGateway.ts, divisionPacketRouter primitives, SECRET_PATTERNS from gitOperations.ts, SecurityFlag from qaReview.ts. New wiring: div5Quarantine.ts exported from index.ts; packet emission paths from Div5 to Div4 (gate_decision) and Div1 (escalation, status_update). Remaining before milestone E2E: S07 (Div4 Production on approved workspace), S08 (Div5 Eval Gate).

## Verification

- QuarantineVerdict and SanitizedRepoSnapshot provide structured runtime signals. Packet emission diagnostics (gate_decision, escalation, status_update) expose success/failure paths. SecurityFlag arrays expose secret-scan findings.

## Tasks

- [x] **T01: Contract types and parsed_metadata interface** `est:30m`
  Add Div5QuarantineUnauthorized, QuarantineVerdict, and SanitizedRepoSnapshot to contracts.ts. Extend ExternalGitEvidence in div6ExternalGateway.ts with optional parsed_metadata field. Export SecurityFlag via index.ts by wiring qaReview exports so downstream slices can reference security scan results without importing across module boundaries.
  - Files: `plugin-bos-light/src/contracts.ts`, `plugin-bos-light/src/div6ExternalGateway.ts`, `plugin-bos-light/src/index.ts`
  - Verify: npx tsc --noEmit

- [x] **T02: Div6 ls-remote parsed_metadata population** `est:45m`
  Extend GitCommandEvidence in gitOperations.ts with optional metadata field and auto-populate it for ls-remote by parsing stdout into structured refs before redaction/hashing. In div6ExternalGateway.ts, copy git_evidence.metadata into evidence.parsed_metadata. Update div6ExternalGateway.test.ts with non-breaking assertions: parsed_metadata.refs is present and structured on ls-remote success, absent on clone/fetch, and empty on ls-remote failure.
  - Files: `plugin-bos-light/src/gitOperations.ts`, `plugin-bos-light/src/div6ExternalGateway.ts`, `plugin-bos-light/tests/div6ExternalGateway.test.ts`
  - Verify: npx vitest run plugin-bos-light/tests/div6ExternalGateway.test.ts

- [x] **T03: Div5 quarantine module implementation** `est:60m`
  Create plugin-bos-light/src/div5Quarantine.ts with verifyAndQuarantine function enforcing strict caller identity (Div5.QualificationsLibraryLearning only). Retrieve completion_report from Div5 inbox by quarantine_ref. Validate evidence: trust_level must be 'untrusted', git_evidence must exist, grant_id must match. Reject immediately if git_evidence.success is false. Scan redacted_diagnostics and parsed_metadata text fields with SECRET_PATTERNS from gitOperations.ts; report SecurityFlag[]. Build verified_refs from parsed_metadata.refs or fallback to git_evidence.args. Build SanitizedRepoSnapshot with trust_level 'sanitized' on pass, 'rejected' on failure. Emit gate_decision to Div4.Production on approval; escalation to Div1.HCO on rejection; status_update to Div1.HCO in both cases.
  - Files: `plugin-bos-light/src/div5Quarantine.ts`
  - Verify: npx tsc --noEmit

- [x] **T04: Comprehensive Div5 quarantine tests** `est:60m`
  Create plugin-bos-light/tests/div5Quarantine.test.ts covering: caller auth rejection for all non-Div5 divisions (Div1, Div2, Div3, Div4, Div6, Div7); missing completion_report in inbox; evidence validation failures (wrong trust_level, missing git_evidence); git failure rejection (success false); secret scan detection (inject fake secret pattern in redacted_diagnostics); secret scan pass (clean diagnostics); snapshot trust_level correctness (sanitized on approval, rejected on failure); packet emission paths (gate_decision to Div4 on approval, escalation to Div1 on rejection, status_update to Div1 in both cases); test isolation via clearPacketRouter() before each test.
  - Files: `plugin-bos-light/tests/div5Quarantine.test.ts`
  - Verify: npx vitest run plugin-bos-light/tests/div5Quarantine.test.ts

- [x] **T05: Export wiring and full regression** `est:15m`
  Add export * from './div5Quarantine' to plugin-bos-light/src/index.ts so downstream slices (S07 Div4 Production) can import quarantine types and verifyAndQuarantine. Run TypeScript compilation and full vitest regression scoped to plugin-bos-light to confirm zero type errors and zero test failures across the expanded suite.
  - Files: `plugin-bos-light/src/index.ts`
  - Verify: npx tsc --noEmit && npx vitest run plugin-bos-light/

## Files Likely Touched

- plugin-bos-light/src/contracts.ts
- plugin-bos-light/src/div6ExternalGateway.ts
- plugin-bos-light/src/index.ts
- plugin-bos-light/src/gitOperations.ts
- plugin-bos-light/tests/div6ExternalGateway.test.ts
- plugin-bos-light/src/div5Quarantine.ts
- plugin-bos-light/tests/div5Quarantine.test.ts
