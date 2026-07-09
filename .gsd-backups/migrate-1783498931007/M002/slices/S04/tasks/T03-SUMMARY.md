---
id: T03
parent: S04
milestone: M002
key_files:
  - runtime-evidence/M002-S04-live-artifact-flow.json
  - scripts/run_s04_live_artifact_flow.py
  - scripts/test_run_s04_live_artifact_flow.py
key_decisions:
  - Use secure env collection for PAPERCLIP_API_KEY and never print or persist the token value in evidence.
  - Use supported Paperclip HTTP API routes observed from the live runtime source instead of Paperclip core patches, direct DB writes, or private imports.
  - Record runtime build as health.version:0.3.1 because Paperclip 0.3.1 exposes serverVersion on /api/health but no separate /api/version build endpoint.
duration: 
verification_result: passed
completed_at: 2026-05-29T10:29:39.520Z
blocker_discovered: false
---

# T03: T03 was rerun with a securely supplied Paperclip API key and now produces final live S04 issue/document/comment readback evidence instead of blocker evidence.

**T03 was rerun with a securely supplied Paperclip API key and now produces final live S04 issue/document/comment readback evidence instead of blocker evidence.**

## What Happened

Reopened T03 to replace the prior missing-auth fail-closed blocker with a real authenticated live probe. Collected PAPERCLIP_API_KEY through secure env collection into the M002 worktree dotenv file without printing the secret. The first authenticated run proved the key could create a Paperclip issue but exposed route drift in the S04 runner: issue readback and document/comment paths were using company-scoped shapes that this Paperclip build does not expose. Inspected the live Paperclip route definitions and adjusted the runner/tests to use the supported /api/issues/:id, PUT /api/issues/:id/documents/:key, and /api/issues/:id/comments paths. Added a compact family marker at the top of the BOS artifact body so bounded readback snippets contain all five required artifact families. The final rerun wrote live-evidence with Paperclip runtime version 0.3.1, a health-derived build fingerprint, one issue, one document, one comment, zero approvals, and propagated S02/S03 no-go guards.

## Verification

Fresh verification after the last code change: `python3 -m unittest scripts/test_run_s04_live_artifact_flow.py scripts/test_validate_s04_live_artifact_flow.py` passed 21/21 tests. `python3 scripts/run_s04_live_artifact_flow.py ...` wrote live-evidence, and `python3 scripts/validate_s04_live_artifact_flow.py --evidence runtime-evidence/M002-S04-live-artifact-flow.json --phase final` passed with `S04 live artifact-flow evidence OK: final live artifact proof contract is satisfied.` The final artifact reports runtime_version=0.3.1, runtime_build=health.version:0.3.1, issues_created=1, documents_created=1, comments_created=1, approval_requests_created=0.

## Verification Evidence

| # | Command | Exit Code | Verdict | Duration |
|---|---------|-----------|---------|----------|
| 1 | `python3 -m unittest scripts/test_run_s04_live_artifact_flow.py scripts/test_validate_s04_live_artifact_flow.py` | 0 | ✅ pass: 21 tests | 7400ms |
| 2 | `python3 scripts/run_s04_live_artifact_flow.py --base-url https://paperclip.oysana.com --company-id 1a194762-74b6-4c84-ae3c-d2d8f6f31578 --auth-token-env PAPERCLIP_API_KEY --auth-header-name Authorization --origin https://paperclip.oysana.com --run-label s04-<timestamp> --output runtime-evidence/M002-S04-live-artifact-flow.json` | 0 | ✅ pass: wrote live-evidence | 10400ms |
| 3 | `python3 scripts/validate_s04_live_artifact_flow.py --evidence runtime-evidence/M002-S04-live-artifact-flow.json --phase final` | 0 | ✅ pass: final live artifact proof contract satisfied | 10400ms |

## Deviations

T03 was reopened at user request after a Paperclip API key was supplied through secure env collection. The runner was updated to match the observed Paperclip 0.3.1 supported routes: issue readback at /api/issues/:id, document upsert/readback at /api/issues/:id/documents/:key, and comments at /api/issues/:id/comments. Because /api/version returns 404 in this runtime, build evidence is recorded as the explicit health-derived fingerprint health.version:0.3.1 rather than an invented commit SHA.

## Known Issues

Paperclip /api/version returns 404, so runtime build is represented by the explicit health-derived fingerprint health.version:0.3.1. S02 Hermes and S03 GSD-Pi execution no-go guards remain propagated; T03 does not prove Hermes, GSD-Pi, plugin registration, UI/data/action surfaces, approvals, activity, state, or events.

## Files Created/Modified

- `runtime-evidence/M002-S04-live-artifact-flow.json`
- `scripts/run_s04_live_artifact_flow.py`
- `scripts/test_run_s04_live_artifact_flow.py`
