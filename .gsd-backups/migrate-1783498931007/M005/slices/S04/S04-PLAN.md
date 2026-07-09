# S04: Git Integration + Hybrid State Persistence

**Goal:** Deliver git operations abstraction, hybrid state persistence with automatic Paperclip artifact mirroring, and state reconstruction from native artifacts for M005 S04. Produce validated fail-closed probe evidence and append-only capability matrix update.
**Demo:** Div4.Production clones the aipay.kz repository, creates a branch, commits changes, and pushes. Hybrid state mirrors betting table, gate results, and circuit breaker state to Paperclip native artifacts. On simulated restart, state reconstructs from artifacts.

## Must-Haves

- All TypeScript modules (gitOperations, hybridPersistence, stateReconstruction) pass unit tests. S04 probe runner produces a valid evidence artifact (expected fail-closed-blocker in the current auth-missing environment). Validator accepts the artifact with --allow-blocker. 12 test fixtures pass. Capability matrix validates with new git.local_cli and state.hybrid_persistence rows append-only. Cumulative S01-S04 evidence summary generated.

## Proof Level

- This slice proves: contract

## Integration Closure

Upstream surfaces consumed: confirmed native issue/document/comment surfaces from S01/S02, BOS config and company template from S02, resource intake checklist from S03. New wiring introduced: HybridBOSPersistence replaces InMemoryBOSPersistence as the durable persistence path for S05. GitOperations provides Div4.Production with repo manipulation. StateReconstruction enables restart recovery from native artifacts. What remains before the milestone is truly usable end-to-end: S05 must exercise these modules in a live mission with actual git push and artifact readback.

## Verification

- Runtime signals: HybridBOSPersistence diagnostics track mirror attempts, failures, and artifact refs. GitOperations evidence envelope records clone_ref, branch_name, commit_sha, push_ref. State reconstruction envelope records found/missing/fallback status. Inspection surfaces: Probe evidence JSON, capability matrix JSON, unit test output, validator audit JSON. Failure visibility: adapter failure falls back to in-memory with logged diagnostics; git binary missing produces clean blocker code. Redaction constraints: Git SSH keys and tokens passed via env only, never logged or stored in code.

## Tasks

- [x] **T01: Create git operations TypeScript module with tests** `est:45m`
  Why: Div4.Production needs local git CLI operations to modify the aipay.kz repository (MEM046: GSD-Pi remains blocked). Do: Create `GitOperations` interface and implementation in `gitOperations.ts` using `child_process` spawn. Support SSH via `GIT_SSH_KEY` and HTTPS via `GITHUB_TOKEN`/`GITLAB_TOKEN` auth discovery from environment. Implement `clone`, `checkoutBranch`, `add`, `commit`, `push` with structured evidence envelopes. Detect missing git binary and non-fast-forward conflicts. Redact all secrets in diagnostics. Create `gitOperations.test.ts` with vitest covering: successful command shaping, missing git binary detection, and secret redaction. Done when: unit tests pass.
  - Files: `plugin-bos-light/src/gitOperations.ts`, `plugin-bos-light/tests/gitOperations.test.ts`
  - Verify: cd plugin-bos-light && npx vitest run tests/gitOperations.test.ts

- [x] **T02: Create hybrid persistence TypeScript module with tests** `est:45m`
  Why: Fast in-memory cache must automatically mirror to durable Paperclip native artifacts (issue documents/comments) so state survives plugin restart without depending on unvalidated Paperclip state APIs. Do: Create `HybridBOSPersistence` class implementing `BOSPersistence` in `hybridPersistence.ts`. Wrap `InMemoryBOSPersistence`. After every `save*` call, auto-mirror to Paperclip via the adapter: `createIssueDocument` for structured data (BPI, betting table, circuit breaker) and `addIssueComment` for human-visible summaries. Track artifact refs and diagnostics. Gracefully degrade to in-memory-only when the adapter throws. Create `hybridPersistence.test.ts` covering mirror success, adapter failure fallback, artifact ref tracking, and zero secret leakage. Done when: unit tests pass.
  - Files: `plugin-bos-light/src/hybridPersistence.ts`, `plugin-bos-light/tests/hybridPersistence.test.ts`
  - Verify: cd plugin-bos-light && npx vitest run tests/hybridPersistence.test.ts

- [x] **T03: Create state reconstruction TypeScript module with tests** `est:45m`
  Why: On plugin restart, BOS state (betting table, gate results, circuit breaker) must rebuild from Paperclip native artifacts when company-scoped plugin state is unavailable. Do: Create `reconstructStateFromArtifacts(adapter, issueId)` in `stateReconstruction.ts` that scrapes issue documents and comments for structured BOS data. Validate parsed payloads against `contracts.ts` types. Return a reconstruction envelope listing what was found, what was missing, and whether fallback was used. Handle markdown-only fallbacks gracefully with best-effort parsing. Create `stateReconstruction.test.ts` using `InMemoryPaperclipAdapter` to simulate pre-seeded artifacts and verify round-trip recovery. Done when: unit tests pass.
  - Files: `plugin-bos-light/src/stateReconstruction.ts`, `plugin-bos-light/tests/stateReconstruction.test.ts`
  - Verify: cd plugin-bos-light && npx vitest run tests/stateReconstruction.test.ts

