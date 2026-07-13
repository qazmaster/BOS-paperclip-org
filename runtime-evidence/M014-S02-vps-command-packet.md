# M014-a9jj46 / S02 / T01 — VPS Read-Only Forensic Command Packet

**Milestone:** M014-a9jj46 — Paperclip Runtime Stability Gate for BOS Light E2E
**Slice:** S02 — VPS Read Only Forensics
**Task:** T01 — Prepare read-only forensic command packet
**Generated:** 2026-07-11
**Author:** GSD auto-mode executor (T01)
**Companion machine-readable file:** `runtime-evidence/M014-S02-vps-command-packet.json`
**Scope:** Read-only inspection only. **T01 does NOT SSH or run remote commands.** T02 will execute this packet only after explicit user confirmation.

---

## 0. Purpose + freshness posture

This packet turns the **S01 runtime truth map** (`runtime-evidence/M014-S01-runtime-truth-map.json/.md`) and the **HANDOFF_PAPERCLIP_RUNTIME_FORENSICS handoff checklist** (`docs/handoffs/HANDOFF_PAPERCLIP_RUNTIME_FORENSICS.md`) into a fixed list of read-only VPS commands. Every command is mapped to:

- **Why it is read-only** — what makes it non-mutating.
- **What it proves** — the runtime fact it surfaces.
- **Which hypothesis it supports or refutes** — wipe, recreate, auth drift, ownership drift, proxy drift, or inconclusive.
- **Redaction class** — what subset of secrets, if any, must never appear in captured output.

The packet also enumerates **18 forbidden commands** that S02 must never run, with rationale and source.

**Snapshot policy.** This is a snapshot dated 2026-07-11. It must be re-derived when any of these trigger:

- any change to M014-S01 truth map `vps_targets` (§11);
- any change to HANDOFF_PAPERCLIP_RUNTIME_FORENSICS `Next Action` commands;
- any change to the safe-restart command in `docs/archive/PAPERCLIP_SANDBOX_TESTING_HANDOFF.md`;
- any new GSD memory entry tagged `Paperclip-runtime-stability` affecting the VPS contract.

---

## 1. Authority verdict at a glance

| Authority band | What lives here | Why it is authoritative |
|---|---|---|
| Authoritative doctrine | BOS Light v1.4.1 baseline + R026 boundary patch | Both sibling source packages converge on the same v1.4.1 baseline; R026 adds a boundary invariant, does not remap divisions. |
| Authoritative forensic handoff | `HANDOFF_PAPERCLIP_RUNTIME_FORENSICS.md` + spike `RECOMMENDATION.md` | Written from the same investigation window as the user-reported symptom; cited by milestone context. |
| Authoritative VPS operations contract | `docs/archive/PAPERCLIP_SANDBOX_TESTING_HANDOFF.md` | VPS paths, compose project, container name, and the only approved safe-restart command. |
| Provisional runtime evidence | All `runtime-evidence/M012-S06-*`, `M013-S02-*`, `M005-S01-*`, `M002-S12-*` | Cites exact epochs; freshness must be re-probed before mutation. |
| Project memory | `.gsd/KNOWLEDGE.md` (R1–R6, P1) + GSD memory store (MEM046/049/053/054/056/058/071/133/139/288/295/324/325/336) | Durable conventions and gotchas; mirrored from earlier session outputs. |
| S01 truth map (consumed) | `runtime-evidence/M014-S01-runtime-truth-map.json/.md` | Source of `vps_targets`, `failure_window_evidence`, `health_endpoint_policy`, `auth_status`, `runtime_surfaces`. |

---

## 2. VPS targets (mirror of S01 truth map §11)

