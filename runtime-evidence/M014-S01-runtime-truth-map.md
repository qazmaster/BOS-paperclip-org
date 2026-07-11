# M014-a9jj46 / S01 — Runtime Truth Map

**Milestone:** M014-a9jj46 — Paperclip Runtime Stability Gate for BOS Light E2E
**Slice:** S01 — Source Inventory and Runtime Truth Map
**Task:** T02 — Classify runtime identities and capability surfaces
**Generated:** 2026-07-11
**Author:** GSD auto-mode executor (T02)
**Companion machine-readable file:** `runtime-evidence/M014-S01-runtime-truth-map.json`
**Input inventory:** `runtime-evidence/M014-S01-source-inventory.md` (T01)

---

## 0. Purpose + freshness posture

This truth map classifies every runtime identity, doctrine patch, capability surface, proof gap, and governance risk that downstream slices (S02–S05) and downstream S01 tasks (T03) must ground themselves in.

**All canonical company-id claims are provisional.** No company UUID is authoritative until a fresh authenticated readback is recorded (R3 + MEM071 + T01 inventory assumption 1).

**Snapshot policy.** This is a snapshot dated 2026-07-11. It must be re-derived when any of these trigger:

- a new doctrine patch after v1.4.2 lands;
- a new runtime-evidence artifact appears past the 2026-06-04 failure window;
- any cited evidence file is mutated;
- a new GSD memory entry tagged `Paperclip-runtime-stability` is captured.

---

## 1. Authority verdict at a glance

| Authority band | What lives there | Why it is authoritative |
|---|---|---|
| Authoritative doctrine | BOS Light v1.4.1 baseline + R026 boundary patch | Both sibling source packages converge on the same v1.4.1 baseline; R026 adds a boundary invariant, does not remap divisions. |
| Authoritative forensic handoff | `HANDOFF_PAPERCLIP_RUNTIME_FORENSICS.md` + spike `RECOMMENDATION.md` | Written from the same investigation window as the user-reported symptom; cited by milestone context. |
| Authoritative VPS operations contract | `docs/archive/PAPERCLIP_SANDBOX_TESTING_HANDOFF.md` | VPS paths, compose project, container name, and the only approved safe-restart command. |
| Provisional runtime evidence | All `runtime-evidence/M012-S06-*`, `M013-S02-*`, `M005-S01-*`, `M002-S12-*` | Cites exact epochs; freshness must be re-probed before mutation. |
| Provisional company identity | Three candidates: `43c74adb-…` (`/BOS`), `1a194762-…` (`/BOSA`), `9feb4c22-…` (`/BOS` M012) | All three are stale by different epochs. None is authoritative until fresh authenticated readback. |
| Project memory | `.gsd/KNOWLEDGE.md` (R1–R6, P1) + GSD memory store MEM046/049/053/054/056/058/071/133/139/288/295/324/325/336 | Durable conventions and gotchas; mirrored from earlier session outputs. |
| Hardcoded-target scripts | `scripts/create_bos_v141_agents.py`, `scripts/m012_s01_canonical_paperclip_readback.js`, `scripts/m013_s02_create_tech_debt_issue.js` | Encode prior company-id epochs inside mutation paths; S03 hardening target. |

---

## 2. Doctrine

### 2.1 Baseline — BOS Light v1.4.1 (authoritative)

**Core one-liner:** _Paperclip gives the rails. BOS Light gives the doctrine._

Division mental model:

```text
Div7 = mission direction.   Div1.HCO = routing, escalation, Circuit Breaker, hats, staffing.
Div2 = shaping.   Div3 = budget/access/resources.   Div4 = production + self-check.
Div5 = qualify, learn, recommend.   Div6 = only external-world interface.
```

Sources:

- In-repo mirrors: `docs/BOS_Light_v1_4_1_CANONICAL_ORG.md`, `Function_Migration_Matrix.md`, `Tool_Permission_Matrix.md`, `Data_Contracts.md`, `Acceptance_Tests_A12_A20.md`.
- Sibling package: `../BOS_Light_v1_4_1_Handoff/BOS_Light_v1_4_1_Handoff/` (README, docs/, agents/, skills/, configs/).

Ten non-negotiable v1.4.1 rules govern every script; any mutation script that violates them is invalid by doctrine.

### 2.2 R026 boundary patch (v1.4.2, authoritative)

**Invariant:**

```text
Div7 decision output is not an operational terminal route.
Every non-policy-only Div7 decision MUST emit DecisionDelegated to Div1.HCO.
Div1.HCO MUST perform all operational routing after Div7 decision.
```

**Required packet shape:**

```js
emitDivisionPacket({
  from: 'Div7.MissionControl',
  to:   'Div1.HCO',
  type: 'DecisionDelegated',
  payload: { /* cynefinDomain, recommendedMode, routingDirective, constraints, requiredFollowupDivisions, escalationLevel */ }
})
```

**Canonical flow after R026:**

```text
Human -> Div7.MissionControl  (frame or decide)
     -> DecisionDelegated packet
     -> Div1.HCO  (validates boundary, performs operational routing)
     -> Div2 / Div3 / Div4 / Div5 / Div6  (executed via Paperclip runtime)
     -> Div1.HCO  (monitor, route corrections, escalate)
     -> Div7.MissionControl  (only when another strategic/policy/regime decision is needed)
```

**Boundary test surface (eight tests per R026 patch):**

- Div7 must not produce a terminal operational route.
- Technical `COMPLEX` reaches `Div7 -> Div1 -> Div2 -> Div3 -> Div4 -> Div5`.
- `CHAOTIC` reaches `Div7 -> Div1` incident routing.
- Div2/Div3/Div4/Div5/Div6 reject direct operational asks from Div7 unless routed by Div1.

Sources:

- In-repo mirror: `docs/BOS_Light_v1_4_2_R026_Agent_Boundary_Patch.md`.
- Sibling package: `../BOS_Light_v1_4_2_R026_Agent_Boundary_Update/.../README.md`.

### 2.3 Authoritative path

```text
Div7.MissionControl -> DecisionDelegated -> Div1.HCO -> Div2..Div6 -> Div1.HCO (monitor) -> Div7 (next cycle)
```

The truth map **rejects** any code path where Div7 acts as a terminal operational route, or where Div2/Div3/Div4/Div5/Div6 accepts operational asks from Div7 outside Div1 routing.

---

## 3. Runtime identity claims (all provisional)

| Candidate ID | Company label | Last epoch | Promotion state | Fresh readback required |
|---|---|---|---|---|
| `43c74adb-…` | `/BOS` (v1.4.1 era) | M002 (`~2026-04..05`) | fallback-only | yes |
| `1a194762-…` | `/BOSA` | runtime-gate (~2026-05) | fallback-only | yes |
| `9feb4c22-…` | `/BOS` (M012 canonical) | M012/M013 (`~2026-06`) | fallback-only | yes |

Plus three additional stale IDs that R3 names as dead as of 2026-07-08: `7595fd85-…`, `7eede16c-…`, `8233ea7b-…`. That brings the R3 stale set to six IDs.

**No ID above is currently authoritative.** All three were canonical in their respective windows and now require fresh authenticated readback via Postgres before any script or API call. The S03 lockfile must remove the implicit `43c→9feb` replacement as authoritative default.

### 3.1 Why each is provisional

- `43c74adb-…` — Was canonical in M002 human validation per MEM071; mapped to seven-division agent creation in `runtime-evidence/bos-v141-agent-creation.json`. Superseded by `9feb…` in the M012 window but never re-validated.
- `1a194762-…` — Historical runtime-gate company per `HANDOFF_PAPERCLIP_RUNTIME_FORENSICS.md`; never the agent-creation target.
- `9feb4c22-…` — Became the M012/M013 canonical default per HANDOFF_PAPERCLIP_RUNTIME_FORENSICS.md; became stale mid-M013; S03 hardening must reject as script fallback without `PAPERCLIP_COMPANY_ID` env override.

