# S06: Integrated A1 to A10 Demo

**Goal:** Produce a truthful, repeatable integrated A1-A10 baseline demo that composes the validated company template, Paperclip runtime capability posture, BPI scoring, Product Blueprint artifact flow, Betting Table, approval request path, Eval Gates, and Circuit Breaker evidence while explicitly recording live runtime gaps instead of promoting unproven support.
**Demo:** A documented A1-A10 baseline demo shows the template, issue scoring, blueprint, Betting Table, approval request, gates, and circuit evidence working together or records runtime gaps explicitly.

## Must-Haves

- Demo closure:
- A single repository-local command can run the A1 validator, A2 runtime capability guardrail, and A3-A10 fixture integration demo without requiring a live Paperclip instance.
- The demo report enumerates A1 through A10, includes evidence references for each step, and records unvalidated live Paperclip runtime surfaces as gap ledger entries rather than success claims.
- Fixture integration exercises the real plugin orchestration seams: runSeededIssueBlueprintFlow, Betting Table build/load/approval request, Eval Gate evidence, Circuit Breaker observation, injected adapter, and cache-overlay persistence.
- Documentation explains how to run the deterministic baseline, what it proves, what it does not prove, and how to append live runtime smoke evidence only after version/build plus proof evidence exists.
- Threat Surface Q3:
- Abuse: the demo runner executes local repository commands and accepts only bounded local file/path options; implement subprocess calls with argument arrays and never shell interpolation.
- Data exposure: no secrets or PII are required; probe and report output must preserve existing secret redaction posture and avoid dumping environment values.
- Input trust: seed JSON and optional runtime evidence paths are local inputs; malformed JSON, missing paths, and command failures must produce explicit diagnostics.
- Requirement Impact Q4:
- Requirements touched: final assembly supports R001-R013 and re-verifies the already validated R009-R010 evidence envelopes.
- Re-verify: company template validator, runtime capability validators, plugin tests, TypeScript typecheck, and integrated demo runner.
- Decisions revisited: D001-D007 remain locked; S06 must not contradict the proof boundary or cache-overlay decisions.

## Threat Surface

## Exploit analysis

### Abuse scenarios
- **Subprocess injection:** T02 adds/uses `scripts/run_a1_a10_demo.py` and a repository-local command that invokes A1, A2, and A3-A10 checks. If it constructs commands with shell interpolation or accepts arbitrary command fragments, a malicious path/argument could execute unintended shell commands.
- **Path tampering:** Optional runtime evidence paths, seed JSON paths, or report/gap-ledger paths could be pointed outside the repository or at sensitive local files unless bounded to expected repository-local inputs and opened read-only where appropriate.
- **Replay/misleading proof:** Previously generated evidence or gap-ledger files could be replayed as fresh runtime proof unless the report records timestamps, step IDs, command/exit evidence, and explicit live-runtime proof boundaries.
- **Capability overclaim:** A malicious or malformed seed/evidence file could claim Paperclip support for import/export, dashboard, approval, comments, activity, events, UI, or fallback observability without version/build plus proof evidence unless validators keep capability posture conservative.

### Data exposure risks
- No PII or secrets are required for deterministic S06 proof.
- Risk remains that command diagnostics, environment dumps, adapter errors, or runtime probe output could disclose tokens, paths, or secret env values; outputs must preserve existing redaction and use bounded stdout/stderr digests.

### Input trust boundaries
- Untrusted local inputs: seeded issue JSON, optional runtime smoke/evidence files, CLI flags/path arguments, cached overlay content, and fake adapter outputs used by fixture integration.
- These inputs reach subprocess execution, JSON parsing, report generation, cache-overlay persistence, and documentation/gap-ledger surfaces.

### Required mitigations for implementation
- Invoke subprocesses with argument arrays, not `shell=True` or string interpolation.
- Bound/normalize file paths to repository-local expected locations and reject missing/malformed JSON with explicit diagnostics.
- Keep live Paperclip runtime evidence optional and unvalidated unless build/version and proof artifacts exist.
- Redact secrets and never dump full environment values in reports or diagnostics.
- Include negative tests for malformed JSON, missing paths, command failure, stale/replayed evidence, and redaction behavior.

## Requirement Impact

## Requirement impact

### R-IDs touched
- **R001-R002:** A1 company-template and seven-division agent/profile/org/routing/ritual validation are included in the integrated demo closure.
- **R003:** S06 must preserve Paperclip as system of record by presenting runtime gaps rather than plugin-owned truth.
- **R004:** Runtime capability validators and proof-gated live evidence boundaries are directly re-exercised.
- **R005-R006:** BPI scoring and Product Blueprint artifact flow are part of the A3-A10 fixture integration path.
- **R007-R008:** Betting Table ranking and native approval/request path, including fallback diagnostics, are included in the integrated flow.
- **R009-R010:** Eval Gate evidence and Circuit Breaker closed/half-open/open plus polling/activity fallback envelopes must be re-verified.
- **R011:** S06 is the final balanced proof baseline for A1-A10 at repository-local contract plus fixture-integration level.
- **R012:** Adapter/persistence seams are exercised by the injected adapter, orchestration seams, and cache-overlay persistence.
- **R013:** Native-first artifact mirroring and cache-overlay non-durability are rechecked across upstream slices.

