# S02: Hermes BOS agents smoke

**Goal:** Prove, using supported Paperclip agent and adapter boundaries only, that a Hermes-backed BOS Light smoke agent can be created with adapterType hermes_local, pass runtime environment validation, execute one harmless bounded BOS smoke task, return resultJson.bos evidence, and show no duplicate wake or approval side effects.
**Demo:** Paperclip sandbox shows Hermes backed BOS agents completing safe smoke tasks with captured resultJson.bos evidence and no duplicate wake behavior.

## Must-Haves

- Threat Surface (Q3): The only live mutation permitted is a short-lived Paperclip sandbox agent/run and any explicitly marked sandbox issue/comment/document evidence; no terminal toolset, no approval creation, no direct database writes, no core patches, and no secret values in repo output. Requirement Impact (Q4): Owns R011 support for S02 by proving all interactions occur through Paperclip agent configuration and adapter/testEnvironment APIs; locked decisions D008 and D009 remain in force. Verification: final evidence JSON validates schemaVersion/runId/issueId/division/role/status in resultJson.bos, hermes_local testEnvironment is passing, agent readback shows adapterType hermes_local, wake diagnostics show duplicate_wake_detected=false, approval diagnostics show created_count=0, no-core-modification audit is recorded, and local runtime capability validators still pass. Negative Tests (Q7): validators reject missing resultJson.bos, non-hermes adapterType, duplicate wake, approvals created, unredacted secret-like strings, and any confirmed capability promotion lacking version/build/readback evidence.

## Threat Surface

## Q3 Exploit analysis

S02 touches a live Paperclip sandbox agent/runtime boundary (`adapterType: hermes_local`) and therefore is not security-neutral even though the planned task is harmless.

### Abuse scenarios to guard against
- **Parameter tampering:** Agent creation or run payloads could be altered to use a non-`hermes_local` adapter, broader role profile, longer timeout, unsafe `cwd`, extra args, environment overrides, or unrestricted toolsets. The S02 validator must reject non-Hermes adapter types and evidence should record readback of the actual agent config.
- **Replay / duplicate wake:** A heartbeat/run invocation could be retried or replayed and produce duplicate wake behavior, duplicate comments/documents, or repeated side effects. The slice already requires `duplicate_wake_detected=false`; evidence should include run IDs, wake counts, timestamps, and idempotency/dedup diagnostics where available.
- **Privilege escalation:** If the Hermes agent gets terminal, approval, or privileged Paperclip capabilities, a smoke prompt could mutate more than intended. Enforce no terminal toolset, no approval creation, short timeout/grace, bounded prompt, and approval diagnostics `created_count=0`.
- **Boundary bypass:** A blocked Hermes setup might tempt direct DB writes, Paperclip core patches, private module imports, or plugin-side subprocess orchestration. D008/D009 and the slice plan prohibit these; final evidence needs a no-core-modification audit.

### Data exposure risks
- Hermes setup may require authentication/API keys or local agent JWT material; these must be collected/stored only through approved secret mechanisms and never written to repo artifacts, chat, command output, or `runtime-evidence` JSON.
- Runtime evidence can expose company IDs, issue IDs, agent IDs, run IDs, logs, prompts, and adapter diagnostics. IDs are acceptable as sandbox evidence, but tokens, cookies, API keys, bearer headers, and secret-like strings must be redacted and validator-tested.
- `resultJson.bos` should contain only the required BOS smoke fields (`schemaVersion`, `runId`, `issueId`, `division`, `role`, `status`, etc.) and no raw secrets, environment dumps, or private runtime internals.

### Input trust boundaries
- Untrusted or semi-trusted inputs include Paperclip API responses, adapter `testEnvironment` output, Hermes run logs, `resultJson`, issue/comment/document bodies, and any local evidence JSON produced from them.
- These inputs flow into repository docs, capability matrix updates, and downstream S04 evidence; validators must parse defensively, fail closed on malformed/missing `resultJson.bos`, and avoid promoting capabilities without live version/build/readback proof.

