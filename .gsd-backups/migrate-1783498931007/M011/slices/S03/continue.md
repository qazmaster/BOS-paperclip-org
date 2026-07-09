# Continue — after M011 / before M012

## Last action

M011 was completed and validated: `runtime-evidence/M011-S03-reconciled-capability-gate.md` is the current gate, and `.gsd/milestones/M011/M011-SUMMARY.md` records closure.

## Next action

Plan M012 as **First Real Mission Through Native Paperclip Flow** using `runtime-evidence/M011-S03-reconciled-capability-gate.json`; if execution starts, first collect Paperclip auth with `secure_env_collect` and run an authenticated read-only reprobe before asking for explicit confirmation to create any live Paperclip issue/document/comment.

## Why

M011 proved exact confirmed surfaces and blockers. Native Paperclip company/resource/mission/artifact/git surfaces are confirmed for their evidence-backed boundaries, but the current environment lacks Paperclip auth and plugin host, piko tools, Hermes, GSD-Pi, and live GitHub PR/merge/CI remain fallback-only or blocked.

## Open threads

- `.gsd/STATE.md` currently shows stale `Next Action: Plan milestone M007`; for this handoff, follow M011 summary/gate and plan M012 next.
- M012 should use native Paperclip issue/document/comment artifacts, not plugin-host tools.
- Current S02 reprobe has `health_ok=true` but `missing_paperclip_auth`, so authenticated company/agents/issues readback must be refreshed before live mutation.
- GitHub PR/merge/CI should stay out of M012 unless the user explicitly expands scope and confirms external actions.

## Do not

- Do NOT treat `plugin.host_registration`, `plugin.piko_tools`, Hermes, or GSD-Pi as live capabilities.
- Do NOT create/edit live Paperclip issues/documents/comments without immediate explicit user confirmation after auth is available.
- Do NOT ask the user to paste secrets or edit `.env`; use `secure_env_collect`.
- Do NOT push to `main`/`master`, force-push, open PRs, trigger CI, merge, or send Telegram secrets without explicit confirmation.