- [x] **T04: Create S04 Python probe runner** `est:40m`
  Why: Need a bounded live probe that discovers git credentials, checks git binary availability, and validates hybrid persistence behavior, producing a machine-readable evidence artifact. Do: Create `scripts/run_m005_s04_git_hybrid_probe.py` following the exact S01-S03 patterns: HttpClient, redaction, preflight auth gate, evidence schema_version `m005-s04-git-hybrid/v1`. Discover `AIPAY_GIT_URL`, `GIT_SSH_KEY`, `GITHUB_TOKEN`, `GITLAB_TOKEN` from env. Perform git binary check (`git --version`) and bounded `git ls-remote` if URL is present. Smoke-test hybrid persistence via in-memory + simulated adapter. Write evidence to `runtime-evidence/M005-S04-git-hybrid-probe.json`. In the current auth-missing environment, produce a valid fail-closed-blocker artifact with precise blocker codes and zero side effects. Done when: script executes and writes evidence artifact.
  - Files: `scripts/run_m005_s04_git_hybrid_probe.py`
  - Verify: python3 scripts/run_m005_s04_git_hybrid_probe.py

- [x] **T05: Create S04 Python validator and test fixtures** `est:50m`
  Why: Machine-readable closeout requires a validator and comprehensive fixture coverage for all S04 artifact types. Do: Create `scripts/validate_m005_s04_git_hybrid_probe.py` with schema_version enforcement (`m005-s04-git-hybrid/v1`), redaction checks, no_core_modification validation, blocker acceptance (`--allow-blocker`), and zero capability-promotion rejection. Create `scripts/test_validate_m005_s04_git_hybrid_probe.py` with 12 fixtures: (1) passing git+hybrid proof, (2) passing reconstruction proof, (3) fail-closed blocker missing auth, (4) fail-closed blocker missing git binary, (5) fail-closed blocker missing git URL, (6) fail-closed blocker unsupported endpoint, (7) partial hybrid mirror failure, (8) unredacted secrets in diagnostics, (9) malformed timestamp, (10) unsupported paths used, (11) capability promotion in blocker artifact, (12) CLI write-audit closeout. Done when: all 12 fixtures pass.
  - Files: `scripts/validate_m005_s04_git_hybrid_probe.py`, `scripts/test_validate_m005_s04_git_hybrid_probe.py`
  - Verify: python3 -m unittest scripts/test_validate_m005_s04_git_hybrid_probe.py -v

- [x] **T06: Run probe, validate evidence, update capability matrix, and generate summary** `est:30m`
  Why: Slice closeout requires validated evidence, append-only capability matrix update, and cumulative evidence summary per MEM058. Do: Run the S04 probe to produce `runtime-evidence/M005-S04-git-hybrid-probe.json`. Validate it with `python3 scripts/validate_m005_s04_git_hybrid_probe.py --evidence runtime-evidence/M005-S04-git-hybrid-probe.json --allow-blocker` (expect exit 0). Update `plugin-bos-light/capabilities.paperclip-runtime.json` append-only: add `git.local_cli` and `state.hybrid_persistence` rows with status `fallback-only`, evidence_source referencing M005-S04 probe, and blocker_text describing the auth-missing environment. Preserve all existing S01-S03 rows unchanged. Generate `runtime-evidence/M005-S04-evidence-summary.json` combining S01+S02+S03+S04 results with posture, guardrails, confirmed surfaces, fallback-only surfaces, and MEM058 compliance flag. Done when: capability matrix validation passes.
  - Files: `plugin-bos-light/capabilities.paperclip-runtime.json`, `runtime-evidence/M005-S04-evidence-summary.json`
  - Verify: python3 scripts/validate_runtime_capabilities.py

## Files Likely Touched

- plugin-bos-light/src/gitOperations.ts
- plugin-bos-light/tests/gitOperations.test.ts
- plugin-bos-light/src/hybridPersistence.ts
- plugin-bos-light/tests/hybridPersistence.test.ts
- plugin-bos-light/src/stateReconstruction.ts
- plugin-bos-light/tests/stateReconstruction.test.ts
- scripts/run_m005_s04_git_hybrid_probe.py
- scripts/validate_m005_s04_git_hybrid_probe.py
- scripts/test_validate_m005_s04_git_hybrid_probe.py
- plugin-bos-light/capabilities.paperclip-runtime.json
- runtime-evidence/M005-S04-evidence-summary.json
