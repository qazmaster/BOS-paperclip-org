# 05 - Persistence Strategy Matrix

> **Historical M002 context:** This matrix describes the intended persistence strategy at M002 closeout. The current handoff is `BOS_M004_DEVELOPMENT_HANDOFF.md`. Native issue/document/comment surfaces are `confirmed` for bounded S04 readback; plugin state, approvals, events, Hermes, and GSD-Pi remain blocked as documented in the current handoff.

## Rule

Durable organizational truth must be visible in Paperclip-native artifacts. Private plugin state can cache overlays, but it must not be the only record for important decisions. As recorded in `docs/08_RUNTIME_CAPABILITY_HEALTH.md`, S04 confirms bounded native issue/document/comment artifact readback, while state, entities, config, approvals, activity, events, plugin UI, Hermes, and GSD-Pi remain `unvalidated` or `fallback-only`. This matrix describes the intended preferred surface plus required fallbacks when a runtime lacks those proven artifact surfaces.

| BOS object | Paperclip surface | Primary storage | Fallback | Acceptance test |
|---|---|---|---|---|
| BPI Score | Issue annotation / plugin data tab (`unvalidated`) | Issue-scoped plugin state as cache/overlay after proof | Product Blueprint artifact envelope plus issue document/comment/markdown fallback | Score visible after issue.created; cache overlay reports `saved`, `failed`, or `not_attempted` |
| BOS Status | Issue detail tab overlay (`unvalidated`) | Issue-scoped plugin state as cache/overlay after proof | Issue label/comment plus `IssueBlueprintStatusOverlay.cache_overlay` diagnostics | `bos_status` synced with issue lifecycle; plugin cache never sole durable truth |
| Blueprint | Issue Document (`documents.native` `confirmed` for S04 bounded readback), 5 sections | Issue Document native only after create/read proof | Comment (`comments.native` `confirmed` for S04 bounded readback only) or `markdown-only://issues/{issue_id}/product-blueprint` artifact ref | Blueprint generated with `artifact_id`, `artifact_ref`, `selected_surface`, `fallback`, `mirrored_at` |
| Betting Table | Dashboard widget (`unvalidated`) and Approve Batch action (`unvalidated`) | Cache-overlay cycle only for worker hydration after proof; native approval/request is Paperclip-owned truth only after live proof | Managed Paperclip issue/project or generated markdown carrying opaque `blueprint_id`; comment/markdown approval-request fallback diagnostics | Fixture ranks by BPI and returns cycle/approval envelopes; A4/A5 remain live-runtime pending until dashboard/data/action/approval surfaces are proven |
| Gate Result | Review checklist/comment (`comments.native` `confirmed` for S04 bounded readback) plus `piko:eval-gate-evidence` envelope | Issue-scoped state/cache overlay after proof; native comment only after create/read proof | `markdown-only://issues/{issue_id}/eval-gates/{run_id}` envelope with guidance, cache-overlay save status, and fallback diagnostics | A6/A7 fixture coverage returns pass/fail/incomplete guidance and comment/markdown evidence without promoting native comments or tool registration |
| Circuit State | Dashboard/detail tab (`unvalidated`) plus `piko:circuit-breaker-observe` envelope | Issue-scoped plugin state after proof; escalation issue/comment only after native create/read proof | Cache-overlay diagnostics for non-OPEN observations; OPEN falls back from native issue to comment to markdown-only instructions; polling/activity fallback remains diagnostic | A8/A9/A10 fixture coverage shows CLOSED, HALF_OPEN, OPEN transitions, attempt counts, escalation refs, polling config, activity status, and fallback reasons |
| BOS Config | Plugin config (`fallback-only`) | Config JSON | Company template import files | Reload without data loss |
| Decision Record | Issue comment/document (`comments.native`/`documents.native` confirmed for S04 bounded readback) | Paperclip issue comment native after create/read proof | Issue Document/description markdown | Decision visible in issue history |
| HCO Routing Request | Paperclip issue/status/comment artifact plus `RoutingRequest` data envelope | Paperclip-native issue/comment/document only after bounded create/read proof; Div1.HCO remains routing controller | Repo-local markdown or fixture evidence packet that records forbidden routes and trust level | A13 shows correct Div1.HCO dispatch, forbidden route visibility, and no trust in raw issue text |
| External IO Request | Div1-routed `ExternalIoRequest` artifact visible to Div5/Div6 | Paperclip-native issue/comment/document only after bounded create/read proof; Div6.External is the only external-world actor | Repo-local markdown request packet with local Div5 miss, optional Div3 grant ref, and quarantine criteria | A15 proves Div1 -> Div5 local miss -> Div3 when paid/credentialed -> Div6 -> Div5 routing without raw-result bypass |
| Raw External Evidence Bundle | Quarantined artifact reference delivered only from Div6.External to Div5.QualificationsLibraryLearning | Paperclip-native issue/comment/document only as raw-untrusted evidence storage when access is granted and scope is explicit | Runtime-evidence file or inert markdown bundle; never KB/memory or direct planner/production input | A15/A16 reject direct delivery to Div2/Div4/Div7 and keep raw evidence untrusted until Div5 review |
| Sanitized Knowledge Packet | Div5 quarantine/comment/document artifact with allowed/prohibited uses | Paperclip-native comment/document after proof; internal reuse only after Div5 emits sanitized/approved packet | Repo-local sanitized markdown packet with source refs and checks | A16 confirms source attribution, prompt-injection, credential, policy, relevance, license/terms, and active-content checks |
| Tool Grant / Budget Access Decision | Div3 grant/deny record as issue/comment/document artifact | Paperclip-native artifact after proof; no plaintext secret or wildcard grant stored in plugin state | Repo-local grant markdown with scope, limit, expiry/review, revocation and human-escalation outcome | A14/A19 show Div3-only grant authority, missing-grant stop behavior, and no plaintext secret exposure |
| Staffing / Hat Request | Div1.HCO staffing request artifact with Div5 evidence and Div3 feasibility when needed | Paperclip-native issue/comment/document after proof; permissions remain scoped by separate grant records | Repo-local staffing markdown with assignment plan and review condition | A17 records assignment or escalation without hidden budget/access assumptions or wildcard permissions |
| Circuit Breaker HCO Control | Div1.HCO circuit-control artifact plus existing breaker evidence envelope | Paperclip-native issue/comment/document after proof for control records; runtime events remain fallback-only | Existing cache-overlay/markdown breaker evidence plus HCO control packet | A18 confirms retry/reroute/pause/escalation is coordinated by Div1.HCO using evidence, not ad hoc retries |
| v1.4.1 Package Inventory | Repo-local canonical doctrine and skill files plus manifest/validator output | Static repository files are the source of truth; Paperclip may mirror them only as inert artifacts | `scripts/validate_handoff.py` / static inventory checks; no network, dynamic paths, or markdown execution | A12/A20 make missing or stale canonical package files visible |