### 3.2 R3 stale-set (re-verify every UUID before any API call)

```text
9feb4c22-…
43c74adb-…
1a194762-…
7595fd85-…
7eede16c-…
8233ea7b-…
```

---

## 4. Auth status

| Mode | Status | Promotion state | Evidence |
|---|---|---|---|
| Session-cookie (`POST /api/auth/sign-in/email`) | confirmed | default | MEM295 + MEM336 + `runtime-evidence/M012-S06-session-auth-readback.json` |
| API-key bearer (`PAPERCLIP_API_KEY`) | rejected | blocked | MEM295: returns 401 in the current build |
| Public sign-up | forbidden | forbidden | R2 + nginx lockdown `paperclip.oysana.com` |
| Password reset | not-applicable | — | MEM295: no password-reset endpoint |

**Live quirks (MEM336):**

- `Origin` header required for `POST /api/auth/sign-in/email` (else 403).
- Session cookie URL decoding required.
- Board access required for issue list `GET`.
- `DELETE` returns 500 with cookie-auth.
- Board keys revoked as of 2026-07-08 M014 lockdown.
- Registration open but accounts cannot be re-registered.

Cookie name: `__Secure-paperclip-default.session_token`.

---

## 5. Runtime surfaces

### 5.1 Promotable via bounded native evidence only

Three surfaces may be promoted, and only via native Paperclip issue/document/comment create+readback evidence:

| Surface | Route | Promotion state | Notes |
|---|---|---|---|
| issue | `/api/issues/:id` (non-company-scoped) | confirmed-surface | Company-scoped variants return 404 (MEM324). |
| document | native create+readback | confirmed-surface | Same evidence rule as issue. |
| comment | `/api/issues/:id/comments` | confirmed-surface | Non-company-scoped. |

**Memory IDs anchoring this rule:** MEM054, MEM058, MEM056, MEM049.

### 5.2 Do-not-promote surfaces

These surfaces must never be promoted by issue/document/comment evidence. Each remains `blocked` or `fail-closed`:

| Surface | Promotion state | Evidence |
|---|---|---|
| approval | blocked | MEM054/MEM058: native approval evidence never promoted |
| plugin-registration | blocked | `plugin-bos-light/manifest.paperclip-plugin.json` (draft only, 12 capabilities_requested + 3 tabs + 7 piko tools); `M002-S05-plugin-ui-surface-probe.json` |
| ui-surface | blocked | M002-S05 plugin-ui-surface-probe |
| data-surface | blocked | — |
| action-surface | blocked | — |
| tool-surface | blocked | — |
| state-event-activity | blocked | MEM054/MEM058 explicitly forbid reuse |
| Hermes execution | fail-closed | M002-S12-hermes-runtime-execution-proof.json + M005-S01-hermes-xiaomi-runtime-probe-live-proof.json |
| GSD-Pi execution | fail-closed | M002-S12-gsdpi-runtime-execution-proof.json + MEM046 |

### 5.3 Hermes xiaomi — promotion requires

1. Live terminal run status (exit 0).
2. `resultJson.bos` readback with non-empty payload.
3. Explicit adapter identity validation.

Current state: `resultJson={}` (M005 S01). Until `resultJson.bos` reads back, Hermes xiaomi remains fallback-only.

### 5.4 GSD-Pi local — promotion requires

1. Registry readback confirming `gsdpi_local`.
2. Passing `testEnvironment`.
3. `BosAdapterResult` execution proof.

Current state: `gsdpi_local` is not in Paperclip registry. Supported readback returns `Unknown adapter type: gsdpi_local`. Promotion blocked until registry readback succeeds.

### 5.5 Health endpoint policy

