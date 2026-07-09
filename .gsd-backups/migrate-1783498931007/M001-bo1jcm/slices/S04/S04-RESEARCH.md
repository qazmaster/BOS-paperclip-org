# S04: Betting Table Native Approval Request Research

## Summary
S04 already has the core pure-selection primitive and approval-request shaping helpers, but the runtime orchestration is still thin. `plugin-bos-light/src/bettingTable.ts` can build a top-N table from opaque `blueprint_id` values, and it can mark a row as approval-requested or decided. However, `plugin-bos-light/src/worker.ts` currently registers a `betting-table` data provider that returns `[]` and an `approve-batch` action that simply forwards to `ctx.approvals?.create` without cycle lookup, persistence, or fallback handling.

The main constraint is proof-gated runtime support: `approvals.native`, `ui.dashboard_widgets`, `registration.data`, `entities.api`, and `state.company_scoped` are all still `unvalidated`/`fallback-only` in `docs/08_RUNTIME_CAPABILITY_HEALTH.md`. So S04 must treat Betting Table as a coordination view and keep `blueprint_id` opaque (`artifact_ref`), not as an approval id or durable plugin-state key.

## Relevant Requirements
- **R007** — prepare Betting Table work by returning a stable `blueprint_id` artifact reference for ranked candidates.
- **R008** — create or update a Paperclip-native approval/request when runtime support allows; do not implement approval governance inside the plugin.
- **R012** — route native artifact behavior through adapter and persistence seams with covered fallback/error paths.
- **R013** — preserve native-first mirroring semantics with explicit comment/markdown-only fallback metadata.
- Supporting constraints from **R003/R004**: Paperclip remains the system of record, and unproven runtime surfaces must not be claimed as native support.

## Implementation Landscape

### Existing files that matter
- `plugin-bos-light/src/bettingTable.ts` — pure top-N ranking plus `markApprovalRequested` / `markNativeApprovalDecided`.
- `plugin-bos-light/src/worker.ts` — tool/action registration. Current `approve-batch` flow returns raw approval output and does not persist a betting cycle.
- `plugin-bos-light/src/persistence.ts` — in-memory `saveBettingTable` / `getBettingTable` exist, but worker does not currently use them.
- `plugin-bos-light/src/contracts.ts` — defines `BettingTableItem` fields, including `blueprint_id`, `native_approval_request_id`, and approval status fields.
- `plugin-bos-light/src/paperclipAdapter.ts` — adapter seam exposes `createApprovalRequest`, but the in-memory adapter is only a test double.
- Docs: `docs/04_DATA_CONTRACTS.md`, `docs/05_PERSISTENCE_MATRIX.md`, `docs/06_ACCEPTANCE_TESTS.md`, `docs/08_RUNTIME_CAPABILITY_HEALTH.md`, `docs/09_BACKLOG.md`.

### What already works
- `buildBettingTable` filters out non-positive BPI scores, sorts descending, and returns at least one row when candidates exist.
- `markApprovalRequested` already captures the native approval request id and approved-by metadata.
- The docs already require `blueprint_id` to remain an opaque `artifact_ref` and explicitly warn against approval/request scope bleed.

### What is missing
- No orchestration path loads/saves a current betting cycle via persistence.
- No code updates a table row after a native approval request is created.
- No fallback path exists for environments where `approvals.native` is unavailable; current code just returns whatever optional chaining yields.
- No runtime proof exists for dashboard data-provider hydration or the `betting-table` widget surface.

## Natural Seams
1. **Pure ranking seam** — `buildBettingTable` remains a deterministic sorter/filterer and should stay UI/runtime-agnostic.
2. **Action orchestration seam** — `worker.ts` should own the host-specific `approve-batch` flow and convert the pure table row into a native approval request or an explicit fallback artifact.
3. **Cycle persistence seam** — `InMemoryBOSPersistence` already has betting-table storage; this is the obvious place to connect cycle load/save behavior once the orchestration exists.
4. **Runtime boundary seam** — approval, data-provider, and dashboard widget support are all proof-gated; code must not promote them beyond the capability matrix.

## First Proof
The highest-value proof is a single end-to-end testable path that:
1. feeds S03 `blueprint_id` values into `buildBettingTable`,
2. persists the ranked cycle, and
3. on `approve-batch`, creates a Paperclip-native approval request when the adapter/host surface is present, otherwise emits an explicit fallback artifact/comment without pretending approval succeeded.

That proves the stable handoff from S03 to S04 and keeps approval ownership with Paperclip rather than plugin-side state.

## Verification
- `npm --prefix plugin-bos-light test` — add/extend tests for ranking, opaque `blueprint_id` passthrough, and approval-request orchestration.
- `npm --prefix plugin-bos-light run typecheck` — verify worker/action signatures and contract usage.
- `python3 scripts/validate_runtime_capabilities.py` — ensure docs/manifest/source boundary still classify approvals/data/UI surfaces as unvalidated unless real proof exists.

## Notes / Skills
- The installed `observability` skill is relevant if this slice starts tracking repeated approval fallback or missing-widget behavior.
- The installed `api-design` / `design-an-interface` skills are useful only if the approval-request payload or betting-cycle contract needs reshaping; otherwise the current contract is intentionally minimal and opaque-reference oriented.

## Planner-facing takeaway
S04 should probably split into: (1) cycle table persistence/orchestration, (2) approve-batch native/fallback handling, and (3) docs/tests alignment for opaque `blueprint_id` and unvalidated dashboard/data-provider surfaces.