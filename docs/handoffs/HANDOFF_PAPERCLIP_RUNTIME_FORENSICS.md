# Handoff: Paperclip Runtime Forensics and BOS Light E2E Blocker

**Status:** Forensics in progress. Do not run live Paperclip mutations or recovery steps before VPS-side evidence is captured.

**Date:** 2026-06-06

---

## Problem

The user reports a repeated pattern: after testing and attempting production-like BOS Light tasks, the Docker-backed Paperclip runtime at `paperclip.oysana.com` appears to restart/reset, previously configured BOS Light/Paperclip/Hermes/Xiaomi setup is lost, and the team has to restore it again. This has prevented reaching the intended full E2E agentic workflow for one simple task across the planned BOS agents.

This handoff preserves the local forensic findings and the next concrete investigation steps. It does not prove a Docker volume wipe yet.

## Current Local Findings

### Confirmed

1. **Current public health is reachable.**
   - Read-only health probe returned `status=ok`, `deploymentMode=authenticated`, `deploymentExposure=private`, `bootstrapStatus=ready`, `bootstrapInviteActive=false`.
   - Health alone does not prove company/agent/auth persistence.

2. **Runtime identity drift exists across artifacts.**
   - Historical canonical `/BOS`: `43c74adb-b194-44d1-8f8e-ba142544bb9d`.
   - Historical disposable `/BOSA`: `1a194762-74b6-4c84-ae3c-d2d8f6f31578`.
   - Later M012/M013 canonical target: `9feb4c22-05b9-401e-ba67-0e866e3056da`.

3. **Local `.env` has no `PAPERCLIP_COMPANY_ID`.**
   - Present keys only: `OPENAI_API_KEY`, `XIAOMI_API_KEY`, `XIAOMI_BASE_URL`, `PAPERCLIP_BASE_URL`, `PAPERCLIP_EMAIL`, `PAPERCLIP_PASSWORD`.
   - Therefore several scripts fall back to hardcoded company IDs.

4. **Scripts contain hardcoded company IDs.**
   - `scripts/create_bos_v141_agents.py` defaults to old `43c...`.
   - `scripts/m012_s01_canonical_paperclip_readback.js` hardcodes `9feb...` and forcibly replaces `43c...` as stale.
   - `scripts/m013_s02_create_tech_debt_issue.js` hardcodes `9feb...`.
   - M012 validators also expect `9feb...`, so drift became encoded in tests.

5. **Auth worked briefly, then became stale again.**
   - `runtime-evidence/M012-S06-mission-issue-evidence.json` shows session auth success and issue readback for `9feb...` on 2026-06-03T08:07Z.
   - `runtime-evidence/M013-S02-T04-paperclip-issue.json` shows stale Paperclip credentials on 2026-06-04T08:30Z.
   - Key window for remote audit: 2026-06-03 08:00Z through 2026-06-04 09:00Z.

6. **A live mutation governance breach is already recorded.**
   - `runtime-evidence/M012-S07-rescope-decision.json` states BOS-3 was created as a side effect during research without explicit user confirmation.
   - This is why live mutations must be frozen until a stability and confirmation gate exists.

7. **M005 Hermes/Xiaomi “proof” is not full BOS-shaped E2E proof.**
   - `runtime-evidence/M005-S01-hermes-xiaomi-runtime-probe-live-proof.json` has `artifact_type=runtime-execution-proof` and `passing=true`, but `run.resultJson` is `{}`.
   - The pass is based on Hermes stdout/session/exit code, not a complete `resultJson.bos` workflow result.
   - There are 26 M005 S01 live probe variants, many creating agents/runs; several were fail-closed and some captured `running` status at artifact write time.

### Not Confirmed Yet

- No local script was found that directly runs `docker compose down -v`, `docker volume prune`, `docker system prune`, or removes Paperclip volumes.
- The Docker reset/wipe hypothesis requires VPS evidence: Docker events, daemon logs, compose config, mounts/volumes, shell history, and Paperclip data directory inspection.

## Important Existing Contract

Read before touching VPS or live Paperclip:

- `docs/archive/PAPERCLIP_SANDBOX_TESTING_HANDOFF.md`
- `docs/archive/BOS_M004_DEVELOPMENT_HANDOFF.md`

Known sandbox contract:

- VPS: `87.99.146.178`
- Sandbox path: `/opt/paperclip-sandbox`
- Compose project: `paperclip_sandbox`
- Container: `paperclip_sandbox-paperclip-1`
- Expected binding: `127.0.0.1:3131->3100/tcp` on VPS only
- Base compose: `/opt/paperclip-sandbox/docker/docker-compose.quickstart.yml`
- Override: `/opt/paperclip-sandbox/docker-compose.sandbox-override.yml`

Safe restart command only:

```bash
cd /opt/paperclip-sandbox/docker
docker compose -p paperclip_sandbox \
  --env-file /opt/paperclip-sandbox/.env.sandbox \
  -f docker-compose.quickstart.yml \
  -f /opt/paperclip-sandbox/docker-compose.sandbox-override.yml \
  up -d --no-build paperclip
```

Forbidden on VPS unless explicitly approved for destructive recovery:

```bash
docker compose down -v
docker volume prune
docker system prune
docker rm
docker volume rm
```

## Next Action

Perform read-only VPS forensics before any recovery, restart, or live mutation.

### 1. Establish current Docker identity

