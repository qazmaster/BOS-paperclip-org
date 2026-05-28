# 05 - Persistence Strategy Matrix

## Rule

Durable organizational truth must be visible in Paperclip-native artifacts. Private plugin state can cache overlays, but it must not be the only record for important decisions. As recorded in `docs/08_RUNTIME_CAPABILITY_HEALTH.md`, native documents/comments, state, entities, config, and events are currently `unvalidated` or `fallback-only`; this matrix describes the intended preferred surface plus the required fallback until live runtime proof exists.

| BOS object | Paperclip surface | Primary storage | Fallback | Acceptance test |
|---|---|---|---|---|
| BPI Score | Issue annotation / plugin data tab (`unvalidated`) | Issue-scoped plugin state as cache/overlay after proof | Product Blueprint artifact envelope plus issue document/comment/markdown fallback | Score visible after issue.created; cache overlay reports `saved`, `failed`, or `not_attempted` |
| BOS Status | Issue detail tab overlay (`unvalidated`) | Issue-scoped plugin state as cache/overlay after proof | Issue label/comment plus `IssueBlueprintStatusOverlay.cache_overlay` diagnostics | `bos_status` synced with issue lifecycle; plugin cache never sole durable truth |
| Blueprint | Issue Document (`documents.native` `unvalidated`), 5 sections | Issue Document native only after create/read proof | Comment (`comments.native` `unvalidated`) or `markdown-only://issues/{issue_id}/product-blueprint` artifact ref | Blueprint generated with `artifact_id`, `artifact_ref`, `selected_surface`, `fallback`, `mirrored_at` |
| Betting Table | Dashboard widget (`unvalidated`) | Plugin entity/config/current cycle after proof | Managed Paperclip issue/project or generated markdown carrying opaque `blueprint_id` | Approve creates native approval request only after `approvals.native` proof |
| Gate Result | Review checklist/comment | Issue-scoped state + Issue Document after proof | Issue comment | Blocking gate stops release path |
| Circuit State | Dashboard/detail tab (`unvalidated`) | Issue-scoped plugin state after proof | Polling + activity log/comment scanning | 3 failures -> OPEN + escalation issue |
| BOS Config | Plugin config (`fallback-only`) | Config JSON | Company template import files | Reload without data loss |
| Decision Record | Issue comment/document (`unvalidated`) | Paperclip issue comment native after create/read proof | Issue Document/description markdown | Decision visible in issue history |

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

- `documents.native`: preferred surface, but still unvalidated unless `docs/08_RUNTIME_CAPABILITY_HEALTH.md` and the capability matrix contain live create/read evidence. Local in-memory adapter writes exercise code paths only.
- `comments.native`: human-visible fallback when documents are unvalidated or fail. It is also unvalidated as Paperclip runtime support until comment create/read evidence exists.
- `markdown-only`: explicit fallback for hard-gate failure, incomplete Blueprint inputs, adapter failures, or missing usable native/comment support. The markdown payload is the artifact; callers should preserve it or mirror it to a managed issue/project in later slices.

`IssueBlueprintStatusOverlay.cache_overlay` may say BPI/status writes were `saved`, `failed`, or `not_attempted`, but the `durability` field remains `cache-overlay-only` in every case. S04 Betting Table code must consume `blueprint_id` as an opaque artifact reference and avoid approval/request scope bleed: a Blueprint document/comment/markdown reference is not a native approval id, not a cycle id, and not evidence that plugin state can be restored after restart.