`/api/health` is **not** a runtime persistence proof. Health alone does not prove company, agent, auth, or plugin state. The S04 persistence canary must use Paperclip-native markers (issue/document/comment readback), not just `/api/health`.

---

## 6. Failure-window evidence (2026-06-03 .. 2026-06-04)

| File | Recorded epoch | Classification | Why it matters here |
|---|---|---|---|
| `M005-S01-hermes-xiaomi-runtime-probe-live-proof.json` | 2026-06-01T02:33Z | Hermes-fallback-only | `passing=true` but `resultJson={}` — keeps Hermes at fail-closed. |
| `M012-S06-mission-issue-evidence.json` | 2026-06-03T08:07Z | bounded-issue-surface | Anchors the governance-rail breach (BOS-3 created without explicit user confirmation). |
| `M012-S07-rescope-decision.json` | 2026-06-03T08:15Z | governance-rescope-record | Re-scopes criterion to readback-only; does not restore explicit user confirmation. |
| `M013-S02-T04-paperclip-issue.json` | 2026-06-04T08:30Z | auth-bl-401 | Session and API-key both 401; demands `.env` refresh. |

**Events window filter (read-only, S02 only):**

```text
docker events --since '2026-06-03T08:00:00' --until '2026-06-04T09:00:00' \
  --filter container=paperclip_sandbox-paperclip-1
```

---

## 7. M002 fail-closed anchor set

These 32 files collectively establish the formal anchor for Hermes/GSD-Pi = fail-closed classification. Together with `M005-S01-hermes-xiaomi-runtime-probe-live-proof.json`, they justify MEM046 / MEM049 / MEM058 / MEM139 keeping both adapters at fail-closed until registry + testEnvironment + `BosAdapterResult` proof lands.

Full anchor file list lives in `runtime-evidence/M014-S01-runtime-truth-map.json` § `m002_fail_closed_anchors.files`. Highlights:

- `M002-S02-hermes-environment.json`, `M002-S02-hermes-smoke.json`
- `M002-S03-gsdpi-environment.json`, `M002-S03-gsdpi-registration.json`, `M002-S03-gsdpi-smoke.json`
- `M002-S04-live-artifact-flow.json`
- `M002-S05-plugin-ui-surface-probe.json`
- `M002-S07-agent-discovery-readonly.json`, `M002-S07-agent-mutation-approval-packet.json`, `M002-S07-agent-template-map.json`, `M002-S07-agent-visibility.json`
- `M002-S08-adapter-registration-evidence.json`, `M002-S08-execution-path-decision-packet.json`, `M002-S08-hermes-cli-environment-remediation.json`, `M002-S08-provider-adapter-feasibility.json`, `M002-S08-runtime-execution-smoke.json`
- `M002-S09-reconciliation-audit.json`, `M002-S09-s08-artifact-reconstruction.json`
- `M002-S10-gsdpi-runtime-execution-proof.json`, `M002-S10-hermes-runtime-execution-proof.json`, `M002-S10-requirement-scope-resolution.json`, `M002-S10-runtime-execution-closeout.json`
- `M002-S11-validation-artifact-repair.json`
- `M002-S12-gsdpi-runtime-execution-proof.json`, `M002-S12-hermes-runtime-execution-proof.json`, `M002-S12-rescope-approval.json`, `M002-S12-runtime-proof-or-rescope.json`, `M002-S12-validation-closeout.json`
- `M002-S13-requirement-coverage.json`, `M002-S13-validation-closeout.json`
- `M002-S06-regression-closure.json`

---

## 8. Scripts to harden (S03 targets)

| Script | Hardcoded ID | Epoch | Risk class |
|---|---|---|---|
| `scripts/create_bos_v141_agents.py` | `43c74adb-…` | v1.4.1 era | mutation-capable |
| `scripts/m012_s01_canonical_paperclip_readback.js` | `9feb4c22-…` (with `43c…` re-write as stale) | M012 era | mixed read+cleanup |
| `scripts/m013_s02_create_tech_debt_issue.js` | `9feb4c22-…` | M013 era | mutation-capable |

