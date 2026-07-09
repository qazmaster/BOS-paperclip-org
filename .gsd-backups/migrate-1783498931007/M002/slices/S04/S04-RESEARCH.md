# S04 — Research

**Date:** 2026-05-29

## Summary

Live Paperclip issue, comment, and document create/readback is already proven at the sandbox API layer and recorded in `PAPERCLIP_LIVE_VALIDATION_REPORT.md` (`POST /api/companies/{companyId}/issues`, `POST/GET /api/issues/{issueId}/comments`, `PUT/GET /api/issues/{issueId}/documents/{key}`). However, the BOS Light codebase still treats those native surfaces as unvalidated/fallback-only in `plugin-bos-light/capabilities.paperclip-runtime.json`, and the only concrete adapter implementation in-repo is still the test-only `InMemoryPaperclipAdapter`.

The artifact-flow code is already well-factored into seam-based envelopes: `issueBlueprintFlow.ts` for Product Blueprint mirroring, `bettingTable.ts` for cycle/approval envelopes, `evalGateEvidence.ts` for gate evidence, and `circuitBreakerFlow.ts` for escalation/polling fallback. `integratedDemo.ts` composes those seams into a fixture-only A1-A10 report with `native_support_confirmed: false`, so it must not be used as live runtime proof.

For S04, the right direction is to build the live visible-artifact flow around the existing envelope contracts and the supported issue/comment/document APIs, while keeping Hermes as a no-go guard. Do not depend on `hermes_local` execution until the S02 secret-materialization blocker is fixed, and do not promote approvals, data-provider, dashboard, or issue-tab claims without their own live proof.

## Recommendation

1. First proof should be a bounded live round-trip on visible artifacts only: create/read one issue, mirror one Blueprint, and verify the returned refs and redacted fallback diagnostics.
2. Reuse the existing envelope serializers and fallback semantics instead of inventing a new artifact format; add only thin boundary code or a dedicated probe script if live API wiring is needed.
3. Keep Betting Table approval, dashboard/data-provider, issue-detail-tab, state, entity, activity, and event claims conservative until their runtime surfaces are explicitly proven.
4. If Div4 quality checks are required in this slice, use the S03-style guard: call GSD-Pi only after registry readback, `testEnvironment`, and `BosAdapterResult` execution proof exist; otherwise record that branch as blocked rather than pretending success.

## Implementation Landscape

### Key Files

- `plugin-bos-light/src/issueBlueprintFlow.ts` — Product Blueprint artifact envelope and cache-overlay writes; the natural seam for live document/comment mirroring.
- `plugin-bos-light/src/bettingTable.ts` — Betting cycle ranking and approval-request envelope; preserves opaque `blueprint_id` values and returns native/comment/markdown fallback diagnostics.
- `plugin-bos-light/src/evalGateEvidence.ts` — Gate-evidence envelope with comment-first visibility and markdown fallback.
- `plugin-bos-light/src/circuitBreakerFlow.ts` — OPEN escalation via issue/comment/markdown, activity diagnostics, and polling posture.
- `plugin-bos-light/src/worker.ts` — Draft host registration layer; still optional-chaining wiring, so runtime support is unproven.
- `plugin-bos-light/src/paperclipAdapter.ts` / `plugin-bos-light/src/persistence.ts` — only adapter/persistence seams today; the in-memory classes are test helpers, not live host proof.
- `plugin-bos-light/src/integratedDemo.ts` — fixture-only A1-A10 composition with explicit runtime-gap ledger and `native_support_confirmed: false`.
- `docs/05_PERSISTENCE_MATRIX.md`, `docs/06_ACCEPTANCE_TESTS.md`, `docs/08_RUNTIME_CAPABILITY_HEALTH.md`, `docs/09_BACKLOG.md`, `docs/10_A1_A10_DEMO.md` — the contract/posture docs that must stay synchronized with any runtime claim.
- `PAPERCLIP_LIVE_VALIDATION_REPORT.md` — current live proof ledger for issue/comment/document APIs and Hermes/GSD-Pi blockers.
- `plugin-bos-light/capabilities.paperclip-runtime.json` — source of truth for capability promotion; currently conservative/unvalidated.

