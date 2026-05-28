# 09 - Initial Backlog

## Epic 1 - Company Template

- [ ] Create 7 division agent profiles.
- [ ] Create org chart and reporting lines.
- [ ] Create task routing rules.
- [ ] Create company rituals.
- [ ] Validate import/export against current Paperclip.
- [ ] Pass A1.

## Epic 2 - Minimal Plugin Spike

- [ ] Check SDK version and current plugin runtime.
- [ ] C2 event emission spike.
- [ ] C3 state spike.
- [ ] C7 capability set confirmation.
- [ ] Decide native artifacts for approvals, comments, issue docs.

## Epic 3 - BPI and Blueprint

- [ ] Implement BPI pure function.
- [ ] Implement BPI agent tool adapter.
- [ ] Implement issue annotation/storage as cache-overlay-only until `state.issue_scoped` read/write/restart proof exists.
- [ ] Implement 5-section blueprint generator.
- [ ] Mirror blueprint into Product Blueprint artifact envelope with native document preference, comment fallback, and markdown-only fallback diagnostics.
- [ ] Prove `documents.native` and `comments.native` create/read behavior in a live Paperclip runtime before treating Blueprint artifacts as native host support.
- [ ] Pass A2-A3.

## Epic 4 - Betting Table

- [ ] Implement top-N selection by BPI.
- [ ] Implement dashboard data provider.
- [ ] Prove dashboard data-provider hydration in a live Paperclip runtime before claiming Pitch Deck UI support.
- [ ] Carry S03 `blueprint_id` through as an opaque artifact reference (`paperclip://.../documents/...`, `paperclip://.../comments/...`, or `markdown-only://...`) without approval/request scope bleed.
- [ ] Implement Approve Batch action.
- [ ] Implement adapter-seam path for Paperclip-native approval/request once live proof exists.
- [ ] Prove native approval/request create/read in a live Paperclip runtime; until then keep comment/markdown fallbacks diagnostic-only.
- [ ] Add fallback-rate observability for approval native/comment/markdown outcomes and cache-overlay save/load errors.
- [ ] Mirror cycle state to native issue/project.
- [ ] Pass A4-A5.

## Epic 5 - Safety Loop

- [ ] Implement Eval Gates.
- [ ] Keep `piko:eval-gate` pure and expose `piko:eval-gate-evidence` as the explicit evidence-mirroring tool; prove tool registration/invocation in a live Paperclip runtime before claiming host availability.
- [ ] Persist gate results as cache-overlay-only diagnostics and mirror pass/fail guidance to comment or markdown-only evidence until `comments.native` create/read proof exists.
- [ ] Implement Circuit Breaker pure state machine.
- [ ] Expose `piko:circuit-breaker-observe` for one bounded observation at a time with CLOSED, HALF_OPEN, and OPEN envelopes; do not claim background event support without C2/C7 proof.
- [ ] Implement run polling fallback with active-runs-only scope, jitter/backoff, and activity/comment/manual fallback; keep terminal run events fallback-only until live emitted-event evidence exists.
- [ ] Create escalation issue on OPEN through the adapter seam when available, but keep native issue creation unvalidated until live create/read proof; otherwise fall back to comment or markdown-only instructions.
- [ ] Add fallback-rate observability for gate evidence surface, circuit evidence surface, cache-overlay get/save failures, escalation issue/comment fallback, and activity-log failures.
- [ ] Pass A6-A10.

## Epic 6 - State Resilience

- [ ] Clear plugin state in test environment.
- [ ] Restore config.
- [ ] Restore BPI scores.
- [ ] Restore current cycle.
- [ ] Restore gate results.
- [ ] Restore decisions.
- [ ] Pass A11a-e.

## Epic 7 - Div7 Decision Protocol

- [ ] Collect usage traces.
- [ ] Define trigger conditions.
- [ ] Implement Cynefin classifier.
- [ ] Implement OODA recommendation.
- [ ] Store decision record in issue comments/documents.

## Epic 8 - A1-A10 Integrated Demo and Live Runtime Closure

- [x] Publish the fixture-first A1-A10 baseline runbook in `docs/10_A1_A10_DEMO.md`.
- [x] Add the deterministic demo command `python3 scripts/run_a1_a10_demo.py` for local A1-A10 evidence reproduction.
- [x] Add docs validation for the A1-A10 table, fixture proof boundary, command reference, and live runtime gap ledger.
- [ ] Run the A1-A10 baseline against a real live Paperclip runtime path and preserve the resulting evidence envelope.
- [ ] Capture live Paperclip runtime version/build before any capability promotion.
- [ ] Prove plugin load, `piko:*` tool registration/invocation, data provider hydration, action invocation, dashboard widget rendering, and issue detail tab rendering.
- [ ] Prove native issue/document/comment create-read, native approval/request create-read, config/state/entities round trips, activity write/read visibility, issue lifecycle events, and terminal run event emission.
- [ ] Update `plugin-bos-light/capabilities.paperclip-runtime.json` only after live Paperclip runtime proof exists, then re-run `python3 scripts/validate_runtime_capabilities.py` and `python3 scripts/validate_a1_a10_demo_docs.py`.
