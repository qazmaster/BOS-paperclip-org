# M014-a9jj46 / S04 / T01 — Paperclip Upstream Diff (Baseline)

**Milestone:** M014-a9jj46 — Paperclip Runtime Stability Gate for BOS Light E2E
**Slice:** S04 — Paperclip Upstream Upgrade
**Task:** T01 — Verify upstream and capture Paperclip baseline
**Generated:** 2026-07-12
**Author:** GSD auto-mode executor (M014-a9jj46/S04/T01)
**Companion machine-readable file:** `runtime-evidence/M014-S04-paperclip-baseline.json`
**Verdict this turn:** **PROVISIONAL_PENDING_FRESH_READBACK**

---

## 0. Purpose

This document records (a) what the official Paperclip upstream looks like, (b) what the live Paperclip runtime looked like in the last authenticated readback window, (c) what local BOS Light runtime patches exist that must survive an upstream upgrade, and (d) what is missing because S02 was blocked at the VPS forensic gate (H-INCONCLUSIVE verdict). The companion JSON is the machine-readable source of truth for downstream S04 tasks (T02 upgrade contract, T03 deploy, T04 native smoke).

**No live runtime mutation was performed.** The work is read-only: filesystem walk of this repo + web fetch of the upstream releases page. No `docker inspect`, no `git clone`, no `POST /api/...`, no shell access to the VPS.

---

## 1. Official upstream identity (verified)

| Field | Value | Source |
|---|---|---|
| Canonical repository | `https://github.com/paperclipai/paperclip` | `plugin-bos-light/src/pluginRegistration.ts` references it as the PLUGIN_SPEC source |
| Latest release tag observed | `v2026.707.0` | https://github.com/paperclipai/paperclip/releases (fetch_page, 2026-07-12) |
| Latest release published | `2026-07-07` | same fetch |
| Latest release short SHA | `390627b` | same fetch |
| Releases visible (count) | `11` tagged releases in reverse-chronological order | same fetch |
| Default branch | `master` | path-encoded in PLUGIN_SPEC URL |

### 1.1 Visible upstream release tags (chronological asc)

```text
v2026.428.0   (oldest observed)
v2026.512.0
v2026.513.0
v2026.517.0
v2026.525.0
v2026.529.0
v2026.609.0
v2026.618.0
v2026.626.0
v2026.707.0   (latest, 2026-07-07)
```

### 1.2 Why "verified" rather than "promoted"

The latest upstream tag is recorded as `verified: true` because the value was independently confirmed by a remote readback of the upstream releases page. This is a PUBLIC, READ-ONLY check. Promotion to "authoritative" would require an additional check that this repo is intentionally tracking that exact tag as its upgrade target — which is T02's job. T01 only proves the upstream identity exists and is reachable; the decision to target it is the upgrade contract's responsibility.

---

## 2. Local Paperclip checkout

There is **no vendored Paperclip source tree** in this repository. Paperclip is consumed as a runtime image at the VPS, not vendored.

| Probe | Result |
|---|---|
| `find . -maxdepth 4 -type d -name 'paperclip*' -not -path './node_modules/*'` | empty |
| `find . -maxdepth 3 -name 'docker-compose*'` | empty |
| `find . -maxdepth 3 -name 'Dockerfile*'` | empty |
| `cat .git/config` upstream remote | `git@github.com:qazanik/BOS-paperclip-org.git` (this BOS org handoff repo, NOT Paperclip) |

### 2.1 Local references to upstream Paperclip (documentation only)

| Kind | Path | Snippet |
|---|---|---|
| Plugin spec source | `plugin-bos-light/src/pluginRegistration.ts` | `https://github.com/paperclipai/paperclip/blob/master/doc/plugins/PLUGIN_SPEC.md` |
| Optional peer dep | `plugin-bos-light/package.json` | `@paperclipai/plugin-sdk` listed as `peerDependenciesMeta.optional` |
| CLI reference | `docs/archive/BOS_M002_DEVELOPMENT_HANDOFF.md` | `pnpm paperclipai auth bootstrap-ceo --help` |

These references are documentation and SDK peer-dependency contracts, not source clones. They confirm BOS Light's INTENT to track `paperclipai/paperclip` as upstream, but they do not establish a vendored baseline.