### Requirements not promoted by this slice
- Live Paperclip runtime smoke proof for currently unvalidated import/export, dashboard, approval create/read, comment readback, issue creation, activity, event, UI, and fallback-rate observability remains optional/follow-up unless version/build plus proof evidence exists.

### Must be re-tested after shipping
- `python3 scripts/run_a1_a10_demo.py` deterministic integrated demo runner.
- `python3 scripts/test_run_a1_a10_demo.py` runner/unit coverage.
- `python3 scripts/test_validate_company_template.py` and the A1 company-template validator.
- `python3 scripts/test_validate_runtime_capabilities.py`, `python3 scripts/validate_runtime_capabilities.py`, and any runtime probe guardrails.
- `npm --prefix plugin-bos-light test` including integrated demo/acceptance tests.
- `npm --prefix plugin-bos-light run typecheck`.
- `python3 scripts/validate_a1_a10_demo_docs.py` for runbook and gap-ledger consistency.

### Decisions to revisit
- No decision changes are required before S06. D001-D007 remain binding, especially the proof boundary, Paperclip-native source-of-truth, adapter seam, Betting Table coordination, and cache-overlay decisions.
- Revisit decisions only if S06 attempts to promote live Paperclip support without build/version proof, make plugin cache authoritative, or introduce a plugin-side approval/runtime engine.

## Proof Level

- This slice proves: Final-assembly proof at repository-local contract plus fixture integration level. Real live Paperclip runtime is not required for S06 completion and must remain optional/unvalidated unless version/build proof evidence is supplied. Human/UAT is not required.

## Integration Closure

Upstream surfaces consumed: S01 company-template validator and A1 evidence; S02 runtime capability matrix, validator, and probe; S03 BPI and Product Blueprint artifact flow; S04 Betting Table and approval-request orchestration; S05 Eval Gate and Circuit Breaker evidence envelopes. New wiring introduced: an integrated demo module, a repository-level demo runner, and a runbook/gap ledger that ties the slices together. Remaining after S06: only live Paperclip runtime smoke proof for currently unvalidated import/export, dashboard, approval create/read, comment readback, issue creation, activity, event, UI, and fallback-rate observability surfaces.

## Verification

- The slice adds inspection surfaces for future agents: a deterministic demo command, typed fixture demo report, docs gap ledger, per-step selected surfaces, cache-overlay diagnostics, fallback reasons, timestamps, and explicit runtime capability posture. Failure visibility should include failing phase, command, exit code, bounded stderr/stdout digest, malformed input diagnostics, and live-runtime gap entries without secrets.

## Tasks

- [x] **T01: Compose fixture demo flow** `est:2h`
  Task plan metadata: estimated_steps: 8; estimated_files: 3; skills_used: [tdd, verify-before-complete].
  - Files: `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/plugin-bos-light/src/index.ts`, `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/plugin-bos-light/src/issueBlueprintFlow.ts`, `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/plugin-bos-light/src/bettingTable.ts`, `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/plugin-bos-light/src/evalGateEvidence.ts`, `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/plugin-bos-light/src/circuitBreakerFlow.ts`, `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/plugin-bos-light/tests/acceptance.test.ts`
  - Verify: npm --prefix plugin-bos-light test -- integratedDemo.test.ts

- [x] **T02: Add repository demo runner** `est:2h`
  Task plan metadata: estimated_steps: 7; estimated_files: 2; skills_used: [tdd, verify-before-complete, error-handling-patterns].
  - Files: `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/scripts/validate_company_template.py`, `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/scripts/validate_runtime_capabilities.py`, `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/scripts/probe_paperclip_runtime.py`
  - Verify: python3 scripts/test_run_a1_a10_demo.py

- [x] **T03: Publish runbook and gap ledger** `est:1.5h`
  Task plan metadata: estimated_steps: 7; estimated_files: 5; skills_used: [write-docs, verify-before-complete].
  - Files: `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/docs/06_ACCEPTANCE_TESTS.md`, `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/docs/08_RUNTIME_CAPABILITY_HEALTH.md`, `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/docs/09_BACKLOG.md`
  - Verify: python3 scripts/validate_a1_a10_demo_docs.py

- [x] **T04: Run final closure verification** `est:45m`
  Task plan metadata: estimated_steps: 5; estimated_files: 0; skills_used: [verify-before-complete].
  - Verify: python3 scripts/run_a1_a10_demo.py && python3 scripts/test_validate_company_template.py && npm --prefix plugin-bos-light test && npm --prefix plugin-bos-light run typecheck && python3 scripts/test_validate_runtime_capabilities.py && python3 scripts/validate_runtime_capabilities.py && python3 scripts/validate_a1_a10_demo_docs.py

## Files Likely Touched

- /home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/plugin-bos-light/src/index.ts
- /home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/plugin-bos-light/src/issueBlueprintFlow.ts
- /home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/plugin-bos-light/src/bettingTable.ts
- /home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/plugin-bos-light/src/evalGateEvidence.ts
- /home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/plugin-bos-light/src/circuitBreakerFlow.ts
- /home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/plugin-bos-light/tests/acceptance.test.ts
- /home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/scripts/validate_company_template.py
- /home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/scripts/validate_runtime_capabilities.py
- /home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/scripts/probe_paperclip_runtime.py
- /home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/docs/06_ACCEPTANCE_TESTS.md
- /home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/docs/08_RUNTIME_CAPABILITY_HEALTH.md
- /home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/docs/09_BACKLOG.md
