# 06 - Acceptance Tests

| # | Component | Given | When | Then |
|---|---|---|---|---|
| A1 | Company Template | Fresh Paperclip company | Import BOS template | 7 agents created with AGENTS.md; org chart rendered |
| A2 | BPI Score | Issue created in backlog | Div2 calls `piko:bpi-score` or the seeded issue flow computes BPI locally | Score 0.0-1.0 is returned, cache-overlay write posture is explicit, and no plugin state is treated as durable truth |
| A3 | Blueprint Gen | Issue approved by BPI | `piko:blueprint-gen` or seeded issue flow invoked | Five-section Product Blueprint returned in a `ProductBlueprintArtifact` envelope with `artifact_id`, `artifact_ref`, `selected_surface`, `fallback`, and `mirrored_at`; native document status is confirmed only for the bounded S04 live readback proof |
| A4 | Betting Table | 5+ issues with BPI score | Widget/data provider renders Pitch Deck | Fixture-level provider returns top-N rows ranked by BPI with `cycle_id`, `selected_issue_ids`, opaque `blueprint_id`, and cache-overlay diagnostics; dashboard rendering remains unvalidated until live UI proof |
| A5 | Batch Approval | Betting Table with candidates | User clicks Approve Batch | Native approval adapter seam remains fixture proof only; S04 confirms comment/document artifact visibility, but approval create/read stays unvalidated and comment/markdown review requests remain diagnostics |
| A6 | Eval Gate Pass | Issue in `QA_REVIEW` | `piko:eval-gate-evidence` runs and all blocking gates pass | Envelope returns `overall=PASSED`/`PASSED_WITH_WARNINGS`, pass guidance, cache-overlay save posture, and comment or markdown-only evidence; native comments are confirmed only for S04 bounded artifact readback; tool registration remains unvalidated until live proof |
| A7 | Eval Gate Fail | Issue in `QA_REVIEW` | `piko:eval-gate-evidence` runs and a blocking gate fails | Envelope returns `overall=FAILED_BLOCKING`, correction guidance, fallback diagnostics, and comment or markdown-only evidence; status movement to `CORRECTION_REQUIRED` must inspect the envelope |
| A8 | Circuit Breaker Close | Issue with failed attempts or HALF_OPEN probe | `piko:circuit-breaker-observe` records a success | Envelope returns `next_state=CLOSED`, `attempt_count=0`, cache-overlay save posture, activity diagnostics, and no hidden event dependency |
| A9 | Circuit Breaker Open | Issue reaches failure threshold | `piko:circuit-breaker-observe` records the threshold failure | Envelope returns `next_state=OPEN`, failure reason, attempt count, escalation issue/comment/markdown ref, cache-overlay status, activity diagnostics, and fallback reason |
| A10 | CB Fallback | Terminal events unavailable | Circuit Breaker observations are collected explicitly or by bounded polling | Envelope preserves active-runs-only polling config with jitter/backoff/activity fallback and transitions correctly without claiming live run-event support |
| A11a | State: Config | Plugin state cleared | Restart plugin | BOS config reloaded from Paperclip artifacts |
| A11b | State: BPI Scores | Plugin state cleared | Restart plugin | BPI scores restored from issue documents/state |
| A11c | State: Betting Table | Plugin state cleared | Restart plugin | Current cycle restored from native issue/project |
| A11d | State: Gate Results | Plugin state cleared | Restart plugin | Gate results restored from issue comments/docs |
| A11e | State: Decisions | Plugin state cleared | Restart plugin | Decision records restored from issue comments |
| A12 | Canonical org package | A fresh reader opens the repo | They read the v1.4.1 docs package | The seven active divisions, org chart, ownership map, historical boundary and package inventory are explicit |
| A13 | HCO routing control | A work item needs routing | Div1.HCO receives a routing request | The request dispatches to the correct division, forbidden routes are visible, and raw issue text is not trusted as instruction |
| A14 | Tool permission matrix | A division wants a tool class | The v1.4.1 permission matrix is checked | Owns, may-use, may-request and prohibited surfaces are unambiguous; Div6-only external-world access and Div3 grant authority are visible |
| A15 | External IO gateway | Internal work needs web/API/customer/vendor input | The request follows Div1 -> Div5 local miss -> Div3 if paid/credentialed -> Div6 -> Div5 | Div6.External is the only external actor and raw evidence returns only to Div5 quarantine |
| A16 | Knowledge quarantine | Div6 returns raw external evidence | Div5.QualificationsLibraryLearning reviews and sanitizes it | Internal divisions receive only a sanitized knowledge packet, rejection or needs-human result with allowed/prohibited uses |
| A17 | Agent staffing and hats | Workload, underperformance or missing capability appears | HCO evaluates a staffing or hat request with Div5 evidence and Div3 feasibility when needed | Assignment or escalation is recorded without hidden budget/access assumptions or wildcard permissions |
| A18 | Circuit Breaker HCO control | Gate/runtime failures repeat | Circuit-breaker state opens or half-opens | Div1.HCO coordinates retry, reroute, pause, Div7 escalation or human escalation using recorded evidence |
| A19 | Treasury budget/access | Work needs budget, secrets, paid API or credentialed access | Div3.Treasury evaluates the request | A scoped grant, denial or needs-human record exists and plaintext secrets are not exposed |
| A20 | Package inventory and validator visibility | The v1.4.1 package is imported | Handoff validation or manual inventory checks run | Missing or stale canonical package files are reported explicitly without executing markdown or fetching network content |

