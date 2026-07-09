# S05: Eval Gates and Circuit Breaker Evidence

**Goal:** Make Eval Gate results and Circuit Breaker closed, half-open, and open behavior visible through deterministic Paperclip adapter evidence paths, with polling/activity fallback semantics documented and tested without claiming unproven live runtime event support.
**Demo:** Eval Gate pass/fail guidance and Circuit Breaker closed, half-open, and open behavior are visible through issue evidence and polling/activity fallback.

## Must-Haves

- Owned requirements: R009 and R010. Supporting requirements: R003, R004, R011, R012, and R013.
- Demo closure: a fixture issue can run Eval Gates, persist cache-overlay gate state, mirror pass/fail guidance to a Paperclip-visible comment when the adapter seam is supplied, and return explicit markdown-only diagnostics when comments/activity/issues are unavailable. Repeated failure observations open the Circuit Breaker on the configured threshold, attempt Paperclip-native escalation issue creation through the adapter seam, fall back to issue comments or markdown-only diagnostics, expose polling configuration as ACTIVE_RUNS_ONLY with jitter/backoff/activity fallback, and allow HALF_OPEN recovery back to CLOSED on success.
- Threat Surface Q3:
- Abuse: callers may tamper with issue ids, run ids, observation status, reasons, timestamps, or adapter-like objects to fake gate/circuit evidence. The slice should validate required strings, keep native support proof-gated, and avoid treating caller-provided capability posture as runtime proof.
- Data exposure: diagnostic bodies may include failure reasons and adapter errors; they must be bounded and sanitized, with no token, secret, or stack trace echoing.
- Input trust: issue/run content is untrusted markdown and should remain inert evidence text only; plugin cache state is an overlay, not durable truth.
- Requirement Impact Q4:
- Requirements touched: R003, R004, R009, R010, R011, R012, R013.
- Re-verify: BOS plugin tests, TypeScript typecheck, runtime capability validator, and validator unit tests after manifest/capability docs change.
- Decisions revisited: D003, D004, and D006 remain in force; do not promote events/activity/issues/comments to confirmed without live version/build proof.
- Slice verification before completion:
- npm --prefix plugin-bos-light test
- npm --prefix plugin-bos-light run typecheck
- python3 scripts/test_validate_runtime_capabilities.py
- python3 scripts/validate_runtime_capabilities.py
- Negative proof expectations Q7:
- Tests cover missing adapter, failing comment write, failing escalation issue write, malformed or empty issue ids, repeated failure threshold, HALF_OPEN success recovery, activity logging failure fallback, and preservation of fallback-only event posture.

## Threat Surface

## Q3 Exploit Analysis

### Abuse scenarios
- **Identifier tampering:** callers can provide malformed, empty, or unauthorized `issueId` / `runId` values to write gate or circuit evidence to the wrong Paperclip issue, fabricate evidence for a different run, or confuse fallback diagnostics.
- **Observation forgery / replay:** callers can submit repeated failure observations, stale timestamps, or success observations in HALF_OPEN to force incorrect CLOSED/HALF_OPEN/OPEN transitions or prematurely reset the circuit.
- **Adapter spoofing:** because runtime support remains proof-gated, adapter-like objects must not be treated as evidence of native Paperclip support; fake comment/issue/activity functions could otherwise make tests or tools claim unproven live runtime behavior.
- **Evidence inflation / markdown abuse:** untrusted issue/run content and failure reasons could be mirrored into comments or markdown diagnostics; content must remain inert evidence text, bounded in length, and not interpreted as commands or trusted state.

### Data exposure risks
- Diagnostic bodies may include failure reasons, adapter errors, state transition details, polling posture, timestamps, and artifact references.
- These diagnostics must not echo secrets, tokens, stack traces, raw SDK errors, environment details, or excessive user-provided markdown.

### Trust boundaries
- Issue IDs, run IDs, observation status/reason/timestamps, and issue/comment content are untrusted inputs crossing into adapter calls, plugin cache-overlay state, and generated markdown evidence.
- Plugin cache state is explicitly an overlay and must not become durable truth; Paperclip-native artifacts or explicit fallback diagnostics remain the visible evidence path.

