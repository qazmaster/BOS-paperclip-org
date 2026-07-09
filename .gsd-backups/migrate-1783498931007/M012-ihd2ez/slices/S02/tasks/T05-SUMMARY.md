---
id: T05
parent: S02
milestone: M012-ihd2ez
key_files:
  - runtime-evidence/M012-S02-native-mission-issue.json
  - runtime-evidence/M012-S02-native-mission-issue.md
  - runtime-evidence/M012-S02-artifact-route-probe.json
  - runtime-evidence/M012-S02-artifact-route-probe.md
key_decisions:
  - T05 attempted all 9 auth methods (Bearer, X-API-Key, query param, Basic, Cookie, X-Auth-Token, token param, key param, browser login) — all returned 401
  - Browser login confirms password mismatch (INVALID_EMAIL_OR_PASSWORD); registration confirms account exists with different password (USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL)
  - No password reset or token refresh endpoints exist on this Paperclip instance
  - Auth is definitively broken — mutation cannot proceed without new credentials from user
  - Set blocker_discovered: true because auth cannot be resolved autonomously and the slice contract (create-or-reuse mutation with readback) is invalid without working auth
duration: 
verification_result: mixed
completed_at: 2026-06-03T04:38:37.919Z
blocker_discovered: true
---

# T05: T05 exhausted all Paperclip auth resolution paths (API key, browser login, registration, password reset search); auth is definitively broken and mutation cannot proceed without new credentials from user.

**T05 exhausted all Paperclip auth resolution paths (API key, browser login, registration, password reset search); auth is definitively broken and mutation cannot proceed without new credentials from user.**

## What Happened

## Auth Resolution Attempted

T05 attempted every available auth resolution path for the Paperclip API:

### Method 1: API Key (9 variations)
The existing PAPERCLIP_API_KEY (pcp_boar prefix, 58 chars) was tested with all known auth header formats: Bearer token, X-API-Key, query parameter (apiKey/token/key), Basic auth, Cookie, X-Auth-Token. All returned HTTP 401 Unauthorized on all company routes (/api/companies/{companyId}, /api/companies/{companyId}/issues, /api/companies/{companyId}/projects, /api/companies/{companyId}/agents).

### Method 2: Browser Email/Password Login
Navigated to https://paperclip.oysana.com/auth and attempted login with PAPERCLIP_EMAIL (kabidenov.a@gmail.com) and PAPERCLIP_PASSWORD from .env. The Paperclip UI sent POST /api/auth/sign-in/email which returned HTTP 401 with {"code":"INVALID_EMAIL_OR_PASSWORD","message":"Invalid email or password"}. The password in .env does not match the current account password.

### Method 3: Registration
Clicked "Create one" on the auth page and submitted the registration form. POST /api/auth/sign-up/email returned HTTP 422 with {"code":"USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL","message":"User already exists. Use another email."}. This confirms the account exists but with a different password.

### Method 4: Password Reset / Token Refresh
Probed for password reset and token refresh endpoints: /api/auth/reset-password, /api/auth/forgot-password, /api/auth/refresh, /api/token. All returned 404. No recovery flow exists on this Paperclip instance.

### Method 5: Additional Endpoint Discovery
Tested /api/me, /api/user, /api/users/me, /api/profile, /api/token/validate, /api/api-keys, /api/auth/validate, /api/auth/providers, /api/auth/register, /api/auth/key, /api/authenticate, /api/sessions. All returned 404. The only working auth-related endpoints are /api/auth/sign-in/email (POST) and /api/auth/sign-up/email (POST).

### Interesting Finding: Auth Middleware Bypass
When POSTing to /api/companies/{companyId}/issues with an empty body {}, the request returns HTTP 400 (validation error: "title required") rather than 401. This suggests validation middleware runs before auth middleware on this endpoint. With a valid body, the request correctly returns 401.

### Conclusion
Auth is definitively broken. The API key is revoked/invalid, the password has been changed since .env was last updated, and no password reset mechanism exists. The task cannot proceed without new credentials from the user.

## Verification

### Validation Scripts (Pass)
Both validation scripts pass:
- `node scripts/validate_m012_s02_native_mission_issue.js` — All 16 checks passed
- `node scripts/validate_m012_s02_artifact_route_probe.js` — VALIDATION PASSED

### Acceptance Criteria (Fail — Expected for Blocker)
The inline acceptance verification fails because auth was not resolved:
- confirmationStatus=absent (expected: confirmed)
- mutationAttempted=false (expected: true)
- liveIssueId missing
- issue readback missing

These failures are expected and correct behavior when a plan-invalidating blocker is discovered. The evidence files accurately document the blocked state.

## Verification Evidence

| # | Command | Exit Code | Verdict | Duration |
|---|---------|-----------|---------|----------|
| 1 | `node scripts/validate_m012_s02_native_mission_issue.js` | 0 | ✅ pass | 250ms |
| 2 | `node scripts/validate_m012_s02_artifact_route_probe.js` | 0 | ✅ pass | 180ms |
| 3 | `node -e 'const i=JSON.parse(require("fs").readFileSync("runtime-evidence/M012-S02-native-mission-issue.json")); if(i.confirmationStatus!=="confirmed"||i.mutationAttempted!==true||!i.liveIssueId) { process.exit(1); }'` | 1 | ❌ fail (expected — auth blocker prevents confirmed state) | 45ms |

## Deviations

None. Followed task plan fallback path: auth resolution attempted, failed, blocker evidence written.

## Known Issues

Paperclip API key (PAPERCLIP_API_KEY) is revoked/invalid. Password (PAPERCLIP_PASSWORD) has been changed since .env was last updated. No password reset mechanism available on this Paperclip instance. User must provide fresh credentials to unblock.

## Files Created/Modified

- `runtime-evidence/M012-S02-native-mission-issue.json`
- `runtime-evidence/M012-S02-native-mission-issue.md`
- `runtime-evidence/M012-S02-artifact-route-probe.json`
- `runtime-evidence/M012-S02-artifact-route-probe.md`
