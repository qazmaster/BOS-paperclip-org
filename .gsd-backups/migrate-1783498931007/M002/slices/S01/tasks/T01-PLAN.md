---
estimated_steps: 8
estimated_files: 1
skills_used: []
---

# T01: Confirm sandbox scope and fingerprint runtime

Inspect current repo state and restart access to the Paperclip sandbox only after confirming target scope. Verify the local SSH tunnel or recreate it without exposing Paperclip publicly, then read health and admin session evidence.

Steps:
1. Confirm with the human that the existing Hetzner Paperclip sandbox may be used and whether creating test issues/comments/documents is approved.
2. Check git status and avoid staging secrets or browser state.
3. Recreate local SSH tunnel to VPS loopback 127.0.0.1:3131 if absent.
4. Verify /api/health and browser access to /BOS/costs.
5. Record runtime version/build and environment type if available.
6. Record explicitly that Paperclip core is read-only for this milestone.

## Inputs

- `PAPERCLIP_SANDBOX_TESTING_HANDOFF.md`
- `HANDOFF_REAL_PAPERCLIP_IMPORT_TEST.md`

## Expected Output

- `PAPERCLIP_LIVE_VALIDATION_REPORT.md draft or M002/S01 evidence note with sandbox fingerprint`
- `Redacted command/browser evidence for health, admin, tunnel, version/build, and core read-only boundary`

## Verification

Read-only verification: health endpoint returns ok; browser costs page confirms sandbox admin session; no secrets printed or stored; no Paperclip core modifications.

## Observability Impact

Records operational health, tunnel status, target scope, runtime identity, redacted admin evidence, and core read-only boundary.