S03 must convert each script into a fail-closed one whenever the runtime lockfile or `PAPERCLIP_COMPANY_ID` env var is missing/stale. The implicit `43c→9feb` rewrite path inside `m012_s01_canonical_paperclip_readback.js` must be removed.

---

## 9. Governance risks

| ID | Title | Rule | Memory |
|---|---|---|---|
| GR-001 | Live mutation governance already failed once (BOS-3 in `M012-S07-rescope-decision.json`) | S03 must require explicit human confirmation for every POST/PUT/PATCH/DELETE before execution. | MEM053, MEM054 |
| GR-002 | Public sign-up is a documented footgun | Never call `POST /api/auth/sign-up` against public host for recon; use SSH tunnel to `127.0.0.1:3131` instead. | R2 |
| GR-003 | External credential disclosure | Telegram delivery `TELEGRAM_CHAT_ID=-1003930272893` and `TELEGRAM_BOT_TOKEN` in local `.env`; require explicit user confirmation before sending credentials. | MEM053 |
| GR-004 | Stale IDs routinely outlive their entities | Re-verify UUIDs via Postgres before any API call or script. | R3 |
| GR-005 | Capability rows are snapshots, not state | Re-probe live execution before relying on a row marked fallback-only or blocker. | R4, MEM139 |

---

## 10. Proof gaps

| ID | Title | Blocking | Opens after S01 |
|---|---|---|---|
| PG-001 | No fresh authenticated company readback post 2026-06-04 | yes | S02, S03, S04, S05 |
| PG-002 | `resultJson.bos` for Hermes xiaomi missing | yes | S05 |
| PG-003 | `gsdpi_local` registry entry not present in Paperclip | yes | S05 |
| PG-004 | Plugin/piko/UI/data/action/tool runtime proof absent | yes | S05 |
| PG-005 | Persistence canary not yet implemented | no | S04 |
| PG-006 | Runtime lockfile / preflight contract not yet defined | no | S03 |
| PG-007 | VPS forensic commands not yet executed | no | S02 |

---

## 11. VPS targets (read-only in S02)

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
| Admin email | `kabidenov.a@gmail.com` (in repo knowledge; password in `/root/paperclip-sandbox-admin.env` — never print or commit) |

### 11.1 Approved safe-restart command (do not deviate)

```bash
cd /opt/paperclip-sandbox/docker && \
  docker compose -p paperclip_sandbox \
    --env-file /opt/paperclip-sandbox/.env.sandbox \
    -f docker-compose.quickstart.yml \
    -f /opt/paperclip-sandbox/docker-compose.sandbox-override.yml \
    up -d --no-build paperclip
```

### 11.2 Forbidden commands on VPS

```text
docker compose down -v
docker volume prune
docker system prune
docker rm
docker volume rm
```

Forbidden unless explicitly approved for destructive recovery.

### 11.3 Acceptable read-only commands (S02 only)

- `docker inspect <container>`
- `docker stats --no-stream <container>`
- `docker logs <container>`
- `journalctl -u docker --since ...`
- `ls /opt/paperclip-sandbox/data/...`
- `ss -tlnp | grep 3131`
- `docker compose -p paperclip_sandbox --env-file /opt/paperclip-sandbox/.env.sandbox -f docker-compose.quickstart.yml -f /opt/paperclip-sandbox/docker-compose.sandbox-override.yml ps`

---

## 12. Downstream handoff (single-page reference)