---

## 3. Live runtime — historical observation only

The live Paperclip runtime identity was last observed during the S01/S04 readback windows of the M002 development effort. The M014 S02 forensic T02 step was **blocked** because autonomous mode had no explicit user confirmation for VPS SSH (`runtime-evidence/M014-S02-vps-forensics-verdict.json` = `H-INCONCLUSIVE`, captures_count=0). Therefore all `current_*` fields in the baseline JSON are `null` and `fresh_readback_required=true`. The historical values are kept below as a reference baseline ONLY; they MUST NOT be promoted to authoritative without a fresh authenticated readback.

### 3.1 Historical observation (from `docs/archive/PAPERCLIP_LIVE_VALIDATION_REPORT.md`, epoch `2026-05-28T17:20:20+05:00`)

| Field | Historical value | Note |
|---|---|---|
| Runtime version (API) | `0.3.1` | recorded by `health.version` |
| Runtime build fingerprint | `health.version:0.3.1` | same |
| Git describe | `canary/v2026.525.0-canary.1` | observed in `/opt/paperclip-sandbox` |
| Git commit SHA | `60efa38f868e838e9af2e2168daf0c70afefb9e6` | observed in `/opt/paperclip-sandbox` |
| Sandbox path | `/opt/paperclip-sandbox` | per `vps_targets` |
| Container name | `paperclip_sandbox-paperclip-1` | per `vps_targets` |
| Container binding | `127.0.0.1:3131->3100/tcp` on VPS only | per `vps_targets` |
| Public ingress | `https://paperclip.oysana.com` | nginx-fronted |
| Compose project | `paperclip_sandbox` | per `vps_targets` |
| Base compose file | `/opt/paperclip-sandbox/docker/docker-compose.quickstart.yml` | per `vps_targets` |
| Override compose file | `/opt/paperclip-sandbox/docker-compose.sandbox-override.yml` | per `vps_targets` |
| Admin email (public) | `kabidenov.a@gmail.com` | documented owner |

### 3.2 What is missing — `current_*` fields all `null`

The following fields CANNOT be asserted as observed in this turn because S02 was blocked:

- `current_branch` — no vendored checkout; live checkout needs SSH+git describe
- `current_commit_sha` — no fresh VPS read
- `current_image_digest` / `current_image_tag` — no `docker inspect`
- `current_health_status`, `current_health_version`, `current_health_deployment_mode`, `current_health_bootstrap_status` — no authenticated `GET /api/health`
- `current_database_schema_identity` and `current_database_schema_migrations_applied` — no Postgres introspection
- `current_volumes` and `current_volumes_required_for_rollback` — no `docker volume ls` / `docker inspect`
- `current_canonical_company_id`, `current_canonical_company_visibility_in_canonical_company` — no `SELECT id FROM company` and no `GET /api/companies`
- `current_signup_lockdown_status` — no nginx config read
- `current_owner_membership_status` — no authenticated user readback
- `current_adapter_registry_readback` — no `GET /api/adapters` (board-key required per MEM336)

### 3.3 Re-probe requirements (per `fresh_readback_required=true`)

T02 cannot proceed without a fresh authenticated readback. Each re-probe maps to a specific source:

| Field | Re-probe method |
|---|---|
| health, version, deployment mode | authenticated `GET https://paperclip.oysana.com/api/health` (or SSH-tunnel probe to `127.0.0.1:3131/api/health`) |
| canonical company ID | Postgres `SELECT id, name FROM company WHERE name LIKE '%BOS%' ORDER BY created_at DESC LIMIT 5;` OR authenticated `GET /api/companies` |
| canonical company visibility | authenticated `GET /api/companies/{canonical_id}` (must return 200 with the seven division agent records per S07 evidence) |
| database schema identity | `SELECT version();` and `SELECT extname, extversion FROM pg_extension;` plus drizzle-kit introspection |
| database migrations applied | `npm --prefix /opt/paperclip-sandbox drizzle-kit status` (read-only) |
| volumes | `docker inspect paperclip_sandbox-paperclip-1 --format '{{json .Mounts}}'` and `docker volume ls` |
| signup lockdown | SSH-tunnel probe `GET https://paperclip.oysana.com/api/auth/sign-up` (expect 403 from nginx per R2) and `GET http://127.0.0.1:3131/api/auth/sign-up` (expect 404 from Paperclip) |
| owner membership | authenticated `GET /api/me` and `GET /api/companies/{canonical_id}/members` |
| adapter registry readback | `GET /api/adapters` with board-key cookie per MEM336 |