### Required controls before/during execution
- Use only the dedicated sandbox and approved mutation scope from S01.
- Create only short-lived sandbox agent/run artifacts and explicitly marked sandbox issue/comment/document evidence.
- Prohibit terminal toolsets, approval creation, direct DB writes, Paperclip core changes, and private internal dependencies.
- Validate both environment and smoke artifacts for redaction, adapter type, duplicate wake, approval count, runtime version/build/readback evidence, and no-core-modification proof.

## Requirement Impact

## Q4 Requirement impact analysis

### Requirements touched
- **R003 — Paperclip remains system of record.** S02 creates/reads live Paperclip agent/run and possibly issue/comment/document evidence; it must verify evidence through Paperclip-visible readback rather than local-only fixtures.
- **R004 — Runtime assumptions must be validated before SDK/capability claims.** S02 directly validates the `hermes_local` runtime environment, adapter registration, agent execution, `resultJson.bos` shape, and duplicate-wake behavior before promoting capability posture.
- **R011 — Balanced proof / upgrade-safety constraint for M002.** The S02 plan explicitly says it owns R011 support by proving interactions occur only through Paperclip agent configuration and adapter/testEnvironment APIs, with no core patches, direct DB writes, or private internals.
- **R012 — Adapter/persistence seams.** S02 exercises the Hermes adapter seam and must keep BOS Light integration at the Paperclip agent/adapter boundary rather than embedding a BOS worker subprocess path.
- **R013 — Native-first durable artifact mirroring.** Any S02 smoke output consumed by S04 must be durable Paperclip-visible evidence or a documented fallback/blocker, not an untraceable local claim.

### Requirements potentially adjacent but not owned by S02
- **R008 — Native approval/request creation.** S02 must explicitly *not* create approvals; it re-tests the negative side-effect invariant (`approvals.created_count=0`) rather than validating approval creation.
- **R009/R010 — Eval Gate and Circuit Breaker evidence.** These are downstream S05 concerns; S02 only supplies Hermes agent/run evidence that later slices may consume.

### Must be re-tested after shipping S02
- `hermes_local` environment validation passes or records a fail-closed blocker (`runtime-evidence/M002-S02-hermes-environment.json`).
- Smoke evidence validates `adapterType: hermes_local`, expected `resultJson.bos` required fields, run/agent/issue IDs, and bounded status (`runtime-evidence/M002-S02-hermes-smoke.json`).
- Duplicate wake and replay diagnostics remain clean (`duplicate_wake_detected=false`).
- Approval side effects remain absent (`approvals.created_count=0`).
- Secret-redaction checks reject token/cookie/key-like strings in evidence artifacts and docs.
- No-core-modification audit confirms no Paperclip core patch, direct DB mutation, private module import, or plugin-side subprocess bypass.
- Capability matrix/docs validators still pass, especially `python3 scripts/validate_runtime_capabilities.py`; no capability is promoted without live version/build/readback proof.

### Decisions to keep/revisit
- **Keep D008:** Hermes and GSD-Pi must use Paperclip native adapters/agents; S02 should not introduce a BOS plugin worker subprocess executor layer.
- **Keep D009:** Paperclip core remains read-only; if Hermes installation/authentication cannot be achieved through supported runtime/secret mechanisms, S02 should record a blocker/fallback rather than patching core.
- Revisit only if supported Paperclip APIs cannot create/read Hermes agent smoke evidence without prohibited access; that would require scope reassessment before proceeding.

## Proof Level

- This slice proves: Operational integration proof against the live Paperclip sandbox. Real runtime required: yes. Human/UAT required: no, but execution must fail closed if Hermes CLI/auth cannot be provisioned without secrets.

## Integration Closure

Consumes S01 sandbox fingerprint, browser-authenticated Paperclip API posture, native issue/readback evidence, and adapter readiness blocker. Introduces no Paperclip core code or repo-internal Paperclip imports; any local code added is a repository-side evidence harness and validator. Produces S02 evidence for S04 to use: Paperclip Hermes agent ID, run ID, resultJson.bos sample shape, wake/approval side-effect checks, and conservative docs/matrix posture.

