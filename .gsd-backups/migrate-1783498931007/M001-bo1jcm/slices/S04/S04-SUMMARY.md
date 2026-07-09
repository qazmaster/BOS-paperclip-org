---
id: S04
parent: M001-bo1jcm
milestone: M001-bo1jcm
provides:
  - A persisted Betting cycle contract and worker hydration path for ranked BPI candidates.
  - An approve-batch action that can create native Paperclip approval requests through the adapter seam where runtime support exists.
  - Explicit fallback diagnostics when native approvals or comments are unavailable.
  - Acceptance tests and docs proving S04 behavior without claiming live runtime support.
requires:
  - slice: S03
    provides: S03 Product Blueprint artifact refs in `status_overlay.blueprint_id`, consumed opaquely by Betting Table rows.
affects:
  - S05: Eval Gates can consume the same explicit diagnostic/fallback approach for visible evidence and safe failure behavior.
  - S06: Integrated demo can exercise Betting Table ranking, worker hydration, adapter-mediated approval request, and documented runtime gaps.
key_files:
  - plugin-bos-light/src/bettingTable.ts
  - plugin-bos-light/src/contracts.ts
  - plugin-bos-light/src/persistence.ts
  - plugin-bos-light/src/paperclipAdapter.ts
  - plugin-bos-light/src/worker.ts
  - plugin-bos-light/src/index.ts
  - plugin-bos-light/tests/acceptance.test.ts
  - plugin-bos-light/src/runtimeCapabilities.ts
  - plugin-bos-light/capabilities.paperclip-runtime.json
  - scripts/validate_runtime_capabilities.py
  - docs/04_DATA_CONTRACTS.md
  - docs/05_PERSISTENCE_MATRIX.md
  - docs/06_ACCEPTANCE_TESTS.md
  - docs/08_RUNTIME_CAPABILITY_HEALTH.md
  - docs/09_BACKLOG.md
key_decisions:
  - Betting cycle persistence diagnostics remain cache-overlay-only and never claim durable native Paperclip truth.
  - S03 `blueprint_id` remains opaque and is passed through without reinterpretation as approval id or plugin-state key.
  - Approve Batch creates native approval requests only through the Paperclip adapter seam; direct `ctx.approvals` calls are not used.
  - Fallback comment and markdown artifacts are diagnostic-only and never mutate row status or claim native approval success.
  - No unproven runtime capability was promoted; S04 documentation describes fixture-level proof only.
patterns_established:
  - Adapter-mediated native request orchestration with schema validation before any local cache-overlay mutation.
  - Worker data providers return explicit diagnostics rather than throwing for missing cycle id, persistence, or cache rows.
  - Native success and diagnostic fallback paths share the same approval envelope, but only native success carries approval id/status.
  - Cache-overlay failures are reported without making plugin cache authoritative over Paperclip-native evidence.
observability_surfaces:
  - Betting cycle diagnostics: `cycle_id`, cache-overlay persistence/load/save status, timestamp, and sanitized cache errors.
  - Approval diagnostics: selected issue ids, `selected_surface`, native approval id/status only on validated native response, fallback artifact ref, fallback reason, sanitized native/comment/cache errors.
  - Runtime capability validator output guarding against promoted unvalidated Paperclip surfaces.
  - Docs/backlog inspection surfaces for S06 live fallback-rate and dashboard hydration follow-ups.
drill_down_paths:
  - .gsd/milestones/M001-bo1jcm/slices/S04/tasks/T01-SUMMARY.md
  - .gsd/milestones/M001-bo1jcm/slices/S04/tasks/T02-SUMMARY.md
  - .gsd/milestones/M001-bo1jcm/slices/S04/tasks/T03-SUMMARY.md
  - .gsd/milestones/M001-bo1jcm/slices/S04/tasks/T04-SUMMARY.md
  - .gsd/exec/aeeafcc5-1498-4eb5-93ee-a61a86e5b27d.stdout