| Field | Value |
|---|---|
| VPS IP | `87.99.146.178` |
| Sandbox path | `/opt/paperclip-sandbox` |
| Compose project | `paperclip_sandbox` |
| Container | `paperclip_sandbox-paperclip-1` |
| Container binding | `127.0.0.1:3131->3100/tcp` on VPS only |
| Public ingress | `https://paperclip.oysana.com` |
| Browser tunnel | local `127.0.0.1:3131` ←SSH→ VPS `127.0.0.1:3131` |
| Base compose | `/opt/paperclip-sandbox/docker/docker-compose.quickstart.yml` |
| Override compose | `/opt/paperclip-sandbox/docker-compose.sandbox-override.yml` |
| Auth override env | `BETTER_AUTH_TRUSTED_ORIGINS=http://127.0.0.1:3131` |
| Admin email | `kabidenov.a@gmail.com` (in repo knowledge; password in `/root/paperclip-sandbox-admin.env` — **never print or commit**) |

### 2.1 Approved safe-restart command (do not deviate; S02 does not run it)

```bash
cd /opt/paperclip-sandbox/docker && \
  docker compose -p paperclip_sandbox \
    --env-file /opt/paperclip-sandbox/.env.sandbox \
    -f docker-compose.quickstart.yml \
    -f /opt/paperclip-sandbox/docker-compose.sandbox-override.yml \
    up -d --no-build paperclip
```

**S02 T02 does NOT execute this command.** This is recorded here only so T02 operators can recognize whether the running container was started via the approved path.

---

## 3. Execution gate (T02 only — T01 does not run anything)

These preconditions **must** be satisfied before T02 begins. T01 explicitly does not perform them.

- **Explicit user confirmation** for VPS read-only inspection recorded in T02.
- SSH access to `87.99.146.178` as non-root operator OR root with sudo to docker group.
- Local evidence-output directory writable: `runtime-evidence/`.
- Operator rule: do not run any forbidden command listed in §6.
- Operator rule: redirect every command output to `runtime-evidence/M014-S02-vps-forensics.json` or `.md` via `tee` or shell redirection; never paste secrets into chat.
- Operator rule: if any command fails or returns a stack trace, capture full stderr verbatim.
- Operator rule: stop and write a fail-closed blocker if a mutation is accidentally triggered or VPS host identity (C-1.2) does not match expected.

**T02 execution order:** `C-1 → C-2 → C-3 → C-4 → C-5 → C-6 → C-7 → C-8 → C-9 → C-10 → C-11 → C-12`.

---

## 4. Redaction policy (applied to every captured output)

### 4.1 Never print or store

- Session cookies (e.g. `__Secure-paperclip-default.session_token` value).
- Admin password (in `/root/paperclip-sandbox-admin.env`).
- `POSTGRES_PASSWORD`, `DATABASE_URL`, `REDIS_PASSWORD`, `OPENAI_API_KEY`, `XIAOMI_API_KEY` values.
- `TELEGRAM_BOT_TOKEN` value.
- Any URL containing embedded credentials (`user:pass@host`).
- `BETTER_AUTH_SECRET`, `BETTER_AUTH_SESSION_SECRET`, `JWT_SECRET` values.
- API keys, bearer tokens, raw `Authorization` headers.

### 4.2 Allowlisted to print (no secrets, but useful diagnostics)

- Key names present in env (e.g. `BETTER_AUTH_TRUSTED_ORIGINS=`) but with value SHA-256 truncated.
- File path, file size, file mtime, permission bits (e.g. `drwxr-xr-x`).
- Container ID, image ID, image tag (full digest ok; tags are not secrets).
- Compose config keys (env names) but not values.
- Service ports, listening sockets.
- Systemd unit status (`running`/`failed`/`dead`).

**Validator reference:** `scripts/validate_m014_s02_vps_forensics.js` (built in T03) must reject any output containing literal redaction targets (regex allowlist). The redaction-policy shape is defined here so T03 can directly import it.

---

## 5. Hypothesis matrix

S02 verdict (T03) is one of these six outcomes. Each approved command below cites which hypotheses it supports or refutes.