All VPS-touching re-probes require explicit user confirmation per the S02 fail-closed gate.

---

## 4. Local runtime patches detected (must reconcile in T02)

The local source tree carries four classes of patches that diverge from upstream Paperclip. None were created by mutating live state; detection is a filesystem walk plus manifest review.

### 4.1 BOS Light plugin (`plugin-bos-light/`) — kind: paperclip-plugin

| Property | Value |
|---|---|
| Path | `plugin-bos-light/` |
| Local version | `0.1.0` |
| Manifest | `plugin-bos-light/manifest.paperclip-plugin.json` (status: `draft-0.1`) |
| Capabilities requested | 13 (config.rw, events.subscribe, state.rw, entities.rw, issues.rw, activity.write, data.register, actions.register, tools.register) |
| UI widgets requested | `betting-table` |
| UI tabs requested | `bos-status`, `circuit-state`, `gate-results` |
| Tools requested | 7 piko tools (`bpi-score`, `blueprint-gen`, `bpi-blueprint-artifact`, `eval-gate`, `eval-gate-evidence`, `circuit-breaker-observe`, `decide`) |
| Reconciliation required | **YES** — every requested surface is `blocked` per MEM054/MEM058/MEM046; T02 must record what the new upstream actually exposes |

### 4.2 GSD-Pi local adapter (`adapters/gsdpi-local/`) — kind: paperclip-external-adapter

| Property | Value |
|---|---|
| Path | `adapters/gsdpi-local/` |
| Purpose | Standalone server-adapter npm package loaded at startup via Paperclip plugin system per `docs/adapters/external-adapters.md` |
| Live registration state | `unregistered` (MEM046); supported readback returns `Unknown adapter type: gsdpi_local` |
| Reconciliation required | **YES** — T02 must not assume registry readback succeeds against the new upstream without re-validation |

### 4.3 Reverse-proxy signup lockdown — kind: infrastructure-policy

| Property | Value |
|---|---|
| Path | nginx config on VPS (outside this repo) |
| Evidence | `P1` in `.gsd/KNOWLEDGE.md` + `R2` + nginx `location ^/api/auth/sign-up { allow 127.0.0.1/::1; deny all; }` referenced in handoff docs |
| Reconciliation required | **YES** — this is an nginx-layer policy, NOT a Paperclip-layer policy. It must survive any upstream upgrade because it is not stored inside the Paperclip image. T03 deploy MUST NOT remove or rewrite the nginx vhost; T04 post-upgrade MUST verify the lockdown is still in place |
| Fresh readback required | YES — `ssh root@87.99.146.178 'nginx -T 2>/dev/null \| grep -A3 "location \\^/api/auth/sign-up"'` (requires explicit user confirmation per S02 fail-closed gate) |

### 4.4 Plugin SDK floor — kind: peer-dependency

| Property | Value |
|---|---|
| Value | `@paperclipai/plugin-sdk` (optional peer) |
| Reconciliation required | **YES** — T02 must record the SDK floor the new upstream revision requires and whether `plugin-bos-light` still satisfies it. If the new upstream drops or renames a capability used by `plugin-bos-light` (e.g. `actions.register`), the upgrade MUST be marked incompatible and T03 must NOT deploy until the plugin source is patched and re-tested |

### 4.5 Non-runtime local artefacts (do NOT need T02 reconciliation)

| Path | Kind | Why no reconciliation needed |
|---|---|---|
| `company-template/` | Paperclip company package (content) | Templates are content, not runtime. T02 should record SHA-256 before upgrade; re-import only if upstream schema changed |
| `scripts/`, `configs/`, `skills/`, `docs/handoffs/`, `docs/BOS_Light_v1_4_*` | Orchestration and doctrine | Run against Paperclip HTTP API; not affected by an upstream revision bump. `scripts/validate_m014_s03_script_hardening.js` MUST be re-run after upgrade because R3 stale-id membership may shift |

