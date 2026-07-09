---
id: S06
parent: M001-bo1jcm
milestone: M001-bo1jcm
provides:
  - Final repository-local A1-A10 baseline proof for BOS Light through contract plus fixture integration level.
  - Repeatable closeout command set for future agents.
  - Runbook and gap ledger documenting what is proven and what remains live-runtime follow-up.
requires:
  - slice: S01
    provides: Company-template validator and A1 evidence.
  - slice: S02
    provides: Runtime capability matrix, validator, probe, and proof boundary.
  - slice: S03
    provides: BPI scoring and Product Blueprint artifact flow.
  - slice: S04
    provides: Betting Table ranking and approval/request orchestration.
  - slice: S05
    provides: Eval Gate and Circuit Breaker evidence envelopes.
affects:
  - Milestone closeout and any future live Paperclip runtime smoke proof.
key_files:
  - plugin-bos-light/src/integratedDemo.ts
  - plugin-bos-light/src/index.ts
  - plugin-bos-light/src/issueBlueprintFlow.ts
  - plugin-bos-light/src/bettingTable.ts
  - plugin-bos-light/src/evalGateEvidence.ts
  - plugin-bos-light/src/circuitBreakerFlow.ts
  - plugin-bos-light/tests/integratedDemo.test.ts
  - scripts/run_a1_a10_demo.py
  - scripts/test_run_a1_a10_demo.py
  - scripts/validate_a1_a10_demo_docs.py
  - scripts/test_validate_a1_a10_demo_docs.py
  - docs/10_A1_A10_DEMO.md
  - docs/06_ACCEPTANCE_TESTS.md
  - docs/08_RUNTIME_CAPABILITY_HEALTH.md
  - docs/09_BACKLOG.md
key_decisions:
  - The integrated demo remains fixture-first and must not promote live Paperclip support without runtime version/build/proof evidence.
  - Runtime gaps are documented as explicit gap-ledger entries rather than simulated success claims.
  - The A1-A10 documentation validator stays standard-library only and fails closed on missing command, A-step, fixture-boundary, or gap-ledger references.
patterns_established:
  - Repository-local deterministic demo runner that composes Python validators with TypeScript fixture integration.
  - Proof-boundary fields such as `native_support_confirmed: false` and runtime posture `unvalidated` for honest runtime claims.
  - Docs validator that prevents runbook and live gap ledger drift.
observability_surfaces:
  - A1-A10 demo report with phase labels, command labels, timestamps, exit codes, bounded stdout/stderr digests, selected surfaces, failures, and gap-ledger entries.
  - Runtime capability validator guardrails for version/build/proof evidence before confirmed native support.
  - Documentation validator for runbook/gap-ledger operational drift.
drill_down_paths:
  - .gsd/milestones/M001-bo1jcm/slices/S06/tasks/T01-SUMMARY.md
  - .gsd/milestones/M001-bo1jcm/slices/S06/tasks/T02-SUMMARY.md
  - .gsd/milestones/M001-bo1jcm/slices/S06/tasks/T03-SUMMARY.md
  - .gsd/milestones/M001-bo1jcm/slices/S06/tasks/T04-SUMMARY.md
duration: ""
verification_result: passed
completed_at: 2026-05-28T06:52:33.410Z
blocker_discovered: false
---

# S06: Integrated A1 to A10 Demo

**Closed the integrated A1-A10 BOS Light baseline demo with a deterministic repository command, runbook, gap ledger, and full verification proof while keeping live Paperclip runtime support explicitly unvalidated.**

## What Happened

S06 assembled the validated upstream slices into a repeatable A1-A10 baseline demo. T01 added the typed fixture integration helper that composes seeded issue blueprint flow, Betting Table candidate ranking and approval-request orchestration, Eval Gate evidence, Circuit Breaker observation and recovery, injected adapter behavior, and cache-overlay persistence diagnostics. T02 added the repository-local demo runner and tests so a single command can execute the A1 company-template validator, A2 runtime-capability guardrail, and A3-A10 fixture integration without a live Paperclip instance. T03 published `docs/10_A1_A10_DEMO.md`, refreshed the acceptance/runtime/backlog docs, and added a documentation validator so the runbook, A-step map, fixture proof boundary, and live runtime gap ledger stay in sync. T04 ran the full closure verification set and confirmed no source edits were required for final closure. The completed slice proves final assembly at repository-local contract plus fixture-integration level only: live Paperclip import/export, dashboard, approval create/read, comment readback, issue creation, activity, event, UI, and fallback-rate observability surfaces remain gap-ledger items until separate runtime version/build/proof evidence is supplied.

## Operational Readiness