```bash
date -Is
hostname
docker ps -a --filter name=paperclip --no-trunc
docker inspect paperclip_sandbox-paperclip-1 \
  --format '{{json .Created}} {{json .State.StartedAt}} {{json .RestartCount}} {{json .Image}}'
```

### 2. Capture mounts and volumes

```bash
docker inspect paperclip_sandbox-paperclip-1 \
  --format '{{json .Mounts}}'
docker volume ls
docker volume inspect $(docker inspect paperclip_sandbox-paperclip-1 \
  --format '{{range .Mounts}}{{if eq .Type "volume"}}{{.Name}} {{end}}{{end}}')
```

Goal: prove whether Paperclip state is on a durable named volume/bind mount or only container filesystem.

### 3. Inspect compose config

```bash
cd /opt/paperclip-sandbox/docker
docker compose -p paperclip_sandbox \
  --env-file /opt/paperclip-sandbox/.env.sandbox \
  -f docker-compose.quickstart.yml \
  -f /opt/paperclip-sandbox/docker-compose.sandbox-override.yml \
  config
```

Check for named volumes, bind mounts, anonymous volumes, Paperclip data paths, and auth/trusted-origin env.

### 4. Search Docker events in the critical window

```bash
docker events \
  --since '2026-06-03T08:00:00' \
  --until '2026-06-04T09:00:00' \
  --filter container=paperclip_sandbox-paperclip-1
```

Then broader:

```bash
docker events \
  --since '2026-06-01T00:00:00' \
  --until "$(date -Is)" \
  --filter type=container \
  --filter type=volume
```

Look for `destroy`, `remove`, `die`, `create`, `prune`, or volume removal.

### 5. Check Docker daemon logs

```bash
journalctl -u docker --since '2026-06-01' --no-pager \
  | grep -Ei 'paperclip|volume|destroy|remove|prune|compose|down'
```

### 6. Check shell history for destructive commands

Do not print or copy secrets. Search only command patterns:

```bash
grep -nE 'docker( compose)? down|down -v|--volumes|volume prune|system prune|docker rm|docker volume rm|docker rmi' \
  /root/.bash_history /home/*/.bash_history 2>/dev/null
```

### 7. Inspect Paperclip data directories

```bash
docker exec paperclip_sandbox-paperclip-1 sh -lc '
  date -Is
  ls -la /paperclip
  find /paperclip/instances/default/companies -maxdepth 2 -type d 2>/dev/null | head -100
'
```

Specifically check for these company IDs:

- `43c74adb-b194-44d1-8f8e-ba142544bb9d`
- `1a194762-74b6-4c84-ae3c-d2d8f6f31578`
- `9feb4c22-05b9-401e-ba67-0e866e3056da`

## Follow-up Fixes After Forensics

Do not implement before evidence is captured.

1. Add a runtime lockfile / runbook with authoritative base URL, company ID, compose project, container, mount, safe restart command, and forbidden commands.
2. Require `PAPERCLIP_COMPANY_ID` for all live scripts; remove hardcoded company fallback for mutation paths.
3. Add read-only preflight before every Paperclip POST:
   - health OK;
   - auth OK;
   - target company visible;
   - expected marker/canary visible;
   - adapter registry/testEnvironment visible when needed.
4. Add a persistence canary:
   - create one small native Paperclip marker;
   - read it back;
   - perform safe `up -d --no-build` restart;
   - read it back again;
   - only then permit BOS Light E2E.
5. Tighten Hermes/Xiaomi pass criteria:
   - require `resultJson.bos` with expected schema;
   - require `wakeCountDelta=1`;
   - require terminal run status;
   - do not promote based only on stdout/session id.
6. Freeze cleanup/mutation scripts until explicit user confirmation is available.

## Do Not

- Do not run live Paperclip E2E tasks yet.
- Do not create/delete Paperclip agents, issues, comments, documents, plugins, or runs during forensics.
- Do not “restore again” before preserving Docker/container/volume evidence.
- Do not treat `/api/health` success as proof that Paperclip state persisted.
- Do not treat `9feb...` or `43c...` as canonical without fresh authenticated readback.
- Do not print, copy, or commit secrets.
- Do not claim BOS Light plugin runtime support until plugin load/registration is proven in the live runtime.
- Do not claim full Hermes/Xiaomi E2E until a BOS-shaped result is read back.

## Key Artifacts to Re-read

- `docs/archive/PAPERCLIP_SANDBOX_TESTING_HANDOFF.md`
- `docs/archive/BOS_M004_DEVELOPMENT_HANDOFF.md`
- `docs/archive/08_RUNTIME_CAPABILITY_HEALTH.md`
- `runtime-evidence/M012-S06-mission-issue-evidence.json`
- `runtime-evidence/M012-S07-rescope-decision.json`
- `runtime-evidence/M013-S02-T04-paperclip-issue.json`
- `runtime-evidence/M005-S01-hermes-xiaomi-runtime-probe-live-proof.json`
- `scripts/m012_s01_canonical_paperclip_readback.js`
- `scripts/m013_s02_create_tech_debt_issue.js`
- `scripts/create_bos_v141_agents.py`

## Cold-start Summary for Next Agent

The next useful move is not coding and not another E2E run. It is VPS evidence capture. The local repository shows Paperclip target/auth/company drift and insufficient gates, but does not prove Docker volume deletion. Preserve remote evidence first, then add a stability gate and remove hardcoded company fallbacks before any further live BOS Light work.