### 4.6 Local runtime patch count

`local_runtime_patch_count: 4` (the four items above that require T02 reconciliation).

---

## 5. Inherited rollout safety constraints

The baseline inherits six constraints from `paperclip-runtime.lock.json` and the S02 forensic verdict. Each is referenced by ID so T02 can assert them by name.

| ID | Source | Rule |
|---|---|---|
| `LFP-LF-01` | lockfile | `verified_base_url` and `canonical_company_id` MUST be `null` until a fresh authenticated readback promotes them; mutation scripts refuse to run with `null` values unless `PAPERCLIP_COMPANY_ID_OVERRIDE=allow` is set |
| `LFP-LF-02` | lockfile + R2 + P1 | Public sign-up (`POST /api/auth/sign-up`) MUST NOT be invoked against the public host for recon; nginx lockdown is the source of truth and MUST remain in place |
| `LFP-LF-03` | lockfile | `PAPERCLIP_API_KEY` is REJECTED as an auth source; session-cookie is the only allowed mode |
| `LFP-S02-01` | S02 verdict | VPS forensic verdict was `H-INCONCLUSIVE` with zero captures; explicit user confirmation is required before any future VPS read-only probe |
| `LFP-S02-02` | S02 verdict | Zero-capture state means no failure hypothesis (`H-WIPE`, `H-RECREATE`, `H-AUTH-DRIFT`, `H-OWNERSHIP-DRIFT`, `H-PROXY-DRIFT`) can be promoted; all six R3 stale IDs remain unverified as live |
| `LFP-S02-03` | S02 verdict | T01 baseline cannot assert wipe/recreate/auth-drift/ownership-drift/proxy-drift; it can only assert upstream-identity, local-patches-detected, and fresh-readback-required |

---

## 6. Failure modes covered (Q5)

This baseline task has the following external dependencies and failure paths:

| Dependency | Failure path | Handling |
|---|---|---|
| Upstream releases page (`https://github.com/paperclipai/paperclip/releases`) | network timeout, 5xx, page changed shape | recorded as `verified: false` with `verification_method=fetch_page_failed`; the validator MUST refuse to pass `--phase baseline` until `verified=true` is restored |
| Local filesystem paths under `plugin-bos-light/`, `adapters/`, `company-template/`, `scripts/`, `configs/`, `skills/`, `docs/` | path missing, file unreadable | recorded as `local_references_to_upstream_only=[]` and `local_runtime_patch_count` decremented accordingly; validator reports missing-patch blocker per missing kind |
| `paperclip-runtime.lock.json` | file missing or stale-id set shrunk | cross-checked via `consumes` field; validator emits a `LFP-LF-05` blocker when the R3 prefix set diverges |
| `runtime-evidence/M014-S02-vps-forensics-verdict.json` | file missing or verdict promoted past `H-INCONCLUSIVE` | the baseline JSON explicitly inherits `LFP-S02-01..03`; validator asserts these IDs are present in `rollout_safety_constraints.inherited_constraints` |
| Secret/credential leakage into this artifact | forbidden substrings detected | validator scans baseline JSON for `PAPERCLIP_API_KEY=`, `BETTER_AUTH_SECRET=`, `POSTGRES_PASSWORD=`, `OPENAI_API_KEY=`, `XIAOMI_API_KEY=`, `Bearer <token>`, and full 36-char UUID literals; emits `V-UP-09` blocker on any hit |

## 7. Negative paths asserted (Q7)