| ID | Title | Summary |
|---|---|---|
| **H-WIPE** | Docker / Paperclip data volume wipe or delete | A docker volume, compose-managed anonymous volume, or `/paperclip` data tree was destroyed; runtime evidence would show destroy/remove events, prune/rm commands in shell history, missing named volume, or missing `/paperclip/instances/default/companies/<id>`. |
| **H-RECREATE** | Container destroyed and recreated (data intact) | Container was stopped/destroyed and a new container was started without data loss; runtime evidence would show non-zero `RestartCount`, recent `StartedAt`/`Created` post failure-window, multiple die/create events in window. |
| **H-AUTH-DRIFT** | Auth credentials, session cookie, or admin password drift (no data loss) | Credentials, session cookies, or admin password were rotated, expired, or revoked; runtime evidence would show `/api/health` ok but session 401, missing `PAPERCLIP_COMPANY_ID` in `.env`. |
| **H-OWNERSHIP-DRIFT** | Filesystem UID / GID ownership drift (bind mount perms) | Container filesystem UID/GID changed or bind mount perms mismatched; runtime evidence would show wrong owner on `/paperclip` or Postgres data dir. |
| **H-PROXY-DRIFT** | nginx / reverse-proxy / ingress config drift | Public ingress changed: nginx config drift, `BETTER_AUTH_TRUSTED_ORIGINS` missing or wrong, public host 502/403, or Trusted Origin header handling changed. |
| **H-INCONCLUSIVE** | Inconclusive — none of the above can be confirmed | Evidence is mixed, partial, or insufficient to commit to a verdict. T03 must write a precise fail-closed blocker explaining the residual unknowns and required next inspection step. |

### 5.1 What each hypothesis needs to be confirmed

- **H-WIPE:** destroy/remove events **OR** shell-history destructive commands **OR** missing company dirs **OR** anonymous volume in use.
- **H-RECREATE:** `RestartCount > 0` **OR** `StartedAt`/`Created` after `2026-06-04T09:00:00Z` **OR** multiple die/create events in window.
- **H-AUTH-DRIFT:** session-cookie POST returns 401 **OR** admin artifacts missing **OR** `PAPERCLIP_COMPANY_ID` env not present.
- **H-OWNERSHIP-DRIFT:** `/paperclip` wrong UID/GID **OR** Postgres permission-denied logs.
- **H-PROXY-DRIFT:** nginx config mtime in window **OR** `BETTER_AUTH_TRUSTED_ORIGINS` missing/wrong **OR** public `/api/health` returns 502/403.
- **H-INCONCLUSIVE:** none of the above matches with confidence.

### 5.2 What refutes each hypothesis

- **H-WIPE refuted:** named volume present and bound + company directory persists with expected IDs.
- **H-RECREATE refuted:** `RestartCount = 0` + `StartedAt` pre failure-window + no die/create events.
- **H-AUTH-DRIFT refuted:** session-cookie POST returns 200 + admin artifacts present.
- **H-OWNERSHIP-DRIFT refuted:** `/paperclip` owned by paperclip UID/GID + Postgres starts clean.
- **H-PROXY-DRIFT refuted:** nginx config mtime older than failure-window + `BETTER_AUTH_TRUSTED_ORIGINS` matches + public `/api/health` 200.
- **H-INCONCLUSIVE refuted:** at least one of H-WIPE / H-RECREATE / H-AUTH-DRIFT / H-OWNERSHIP-DRIFT / H-PROXY-DRIFT is confirmed.

---

## 6. Approved commands (12 groups, 31 commands)

Each command is identified as `C-<group>.<n>`, is **read-only**, has a `why`/`proves` explanation, and lists which hypotheses it supports or refutes.

### 6.1 C-1 — VPS identity & timing baseline

Purpose: establish host identity and current time as evidence anchor.

