# Environment Variable Audit

Generated: 2026-06-04

## GITHUB_TOKEN
- Code refs: `plugin-bos-light/src/externalIO.ts:83,228`, `plugin-bos-light/src/gitOperations.ts:99,101,140`
- Documented: yes — mentioned in `docs/archive/BOS_M002_DEVELOPMENT_HANDOFF.md`, `docs/archive/PAPERCLIP_LIVE_VALIDATION_REPORT.md`
- CI: no
- Required / optional: optional (git operations fall back to other auth methods)
- Has a default: yes — `""` (empty string) in externalIO.ts
- Drift: missing-in-ci
- Recommendation: Add to .env.example; no CI impact since tests mock it

## GITLAB_TOKEN
- Code refs: `plugin-bos-light/src/gitOperations.ts:103,106,140`
- Documented: no — gap
- CI: no
- Required / optional: optional (alternative to GITHUB_TOKEN for GitLab repos)
- Has a default: no
- Drift: undocumented, missing-in-ci
- Recommendation: Add to .env.example as optional

## GIT_SSH_KEY
- Code refs: `plugin-bos-light/src/gitOperations.ts:93,94`
- Documented: no — gap
- CI: no
- Required / optional: optional (alternative auth method)
- Has a default: no
- Drift: undocumented, missing-in-ci
- Recommendation: Add to .env.example as optional

## OPENAI_API_KEY
- Code refs: none in source (used by Hermes adapter externally)
- Documented: yes — in `.env` and `docs/archive/11_HERMES_BOS_AGENTS_SMOKE.md`
- CI: no
- Required / optional: required for Hermes Xiaomi execution
- Has a default: no
- Drift: unused-in-code (external dependency)
- Recommendation: Keep in .env; document as Hermes dependency

## PAPERCLIP_API_KEY
- Code refs: `plugin-bos-light/src/pluginRegistration.ts:945`
- Documented: yes — in `.env`, `README.md`, multiple handoff docs
- CI: no
- Required / optional: required for live Paperclip API calls
- Has a default: yes — `""` (empty string)
- Drift: none
- Recommendation: No action needed

## PAPERCLIP_AUTH_HEADER
- Code refs: `scripts/run_s05_plugin_ui_surface_probe.py:400`
- Documented: no — gap
- CI: no
- Required / optional: optional (defaults to "Authorization")
- Has a default: yes — `"Authorization"`
- Drift: undocumented
- Recommendation: Document in probe runner README

## PAPERCLIP_API_KEY_ENV
- Code refs: `scripts/run_s05_plugin_ui_surface_probe.py:399`
- Documented: no — gap
- CI: no
- Required / optional: optional (defaults to "PAPERCLIP_API_KEY")
- Has a default: yes — `"PAPERCLIP_API_KEY"`
- Drift: undocumented
- Recommendation: Document in probe runner README

## PAPERCLIP_BASE_URL
- Code refs: `plugin-bos-light/src/pluginRegistration.ts:944`, `scripts/m011_s02_paperclip_readonly_reprobe.js:137`, `scripts/run_s05_plugin_ui_surface_probe.py:401`
- Documented: yes — in `.env`, `README.md`
- CI: no
- Required / optional: required for live Paperclip API calls
- Has a default: yes — `"https://paperclip.oysana.com"` in pluginRegistration.ts
- Drift: none
- Recommendation: No action needed

## PAPERCLIP_COMPANY_ID
- Code refs: `plugin-bos-light/src/pluginRegistration.ts:946`, `scripts/m011_s02_paperclip_readonly_reprobe.js:138`
- Documented: yes — in `docs/archive/M006_RUNTIME_CAPABILITY_INVENTORY.md`
- CI: no
- Required / optional: required for live API calls
- Has a default: yes — hardcoded in reprobe script
- Drift: missing-in-ci
- Recommendation: Add to .env.example

## PAPERCLIP_EMAIL
- Code refs: none in source (used for Paperclip web login)
- Documented: no — gap
- CI: no
- Required / optional: optional (web login, not API)
- Has a default: no
- Drift: unused-in-code
- Recommendation: Keep in .env but mark as optional web credential

