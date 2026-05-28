# 06 - Acceptance Tests

| # | Component | Given | When | Then |
|---|---|---|---|---|
| A1 | Company Template | Fresh Paperclip company | Import BOS template | 7 agents created with AGENTS.md; org chart rendered |
| A2 | BPI Score | Issue created in backlog | Div2 calls `piko:bpi-score` or the seeded issue flow computes BPI locally | Score 0.0-1.0 is returned, cache-overlay write posture is explicit, and no plugin state is treated as durable truth |
| A3 | Blueprint Gen | Issue approved by BPI | `piko:blueprint-gen` or seeded issue flow invoked | Five-section Product Blueprint returned in a `ProductBlueprintArtifact` envelope with `artifact_id`, `artifact_ref`, `selected_surface`, `fallback`, and `mirrored_at`; native document status remains unvalidated until runtime proof |
| A4 | Betting Table | 5+ issues with BPI score | Widget/data provider renders Pitch Deck | Fixture-level provider returns top-N rows ranked by BPI with `cycle_id`, `selected_issue_ids`, opaque `blueprint_id`, and cache-overlay diagnostics; dashboard rendering remains unvalidated until live UI proof |
| A5 | Batch Approval | Betting Table with candidates | User clicks Approve Batch | Native approval adapter seam creates a Paperclip-owned request in fixture proof; otherwise comment/markdown fallback diagnostics are returned without plugin-side approval decisions |
| A6 | Eval Gate Pass | Issue in `QA_REVIEW` | All blocking gates pass | Status `ACCEPTED`; gate results in issue document |
| A7 | Eval Gate Fail | Issue in `QA_REVIEW` | Blocking gate fails | Status `CORRECTION_REQUIRED`; guidance attached |
| A8 | Circuit Breaker Close | Issue with 1 failed attempt | Retry succeeds | State `CLOSED`; `attempt_count` reset |
| A9 | Circuit Breaker Open | Issue with 3 failed attempts | 3rd failure detected | State `OPEN`; escalation issue created; alert sent |
| A10 | CB Fallback | Events unavailable | Circuit Breaker active | Polling detects failures; transitions correct |
| A11a | State: Config | Plugin state cleared | Restart plugin | BOS config reloaded from Paperclip artifacts |
| A11b | State: BPI Scores | Plugin state cleared | Restart plugin | BPI scores restored from issue documents/state |
| A11c | State: Betting Table | Plugin state cleared | Restart plugin | Current cycle restored from native issue/project |
| A11d | State: Gate Results | Plugin state cleared | Restart plugin | Gate results restored from issue comments/docs |
| A11e | State: Decisions | Plugin state cleared | Restart plugin | Decision records restored from issue comments |

## Test strategy

- Unit-test pure logic: BPI, blueprint, gates, circuit breaker transitions.
- Integration-test Paperclip SDK adapters only after state/event spike.
- E2E-test demo script once a Paperclip instance is available.

## S03 seeded issue proof and downstream handoff

Current local S03 proof covers the seeded issue path without live Paperclip runtime evidence:

- BPI is calculated from bounded inputs and hard gates.
- The Product Blueprint markdown contains the five required sections: identity, BPI, acceptance contract, resources, and QA policy.
- The artifact mirror prefers a document only when the capability posture is `confirmed` or an explicit local `enabled` seam exercise; unvalidated/failed documents fall back to comments or markdown-only diagnostics.
- The returned artifact envelope exposes `artifact_id`, `artifact_ref`, `selected_surface`, `fallback.reason`, optional adapter errors, and `mirrored_at` for inspection.
- The status overlay stores `blueprint_id = artifact.artifact_ref` and carries `cache_overlay.durability = "cache-overlay-only"` so S04 can pass the Blueprint reference into Betting Table candidates without treating cache state as recoverable truth.

Negative coverage required for A2/A3 includes adapter document failure, adapter comment failure, missing persistence, cache write failure, hard-gated BPI scores, incomplete Blueprint inputs, and absent worker registration surfaces. Runtime capability validation must continue rejecting unproven `confirmed`/native claims; S03 does not change `documents.native`, `comments.native`, or `state.issue_scoped` to confirmed.

S04 acceptance consumes `blueprint_id` as an opaque artifact reference. It must not parse `paperclip://.../documents/...`, `paperclip://.../comments/...`, or `markdown-only://...` references as approval ids, cycle ids, or proof that Paperclip-native approvals/documents exist.

## S04 Betting Table fixture proof and negative coverage

Current S04 proof is fixture-integrated and intentionally does not promote dashboard, data-provider, action, approval, entity, config, or state capabilities to live runtime support:

- Betting cycle construction ranks positive-BPI candidates descending, enforces a minimum top-N of one, excludes non-positive BPI rows, returns `cycle_id`, `selected_issue_ids`, `items`, and `cache_overlay`, and preserves native/comment/markdown/null `blueprint_id` values exactly.
- Cache-overlay persistence can save and load cycles for worker hydration in tests, but every result reports `durability: "cache-overlay-only"` and exposes missing, failed, or absent persistence explicitly.
- The worker data provider hydrates persisted S03 `blueprint_id` rows from the cache-overlay seam and returns diagnostics for missing cycle ids or missing persistence instead of crashing.
- Approve Batch delegates to the adapter seam and never calls a direct `ctx.approvals` plugin-side approval surface. A valid native adapter response returns `selected_surface: "approvals.native"`, native id/status, updated rows, and cache-overlay save status.
- When native approval support is unavailable, comment fallback can record a review request, but rows remain candidates and native approval fields stay null.
- When native and comment fallbacks fail, the flow returns `selected_surface: "markdown-only"`, a deterministic fallback ref, sanitized adapter errors, and unchanged rows.

Negative coverage protecting A4/A5 includes missing persistence, missing cache data, cache save/load failures, empty candidates, empty issue selections, stale issue ids, missing cycles, already-decided rows, malformed native approval responses, native adapter exceptions, comment fallback exceptions, cache save failure after native approval creation, absent worker cycle id, absent worker persistence, and absent adapter seams. Runtime capability validation remains responsible for rejecting promoted `confirmed` claims without live Paperclip evidence.
