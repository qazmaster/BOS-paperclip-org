# S04: Betting Table Native Approval Request — UAT

**Milestone:** M001-bo1jcm
**Written:** 2026-05-28T05:15:16.142Z

# UAT: S04 Betting Table Native Approval Request

## UAT Type
Contract and fixture-integrated automated UAT. Real Paperclip runtime access is not required and no live dashboard, data-provider, approval, state, or entity support is claimed.

## Preconditions
- S01-S03 are complete and S03 supplies issue rows with bounded BPI scoring and opaque Product Blueprint artifact refs in `status_overlay.blueprint_id`.
- `plugin-bos-light` dependencies are installed.
- A fixture or fake worker context can supply optional `persistence` and `paperclipAdapter` seams.
- Runtime capability docs/manifests still mark unproven Paperclip approvals, data/actions, UI, state, config, and entity surfaces as unvalidated or fallback-only.

## Steps and Expected Outcomes
1. Build a Betting Table cycle from candidate issues containing positive, zero, negative, and missing BPI values.
   - Expected: only positive BPI candidates are ranked; rows are sorted by BPI descending; top-N remains bounded; null or opaque `blueprint_id` values are preserved exactly and never interpreted as approval ids.
2. Save and load a Betting cycle through the cache-overlay persistence seam.
   - Expected: responses include `cycle_id`, `items`, timestamped cache-overlay diagnostics, and sanitized save/load errors when failures are simulated; missing persistence or missing cycle data returns explicit diagnostics rather than throwing.
3. Hydrate the worker `betting-table` data provider with a valid cycle id.
   - Expected: provider returns the persisted cycle rows and diagnostics from exactly one cache-overlay load; missing cycle id or missing persistence returns empty items plus explicit diagnostics.
4. Invoke `approve-batch` with a valid cycle id, selected issue ids present in the cycle, and a fake `PaperclipAdapter.createApprovalRequest` that returns a valid native request id/status.
   - Expected: native approval request creation occurs only through the adapter seam; selected rows are marked `approval-requested` only after the valid native response; updated rows are saved once; the result includes native approval id/status and cache-overlay save diagnostics.
5. Invoke `approve-batch` when native approval support is unavailable or throws.
   - Expected: the result records `approvals.native:unavailable` or sanitized native error diagnostics, attempts a single comment fallback when available, and otherwise returns a `markdown-only://betting-cycles/<cycle_id>/approval-request` ref without mutating or persisting row approval state.
6. Run the closeout command.
   - Expected: `npm --prefix plugin-bos-light test && npm --prefix plugin-bos-light run typecheck && python3 scripts/validate_runtime_capabilities.py` exits 0; tests report 33 passing tests; typecheck passes; runtime capability validator reports mapped manifest surfaces, adapter assumptions, and guardrail fields.

## Edge Cases to Exercise
- Empty candidates and `top_n <= 0`.
- Zero or negative BPI candidates.
- Null and opaque `blueprint_id` values.
- Missing persistence, missing cache data, cache load failure, and cache save failure.
- Empty `issue_ids`, stale issue id, missing cycle id, missing cycle, and already-requested/decided rows.
- Adapter unavailable, native adapter throws, malformed native approval id/status, comment fallback unavailable, and comment fallback throws.
- Confirm `ctx.approvals` is not called directly and fallback artifacts are not reported as native approvals.

## Operational Readiness
- Health signal: automated tests/typecheck/validator pass, and runtime responses include explicit cycle, selected issue, selected surface, cache-overlay, fallback, and sanitized error diagnostics.
- Failure signal: response diagnostics show missing/stale inputs, unavailable native approvals, malformed native responses, comment fallback failure, or cache-overlay failure; validator failure indicates docs/manifests/source overclaimed runtime support.
- Recovery: retry with a valid persisted cycle and selected issue ids, restore adapter/persistence seams, use comment/markdown fallback diagnostics, and treat native Paperclip approval as authoritative if cache save fails after native creation.
- Monitoring gaps: live Paperclip dashboard visibility, native approval create/read evidence, fallback-rate metric, and alert wiring are deferred to S06/live-runtime proof.