### Required mitigations to preserve before execution
- Validate required string identifiers and reject malformed/empty values before adapter writes.
- Bound and sanitize diagnostic/failure text before persistence or comments.
- Keep native runtime support proof-gated; do not infer live events/activity/issues/comments from fixture adapters.
- Test negative paths for missing adapter, failing comment writes, failing escalation issue writes, malformed IDs, threshold opening, HALF_OPEN recovery, activity logging fallback, and fallback-only event posture.

## Requirement Impact

## Q4 Requirement Impact

### Touched requirements
- **R003** — Preserves Paperclip as the system of record; S05 must mirror gate/circuit evidence to Paperclip-visible artifacts or explicit fallback diagnostics rather than hidden plugin truth.
- **R004** — Validates runtime assumptions before trusting SDK behavior; S05 must keep comments, activity, issues, and event posture proof-gated.
- **R009** — Owns Eval Gate evidence and release guidance; S05 directly implements pass, warning, blocking fail, and incomplete guidance evidence.
- **R010** — Owns Circuit Breaker fallback behavior; S05 directly implements CLOSED, HALF_OPEN, OPEN, threshold escalation, and polling/activity fallback evidence.
- **R011** — Balanced proof for M001; S05 contributes contract plus fixture integration proof without claiming live runtime support.
- **R012** — Adapter and persistence seams; S05 extends `paperclipAdapter.ts`, `persistence.ts`, contracts, and worker entrypoints while keeping SDK calls isolated.
- **R013** — Native-first durable artifact mirroring; S05 must prefer Paperclip-visible comments/issues/artifacts and document markdown-only fallback when native writes fail.

### Must re-test after shipping
- `npm --prefix plugin-bos-light test`
- `npm --prefix plugin-bos-light run typecheck`
- `python3 scripts/test_validate_runtime_capabilities.py`
- `python3 scripts/validate_runtime_capabilities.py`
- Focused S05 tests from the plan: `evalGateEvidence.test.ts`, `circuitBreakerFlow.test.ts`, and `acceptance.test.ts`.
- Regression attention for S02/S03/S04 surfaces: runtime capability validator, native artifact fallback patterns, adapter contracts, persistence matrix, and approval/native artifact posture.

### Decisions to revisit or preserve
- **D003, D004, and D006 remain in force** per the slice plan: do not promote events, activity, issues, comments, or tool registrations to confirmed runtime support without live version/build proof.
- Revisit those decisions only if S05 produces actual runtime evidence beyond fixture adapters; otherwise document fallback-only posture in capability and health artifacts.

## Proof Level

- This slice proves: Contract plus fixture integration proof. Real runtime required: no. Human or UAT required: no. This slice must not claim live Paperclip event delivery, activity scanning, issue creation, or comment readback; it proves the adapter-facing orchestration and fallback behavior that S06 can include in the A1 to A10 demo.

## Integration Closure

Upstream surfaces consumed: evalGates.ts, circuitBreaker.ts, paperclipAdapter.ts, persistence.ts, runtimeCapabilities.ts, worker.ts, capabilities.paperclip-runtime.json, and S03 artifact fallback patterns. New wiring introduced: gate evidence orchestration helper, circuit breaker observation helper, optional worker tool registrations for gate evidence and circuit observations, manifest/capability matrix entries for the new tools, and acceptance tests. Remaining before milestone end to end: S06 must compose this with the company template, BPI, Blueprint, Betting Table, approval request, and runtime health evidence in one documented A1 to A10 demo.

## Verification

- Adds bounded, inspectable evidence envelopes for Eval Gates and Circuit Breaker transitions: selected surface, artifact or escalation reference, cache-overlay save status, polling config posture, transition state, attempt count, failure reason, fallback diagnostics, and timestamps. Future agents can inspect test outputs, returned envelopes, adapter comment/issue arrays in fixture tests, and docs/capability health reports to localize missing native support without relying on hidden plugin state.

## Tasks