### Build Order

1. Lock the live visible-artifact path against the already-observed issue/comment/document APIs and capture one bounded end-to-end round-trip.
2. If live artifact flow needs runtime wiring, add only thin boundary code around the existing envelopes; do not change the pure logic modules first.
3. After visible artifacts are stable, decide whether Betting Table approvals need native approval proof or must stay comment/markdown diagnostic-only.
4. Defer UI/data-provider/action/state/event promotion to later slices unless the planner can pair each claim with explicit runtime evidence.

### Verification Approach

- Use the supported live issue APIs already observed in the report: create issue, create/read comment, create/read document, then assert the refs and markdown match the envelope output.
- Verify all fallback diagnostics remain bounded/redacted and that `blueprint_id` stays opaque in Betting Table rows.
- Re-run `python3 scripts/validate_runtime_capabilities.py` plus the relevant docs/matrix validators after any posture change.
- Do **not** use `runA1ToA10FixtureDemo` output as live proof; it is fixture-only and must remain `native_support_confirmed=false`.

## Don't Hand-Roll

| Problem | Existing solution | Why use it |
|---|---|---|
| Blueprint / gate / circuit artifact serialization | Existing envelope builders in `issueBlueprintFlow.ts`, `evalGateEvidence.ts`, `circuitBreakerFlow.ts` | They already encode surface-qualified refs and fallback diagnostics. |
| Betting cycle and approval fallback semantics | `bettingTable.ts` | It already handles opaque `blueprint_id`, native/comment/markdown fallback, and cache-overlay diagnostics. |
| A1-A10 orchestration | `integratedDemo.ts` | It composes the seams without claiming live runtime support. |

## Constraints

- Paperclip core is read-only; no core patches, direct DB writes, monkey patches, or private imports.
- Hermes agent execution is a no-go until secret materialization is fixed; S04 must not depend on Hermes-backed live agents.
- `approvals.native`, `registration.data`, `ui.dashboard_widgets`, `ui.issue_detail_tabs`, `state.*`, `entities.*`, `activity.logging`, and `events.*` remain unvalidated/fallback-only until separately proven.

## Common Pitfalls

- Treating `InMemoryPaperclipAdapter` or fixture seams as live host support.
- Treating `paperclip://.../documents/...` or `paperclip://.../comments/...` as approval ids or as proof of durable state.
- Promoting the GSD-Pi branch without S03-style registry/testEnvironment/BosAdapterResult proof.
- Letting fallback diagnostics leak raw secrets or newline/tab noise.

## Open Risks

- Native approval/request support still lacks live create/read proof.
- Dashboard/data-provider/UI-tab surfaces are still unproven, so the planner may need managed issue/project or markdown fallbacks for the visible artifact flow.
- The live issue/comment/document proof exists in the report but not yet in a reusable host adapter module; the planner should decide whether to centralize that boundary or keep it as a dedicated probe script.
- No live runtime version/build or plugin-registration proof exists for BOS Light yet.

## Skills Discovered

| Technology | Skill | Status |
|---|---|---|
| Paperclip HTTP/runtime surfaces | `api-design` | available |
| Runtime evidence and fallback posture | `observability` | available |
| Report/matrix authoring | `write-docs` | available |
| Change review before closure | `review` / `security-review` | available |

## Sources

- `PAPERCLIP_LIVE_VALIDATION_REPORT.md`
- `docs/08_RUNTIME_CAPABILITY_HEALTH.md`
- `docs/05_PERSISTENCE_MATRIX.md`
- `docs/06_ACCEPTANCE_TESTS.md`
- `plugin-bos-light/src/issueBlueprintFlow.ts`
- `plugin-bos-light/src/bettingTable.ts`
- `plugin-bos-light/src/evalGateEvidence.ts`
- `plugin-bos-light/src/circuitBreakerFlow.ts`
- `plugin-bos-light/src/worker.ts`
- `plugin-bos-light/src/paperclipAdapter.ts`
- `plugin-bos-light/src/persistence.ts`
- `plugin-bos-light/src/integratedDemo.ts`
- `plugin-bos-light/capabilities.paperclip-runtime.json`