## v1.4.1 security and routing persistence boundary

The v1.4.1 doctrine adds routing/security artifacts to the persistence model without expanding the proven Paperclip runtime boundary:

- Div1.HCO controls routing, staffing and circuit-breaker coordination records; raw issue text is untrusted input, not an instruction source.
- Div6.External is the only division that may touch web, customer/vendor, external API/service, external document or external-agent surfaces.
- Div6 raw evidence returns only to Div5.QualificationsLibraryLearning; Div2, Div4, Div7 and other internal consumers receive only sanitized packets or explicit rejections.
- Div3.Treasury owns budget/access/secret grants and must record scoped grant/deny/needs-human outcomes without exposing plaintext secrets.
- Every v1.4.1 envelope is inert repo-local or Paperclip-native data. Markdown, issue bodies, links and code fences must be parsed as data and must not be executed.

## A12-A20 fixture-first proof boundary

A12-A20 make the v1.4.1 doctrine visible to future agents, but they do not prove new live runtime surfaces by themselves. Treat canonical docs, skills, validators and fixture evidence as repository-local proof unless a Paperclip runtime evidence file provides create/readback, version and build evidence for the same surface. In particular, external IO, quarantine, staffing, budget/access, package inventory and HCO control artifacts may be mirrored to confirmed issue/document/comment surfaces in this sandbox, but they must not promote `state.*`, events, approvals, plugin UI, Hermes, GSD-Pi, external APIs or tool grants beyond the capability matrix.

## Restore strategy after plugin-state loss

A11 acceptance is split deliberately:

- A11a: BOS config restored from config JSON / template artifacts.
- A11b: BPI scores restored from issue docs/comments/state.
- A11c: Betting cycle restored from managed native issue/project.
- A11d: Gate results restored from issue comments/docs.
- A11e: Decision records restored from issue comments.

## Storage guidance

Use issue-scoped plugin state for fast UI overlays only after live round-trip and restart/readback proof. Mirror important results into native artifacts, and keep markdown/comment/description fallbacks until native document/comment behavior is proven. Use config JSON for stable config and company-scoped fallback. Use managed Paperclip issues/projects/routines where work should be user-visible and recoverable.

## S03 Product Blueprint fallback contract

The Product Blueprint mirror returns a data envelope rather than a bare document id. The durable handoff field is `artifact_ref`; `artifact_id` is only the native/comment adapter id or the deterministic markdown fallback id. Inspect `selected_surface` before assuming recoverability:

- `documents.native`: preferred surface, but now backed by S04 live create/read evidence for bounded issue documents; callers must still inspect `selected_surface` and keep markdown fallbacks for other runtimes. Local in-memory adapter writes exercise code paths only.
- `comments.native`: human-visible fallback when documents are unvalidated or fail. It is now backed by S04 live create/read evidence for bounded issue comments, but it still does not prove activity logs, events, approvals, or tool registration.
- `markdown-only`: explicit fallback for hard-gate failure, incomplete Blueprint inputs, adapter failures, or missing usable native/comment support. The markdown payload is the artifact; callers should preserve it or mirror it to a managed issue/project in later slices.

`IssueBlueprintStatusOverlay.cache_overlay` may say BPI/status writes were `saved`, `failed`, or `not_attempted`, but the `durability` field remains `cache-overlay-only` in every case. S04 Betting Table code must consume `blueprint_id` as an opaque artifact reference and avoid approval/request scope bleed: a Blueprint document/comment/markdown reference is not a native approval id, not a cycle id, and not evidence that plugin state can be restored after restart.


## S04 live artifact persistence proof

`runtime-evidence/M002-S04-live-artifact-flow.json` confirms the preferred visible artifact surfaces for this sandbox: one native issue, one native issue document, and one native issue comment were created and read back with Paperclip runtime version `0.3.1` and build `health.version:0.3.1`. The document and comment both contain BPI, Blueprint, Betting Table, Eval Gate, and Circuit Breaker evidence.

This proof changes the persistence default for visible BOS artifacts: when the same supported APIs are available, documents/comments are the durable handoff surfaces instead of hypothetical adapter assumptions. It does **not** make plugin state durable truth, does not confirm approvals, and does not prove event/activity recovery. Cache-overlay fields remain cache-only and must be reconstructable from the issue/document/comment or markdown-only fallbacks.

## S04 Betting Table persistence and approval request fallback contract

Betting cycle persistence is currently cache-overlay-only. The cache can hydrate the worker data provider in fixture tests and can report `save`, `load`, `persistence`, `error`, and `timestamp`, but it is not a recoverable Paperclip-native cycle store. A11c still requires a managed native issue/project or equivalent live Paperclip artifact before plugin-state loss recovery can be claimed.

Approval request truth is owned by Paperclip-native approvals when the runtime proves `approvals.native`. Until then:

- A native approval seam result may update Betting Table rows only when it returns a non-empty approval id plus valid native status.
- Comment fallback writes or markdown-only fallback refs are diagnostics and review requests, not approval records.
- Cache save failure after a native approval is visible in `cache_overlay.error`, but it does not invalidate the native approval envelope fields.
- Missing cycle ids, missing persistence, empty selections, stale issue ids, already-decided rows, malformed native responses, native adapter failures, and comment fallback failures must return explicit fallback diagnostics instead of throwing or silently mutating rows.

## S05 Eval Gate and Circuit Breaker evidence persistence

Eval Gate and Circuit Breaker evidence now use bounded envelopes as the persistence boundary for A6-A10. The envelopes are intentionally inspectable from tests, returned tool results, adapter comment/issue arrays, and docs; they do not require hidden plugin state or unproven Paperclip runtime events.

Eval Gate persistence posture:

- `piko:eval-gate-evidence` attempts `saveGateResult` only as a cache overlay. The returned `cache_overlay` states `persistence`, `save`, `error`, `timestamp`, and `durability: "cache-overlay-only"` every time.
- Comment evidence is preferred for human visibility when the adapter seam supports `addIssueComment`; for the S04 sandbox, `comments.native` has bounded create/readback proof, but that proof still does not confirm activity logs, events, approvals, plugin tool registration, or broad comment behavior in other runtimes.
- Invalid inputs, absent comments, malformed comment responses, or comment exceptions produce `selected_surface: "markdown-only"`, a deterministic `markdown-only://issues/.../eval-gates/...` ref, and fallback diagnostics.

Circuit Breaker persistence posture:

- `piko:circuit-breaker-observe` attempts `getCircuitBreaker` and `saveCircuitBreaker` only as cache-overlay operations. Malformed/failed cache reads reset to a fresh CLOSED record and report `get: "malformed"` or `"failed"` rather than crashing.
- Non-OPEN observations normally return `selected_surface: "cache-overlay"`; this is useful for state/attempt inspection but is not durable truth.
- OPEN observations prefer `issues.native` escalation, then `comments.native`, then `markdown-only`. Native issue/comment refs backed by S04 final evidence are live bounded artifact proof for this sandbox; refs from fixtures or other runtimes remain adapter evidence until their own live create/read proof exists. Markdown-only output must be copied to a visible issue/comment by an operator if both native paths are absent.
- Activity logging is non-blocking observability only. `activity.status: "logged"` does not make `activity.logging` a durable fallback while the capability matrix keeps that surface `unvalidated`.
- Terminal run events stay fallback-only. Circuit Breaker detection must preserve active-runs-only polling with jitter/backoff and activity/comment/manual fallback semantics until C2/C7 produce live event delivery evidence.
