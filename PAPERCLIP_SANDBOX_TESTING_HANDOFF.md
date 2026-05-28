# Handoff: Paperclip Sandbox Testing on Hetzner VPS

Audience: the next AI agent continuing live Paperclip validation for BOS Light.

## Current state

A real Paperclip runtime is running safely on the Hetzner VPS `87.99.146.178` in an isolated sandbox.

- VPS host observed earlier: `dwg-conversion-worker`, Ubuntu 24.04.
- Existing services were preserved; do not stop/remove/prune unrelated Docker resources or services.
- Paperclip sandbox path on VPS: `/opt/paperclip-sandbox`.
- Docker Compose project: `paperclip_sandbox`.
- Container: `paperclip_sandbox-paperclip-1`.
- Binding: `127.0.0.1:3131->3100/tcp` on the VPS only.
- Local browser access uses SSH tunnel: local `127.0.0.1:3131` to VPS `127.0.0.1:3131`.
- Current local background tunnel during the previous session: `bg_shell` id `e1ab0cb6`, label `SSH tunnel to Paperclip sandbox`, port `3131`. If it is gone, recreate it with an SSH local-forward to the VPS loopback port.

## Runtime evidence

Latest observed Paperclip checkout on the VPS:

- Git description: `canary/v2026.525.0-canary.1`
- Commit: `60efa38f868e838e9af2e2168daf0c70afefb9e6`
- Health endpoint on VPS: `curl http://127.0.0.1:3131/api/health`
- Last known health response:

```json
{"status":"ok","deploymentMode":"authenticated","bootstrapStatus":"ready","bootstrapInviteActive":false}
```

Paperclip was started from the repo quickstart compose with an additional sandbox override:

- Base compose: `/opt/paperclip-sandbox/docker/docker-compose.quickstart.yml`
- Override: `/opt/paperclip-sandbox/docker-compose.sandbox-override.yml`
- Important override: `BETTER_AUTH_TRUSTED_ORIGINS=http://127.0.0.1:3131`

Why the override exists: Paperclip rewrote local public URL auth origin to internal port `3100`; browser access through SSH tunnel uses `3131`, so auth needed `3131` in trusted origins.

## Admin account

Admin email created for the human:

```text
kabidenov.a@gmail.com
```

Do not print, copy, or commit the password. It is stored only on the VPS at:

```text
/root/paperclip-sandbox-admin.env
```

Last API proof:

- `GET /api/cli-auth/me` returned `isInstanceAdmin: true`.
- Browser session was restored from a session cookie without exposing the password.

## Browser/UI proof already collected

In the browser at `http://127.0.0.1:3131`:

- Setup gate is cleared.
- User menu shows `Kabidenov Admin`.
- Company exists: `BOS Light Sandbox`.
- Agent exists: `BOS CEO`.
- Issue exists: `BOS-1` with title `Prepare BOS Light live validation workspace`.
- Costs page shows:
  - `No monthly cap configured`
  - `Unlimited budget usage`

API proof from browser session:

```json
{
  "budgetPolicies": [],
  "activeIncidentCount": 0,
  "agents": [
    {
      "name": "BOS CEO",
      "budgetMonthlyCents": 0,
      "status": "error",
      "pauseReason": null
    }
  ],
  "dashboardCosts": {
    "monthSpendCents": 0,
    "monthBudgetCents": 0,
    "monthUtilizationPercent": 0
  }
}
```

Interpretation: Paperclip represents no budget cap as `budgetMonthlyCents: 0` and no active policies. The agent is not budget-paused.

## Known limitation

The starter agent run failed immediately and the issue showed recovery/stranded-run state. This is expected for a fresh isolated Paperclip server with no configured live local Claude/Codex execution path or provider credentials inside the Paperclip runtime.

Do not treat this as a BOS Light failure and do not treat it as a budget failure. It means Paperclip UI/API work, but live agent execution still needs adapter/credential setup.

## Next concrete action

1. Reconnect to the browser tunnel if needed.
2. Verify health and admin session:
   - VPS: `curl http://127.0.0.1:3131/api/health`
   - Browser: open `http://127.0.0.1:3131/BOS/costs` and confirm `Unlimited budget usage`.
3. Decide whether to configure a live execution adapter. If credentials are needed, use secure secret collection; never paste secrets into chat or files.
4. Continue BOS Light validation using Paperclip-native artifacts before trying plugin registration:
   - create/read back issue comments;
   - create/read back issue documents if supported;
   - create a project or issue group for BOS Light validation;
   - mirror BOS division profiles as docs/issues/comments if native agent import is not supported;
   - collect object IDs and readback evidence.
5. Only after native read/write surfaces are proven should you update `plugin-bos-light/capabilities.paperclip-runtime.json`.

## Do not

- Do not expose Paperclip publicly unless the human explicitly asks for it.
- Do not delete/prune Docker containers, images, networks, or volumes on the VPS.
- Do not stop existing non-Paperclip services.
- Do not claim BOS Light plugin support until plugin load/registration is actually proven in this live runtime.
- Do not claim company-template import compatibility until Paperclip accepts the import or equivalent schema mapping with version/build evidence.
- Do not commit secrets, cookies, session files, or VPS root-only env files.

## Useful local repo context

Read these before updating BOS capability posture:

- `HANDOFF_REAL_PAPERCLIP_IMPORT_TEST.md`
- `.gsd/milestones/M001-bo1jcm/M001-bo1jcm-SUMMARY.md`
- `.gsd/milestones/M001-bo1jcm/M001-bo1jcm-VALIDATION.md`
- `plugin-bos-light/capabilities.paperclip-runtime.json`
- `docs/08_RUNTIME_CAPABILITY_HEALTH.md`
- `docs/10_A1_A10_DEMO.md`