## v1.4.1 acceptance and runtime boundary

A12-A20 extend the historical A1-A11 baseline for organization remap, routing, tool permissions, external IO quarantine, staffing, circuit-breaker control, budget/access and package inventory. Their source of truth is `docs/BOS_Light_v1_4_1_Acceptance_Tests_A12_A20.md` plus the canonical v1.4.1 doctrine and skill package.

Acceptance evidence remains conservative:

- Repo-local docs, skills, validators and fixture outputs prove doctrine shape and local behavior only.
- Paperclip runtime support is confirmed only when `plugin-bos-light/capabilities.paperclip-runtime.json` cites live runtime evidence with version/build and create/readback or registration proof for that exact surface.
- Div1.HCO routing control, Div6-only external-world access and Div5 quarantine are security invariants, not optional workflow preferences.
- External IO, raw evidence bundles, budget/access grants, staffing requests and HCO circuit-control packets must be treated as inert artifacts; consumers parse them as data and never execute markdown, issue text, links or embedded code.
- A12-A20 do not promote plugin state, events, approvals, plugin UI, Hermes, GSD-Pi or external API access beyond the runtime capability matrix.

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

Negative coverage required for A2/A3 includes adapter document failure, adapter comment failure, missing persistence, cache write failure, hard-gated BPI scores, incomplete Blueprint inputs, and absent worker registration surfaces. Runtime capability validation must continue rejecting unproven `confirmed`/native claims; S03 does not change `documents.native`, `state.issue_scoped` to confirmed; S04 separately confirms bounded native document/comment artifact readback.

S04 acceptance consumes `blueprint_id` as an opaque artifact reference. It must not parse `paperclip://.../documents/...`, `paperclip://.../comments/...`, or `markdown-only://...` references as approval ids, cycle ids, or proof that Paperclip-native approvals/documents exist.

## S04 Betting Table fixture proof and negative coverage

Current Betting Table proof is fixture-integrated and intentionally does not promote dashboard, data-provider, action, approval, entity, config, or state capabilities to live runtime support. Separately, final S04 live artifact proof confirms only bounded issue/document/comment create-readback for the generated BOS artifact body:

- Betting cycle construction ranks positive-BPI candidates descending, enforces a minimum top-N of one, excludes non-positive BPI rows, returns `cycle_id`, `selected_issue_ids`, `items`, and `cache_overlay`, and preserves native/comment/markdown/null `blueprint_id` values exactly.
- Cache-overlay persistence can save and load cycles for worker hydration in tests, but every result reports `durability: "cache-overlay-only"` and exposes missing, failed, or absent persistence explicitly.
- The worker data provider hydrates persisted S03 `blueprint_id` rows from the cache-overlay seam and returns diagnostics for missing cycle ids or missing persistence instead of crashing.
- Approve Batch delegates to the adapter seam and never calls a direct `ctx.approvals` plugin-side approval surface. A valid native adapter response returns `selected_surface: "approvals.native"`, native id/status, updated rows, and cache-overlay save status.
- When native approval support is unavailable, comment fallback can record a review request, but rows remain candidates and native approval fields stay null.
- When native and comment fallbacks fail, the flow returns `selected_surface: "markdown-only"`, a deterministic fallback ref, sanitized adapter errors, and unchanged rows.

Negative coverage protecting A4/A5 includes missing persistence, missing cache data, cache save/load failures, empty candidates, empty issue selections, stale issue ids, missing cycles, already-decided rows, malformed native approval responses, native adapter exceptions, comment fallback exceptions, cache save failure after native approval creation, absent worker cycle id, absent worker persistence, and absent adapter seams. Runtime capability validation remains responsible for rejecting promoted `confirmed` claims without live Paperclip evidence.


## S04 live BOS artifact flow proof

Final S04 proof is live rather than fixture-only. The canonical artifact is `runtime-evidence/M002-S04-live-artifact-flow.json`; it validates with `python3 scripts/validate_s04_live_artifact_flow.py --evidence runtime-evidence/M002-S04-live-artifact-flow.json --phase final` and records one issue, one document, and one comment read back from Paperclip runtime `0.3.1` / build `health.version:0.3.1`.