| ID | Command | Why read-only | What it proves | H supports | H refutes |
|---|---|---|---|---|---|
| C-1.1 | `date -Is` | clock read | capture moment, anti-replay anchor | — | — |
| C-1.2 | `hostname` | kernel data read | VPS identity matches known host | — | — |
| C-1.3 | `uptime` | kernel data read | VPS has not been rebooted recently | — | — |
| C-1.4 | `cat /etc/os-release` | static file read | Ubuntu 24.04 family still in place | — | — |

### 6.2 C-2 — Docker container identity (H-RECREATE primary)

| ID | Command | Why read-only | What it proves | H supports | H refutes |
|---|---|---|---|---|---|
| C-2.1 | `docker ps -a --filter name=paperclip --no-trunc` | read-only | multiple paperclip-named containers? | H-RECREATE | — |
| C-2.2 | `docker inspect paperclip_sandbox-paperclip-1 --format '{{json .Created}} {{json .State.StartedAt}} {{json .RestartCount}} {{json .Image}}'` | inspect only | `RestartCount>0`, `StartedAt` post window? | H-RECREATE | H-RECREATE |
| C-2.3 | `docker inspect paperclip_sandbox-paperclip-1 --format '{{json .Id}} {{json .Name}} {{json .Config.Image}} {{json .State.Status}} {{json .State.ExitCode}}'` | inspect only | live container ID for cross-reference | H-RECREATE | H-RECREATE |

### 6.3 C-3 — Mounts & volumes (H-WIPE primary, H-OWNERSHIP secondary)

| ID | Command | Why read-only | What it proves | H supports | H refutes |
|---|---|---|---|---|---|
| C-3.1 | `docker inspect paperclip_sandbox-paperclip-1 --format '{{json .Mounts}}'` | inspect only | `/paperclip` is named volume / bind / anonymous | H-WIPE, H-OWNERSHIP | H-WIPE |
| C-3.2 | `docker volume ls` | inspect only | whether paperclip_sandbox has any named volume | H-WIPE | H-WIPE |
| C-3.3 | `docker volume inspect $(docker inspect paperclip_sandbox-paperclip-1 --format '{{range .Mounts}}{{if eq .Type "volume"}}{{.Name}} {{end}}{{end}}')` | inspect only | mountpoint path, labels, scope | H-WIPE, H-OWNERSHIP | H-WIPE |
| C-3.4 | `ls -la /opt/paperclip-sandbox/data 2>/dev/null \|\| echo 'MISSING'` | host read | host-side data tree existence | H-WIPE | H-WIPE |

### 6.4 C-4 — Compose effective config

| ID | Command | Why read-only | What it proves | H supports | H refutes |
|---|---|---|---|---|---|
| C-4.1 | `cd /opt/paperclip-sandbox/docker && docker compose -p paperclip_sandbox --env-file /opt/paperclip-sandbox/.env.sandbox -f docker-compose.quickstart.yml -f /opt/paperclip-sandbox/docker-compose.sandbox-override.yml config` | config dump only — does NOT start anything | effective volumes, env, ports; missing `BETTER_AUTH_TRUSTED_ORIGINS`? | H-WIPE, H-OWNERSHIP, H-PROXY | H-WIPE, H-PROXY |

### 6.5 C-5 — Docker events in failure window

| ID | Command | Why read-only | What it proves | H supports | H refutes |
|---|---|---|---|---|---|
| C-5.1 | `docker events --since '2026-06-03T08:00:00' --until '2026-06-04T09:00:00' --filter container=paperclip_sandbox-paperclip-1` | event-log read | die/destroy/remove/create events in window | H-WIPE, H-RECREATE | H-WIPE, H-RECREATE |
| C-5.2 | `docker events --since '2026-06-01T00:00:00' --until "$(date -Is)" --filter type=container --filter type=volume` | event-log read | broader sweep when C-5.1 returns empty | H-WIPE, H-RECREATE | H-WIPE, H-RECREATE |

### 6.6 C-6 — Docker daemon logs

