---
id: S05
parent: M006
milestone: M006
provides:
  - ExternalGitEvidence type and executeExternalGitOperation as the sole approved external-git execution path for the 7-division loop
  - completion_report packet emission to Div5.QualificationsLibraryLearning with untrusted evidence payload
  - status_update packet emission to Div1.HCO with redacted summary
  - lsRemote and fetch methods on DefaultGitOperations for reuse by downstream slices
requires:
  - slice: S04
    provides: ScopedAccessGrant packet type and issueScopedAccessGrant function from Div3.Treasury; SecretRef resolution via secretResolver.ts; divisionPacketRouter inbox/clear/emit primitives
affects:
  - S06
key_files:
  - plugin-bos-light/src/div6ExternalGateway.ts
  - plugin-bos-light/tests/div6ExternalGateway.test.ts
  - plugin-bos-light/src/gitOperations.ts
  - plugin-bos-light/src/contracts.ts
key_decisions:
  - Added fetch method to DefaultGitOperations instead of duplicating spawn logic inside div6ExternalGateway.ts
  - Fixed latent async test bug by converting .then() inside a for loop to async/await in caller-authorization tests
  - Scoped vitest runs to plugin-bos-light/ to avoid pre-existing adapters/gsdpi-local/tests/execute.test.ts conflict (uses node:test, not vitest)
patterns_established:
  - Division gateway module pattern: strict caller identity check → grant validation (origin, expiration, ops) → secret resolution → git execution → untrusted evidence with SHA256 hashes + redacted diagnostics → packet emission to downstream divisions
  - Untrusted evidence envelope: all external output marked trust_level:'untrusted', no raw stdout/stderr, only hashes and redacted_diagnostics
observability_surfaces:
  - none
drill_down_paths:
  []
duration: ""
verification_result: passed
completed_at: 2026-06-01T09:11:52.500Z
blocker_discovered: false
---

# S05: Div6 External Git Gateway

**Div6.External gateway module with strict caller identity, grant validation, untrusted evidence emission, and 36 gateway tests; lsRemote and fetch added to GitOperations; 427 tests green, zero type errors.**

## What Happened

## T01: lsRemote added to GitOperations
Extended the GitOperations interface with `lsRemote(repoUrl, refs?)` and implemented it in DefaultGitOperations using `runGit` with args `["ls-remote", repoUrl, ...(refs || [])]`. Added 5 new tests covering command shaping, optional refs, evidence envelope completeness, missing binary (ENOENT) classification, and auth failure classification.

## T02: ExternalGitGatewayUnauthorized contract and div6ExternalGateway.ts module
Added `ExternalGitGatewayUnauthorized` to contracts.ts mirroring TreasuryUnauthorized with `required_role: 'Div6.External'`. Created `div6ExternalGateway.ts` containing:
- `ExternalGitEvidence` type with `trust_level: 'untrusted'`
- `executeExternalGitOperation` function enforcing strict caller === 'Div6.External'
- Grant consumption from Div6 inbox, validation of origin (Div3.Treasury), expiration, and allowed_ops mapping
- Secret resolution via `resolveSecretRef` and git execution via `DefaultGitOperations`
- `ExternalGitGatewayUnauthorized` returned on any validation failure
- `ExternalGitEvidence` built on execution success or git failure with SHA256-hashed stdout/stderr and redacted diagnostics only
- `completion_report` emitted to Div5.QualificationsLibraryLearning
- `status_update` emitted to Div1.HCO with redacted summary
Also added `fetch` to GitOperations/DefaultGitOperations to avoid duplicating spawn logic. Exported the new module from `index.ts`.

## T03: Comprehensive div6ExternalGateway.test.ts
Built 36 exhaustive tests covering:
- Caller authorization: rejects all non-Div6 divisions (Div1, Div2, Div3, Div4, Div5, Div7)
- Grant lookup: fails when grant_id not found in Div6 inbox
- Grant validation: fails for non-Div3 origin, expired grants, missing allowed_ops
- Operation enforcement: ls-remote/clone/fetch permission mapping
- Secret resolution: PaperclipSecretRef returns auth_failure evidence with redacted diagnostics; InlineEnvRef success path
- Git execution: mocked spawn tests for success, ENOENT, and auth failure across ls-remote, clone, and fetch
- Packet emission: verifies completion_report reaches Div5 inbox and status_update reaches Div1 inbox
- Evidence integrity: trust_level always 'untrusted', no raw stdout/stderr, redacted_diagnostics present
Fixed a latent async bug in caller-auth tests by converting `.then()` inside a for loop to `async/await`.

## T04: Full regression
Ran `tsc --noEmit` (zero errors) and full vitest suite scoped to `plugin-bos-light/` (28 test files, 427 tests passing). This includes all 386+ pre-existing tests plus 41 new tests (5 gitOperations + 36 div6ExternalGateway). A pre-existing empty `adapters/gsdpi-local/tests/execute.test.ts` using `node:test` was excluded by scoping to `plugin-bos-light/`.

## Verification

TypeScript compilation passed with zero errors (`tsc --noEmit` exit 0). Full test suite passed: 28 test files, 427 tests, zero failures. Specific new coverage: 5 lsRemote tests in gitOperations.test.ts + 36 gateway tests in div6ExternalGateway.test.ts = 41 new tests. All slice must-haves verified: ls-remote in GitOperations, div6ExternalGateway.ts module with strict caller identity and grant validation, ExternalGitEvidence with trust_level:'untrusted' and SHA256-hashed stdout/stderr, packet emissions to Div5 and Div1, redaction constraints enforced.

## Requirements Advanced

- R020 — Added lsRemote and fetch to GitOperations, and created the Div6 external gateway as the sole approved path for external git CLI operations. Local git integration infrastructure expanded but remains unvalidated at live Paperclip runtime level.
- R022 — Established the Div6→Div5 packet pipeline (completion_report with ExternalGitEvidence) and Div6→Div1 status_update path, advancing the 7-division loop infrastructure toward E2E proof.

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

Live Paperclip runtime proof of executeExternalGitOperation invoked through Hermes agent context is S10 (E2E Autonomous Git Mission) scope. This slice proves contract and local unit-test coverage only.

## Follow-ups

None.

## Files Created/Modified

- `plugin-bos-light/src/gitOperations.ts` — Added lsRemote and fetch methods to GitOperations interface and DefaultGitOperations class
- `plugin-bos-light/tests/gitOperations.test.ts` — Added 5 tests for lsRemote: command shaping, optional refs, evidence envelope, ENOENT, auth failure
- `plugin-bos-light/src/contracts.ts` — Added ExternalGitGatewayUnauthorized type with required_role: 'Div6.External'
- `plugin-bos-light/src/div6ExternalGateway.ts` — Created gateway module with ExternalGitEvidence, executeExternalGitOperation, caller identity, grant validation, packet emission, redaction
- `plugin-bos-light/tests/div6ExternalGateway.test.ts` — Created 36 exhaustive unit tests for caller auth, grant validation, operation enforcement, secret resolution, git execution, packet emission, evidence integrity
- `plugin-bos-light/src/index.ts` — Exported div6ExternalGateway module
