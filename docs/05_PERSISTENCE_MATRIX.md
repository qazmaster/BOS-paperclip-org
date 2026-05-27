# 05 - Persistence Strategy Matrix

## Rule

Durable organizational truth must be visible in Paperclip-native artifacts. Private plugin state can cache overlays, but it must not be the only record for important decisions.

| BOS object | Paperclip surface | Primary storage | Fallback | Acceptance test |
|---|---|---|---|---|
| BPI Score | Issue annotation / plugin data tab | Issue-scoped plugin state | Issue document/comment | Score visible after issue.created |
| BOS Status | Issue detail tab overlay | Issue-scoped plugin state | Issue label/comment | `bos_status` synced with issue lifecycle |
| Blueprint | Issue Document, 5 sections | Issue Document native | Issue description | Blueprint generated on approval |
| Betting Table | Dashboard widget | Plugin entity/config/current cycle | Managed Paperclip issue/project | Approve creates native approval request |
| Gate Result | Review checklist/comment | Issue-scoped state + Issue Document | Issue comment | Blocking gate stops release path |
| Circuit State | Dashboard/detail tab | Issue-scoped plugin state | Polling + activity log scanning | 3 failures -> OPEN + escalation issue |
| BOS Config | Plugin config | Config JSON | Company template import files | Reload without data loss |
| Decision Record | Issue comment/document | Paperclip issue comment native | Issue Document | Decision visible in issue history |

## Restore strategy after plugin-state loss

A11 acceptance is split deliberately:

- A11a: BOS config restored from config JSON / template artifacts.
- A11b: BPI scores restored from issue docs/comments/state.
- A11c: Betting cycle restored from managed native issue/project.
- A11d: Gate results restored from issue comments/docs.
- A11e: Decision records restored from issue comments.

## Storage guidance

Use issue-scoped plugin state for fast UI overlays. Mirror important results into native artifacts. Use config JSON for stable config and company-scoped fallback. Use managed Paperclip issues/projects/routines where work should be user-visible and recoverable.
