---
estimated_steps: 1
estimated_files: 3
skills_used: []
---

# T01: Session-Auth Canonical Readback Script

Create and execute a Node.js script that authenticates to Paperclip using session-based auth (POST /api/auth/sign-in/email with email/password from .env), then probes the canonical BOS Light company for agents, issues, projects, and goals using cookie-based GET requests. The script must use a .env parser that respects the LAST value for duplicate keys so the correct password is used, without mutating the .env file. Write structured JSON and markdown evidence artifacts to runtime-evidence/. The JSON must include schema_version, artifact_type, auth_method metadata (session-based), company visibility flags, normalized entity counts, and a deviation note about the missing explicit user confirmation for BOS-3. The script must redact all secrets from output and exit 1 if any secret pattern is detected in the serialized artifact.

## Inputs

- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M012-ihd2ez/.env`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M012-ihd2ez/scripts/m012_s01_canonical_paperclip_readback.js`

## Expected Output

- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M012-ihd2ez/scripts/m012_s06_session_auth_readback.js`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M012-ihd2ez/runtime-evidence/M012-S06-session-auth-readback.json`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M012-ihd2ez/runtime-evidence/M012-S06-session-auth-readback.md`

## Verification

node /home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M012-ihd2ez/scripts/m012_s06_session_auth_readback.js

## Observability Impact

JSON evidence artifact with schema_version; if auth fails, script exits non-zero with error_message in stderr; future agents inspect runtime-evidence/M012-S06-session-auth-readback.json for route inventory and blocker_codes