| ID | Command | Why read-only | What it proves | H supports | H refutes |
|---|---|---|---|---|---|
| C-6.1 | `journalctl -u docker --since '2026-06-01' --no-pager \| grep -Ei 'paperclip\|volume\|destroy\|remove\|prune\|compose\|down'` | journal read | daemon-side destroy/remove/prune/compose down log lines | H-WIPE, H-RECREATE | H-WIPE, H-RECREATE |

### 6.7 C-7 — Shell history destructive-command search (H-WIPE primary)

| ID | Command | Why read-only | What it proves | H supports | H refutes |
|---|---|---|---|---|---|
| C-7.1 | `grep -nE 'docker( compose)? down\|down -v\|--volumes\|volume prune\|system prune\|docker rm\|docker volume rm\|docker rmi' /root/.bash_history /home/*/.bash_history 2>/dev/null \|\| echo 'NO_MATCH'` | grep on history only | operator has issued destructive docker commands in window | H-WIPE | — |

> **Operator rule for C-7.1:** any line containing a credential substring is redacted to `<redacted>` before write. Pattern matches: passwords, API keys, JWT, Telegram tokens.

### 6.8 C-8 — Paperclip data directory presence (H-WIPE primary, H-OWNERSHIP secondary)

| ID | Command | Why read-only | What it proves | H supports | H refutes |
|---|---|---|---|---|---|
| C-8.1 | `docker exec paperclip_sandbox-paperclip-1 sh -lc 'date -Is; ls -la /paperclip'` | `ls -la` only inside container | `/paperclip` tree existence + ownership bits | H-WIPE, H-OWNERSHIP | H-WIPE |
| C-8.2 | `docker exec paperclip_sandbox-paperclip-1 sh -lc 'find /paperclip/instances/default/companies -maxdepth 2 -type d 2>/dev/null \| head -100'` | `find` read-only | which company UUIDs still exist on disk | H-WIPE | H-WIPE |
| C-8.3 | `docker exec paperclip_sandbox-paperclip-1 sh -lc 'for id in 43c74adb-b194-44d1-8f8e-ba142544bb9d 1a194762-74b6-4c84-ae3c-d2d8f6f31578 9feb4c22-05b9-401e-ba67-0e866e3056da 7595fd85-0000-0000-0000-000000000000 7eede16c-0000-0000-0000-000000000000 8233ea7b-0000-0000-0000-000000000000; do echo "== $id =="; ls -la /paperclip/instances/default/companies/$id 2>/dev/null \|\| echo MISSING; done'` | read-only inside container | per-UUID existence + ownership on disk | H-WIPE, H-OWNERSHIP | H-WIPE |

> **Placeholder note:** the three R3 stale IDs `7595fd85-…`, `7eede16c-…`, `8233ea7b-…` are full UUIDs in the JSON twin; the literal ellipsis form in C-8.3 above must be replaced with the full UUIDs before T02 execution (operator rule). The JSON twin already carries the allowlisted form.

### 6.9 C-9 — Postgres / data layer (H-WIPE, H-OWNERSHIP)

| ID | Command | Why read-only | What it proves | H supports | H refutes |
|---|---|---|---|---|---|
| C-9.1 | `docker exec paperclip_sandbox-paperclip-1 sh -lc 'ls -la /var/lib/postgresql/data 2>/dev/null \| head -30'` | `ls -la` only | Postgres data dir presence + ownership bits | H-WIPE, H-OWNERSHIP | H-WIPE |
| C-9.2 | `docker exec paperclip_sandbox-paperclip-1 sh -lc 'pg_isready -h 127.0.0.1 -p 5432 2>/dev/null \|\| echo PG_NOT_READY'` | `pg_isready` is read-only | Postgres is up inside container | H-WIPE, H-OWNERSHIP | H-WIPE, H-OWNERSHIP |
| C-9.3 | `docker logs --tail 200 paperclip_sandbox-paperclip-1 2>&1 \| grep -Ei 'permission\|chown\|denied\|EACCES\|fatal' \| head -50` | log scan only | permission/EACCES or fatal error log lines | H-WIPE, H-OWNERSHIP | H-WIPE, H-OWNERSHIP |