## PAPERCLIP_ISSUE_ID
- Code refs: `scripts/run_s05_plugin_ui_surface_probe.py:403`
- Documented: no — gap
- CI: no
- Required / optional: optional (probe-specific)
- Has a default: no
- Drift: undocumented
- Recommendation: Document in probe runner README

## PAPERCLIP_PASSWORD
- Code refs: none in source (used for Paperclip web login)
- Documented: no — gap
- CI: no
- Required / optional: optional (web login, not API)
- Has a default: no
- Drift: unused-in-code
- Recommendation: Keep in .env but mark as optional web credential

## PAPERCLIP_PLUGIN_KEY
- Code refs: `scripts/run_s05_plugin_ui_surface_probe.py:397`
- Documented: no — gap
- CI: no
- Required / optional: optional (defaults to manifest value)
- Has a default: yes — falls back to manifest
- Drift: undocumented
- Recommendation: Document in probe runner README

## PAPERCLIP_SANDBOX_COMPANY_ID
- Code refs: `scripts/run_s05_plugin_ui_surface_probe.py:402`
- Documented: no — gap
- CI: no
- Required / optional: optional (fallback for PAPERCLIP_COMPANY_ID)
- Has a default: no
- Drift: undocumented
- Recommendation: Document in probe runner README

## PAPERCLIP_SANDBOX_ISSUE_ID
- Code refs: `scripts/run_s05_plugin_ui_surface_probe.py:403`
- Documented: no — gap
- CI: no
- Required / optional: optional (fallback for PAPERCLIP_ISSUE_ID)
- Has a default: no
- Drift: undocumented
- Recommendation: Document in probe runner README

## PAPERCLIP_TIMEOUT_SECONDS
- Code refs: `scripts/run_s05_plugin_ui_surface_probe.py:404`
- Documented: no — gap
- CI: no
- Required / optional: optional (defaults to constant)
- Has a default: yes — DEFAULT_TIMEOUT_SECONDS constant
- Drift: undocumented
- Recommendation: Document in probe runner README

## PAPERCLIP_TOKEN
- Code refs: `scripts/m011_s02_paperclip_readonly_reprobe.js:32`
- Documented: no — gap
- CI: no
- Required / optional: optional (alias for PAPERCLIP_API_KEY)
- Has a default: no
- Drift: undocumented
- Recommendation: Document as alternative to PAPERCLIP_API_KEY

## PAPERCLIP_URL
- Code refs: `scripts/m011_s02_paperclip_readonly_reprobe.js:137`
- Documented: no — gap
- CI: no
- Required / optional: optional (alias for PAPERCLIP_BASE_URL)
- Has a default: no
- Drift: undocumented
- Recommendation: Document as alternative to PAPERCLIP_BASE_URL

## TELEGRAM_BOT_TOKEN
- Code refs: none in source
- Documented: no — gap
- CI: no
- Required / optional: optional (Telegram notifications)
- Has a default: no
- Drift: unused-in-code
- Recommendation: Keep in .env if used; add to .env.example as optional

## TELEGRAM_CHAT_ID
- Code refs: none in source
- Documented: no — gap
- CI: no
- Required / optional: optional (Telegram notifications)
- Has a default: no
- Drift: unused-in-code
- Recommendation: Keep in .env if used; add to .env.example as optional

## XIAOMI_API_KEY
- Code refs: none in source (used by Hermes adapter externally)
- Documented: yes — in `.env`, `docs/archive/11_HERMES_BOS_AGENTS_SMOKE.md`
- CI: no
- Required / optional: required for Hermes Xiaomi execution
- Has a default: no
- Drift: unused-in-code (external dependency)
- Recommendation: Keep in .env; document as Hermes dependency

## XIAOMI_BASE_URL
- Code refs: none in source (used by Hermes adapter externally)
- Documented: yes — in `.env`
- CI: no
- Required / optional: required for Hermes Xiaomi execution
- Has a default: no
- Drift: unused-in-code (external dependency)
- Recommendation: Keep in .env; document as Hermes dependency
