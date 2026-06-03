# 09 - Initial Backlog

This backlog implements the v1.4.1 remap and its traceability set: R012–R016 plus D012–D014. Anything touching runtime support must remain proof-gated until live Paperclip evidence exists. Ownership/security items below are doctrine and fixture-first until a future runtime evidence file proves the exact Paperclip surface.

## Epic 1 - Company Template

- [x] Create 7 division agent profiles (v1.4.1 canonical names).
- [x] Create org chart and reporting lines.
- [x] Create task routing rules.
- [x] Create company rituals.
- [ ] Validate import/export against live Paperclip.
- [x] Pass A1 (local fixture validation).

## Epic 2 - Minimal Plugin Spike

- [ ] Check SDK version and current plugin runtime.
- [ ] C2 event emission spike.
- [ ] C3 state spike.
- [ ] C7 capability set confirmation.
- [ ] Decide native artifacts for approvals, comments, issue docs.
- [ ] Keep plugin/runtime spikes separate from v1.4.1 ownership evidence; Div1/Div3/Div5/Div6 packet routing can be mirrored to native artifacts only after the target surface has separate live proof.

## Epic 3 - BPI and Blueprint

- [x] Implement BPI pure function.
- [x] Implement BPI agent tool adapter.
- [x] Implement issue annotation/storage as cache-overlay-only.
- [x] Implement 5-section blueprint generator.
- [x] Mirror blueprint into Product Blueprint artifact envelope with native document preference, comment fallback, and markdown-only fallback diagnostics.
- [x] Prove `documents.native` and `comments.native` create/read behavior in a live Paperclip runtime (S04 bounded proof).
- [x] Pass A2-A3 (local fixture + bounded live artifact proof).

## Epic 4 - Betting Table

- [x] Implement top-N selection by BPI.
- [x] Implement dashboard data provider (fixture-level; live hydration unvalidated).
- [ ] Prove dashboard data-provider hydration in a live Paperclip runtime before claiming Pitch Deck UI support.
- [x] Carry `blueprint_id` through as an opaque artifact reference without approval/request scope bleed.
- [x] Implement Approve Batch action (adapter seam; live invocation unvalidated).
- [x] Implement adapter-seam path for Paperclip-native approval/request.
- [ ] Prove native approval/request create/read in a live Paperclip runtime; keep comment/markdown fallbacks diagnostic-only until then.
- [x] Add fallback-rate observability for approval native/comment/markdown outcomes and cache-overlay save/load errors.
- [x] Mirror cycle state to cache-overlay (native issue/project round-trip unvalidated).
- [x] Pass A4-A5 (fixture-level with bounded live artifact support for document/comment fallback).

## Epic 5 - Safety Loop

- [x] Implement Eval Gates (pure logic + fixture evidence envelope).
- [x] Keep `piko:eval-gate` pure and expose `piko:eval-gate-evidence` as the explicit evidence-mirroring tool.
- [x] Persist gate results as cache-overlay-only diagnostics and mirror pass/fail guidance to comment or markdown-only evidence.
- [x] Implement Circuit Breaker pure state machine.
- [x] Expose `piko:circuit-breaker-observe` for one bounded observation at a time with CLOSED, HALF_OPEN, and OPEN envelopes.
- [x] Implement run polling fallback with active-runs-only scope, jitter/backoff, and activity/comment/manual fallback; keep terminal run events fallback-only until live emitted-event evidence exists.
- [x] Create escalation issue on OPEN through the adapter seam (fixture-level; live native issue creation confirmed in S04 bounded proof).
- [x] Add fallback-rate observability for gate evidence surface, circuit evidence surface, cache-overlay get/save failures, escalation issue/comment fallback, and activity-log failures.
- [x] Pass A6-A10 (fixture-level with bounded live artifact support for document/comment fallback).

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

## Epic 8 - v1.4.1 Ownership, Security and External IO

- [x] Import v1.4.1 canonical doctrine package (5 docs + 7 skills).
- [x] Define Div1.HCO routing request contract with allowed/forbidden routes.
- [x] Define Div3.Treasury scoped grant contract without plaintext secret exposure.
- [x] Define external-IO gate contract: Div1 -> Div5 local miss -> Div3 grant when paid -> Div6 -> Div5 quarantine.
- [x] Define raw-exidence routing constraint (never direct to Div2/Div4/Div7).
- [x] Define Div5 sanitized knowledge packet contract with quarantine checks.
- [x] Define staffing/hat request contract with Div1 control, Div5 evidence, Div3 feasibility.
- [x] Define Div1.HCO circuit-breaker control contract.
- [ ] Add fixture/unit test coverage enforcing the above contracts in plugin code.
- [x] Mirror ownership/security packets to confirmed native issue/document/comment artifacts (S04 bounded proof) or inert repo-local markdown.
- [x] Keep external API/service access, paid tools, credentialed paths, plugin actions, events, state, approvals, Hermes and GSD-Pi unpromoted until surface-specific live runtime proof exists.
- [x] Pass A12-A20 (doctrine and contract shape; runtime execution remains proof-gated).

## Epic 9 - A1-A10 Integrated Demo and Live Runtime Closure

- [x] Publish the fixture-first A1-A10 baseline runbook in `docs/10_A1_A10_DEMO.md`.
- [x] Add the deterministic demo command `python3 scripts/run_a1_a10_demo.py` for local A1-A10 evidence reproduction.
- [x] Add docs validation for the A1-A10 table, fixture proof boundary, command reference, and live runtime gap ledger.
- [x] Run the A1-A10 baseline against a real live Paperclip runtime path and preserve the resulting evidence envelope (S04 bounded issue/document/comment proof; plugin/UI/approval/state/event surfaces remain unvalidated).
- [x] Capture live Paperclip runtime version/build (S04: `0.3.1` / `health.version:0.3.1`).
- [ ] Prove plugin load, `piko:*` tool registration/invocation, data provider hydration, action invocation, dashboard widget rendering, and issue detail tab rendering.
- [x] Prove native issue/document/comment create-readback (S04 bounded proof).
- [ ] Prove native approval/request create-read, config/state/entities round trips, activity write/read visibility, issue lifecycle events, and terminal run event emission.
- [x] Update `plugin-bos-light/capabilities.paperclip-runtime.json` for confirmed S04 surfaces, then re-run `python3 scripts/validate_runtime_capabilities.py` and `python3 scripts/validate_a1_a10_demo_docs.py`.