duration: ""
verification_result: passed
completed_at: 2026-05-28T05:15:16.141Z
blocker_discovered: false
---

# S04: Betting Table Native Approval Request

**Implemented and verified fixture-integrated Betting Table cycle persistence, worker hydration, and adapter-mediated approve-batch requests with explicit fallback diagnostics and no plugin-owned approval state.**

## What Happened

S04 delivered the contract-level Betting Table approval path on top of the S03 blueprint artifact flow. The implementation ranks valid candidates by bounded BPI, preserves each S03 `blueprint_id` as an opaque artifact reference, persists cycle rows only through the cache-overlay seam, and hydrates worker data providers from a requested cycle id or returns explicit diagnostics for missing cycle id, missing persistence, or missing cache rows.

Approve Batch now validates non-empty selected issue ids against the persisted cycle, rejects stale or non-requestable rows, and delegates native approval creation only through `PaperclipAdapter.createApprovalRequest`. Rows are marked `approval-requested` and re-saved only after a valid native approval request id/status is returned. When native approvals are unavailable, fail, or return malformed data, the flow attempts the documented comment fallback and then markdown-only fallback; fallback artifacts are diagnostic-only and never claim native approval truth or mutate approval status.

Worker registration exposes the Betting Table helpers, wires the `betting-table` data provider to `loadBettingCycle`, and wires `approve-batch` to `requestBettingCycleApproval` through `ctx.paperclipAdapter`/`ctx.paperclip` rather than direct `ctx.approvals` calls. Acceptance coverage proves fake ctx registration, S03 blueprint id preservation, data-provider hydration, native adapter success with persistence updates, adapter-unavailable fallback diagnostics, missing-cycle/missing-persistence no-crash behavior, stale selections, malformed native responses, comment fallback failure, and cache save failure after native creation.

Documentation and runtime guardrails were aligned without promoting any unproven runtime capability. Data contracts now describe Betting cycle and approval request envelopes, persistence docs keep cache rows overlay-only, acceptance docs describe fixture proof for A4/A5, runtime capability health keeps approvals/data/actions/UI/entities/config/state unvalidated or fallback-only, and backlog docs carry live Paperclip follow-ups for S06.

## Operational Readiness

Health signal: the slice is healthy when `npm --prefix plugin-bos-light test`, `npm --prefix plugin-bos-light run typecheck`, and `python3 scripts/validate_runtime_capabilities.py` all pass, and Betting Table responses expose `cycle_id`, selected issue ids, `selected_surface`, cache-overlay `save`/`load` diagnostics, sanitized errors, and native approval request id/status only on validated adapter success.

Failure signal: failures surface as explicit response diagnostics such as `missing_cycle_id`, `missing_cycle`, `empty_issue_ids`, `stale_issue_id:<id>`, `approvals.native:unavailable`, `native_response_malformed`, comment fallback errors, or `cache_overlay.save: failed`; the runtime capability validator should fail if docs/manifests/source boundaries overclaim native support.

Recovery procedure: inspect the returned approval/cycle diagnostics, retry with a valid persisted `cycle_id` and selected issue ids, restore or supply the Paperclip adapter/persistence seam, or route to the comment/markdown fallback artifact. If native approval creation succeeded but cache save failed, treat Paperclip native approval as authoritative and rebuild the cache overlay from Paperclip evidence rather than trusting plugin cache state.

Monitoring gaps: no live Paperclip runtime dashboard, approval create/read, fallback-rate metric, or alert integration is proven in S04. These remain documented S06/live-runtime follow-ups; this slice proves contract and fixture behavior only.

## Verification

Fresh closeout verification passed through the required closeout-safe surface: `gsd_exec[aeeafcc5-1498-4eb5-93ee-a61a86e5b27d]` ran `npm --prefix plugin-bos-light test && npm --prefix plugin-bos-light run typecheck && python3 scripts/validate_runtime_capabilities.py` with exit code 0 in 2851ms. Vitest reported 4 passed test files and 33 passed tests (`circuitBreaker`, `bpi`, `blueprintArtifact`, and `acceptance`); TypeScript `tsc --noEmit` passed; the runtime capability validator reported: `Paperclip runtime capabilities OK: manifest surfaces, adapter assumptions, and guardrail fields are mapped.` Task summaries T01-T04 also record passing test/typecheck/validator evidence and no known implementation regressions.