| Path | Expected blocker |
|---|---|
| Baseline file missing | `V-UP-01` (`baseline.json not found`) |
| Baseline file malformed JSON | `V-UP-02` (`baseline.json malformed`) |
| `official_upstream_identity.verified` is `false` or missing | `V-UP-03` (`upstream identity not verified`) |
| `canonical_repo_url` does not match `github.com/paperclipai/paperclip` | `V-UP-04` (`canonical_repo_url drift`) |
| `latest_release_tag_observed` is empty or not a `vYYYY.MMDD.N` shape | `V-UP-05` (`latest_release_tag_observed malformed`) |
| `local_paperclip_checkout.vendored_checkout_present=true` (this repo is NOT a Paperclip fork) | `V-UP-06` (`unexpected vendored checkout claim`) |
| `live_runtime_observed.fresh_readback_required` is `false` while `current_*` fields are still `null` | `V-UP-07` (`fresh_readback_required misasserted`) |
| Any of `local_runtime_patches_detected.{bos_light_plugin,gsdpi_local_adapter,reverse_proxy_signup_lockdown,plugin_sdk_version_floor}` missing | `V-UP-08` per missing patch kind (counts toward the four-required-patches invariant) |
| Baseline JSON contains `PAPERCLIP_API_KEY=`, `BETTER_AUTH_SECRET=`, `POSTGRES_PASSWORD=`, `OPENAI_API_KEY=`, `XIAOMI_API_KEY=`, `Bearer ` + 20+ chars, or 8-4-4-4-12 fully-qualified UUID literal (other than `historical_observed_runtime_version` field where version is `0.3.1`) | `V-UP-09` (redaction leak) |
| `rollout_safety_constraints.inherited_constraints` missing any of `LFP-LF-01..03` or `LFP-S02-01..03` | `V-UP-10` per missing ID |
| `local_runtime_patch_count` not equal to number of `reconciliation_required: true` entries in `local_runtime_patches_detected` | `V-UP-11` (count drift) |
| `--phase baseline` invoked on this validator without `--phase ready` being runnable downstream | `V-UP-12` (downstream phase readiness) — informational, does not block |

## 8. Anti-replay

- One-shot capture; reusing a baseline for a different upgrade cycle requires a fresh T01 capture with a new `generated` timestamp and a re-asserted `fresh_readback_required=true`.
- No credential seeds, no session cookie seeds, no full UUID echo.
- Stale UUIDs are stored as 8-char prefixes (`9feb4c22…`, `43c74adb…`, `1a194762…`, `7595fd85…`, `7eede16c…`, `8233ea7b…`) per the truncation discipline used by the lockfile and the S01 truth map.
- Admin email `kabidenov.a@gmail.com` is the public-by-policy owner email recorded verbatim in the handoff docs and S01 truth map.
- Telegram chat id `-1003930272893` is recorded in MEM053 but NOT echoed in this artifact to avoid secret-leak regression.

## 9. Downstream handoff

- **T02 upgrade contract** consumes `official_upstream_identity.{latest_release_tag_observed, upstream_commit_sha_for_latest_release}`, `live_runtime_observed.{historical_observed_git_describe, historical_observed_git_commit_sha, current_branch}`, all `local_runtime_patches_detected`, and all `rollout_safety_constraints.inherited_constraints`. T02 must pin revision to the upstream commit SHA (or a chosen known-good SHA inside the same release line) and reconcile every local patch.
- **T03 deploy** MUST verify the nginx signup lockdown is intact after the upgrade and MUST capture the rollback image and config before triggering the safe-restart command.
- **T04 native smoke** MUST compare post-upgrade health, auth, owner membership, canonical company visibility, signup rejection, adapter registry readback, and bounded native issue/document/comment smoke against this baseline AND MUST NOT promote unconfirmed plugin surfaces or reuse the baseline for promotion outside the bounded native artifact surfaces (per MEM054/MEM058/MEM056/MEM049).

---

## 10. What is NOT in this document

To keep T01 honest about its scope:

- No live VPS readback. S02 was blocked; this slice inherits that.
- No auth probe. `LFP-LF-03` rejects PAPERCLIP_API_KEY as an auth source.
- No company-id claim. All candidates (43c…/BOS, 1a1…/BOSA, 9feb…/BOS) are stale per R3.
- No plugin/UI/data/action/tool surface promotion. MEM054/MEM058 keep those blocked.
- No Hermes execution promotion. M005-S01 resultJson is still `{}`; Hermes stays fallback-only.
- No GSD-Pi execution promotion. MEM046 keeps `gsdpi_local` unregistered.
- No destructive Docker command. `docker compose down -v`, `docker volume prune`, `docker system prune`, `docker rm`, `docker volume rm` remain forbidden unless explicitly approved.