Acceptance impact:

- `issues.native`, `documents.native`, and `comments.native` are confirmed for bounded artifact create/readback.
- A2/A3/A6/A7/A8/A9/A10 may mirror reader-facing evidence to those native surfaces when available.
- A4 dashboard/data-provider rendering, A5 native approval/request creation, plugin action/tool registration, state recovery, activity logs, events, Hermes execution, and GSD-Pi execution remain unvalidated or no-go.

Negative coverage protecting the live proof includes final-phase S04 evidence validation, S04 readback/side-effect/no-go guard checks in `scripts/test_run_s04_live_artifact_flow.py`, and T04 capability-matrix tests that reject confirmed native artifact claims without canonical S04 evidence or with missing readbacks.

## S05 Eval Gate and Circuit Breaker fixture proof and negative coverage

The current S05 proof is deterministic and adapter-seam based. It adds worker-registered explicit tools to the manifest and fixture validator expectations, while the S04 live artifact proof separately confirms only `issues.native`, `documents.native`, and `comments.native` for bounded create/readback. The capability matrix still keeps `registration.tools`, `events.issue_lifecycle`, `events.terminal_runs`, `activity.logging`, and `state.issue_scoped` unvalidated or fallback-only according to available proof.

A6/A7 Eval Gate coverage:

- `piko:eval-gate` remains pure; `piko:eval-gate-evidence` returns a bounded envelope with `result`, `guidance`, `selected_surface`, `artifact_ref`, `cache_overlay`, `fallback`, `evaluated_at`, and `mirrored_at`.
- Passing, warning, blocking-failure, and incomplete results are visible through the returned envelope and markdown/comment body.
- Cache-overlay saves are reported as `saved`, `failed`, or `not_attempted` without blocking comment/markdown evidence.
- Comment support in S05 fixture tests remains adapter-seam-only. S04 separately confirms `comments.native` for bounded create/readback in the sandbox, but missing, malformed, or throwing comment adapters still fall back to markdown-only diagnostics and do not prove activity, events, approvals, or tool registration.

A8/A9/A10 Circuit Breaker coverage:

- `piko:circuit-breaker-observe` records one observation per invocation: `failure`, `success`, or `half_open`; it does not claim background poller or live event support.
- Closed, half-open, and open transitions are visible through `previous_state`, `next_state`, `transition_reason`, `attempt_count`, `failure_reason`, `opened_at`, and the nested `record`.
- OPEN evidence prefers escalation issue, then comment, then markdown-only; cache read/write, malformed cache records, escalation create failures, comment failures, missing adapters, and activity logging failures stay visible in `cache_overlay`, `fallback`, and `activity`.
- Polling fallback posture is documented and returned as `poll_scope=ACTIVE_RUNS_ONLY`, `interval_ms=30000`, `jitter_ms=5000`, `backoff_after_attempts=10`, `max_retries=3`, and `fallback_source=activity-log`; terminal run events remain `fallback-only`.

Negative coverage protecting A6-A10 includes invalid Eval Gate input, missing comment adapter, malformed comment response, comment write exception, gate cache save failure, invalid Circuit Breaker input, missing failure reason, missing cache persistence, cache get failure, malformed cache record, cache save failure, escalation issue creation failure, malformed escalation response, missing comment fallback, comment fallback exception, activity log exception, absent worker registration surfaces, manifest tool drift, unsupported/unknown capability statuses, confirmed claims without live version/build proof, placeholder proof text, missing fallback/blocker text, malformed capability JSON, missing health-report sections, and forbidden wording that overclaims events, durable plugin state, or plugin-owned approvals.

## S06 A1-A10 baseline integrated demo

The current integrated baseline is reproducible with:

```bash
python3 scripts/run_a1_a10_demo.py
```

The S06 runbook lives at `docs/10_A1_A10_DEMO.md`. It maps A1-A10 to concrete evidence paths, expected fixture output fields, and the live runtime gap ledger. The fixture proof boundary remains explicit: A3-A10 adapter-seam success demonstrates orchestration behavior only and does not promote Paperclip native runtime support. Future acceptance closure must inspect the runner's `runtime_capability_posture`, `gap_ledger`, per-phase selected surfaces, cache-overlay diagnostics, fallback reasons, and timestamps before claiming a live capability.

Negative coverage protecting the runbook lives in `scripts/test_validate_a1_a10_demo_docs.py` and rejects missing A-step entries, missing fixture proof boundary wording, missing live runtime gap ledger heading, and missing `python3 scripts/run_a1_a10_demo.py` command references. `python3 scripts/validate_a1_a10_demo_docs.py` is the deterministic documentation-drift check.