### 6.10 C-10 — Auth state inspection (H-AUTH-DRIFT)

| ID | Command | Why read-only | What it proves | H supports | H refutes |
|---|---|---|---|---|---|
| C-10.1 | `docker exec paperclip_sandbox-paperclip-1 sh -lc 'ls -la /paperclip/instances/default/admin 2>/dev/null \| head -20'` | `ls -la` only | admin session/instance artifacts present? | H-AUTH-DRIFT | H-AUTH-DRIFT |
| C-10.2 | `docker logs --tail 500 paperclip_sandbox-paperclip-1 2>&1 \| grep -Ei 'auth\|sign-in\|session\|cookie\|trusted\|origin' \| head -50` | log scan only | recent auth attempts, session resets, trusted-origin errors | H-AUTH-DRIFT | H-AUTH-DRIFT |

> **Operator rule for C-10.2:** any cookie value substring is redacted to `<redacted>` before write.

### 6.11 C-11 — Network / proxy / ingress mapping (H-PROXY primary)

| ID | Command | Why read-only | What it proves | H supports | H refutes |
|---|---|---|---|---|---|
| C-11.1 | `ss -tlnp \| grep -E '3131\|3100\|nginx\|http'` | socket table read | port 3131 / 3100 binding state | H-PROXY | H-PROXY |
| C-11.2 | `docker exec paperclip_sandbox-paperclip-1 sh -lc 'cat /etc/hosts 2>/dev/null; echo ---; getent hosts paperclip.oysana.com 2>/dev/null \|\| echo NO_RESOLVE'` | static read | container-internal DNS | — | — |
| C-11.3 | `ls -la /etc/nginx/ 2>/dev/null \| head -50` | directory read | nginx config mtime | H-PROXY | H-PROXY |
| C-11.4 | `docker exec paperclip_sandbox-paperclip-1 sh -lc 'env \| grep -E "BETTER_AUTH_TRUSTED_ORIGINS\|PAPERCLIP_\|ADMIN_" \| sed -E "s/=.*$/=<value-sha256-truncated>/"'` | env read + value truncation | `BETTER_AUTH_TRUSTED_ORIGINS` present + hash | H-PROXY | H-PROXY |
| C-11.5 | `curl -sS -I https://paperclip.oysana.com/api/health` | headers only, no cookies | public ingress reachability | H-PROXY | H-PROXY |

### 6.12 C-12 — Sandbox env file presence (H-AUTH-DRIFT, H-PROXY)

| ID | Command | Why read-only | What it proves | H supports | H refutes |
|---|---|---|---|---|---|
| C-12.1 | `ls -la /opt/paperclip-sandbox/.env.sandbox 2>/dev/null \|\| echo MISSING` | metadata only — contents never printed | env file presence + mtime + permission bits | H-AUTH-DRIFT | — |
| C-12.2 | `wc -l /opt/paperclip-sandbox/.env.sandbox 2>/dev/null \|\| echo MISSING` | count only | env file size without exposing values | — | — |

---

## 7. Forbidden commands (18 patterns — never run in S02)