| Slice / task | Consumes from this map |
|---|---|
| S01 T03 (`scripts/validate_m014_s01_truth_map.js`) | §3 (companies + stale IDs), §5 (surfaces + promotion rules), §8 (scripts), §9 (governance), §11 (VPS), `no_promotion_ledger.keys` |
| S02 VPS forensics | §6 (events window), §11.1 (safe-restart), §11.3 (acceptable read-only commands) |
| S03 lockfile + script hardening | §5.2/5.3/5.4 (Hermes/GSD-Pi promotion requires), §8 (scripts), GR-001/GR-002/GR-004 |
| S04 persistence canary | §5.5 (health endpoint policy) + §11.1 (safe-restart) |
| S05 bounded E2E gate | §2 (doctrine + R026), §5.1 (bounded promotable surfaces), §5.3-5.4 (Hermes/GSD-Pi promotion requires), §9 (governance), §10 PG-002..PG-004 |

---

## 13. Canonical decision posture

Verdict: **Go** on a stability gate milestone. **Do not** auto-mode or live E2E.

Selected option: **B (full stability gate)** — five-slice contract `S01 → S02 → S03 → S04 → S05`.

Anti-goals (must not happen):

- No Docker wipe claim.
- No plugin/piko/GSD-Pi/Hermes E2E promotion.
- No secret disclosure.
- No broker Telegram/external credentials without explicit confirmation.

Source: `.gsd/workflows/spikes/260607-1-start-a-gsd-milestone-for-paperclip-runt/RECOMMENDATION.md`.

---

## 14. No-promotion ledger (per MEM139)

This map is the canonical no-promotion ledger across:

- `auth_status.auth_modes[public-sign-up]` = `forbidden`.
- `health_endpoint_policy.promotion_state` = `not-runtime-proof`.
- `runtime_surfaces.surfaces[approval, plugin-registration, ui-surface, data-surface, action-surface, tool-surface, state-event-activity]` = `blocked`.
- `runtime_surfaces.surfaces[Hermes execution, GSD-Pi execution]` = `fail-closed`.

Every downstream validator, manifest, evidence schema, and human-readable handoff must reference these keys rather than redefining them.

---

## 15. Self-check

- JSON twin parses cleanly (24 top-level keys; `node -e` JSON.parse succeeds).
- All three candidate company IDs carry `promotion_state: "fallback-only"` and `fresh_readback_required: true`.
- Six stale IDs total: three primary + three additional per R3.
- Twelve runtime surfaces classified (3 promotable + 9 blocked/fail-closed).
- Five governance risks enumerated with rule + memory references.
- Seven proof gaps identified with downstream-slice ownership.
- Three scripts flagged for S03 hardening with their hardcoded IDs.
- Eleven read-only VPS commands approved; five destructive commands forbidden.
- No live Paperclip, VPS, Docker, or Telegram commands executed for T02.
- No secret value, session cookie, password, API key, or Telegram chat id committed to the truth map (MEM053 + R2 honored).

---

## 16. Citation index

- Doctrine: `docs/BOS_Light_v1_4_1_*`, `docs/BOS_Light_v1_4_2_R026_Agent_Boundary_Patch.md`, sibling package READMEs.
- Forensic handoffs: `docs/handoffs/HANDOFF_PAPERCLIP_RUNTIME_FORENSICS.md`, spike `RECOMMENDATION.md`, research `ANGLE-1..3`, `docs/archive/PAPERCLIP_SANDBOX_TESTING_HANDOFF.md`.
- Evidence: all `runtime-evidence/M002-*`, `M005-*`, `M011-*`, `M012-*`, `M013-*` files enumerated in §6–§7 of this map and in the JSON twin.
- Project memory: `.gsd/KNOWLEDGE.md` (R1–R6, P1), `.gsd/REQUIREMENTS.md`, GSD memory store (MEM046, MEM049, MEM053, MEM054, MEM056, MEM058, MEM071, MEM133, MEM139, MEM288, MEM295, MEM324, MEM325, MEM336).
- Scripts: `scripts/create_bos_v141_agents.py`, `scripts/m012_s01_canonical_paperclip_readback.js`, `scripts/m013_s02_create_tech_debt_issue.js`.
