# Handoff: M002 Runtime Adapter Validation and Paperclip Exposure

Audience: the next AI agent or human continuing BOS Light after this session. This file is current as of the handoff; older M001-era guidance below has been superseded by the actual M002 progress.

## Current project state

- Active milestone: `M002: Runtime Adapter Validation for Paperclip`.
- Active slice: `S04: Live BOS artifact flow with Hermes no-go guard`.
- Current GSD phase: `replanning-slice`.
- Reason: S04/T03 discovered a real blocker — no authenticated Paperclip API credential env was available in autonomous execution, so final live artifact proof could not be produced.
- GSD handoff anchor: `.gsd/milestones/M002/slices/S04/continue.md`.
- Latest task summary: `.gsd/milestones/M002/slices/S04/tasks/T03-SUMMARY.md`.

## Milestone progress

M002 status from GSD DB:

| Slice | Status | Notes |
|---|---:|---|
| S01 | complete | Sandbox/runtime preflight and live validation report boundaries established. |
| S02 | complete | Hermes environment readiness proven, but Hermes execution remains fail-closed/no-go. |
| S03 | complete | `gsd` command availability in Paperclip container proven; `gsdpi_local` registration/execution remains fail-closed/no-go. |
| S04 | pending | T01-T03 done; T03 is blocker evidence, not final proof. Replan before T04. |
| S05 | pending | No tasks planned/executed yet. |
| S06 | pending | No tasks planned/executed yet. |

## What happened in S04

- T01 added a live Paperclip adapter/composer around BOS Light BPI, Blueprint, Betting Table, Eval Gate, and Circuit Breaker envelopes.
- T02 added standard-library live runner and validator:
  - `scripts/run_s04_live_artifact_flow.py`
  - `scripts/validate_s04_live_artifact_flow.py`
  - focused tests for runner/validator.
- T03 ran the bounded probe path and wrote:
  - `runtime-evidence/M002-S04-live-artifact-flow.json`
- Current evidence is intentionally:
  - `artifact_type: fail-closed-blocker`
  - `blocker_reason: missing_auth_token_env`
- T03 verified:
  - sandbox health via local tunnel,
  - runner fail-closed behavior,
  - `--phase live` validation accepts the blocker artifact,
  - `--phase final` validation rejects it, as expected, because there are no live readback refs,
  - unit tests and py_compile pass,
  - secret scan over evidence found no secret-like values,
  - side-effect counts are all zero.

Do not treat the T03 artifact as live Paperclip artifact proof. It is diagnostic blocker evidence.

## Current S04 blocker

The S04 final contract requires actual Paperclip-visible issue/document/comment write/readback proof. During autonomous execution there was no credential-bearing env var such as:

- `PAPERCLIP_API_KEY`, or
- an equivalent cookie/header env.

The runner correctly stopped before mutation and did not attempt unauthenticated writes. This is the right behavior.

## Paperclip public exposure completed

The Paperclip sandbox is now reachable at:

```text
https://paperclip.oysana.com
```

VPS:

```text
87.99.146.178
```

What changed on the VPS:

- Installed `nginx`, `certbot`, and `python3-certbot-nginx`.
- Created nginx vhost for `paperclip.oysana.com`.
- Configured reverse proxy to Paperclip upstream:
  - external: `https://paperclip.oysana.com`
  - internal: `http://127.0.0.1:3131`
- Issued Let's Encrypt certificate for `paperclip.oysana.com`.
- Certbot auto-renew is enabled.
- Opened UFW `80/tcp` and `443/tcp`.
- Preserved existing UFW rules for `22`, `8080`, `9000`, `6379`.
- Paperclip Docker container remains loopback-only:
  - `127.0.0.1:3131->3100/tcp`
- Added supported Paperclip hostname/public URL config in `/opt/paperclip-sandbox/docker-compose.sandbox-override.yml`:

```yaml
services:
  paperclip:
    environment:
      PAPERCLIP_PUBLIC_URL: "https://paperclip.oysana.com"
      PAPERCLIP_ALLOWED_HOSTNAMES: "paperclip.oysana.com"
      BETTER_AUTH_TRUSTED_ORIGINS: "http://127.0.0.1:3131,http://paperclip.oysana.com,https://paperclip.oysana.com"
```

Final exposure checks passed:

```text
http://paperclip.oysana.com/api/health -> 301 to https
https://paperclip.oysana.com/api/health -> {"status":"ok","deploymentMode":"authenticated","bootstrapStatus":"ready","bootstrapInviteActive":false}
https://paperclip.oysana.com/BOS/costs -> 200 OK
nginx -t -> OK
nginx service -> active
```

## Important operational notes

- Do not print passwords, tokens, cookies, API keys, bootstrap invite URLs, or session values in chat or committed files.
- User asked for login/password after exposure. Do not dump credentials. Use a safe Paperclip auth flow.
- Paperclip CLI shows:

```bash
pnpm paperclipai auth bootstrap-ceo --help
```

This can create a one-time admin invite, but the invite URL is itself a secret. If used, pass it through a secure channel, not chat or repo files.

## How to manage the sandbox compose safely

Existing container labels showed the correct compose invocation:

- working dir: `/opt/paperclip-sandbox/docker`
- project: `paperclip_sandbox`
- env file: `/opt/paperclip-sandbox/.env.sandbox`
- compose files:
  - `docker-compose.quickstart.yml`
  - `/opt/paperclip-sandbox/docker-compose.sandbox-override.yml`

Use:

```bash
cd /opt/paperclip-sandbox/docker
docker compose -p paperclip_sandbox \
  --env-file /opt/paperclip-sandbox/.env.sandbox \
  -f docker-compose.quickstart.yml \
  -f /opt/paperclip-sandbox/docker-compose.sandbox-override.yml \
  up -d --no-build paperclip
```

A prior mistaken compose invocation without `-p paperclip_sandbox` attempted to use project `docker` and failed with missing image `docker-paperclip:latest`; it did not replace the working container. Avoid that path.

## Next concrete action

1. Read:

```text
.gsd/STATE.md
.gsd/milestones/M002/slices/S04/continue.md
.gsd/milestones/M002/slices/S04/tasks/T03-SUMMARY.md
.gsd/milestones/M002/slices/S04/S04-PLAN.md
runtime-evidence/M002-S04-live-artifact-flow.json
```

2. Replan S04 with GSD tooling before executing T04. The likely plan change is to insert an auth/remediation task before T04:

- establish a safe authenticated Paperclip API boundary for the sandbox,
- rerun `scripts/run_s04_live_artifact_flow.py`,
- require final validation to pass,
- then close docs/capability posture in T04.

3. Once auth is available, rerun with only env var names in commands, never values. Example shape:

```bash
python3 scripts/run_s04_live_artifact_flow.py \
  --base-url https://paperclip.oysana.com \
  --company-id <sandbox-company-id> \
  --auth-token-env PAPERCLIP_API_KEY \
  --auth-header-name Authorization \
  --origin https://paperclip.oysana.com \
  --output runtime-evidence/M002-S04-live-artifact-flow.json

python3 scripts/validate_s04_live_artifact_flow.py \
  --evidence runtime-evidence/M002-S04-live-artifact-flow.json \
  --phase final
```

Use the actual company id from current Paperclip/session evidence; do not guess if the authenticated API reveals a different active company.

## Verification commands to keep using

S04-specific:

```bash
python3 -m unittest scripts/test_run_s04_live_artifact_flow.py scripts/test_validate_s04_live_artifact_flow.py
python3 -m py_compile scripts/run_s04_live_artifact_flow.py scripts/validate_s04_live_artifact_flow.py
python3 scripts/validate_s04_live_artifact_flow.py --evidence runtime-evidence/M002-S04-live-artifact-flow.json --phase live
python3 scripts/validate_s04_live_artifact_flow.py --evidence runtime-evidence/M002-S04-live-artifact-flow.json --phase final
```

Broader runtime/capability checks before claiming M002 closure:

```bash
python3 scripts/validate_runtime_capabilities.py
npm --prefix plugin-bos-light run typecheck
npm --prefix plugin-bos-light test
```

## Do not

- Do not claim S04 final live proof from the current blocker artifact.
- Do not patch Paperclip core, mutate the DB directly, or inline plaintext secrets.
- Do not work around S02 Hermes or S03 GSD-Pi no-go guards.
- Do not expose Paperclip container directly; keep nginx as the public boundary.
- Do not remove or overwrite unrelated VPS services on `8080`, `9000`, `6379`, or SSH.
- Do not commit browser state, cookies, session files, credentials, or invite URLs.