| ID | Pattern | Rationale | Source |
|---|---|---|---|
| F-1 | `docker compose down -v` | Destroys named and anonymous volumes; primary cause of H-WIPE. | `HANDOFF_PAPERCLIP_RUNTIME_FORENSICS.md` "Forbidden on VPS unless explicitly approved for destructive recovery". |
| F-2 | `docker volume prune` | Removes all unused volumes; can wipe Paperclip data if mount is anonymous/unused. | Same. |
| F-3 | `docker system prune` | Removes unused images, containers, networks; high blast radius. | Same. |
| F-4 | `docker rm` | Removes containers; can orphan volumes and trigger H-WIPE in subsequent recreate. | Same. |
| F-5 | `docker volume rm` | Removes named volumes directly; direct H-WIPE cause. | Same. |
| F-6 | `docker stop / docker kill / docker restart <container>` | Changes runtime state; forbidden in S02 because evidence must be captured before any restart. | Slice S02 must-haves + handoff. |
| F-7 | `docker exec ... sh -c '... mutation ...'` | Any mutation command inside the container (touch, mkdir, chmod, chown, rm, mv, psql -c, tee, sed -i, `>`, `>>`). | Slice must-haves; Q3 controls. |
| F-8 | `docker exec ... psql -c "..."` | Database mutation via exec; forbidden unless explicitly approved. | Slice must-haves; R3. |
| F-9 | `chmod / chown / chgrp` | Ownership/permission mutation; can fake or mask H-OWNERSHIP. | Q3 controls. |
| F-10 | `rm / mv / cp` (filesystem mutation) | Any direct filesystem mutation on host or container. | Slice must-haves. |
| F-11 | `curl -X POST\|PUT\|PATCH\|DELETE https://paperclip.oysana.com/...` | Any Paperclip API mutation; S02 is read-only; S05 is the only slice that may attempt bounded E2E after gates. | Slice must-haves; MEM053 + GR-001. |
| F-12 | `curl -X POST\|PUT\|PATCH\|DELETE http://127.0.0.1:3131/...` | Same as F-11 but via SSH tunnel. No mutation before evidence capture. | Slice must-haves. |
| F-13 | `wget ... \| sh / bash` | Remote-fetch + execute is a documented footgun pattern; never permitted. | Zero-trust rule; MEM053. |
| F-14 | `systemctl stop / restart docker` | Daemon-level mutation that erases running daemon events/journal context. | Q3 controls. |
| F-15 | `passwd / chpasswd / usermod` | Credential mutation; can mask H-AUTH-DRIFT. | GR-001 + R2. |
| F-16 | `crontab -e / crontab -r` | Cron mutation; can schedule destructive jobs later. | Q3 controls. |
| F-17 | `tee / > / >>` (write mutation operators) | When chained to `/etc/`, `/paperclip/`, or `/var/lib/postgresql/`, constitutes filesystem mutation. Allowed only when redirecting command output to `runtime-evidence/`. | Q3 controls; slice must-haves. |
| F-18 | `tail -f / watch / nc / ncat / socat` | Long-running or interactive commands that block evidence capture and risk exfiltration channels. | Q3 controls + zero-trust. |

---

## 8. Evidence anti-replay (T02 contract)

Every captured command output **must** include these metadata fields before being written to `runtime-evidence/M014-S02-vps-forensics.json`:

- `capture_time_utc`
- `vps_hostname`
- `vps_ip`
- `operator_role`
- `command_id` (matches `command_groups[].commands[].id`)
- `command_text`
- `exit_code`
- `sha256_of_captured_output`
- `redaction_applied` (true|false)

`scripts/validate_m014_s02_vps_forensics.js` (built in T03) must reject any captured output missing these fields.

---

## 9. Downstream handoff

### 9.1 S02 T02 (capture)

- **Executes:** C-1 → C-2 → C-3 → C-4 → C-5 → C-6 → C-7 → C-8 → C-9 → C-10 → C-11 → C-12.
- **Writes:** `runtime-evidence/M014-S02-vps-forensics.json`, `runtime-evidence/M014-S02-vps-forensics.md`.
- **Fails closed when:**
  - no explicit user confirmation recorded before T02 execution;
  - any forbidden command from §7 is run;
  - any command output contains a secret value not redacted;
  - VPS host identity (C-1.2) does not match expected;
  - container C-2.2 returns empty.

### 9.2 S02 T03 (verdict)

- **Consumes:** evidence captured by T02.
- **Outputs:** `runtime-evidence/M014-S02-vps-forensics-verdict.json`, `runtime-evidence/M014-S02-vps-forensics-verdict.md`, `scripts/validate_m014_s02_vps_forensics.js`.
- **Verdict options:** `H-WIPE | H-RECREATE | H-AUTH-DRIFT | H-OWNERSHIP-DRIFT | H-PROXY-DRIFT | H-INCONCLUSIVE`.
- **Must cite:** for each verdict, the specific command output that drove the conclusion.