- [x] **T01: Persist and Mirror Eval Gate Evidence** `est:1h`
  ---
  estimated_steps: 7
  estimated_files: 4
  skills_used:
    - tdd
    - error-handling-patterns
    - observability
  ---
  Why: R009 needs Eval Gate pass, warning, blocking fail, and incomplete guidance to become Paperclip-visible evidence instead of a pure return value. Existing `runEvalGates` is deterministic and should stay pure, so this task creates a composition seam around it.
  - Files: `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/plugin-bos-light/src/evalGates.ts`, `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/plugin-bos-light/src/persistence.ts`, `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/plugin-bos-light/src/paperclipAdapter.ts`, `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/plugin-bos-light/src/contracts.ts`, `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/plugin-bos-light/src/index.ts`
  - Verify: npm --prefix plugin-bos-light test -- evalGateEvidence.test.ts

- [x] **T02: Orchestrate Circuit Breaker Observations** `est:1h 30m`
  ---
  estimated_steps: 8
  estimated_files: 4
  skills_used:
    - tdd
    - error-handling-patterns
    - observability
  ---
  Why: R010 requires repeated failure detection, OPEN escalation, HALF_OPEN retry, and CLOSED recovery behavior to be visible without relying on unvalidated terminal run events. The existing circuit breaker module is a pure state machine but has no orchestration, persistence, escalation, or fallback evidence path.
  - Files: `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/plugin-bos-light/src/circuitBreaker.ts`, `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/plugin-bos-light/src/paperclipAdapter.ts`, `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/plugin-bos-light/src/persistence.ts`, `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/plugin-bos-light/src/contracts.ts`, `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/plugin-bos-light/src/index.ts`
  - Verify: npm --prefix plugin-bos-light test -- circuitBreakerFlow.test.ts

- [x] **T03: Wire Worker Tools and Acceptance Flow** `est:1h`
  ---
  estimated_steps: 6
  estimated_files: 3
  skills_used:
    - tdd
    - observability
    - api-design
  ---
  Why: S05 needs executor-usable entrypoints and an acceptance path, not only standalone helpers. Worker wiring should remain optional and adapter-driven because Paperclip tool registration is still unvalidated.
  - Files: `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/plugin-bos-light/src/worker.ts`, `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/plugin-bos-light/tests/acceptance.test.ts`
  - Verify: npm --prefix plugin-bos-light test -- acceptance.test.ts

- [x] **T04: Document Capability Posture and Validate Drift** `est:45m`
  ---
  estimated_steps: 7
  estimated_files: 8
  skills_used:
    - write-docs
    - observability
    - verify-before-complete
  ---
  Why: S05 changes the public plugin surface and the A6 to A10 evidence story. The manifest, capability matrix, health report, persistence matrix, data contracts, acceptance docs, and backlog must stay aligned with the proof-gated runtime posture from S02 and D006.
  - Files: `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/plugin-bos-light/manifest.paperclip-plugin.json`, `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/plugin-bos-light/capabilities.paperclip-runtime.json`, `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/scripts/test_validate_runtime_capabilities.py`, `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/docs/04_DATA_CONTRACTS.md`, `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/docs/05_PERSISTENCE_MATRIX.md`, `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/docs/06_ACCEPTANCE_TESTS.md`, `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/docs/08_RUNTIME_CAPABILITY_HEALTH.md`, `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/docs/09_BACKLOG.md`
  - Verify: python3 scripts/test_validate_runtime_capabilities.py && python3 scripts/validate_runtime_capabilities.py

## Files Likely Touched

- /home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/plugin-bos-light/src/evalGates.ts
- /home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/plugin-bos-light/src/persistence.ts
- /home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/plugin-bos-light/src/paperclipAdapter.ts
- /home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/plugin-bos-light/src/contracts.ts
- /home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/plugin-bos-light/src/index.ts
- /home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/plugin-bos-light/src/circuitBreaker.ts
- /home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/plugin-bos-light/src/worker.ts
- /home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/plugin-bos-light/tests/acceptance.test.ts
- /home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/plugin-bos-light/manifest.paperclip-plugin.json
- /home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/plugin-bos-light/capabilities.paperclip-runtime.json
- /home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/scripts/test_validate_runtime_capabilities.py
- /home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/docs/04_DATA_CONTRACTS.md
- /home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/docs/05_PERSISTENCE_MATRIX.md
- /home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/docs/06_ACCEPTANCE_TESTS.md
- /home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/docs/08_RUNTIME_CAPABILITY_HEALTH.md
- /home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/docs/09_BACKLOG.md