## Requirements Advanced

- R003 — Maintained Paperclip as system of record by treating Betting cycles as cache overlays and fallbacks as diagnostics, not approval truth.
- R004 — Kept unproven approval/data/action/UI/state capabilities unvalidated or fallback-only in docs and runtime capability guardrails.
- R011 — Added contract and fixture proof for Betting Table and approval paths while avoiding live runtime overclaims.
- R012 — Isolated native approval creation behind `PaperclipAdapter.createApprovalRequest` and preserved independently testable pure Betting Table logic.
- R013 — Exposed approval request artifacts/comments/fallback refs while treating cache persistence as diagnostic overlay.

## Requirements Validated

- R007 — Acceptance tests and closeout verification prove top-N Betting Table BPI ranking, invalid/zero/negative BPI exclusion, opaque `blueprint_id` preservation, cycle persistence, and worker data-provider hydration.
- R008 — Acceptance tests and closeout verification prove approve-batch validation, adapter-only native request creation, native id/status validation, diagnostic-only fallbacks, and no plugin-side approval engine.

## New Requirements Surfaced

None.

## Requirements Invalidated or Re-scoped

None.

## Operational Readiness

None.

## Deviations

None.

## Known Limitations

S04 proves contract and fixture behavior only. Live Paperclip runtime support for dashboard hydration, native approval create/read, fallback-rate observability, plugin state, entities, config, and UI slots remains unvalidated or fallback-only until S06/live-runtime evidence exists.

## Follow-ups

S06 should run an integrated A1-A10 demo against real or documented Paperclip runtime support, collect evidence for native approval create/read if available, and add live observability for fallback rates and dashboard/data provider health before any runtime capability is promoted.

## Files Created/Modified

- `plugin-bos-light/src/bettingTable.ts` — Added Betting cycle build/save/load orchestration, approval request flow, diagnostics, fallback handling, and row mutation rules.
- `plugin-bos-light/src/contracts.ts` — Added approval envelope/result contract types.
- `plugin-bos-light/src/persistence.ts` — Supported Betting Table persistence seam used by cycle orchestration.
- `plugin-bos-light/src/paperclipAdapter.ts` — Exposed adapter seam for native approval request creation.
- `plugin-bos-light/src/worker.ts` — Wired Betting Table data provider and approve-batch action through persistence and adapter seams with diagnostics.
- `plugin-bos-light/src/index.ts` — Exported or surfaced S04 worker/tool wiring.
- `plugin-bos-light/tests/acceptance.test.ts` — Added contract and worker acceptance coverage for ranking, persistence, hydration, native approval, fallback, and negative cases.
- `docs/04_DATA_CONTRACTS.md` — Documented Betting cycle and approval envelopes and mutation/fallback rules.
- `docs/05_PERSISTENCE_MATRIX.md` — Documented Betting Table cache-overlay persistence and Paperclip-owned native approval truth.
- `docs/06_ACCEPTANCE_TESTS.md` — Documented S04 fixture proof and negative coverage.
- `docs/08_RUNTIME_CAPABILITY_HEALTH.md` — Kept runtime approval/data/action/UI surfaces unvalidated or fallback-only and recorded S04 inspection surfaces.
- `docs/09_BACKLOG.md` — Added live-runtime follow-ups for dashboard hydration, native approval create/read, and fallback-rate observability.
- `plugin-bos-light/capabilities.paperclip-runtime.json` — Maintained runtime capability guardrails for unproven surfaces.
- `scripts/validate_runtime_capabilities.py` — Maintained validator guardrails for manifest, docs, and source assumptions.