### 9.3 S03 lockfile uses

- `forbidden_commands` list (§7) as a runtime check.
- `redaction_policy.never_print_or_store` (§4.1) as S03 preflight guard.
- `hypothesis_matrix.verdict_options` (§5) as S03 status enum.

### 9.4 S04 persistence canary uses

- C-8.2 `/paperclip` company tree snapshot as canary target reference.
- §4 redaction policy as canary write guard.

---

## 10. Negative tests / self-checks

### 10.1 T01 packet self-checks (verifiable now)

- [x] Every `command_group` has at least one command.
- [x] Every command has a non-empty `why`/`proves`/`supports`/`refutes` set.
- [x] `forbidden_commands` list contains F-1 through F-18.
- [x] `hypothesis_matrix` has all six hypotheses.
- [x] `redaction_policy.never_print_or_store` is non-empty (7 categories).
- [x] `vps_targets_mirror` matches truth map `vps_targets` field-by-field.
- [x] `safe_restart_command` matches truth map `safe_restart_command` exactly.
- [x] No command in `command_groups` includes a mutation keyword (`rm `, `mv `, `chmod`, `chown`, `>`, `>>`, `tee `, `wget`, `curl -X`, `passwd`, `crontab`, `systemctl`, `docker (rm|stop|kill|restart|compose down)`).

### 10.2 T02 / T03 negative scenarios (outlined for T03 validator)

- Captured output missing `capture_time_utc` → reject.
- Captured output containing any substring from `redaction_policy.never_print_or_store` → reject.
- Captured output containing a forbidden command invocation log → reject.
- Verdict not in `hypothesis_matrix.verdict_options` → reject.
- Verdict cites no command output → reject.

---

## 11. Self-check

- 21 top-level JSON keys; parses cleanly with `node -e JSON.parse`.
- 12 command groups (C-1 through C-12).
- 31 commands total.
- 18 forbidden commands (F-1 through F-18).
- 6 hypotheses (H-WIPE, H-RECREATE, H-AUTH-DRIFT, H-OWNERSHIP-DRIFT, H-PROXY-DRIFT, H-INCONCLUSIVE).
- 6 verdict options.
- All command groups have `read_only: true`.
- All commands have a hypothesis mapping (supports or refutes at least one).
- No command includes a mutation keyword.
- VPS targets mirror S01 truth map §11 field-by-field.
- Safe-restart command matches S01 truth map §11.1 exactly.

---

## 12. Citation index

- **S01 truth map:** `runtime-evidence/M014-S01-runtime-truth-map.json`, `runtime-evidence/M014-S01-runtime-truth-map.md`.
- **S01 source inventory:** `runtime-evidence/M014-S01-source-inventory.md`.
- **Forensic handoff:** `docs/handoffs/HANDOFF_PAPERCLIP_RUNTIME_FORENSICS.md`.
- **Sandbox testing handoff:** `docs/archive/PAPERCLIP_SANDBOX_TESTING_HANDOFF.md`.
- **Project memory:** `.gsd/KNOWLEDGE.md` (R1–R6, P1), GSD memory store (MEM046, MEM049, MEM053, MEM054, MEM056, MEM058, MEM071, MEM133, MEM139, MEM288, MEM295, MEM324, MEM325, MEM336).
- **Spike recommendation:** `.gsd/workflows/spikes/260607-1-start-a-gsd-milestone-for-paperclip-runt/RECOMMENDATION.md`.
- **Milestone context:** `.gsd/phases/14-a9jj46-paperclip-runtime-stability-gate-for-bos/14-CONTEXT.md`.
- **Slice plan:** `.gsd/phases/14-a9jj46-paperclip-runtime-stability-gate-for-bos/14-02-PLAN.md`.