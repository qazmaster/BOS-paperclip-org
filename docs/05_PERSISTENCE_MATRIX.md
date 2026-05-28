# 05 - Persistence Strategy Matrix

## Rule

Durable organizational truth must be visible in Paperclip-native artifacts. Private plugin state can cache overlays, but it must not be the only record for important decisions. As recorded in `docs/08_RUNTIME_CAPABILITY_HEALTH.md`, native documents/comments, state, entities, config, and events are currently `unvalidated` or `fallback-only`; this matrix describes the intended preferred surface plus the required fallback until live runtime proof exists.

| BOS object | Paperclip surface | Primary storage | Fallback | Acceptance test |
|---|---|---|---|---|
| BPI Score | Issue annotation / plugin data tab (`unvalidated`) | Issue-scoped plugin state as cache/overlay after proof | Issue document/comment | Score visible after issue.created |
| BOS Status | Issue detail tab overlay (`unvalidated`) | Issue-scoped plugin state as cache/overlay after proof | Issue label/comment | `bos_status` synced with issue lifecycle |
| Blueprint | Issue Document (`unvalidated`), 5 sections | Issue Document native after create/read proof | Issue description/comment markdown | Blueprint generated on approval |
| Betting Table | Dashboard widget (`unvalidated`) | Plugin entity/config/current cycle after proof | Managed Paperclip issue/project | Approve creates native approval request |
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