Health signal: `python3 scripts/run_a1_a10_demo.py` exits 0 and emits an A1-A10 report with `status: passed`, no phase failures, evidence references for A1 through A10, `native_support_confirmed: false`, runtime posture `unvalidated`, and explicit gap-ledger entries for unproven live Paperclip surfaces. The docs health signal is `python3 scripts/validate_a1_a10_demo_docs.py` exiting 0, proving the runbook, command references, A-step map, proof boundary, and gap ledger remain present.

Failure signal: any non-zero exit from the closure command set, any demo report phase failure, malformed/missing JSON diagnostics, missing runbook/gap-ledger references, or any attempt to promote native support without live runtime version/build/proof evidence should block release. The demo runner records command labels, phase names, exit codes, bounded stdout/stderr digests, timestamps, and failure lists so operators and future agents can identify the broken phase without dumping secrets.

Recovery procedure: rerun the failing command directly from the repository worktree, inspect the referenced `.gsd/exec/<id>.stdout` and `.stderr` evidence plus the generated demo report/gap ledger, fix the failing validator/plugin/docs surface in its owning slice area, and rerun the full S06 closure verification before changing runtime posture. If live Paperclip evidence is added later, first update the runtime capability matrix with version/build/proof artifacts and rerun `python3 scripts/validate_runtime_capabilities.py`; do not edit reports to claim support manually.

Monitoring gaps: S06 has no deployed service, background job, dashboard, or live Paperclip monitor. Operational readiness is deterministic local CLI evidence only; continuous monitoring of live Paperclip runtime surfaces remains future work and is intentionally not claimed by this baseline.

## Verification

Fresh closeout verification was run through `gsd_exec` in this retry. Command: `python3 scripts/run_a1_a10_demo.py; python3 scripts/test_validate_company_template.py; npm --prefix plugin-bos-light test; npm --prefix plugin-bos-light run typecheck; python3 scripts/test_validate_runtime_capabilities.py; python3 scripts/validate_runtime_capabilities.py; python3 scripts/validate_a1_a10_demo_docs.py`. Exit code: 0. Duration: 4141 ms. Evidence: `.gsd/exec/0009a0be-276d-46a2-98a0-a096ef3b217e.stdout` and `.gsd/exec/0009a0be-276d-46a2-98a0-a096ef3b217e.stderr`. The digest shows TypeScript `tsc --noEmit` succeeded, runtime capabilities validated, A1-A10 docs validated, and `S06_CLOSEOUT_VERIFICATION=passed`. Prior T04 closure evidence also recorded plugin Vitest coverage as 7 files / 63 tests passing and the demo posture as honest-unvalidated with no phase failures.

## Requirements Advanced

- R001-R008 — included in the integrated A1-A10 baseline proof through upstream validators and fixture orchestration.
- R011-R013 — supported by final assembly proof, adapter/persistence seam exercise, and native-first artifact mirroring boundaries.
- R014 — advanced by validating the Div7 Strategy profile as part of the seven-division company template and by preserving native-first/cache-overlay artifact boundaries that future Div7 decision-record protocol work can consume without shipping that full protocol in M001.

## Requirements Validated

- R009 — S06 re-ran integrated demo, plugin tests, typecheck, runtime capability validators, and docs validation; Eval Gate evidence remains part of the A1-A10 fixture baseline without claiming live runtime comment/readback support.
- R010 — S06 re-ran integrated demo, plugin tests, typecheck, runtime capability validators, and docs validation; Circuit Breaker observation and fallback evidence remain covered at contract plus fixture integration level.

## New Requirements Surfaced

- No new requirements surfaced.

## Requirements Invalidated or Re-scoped

None.

## Operational Readiness

None.

## Deviations

None at slice closeout. T03 added `scripts/test_validate_a1_a10_demo_docs.py` beyond the original validator plan to provide executable negative coverage for documentation drift.

## Known Limitations

Live Paperclip runtime support remains unvalidated by design. The slice does not prove import/export, dashboard, approval create/read, comment readback, issue creation, activity, event, UI, or fallback-rate observability support in a real Paperclip runtime.

## Follow-ups

When a live Paperclip runtime is available, collect version/build/proof evidence, update the runtime capability matrix, rerun `python3 scripts/validate_runtime_capabilities.py`, and append live smoke evidence to the runbook without changing the fixture-first baseline proof boundary.

## Files Created/Modified

- `plugin-bos-light/src/integratedDemo.ts` — Added typed integrated fixture demo composition for A3-A10 orchestration seams.
- `scripts/run_a1_a10_demo.py` — Added repository-local deterministic runner for A1, A2, and A3-A10 baseline proof.
- `docs/10_A1_A10_DEMO.md` — Published runbook, evidence map, proof boundary, and live runtime gap ledger.
- `scripts/validate_a1_a10_demo_docs.py` — Added fail-closed documentation validator for S06 runbook and gap-ledger consistency.