## Verification

- Adds durable redacted runtime-evidence JSON artifacts and reader-facing smoke report sections so future agents can inspect phase, timestamp, adapter testEnvironment output, agent config/readback, run IDs, resultJson.bos, wake counts, approval counts, blocker reason, and no-core-modification proof without accessing secrets or private Paperclip internals.

## Tasks

- [x] **T01: Add Hermes smoke evidence harness** `est:1h`
  ---
  estimated_steps: 8
  estimated_files: 3
  skills_used:
    - tdd
    - error-handling-patterns
    - observability
  ---
  Why: S02 needs executable proof rules before live sandbox mutation so a registered adapter or fixture success cannot be mistaken for Hermes runtime support. The harness should make the evidence contract explicit, redact secrets, and validate both success and fail-closed blocker records.
  - Files: `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/scripts/probe_paperclip_runtime.py`, `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/scripts/test_probe_paperclip_runtime.py`, `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/scripts/validate_runtime_capabilities.py`
  - Verify: python3 -m unittest scripts/test_validate_s02_hermes_smoke.py

- [x] **T02: Gate Hermes runtime environment** `est:1h`
  ---
  estimated_steps: 7
  estimated_files: 2
  skills_used:
    - agent-browser
    - observability
    - error-handling-patterns
  ---
  Why: S01 proved hermes_local is registered but blocked by hermes_cli_not_found; agent smoke is invalid until the live Paperclip container passes adapter environment validation.
  - Files: `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/PAPERCLIP_LIVE_VALIDATION_REPORT.md`, `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/docs/08_RUNTIME_CAPABILITY_HEALTH.md`
  - Verify: python3 scripts/validate_s02_hermes_smoke.py --phase environment --evidence runtime-evidence/M002-S02-hermes-environment.json

- [x] **T03: Run bounded BOS Hermes agent smoke** `est:1.5h`
  ---
  estimated_steps: 9
  estimated_files: 2
  skills_used:
    - agent-browser
    - api-design
    - observability
  ---
  Why: S02 is only proven by a real Paperclip agent run using adapterType hermes_local that returns BOS-shaped resultJson evidence, not by adapter registration or local fixtures.
  - Files: `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/PAPERCLIP_LIVE_VALIDATION_REPORT.md`, `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/docs/08_RUNTIME_CAPABILITY_HEALTH.md`
  - Verify: python3 scripts/validate_s02_hermes_smoke.py --phase smoke --evidence runtime-evidence/M002-S02-hermes-smoke.json

- [x] **T04: Close S02 docs matrix and boundary audit** `est:1h`
  ---
  estimated_steps: 8
  estimated_files: 4
  skills_used:
    - write-docs
    - verify-before-complete
    - observability
  ---
  Why: Live Hermes proof must be translated into conservative reader-facing posture without overclaiming plugin surfaces, and R011 requires explicit no-core-modification evidence.
  - Files: `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/PAPERCLIP_LIVE_VALIDATION_REPORT.md`, `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/docs/08_RUNTIME_CAPABILITY_HEALTH.md`, `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/plugin-bos-light/capabilities.paperclip-runtime.json`
  - Verify: python3 scripts/validate_s02_hermes_smoke.py --phase final --evidence runtime-evidence/M002-S02-hermes-smoke.json && python3 scripts/validate_runtime_capabilities.py

## Files Likely Touched

- /home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/scripts/probe_paperclip_runtime.py
- /home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/scripts/test_probe_paperclip_runtime.py
- /home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/scripts/validate_runtime_capabilities.py
- /home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/PAPERCLIP_LIVE_VALIDATION_REPORT.md
- /home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/docs/08_RUNTIME_CAPABILITY_HEALTH.md
- /home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/plugin-bos-light/capabilities.paperclip-runtime.json
