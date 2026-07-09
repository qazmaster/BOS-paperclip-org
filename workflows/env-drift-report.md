# Environment Variable Drift Report

Generated: 2026-06-04

## Summary

22 environment variables identified. **13 have drift** — primarily undocumented variables used in probe scripts and optional auth alternatives.

## Critical Drift (could cause runtime failures)

None. All required variables (`PAPERCLIP_API_KEY`, `PAPERCLIP_BASE_URL`, `XIAOMI_API_KEY`, `XIAOMI_BASE_URL`, `OPENAI_API_KEY`) are present in `.env`.

## Undocumented Variables (in code but not in docs)

| Variable | Used in | Impact |
|----------|---------|--------|
| `GITLAB_TOKEN` | `gitOperations.ts` | Low — alternative to GITHUB_TOKEN |
| `GIT_SSH_KEY` | `gitOperations.ts` | Low — alternative auth method |
| `PAPERCLIP_AUTH_HEADER` | probe script | Low — has default |
| `PAPERCLIP_API_KEY_ENV` | probe script | Low — has default |
| `PAPERCLIP_ISSUE_ID` | probe script | Low — probe-specific |
| `PAPERCLIP_PLUGIN_KEY` | probe script | Low — has default |
| `PAPERCLIP_SANDBOX_COMPANY_ID` | probe script | Low — fallback |
| `PAPERCLIP_SANDBOX_ISSUE_ID` | probe script | Low — fallback |
| `PAPERCLIP_TIMEOUT_SECONDS` | probe script | Low — has default |
| `PAPERCLIP_TOKEN` | reprobe script | Low — alias |
| `PAPERCLIP_URL` | reprobe script | Low — alias |

## Missing in CI

All variables are missing from CI — no CI config exists in the repo. This is expected for a handoff package without automated deployment.

## Unused in Code (in .env but not referenced in source)

| Variable | Reason |
|----------|--------|
| `OPENAI_API_KEY` | Used by Hermes adapter externally |
| `PAPERCLIP_EMAIL` | Web login credential |
| `PAPERCLIP_PASSWORD` | Web login credential |
| `TELEGRAM_BOT_TOKEN` | Not referenced in any source |
| `TELEGRAM_CHAT_ID` | Not referenced in any source |
| `XIAOMI_API_KEY` | Used by Hermes adapter externally |
| `XIAOMI_BASE_URL` | Used by Hermes adapter externally |

## Recommended .env.example

```env
# Required for live Paperclip API calls
PAPERCLIP_API_KEY=
PAPERCLIP_BASE_URL=https://paperclip.oysana.com
PAPERCLIP_COMPANY_ID=

# Required for Hermes Xiaomi execution (external dependency)
OPENAI_API_KEY=
XIAOMI_API_KEY=
XIAOMI_BASE_URL=https://token-plan-sgp.xiaomimimo.com/v1

# Optional: Git authentication (choose one)
# GITHUB_TOKEN=
# GITLAB_TOKEN=
# GIT_SSH_KEY=/path/to/key

# Optional: Telegram notifications
# TELEGRAM_BOT_TOKEN=
# TELEGRAM_CHAT_ID=

# Optional: Paperclip web login (not used in API calls)
# PAPERCLIP_EMAIL=
# PAPERCLIP_PASSWORD=
```

## Action Items

1. **Create `.env.example`** — close the documentation gap for new contributors
2. **Document probe-specific vars** — add comments in `scripts/run_s05_plugin_ui_surface_probe.py` header
3. **Remove or document TELEGRAM vars** — they're in .env but unused in code
