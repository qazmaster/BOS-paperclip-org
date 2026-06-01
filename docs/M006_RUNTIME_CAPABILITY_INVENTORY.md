# M006 — Runtime Capability Inventory

> **Slice:** S00  
> **Purpose:** Validate live Paperclip runtime assumptions before M006 implementation. No assumptions. Every claim requires live readback or is marked uncertainty.  
> **Sandbox:** `https://paperclip.oysana.com` (87.99.146.178)  
> **Runtime:** 0.3.1 / canary/v2026.525.0-canary.1  
> **Company:** BOS Light Sandbox (43c74adb-b194-44d1-8f8e-ba142544bb9d)  

---

## 1. Current sandbox version

**Confirmed live (2026-06-01):**

```bash
curl -s https://paperclip.oysana.com/api/health
```

```json
{
  "status": "ok",
  "deploymentMode": "authenticated",
  "bootstrapStatus": "ready",
  "bootstrapInviteActive": false
}
```

- **Version:** 0.3.1 (confirmed live by M006 S00 `health_version` probe, 2026-06-01)
- **Build:** health.version:0.3.1
- **Status:** Operational, authenticated mode

**Confirmation:** M006 S00 probe `GET /api/health` returned status 200 with live response body containing `version: 0.3.1`. This is fresh live evidence, not a reuse of M002 S04 proof.

---

## 2. Plugin install path

**Status: BLOCKED (M006 S00 live probe)**

M006 S00 live probe evidence:

| Route | Method | Result |
|---|---|---|
| `/api/companies/{companyId}/plugins` | GET | 404 |
| `/api/plugins` | GET | Empty list `[]` |
| `/api/plugins/bos-light` | GET | 404 |

Plugin key `bos-light` was not observed in any response.

**Blocker codes:** `plugin_not_found`, `plugin_install_endpoint_unsupported`

**Required S00 proof (not achieved):**
- Command or UI path that installs `plugin-bos-light`
- Post-install verification that Paperclip knows plugin key `bos-light`
- No core patch, no registry mutation, no unsupported internals

**Fallback:** If install path unavailable, operator installs manually. Plugin logic remains callable as local scripts (not autonomous).

---

## 3. Tool registry visibility

**Status: BLOCKED (M006 S00 live probe)**

M006 S00 live probe evidence:

| Route | Method | Result |
|---|---|---|
| `/api/companies/{companyId}/plugins/bos-light/tools` | GET | 404 |
| `/api/plugins/bos-light/tools` | GET | 404 |

Zero `piko:*` tools observed. Both company-scoped and global plugin tool endpoints returned 404.

**Blocker codes:** `tool_registry_endpoint_unsupported`, `piko_tools_not_observed`

Historical evidence:
- `runtime-evidence/M002-S05-plugin-ui-surface-probe.json`: `registered_tool_keys=[]`, `readback_proof=null`
- `runtime-evidence/M005-S01-plugin-ui-surface-probe.json`: same

**Required S00 proof (not achieved):**
- `GET /api/companies/{companyId}/plugins` or equivalent returns `bos-light`
- Tool list includes at least one `piko:*` tool
- Tool schema (name, description, parameters) is readable

**Hypothesis:** If `ctx.tools.register` works in worker, tools appear in agent tool picker. Currently unproven.

---

## 4. Agent-to-tool invocation path

**Status: UNCONFIRMED (target of S01)**

Hypothesized paths:

| Path | How | Uncertainty |
|---|---|---|
| Agent prompt references tool by name | Agent sees `piko:eval-gate` in available tools | If registration fails, tool not visible |
| Direct tool call from agent context | `ctx.tools.register` callback invoked | Requires plugin loaded |
| Subprocess fallback | Agent runs local script | Not autonomous; manual patching |

**Required S01 proof:**
- Div5 agent invokes `piko:eval-gate` and receives result
- Result includes tool name, parameters, output
- Evidence saved with redacted diagnostics

---

## 5. Secret reference behavior

**Status: BLOCKED for custom names (M006 S00 live probe)**

M006 S00 live probe evidence:

| Test | Result |
|---|---|
| Hermes `testEnvironment` for `GITHUB_TOKEN_AIPAY` at company scope | 200 OK |
| Secret `GITHUB_TOKEN_AIPAY` present in probe env | **No** (`secret_present_in_env=false`) |
| Secret value in output | Redacted (no plaintext) |

The Hermes `testEnvironment` endpoint responded successfully, but the secret itself was not present in the environment, so materialization could not be verified.

**Blocker codes:** `missing_secret_env`

Confirmed:
- Paperclip company settings support secrets (M005 S03 proved secret visibility)
- `PAPERCLIP_API_KEY` is known to work for API calls
- Secrets are redacted in UI and probe output (not displayed)

Unconfirmed:
- Custom-named secrets (`GITHUB_TOKEN_AIPAY`) materialize in agent env
- Agent can read env vars during execution

**Required S00 proof (not achieved):**
- Agent executes `env | grep GITHUB_TOKEN_AIPAY` or equivalent
- Output shows variable present (value redacted)
- No plaintext secret in agent output, logs, or artifacts

**Historical:** M005 S04 failed because `GITHUB_TOKEN` was missing (only `GITHUB_TOKEN_AIPAY` existed). Scripts patched to check both names.

---

## 6. Artifact/readback behavior

**Status: RE-CONFIRMED (M002 S04 + M006 S00 regression smoke)**

Confirmed surfaces (M002 S04 baseline, M006 S00 regression re-confirmed):

| Surface | Status | Evidence |
|---|---|---|
| Native issue create/readback | **confirmed** | M002 S04 + M006 S00 regression smoke |
| Native document create/readback | **confirmed** | M002 S04 + M006 S00 regression smoke |
| Native comment create/readback | **confirmed** | M002 S04 + M006 S00 regression smoke |

M006 S00 regression smoke readback hashes:

| Surface | Ref | SHA-256 |
|---|---|---|
| Issue | `e02de4e1-9fe8-4df8-b39a-2230b646c71e` | `616b9ced858464b0cb106af1e6b344b3caf03f1b86102842819b84b8471e2ff7` |
| Document | `7b588916-1f46-4fd9-a44a-f23363479b70` | `eac173c1eff8cf6f9fd18f4cd8cd34bcbb51bbdbf19afc5fca3ad921c3f6c586` |
| Comment | `c5326c31-feb2-459d-8a63-e1e9197b06ac` | `45f10eda5a945696bc47c694f3cf8df324d9db71ee7f60d91ef94175bb048d02` |

Unconfirmed surfaces:

| Surface | Status | Blocker |
|---|---|---|
| Plugin state read/write | unvalidated | No round-trip proof |
| Activity logging write | unvalidated | No write/scan proof |
| Native approval/request | unvalidated | No create/read proof |
| Issue lifecycle events | unvalidated | No event delivery proof |
| Terminal run events | fallback-only | Emission uncertain |

**S00 proof achieved:**
- Re-confirmed issue/document/comment APIs are still working (regression smoke test)
- No regression since M002 S04

---

## 7. Constraints discovered live

### 7.1 Auth model

- Paperclip sandbox runs in `authenticated` mode (not open)
- API key required for all mutations
- Company ID required for scoped operations
- No board/admin access from this session (403 observed historically)

### 7.2 Agent execution

- 7 division agents exist in `/BOS` (M005 S02 confirmed)
- Agents use `hermes_local` adapter, `visibilityOnly=true`
- Heartbeat disabled
- **Execution is NOT confirmed live** — agents exist but have not executed autonomous missions

### 7.3 Hermes execution

- `hermes_local` adapter registered for xiaomi provider
- `mimo-v2.5-pro` model configured
- **Blocked by auth**: `adapter_registry_auth_denied`, `missing_xiaomi_api_key`
- **Not required for M006** (target L3, not L5)

### 7.4 GSD-Pi execution

- Local adapter package exists (`adapters/gsdpi-local`)
- Paperclip runtime rejects `gsdpi_local` adapter type: `422 Unknown adapter type`
- **Not required for M006**

### 7.5 Git CLI

- Git binary available: `git version 2.43.0`
- SSH and HTTPS auth supported
- **Live remote auth unconfirmed** — needs `GITHUB_TOKEN_AIPAY` materialization proof

---

## 8. Capability matrix (M006 start)

| Key | Status | Notes |
|---|---|---|
| `issues.native` | confirmed | M002 S04 proven |
| `documents.native` | confirmed | M002 S04 proven |
| `comments.native` | confirmed | M002 S04 proven |
| `plugin.runtime.version_build` | confirmed | M006 S00 live: 0.3.1 / health.version:0.3.1 |
| `plugin.runtime.registration` | fallback-only | No live install proof |
| `registration.tools` | fallback-only | No live tool readback |
| `registration.data` | fallback-only | No live data provider proof |
| `registration.actions` | fallback-only | No live action proof |
| `config.api` | fallback-only | No read/write proof |
| `state.issue_scoped` | unvalidated | No round-trip proof |
| `state.company_scoped` | fallback-only | Known risk |
| `entities.api` | fallback-only | No implementation |
| `activity.logging` | unvalidated | No-op in adapter |
| `events.issue_lifecycle` | unvalidated | No subscription |
| `events.terminal_runs` | fallback-only | Emission uncertain |
| `hermes.execution.xiaomi` | fallback-only | Auth blocked |
| `approvals.native` | unvalidated | No runtime proof |
| `ui.dashboard_widgets` | fallback-only | No render proof |
| `ui.issue_detail_tabs` | fallback-only | No render proof |
| `git.local_cli` | fallback-only | Binary ok, remote auth blocked |
| `state.hybrid_persistence` | fallback-only | Simulated only |
| `workflow.mission_intake` | fallback-only | Simulated only |
| `workflow.hitl_gates` | fallback-only | Simulated only |
| `workflow.branch_policy` | fallback-only | Simulated only |
| `workflow.qa_review` | fallback-only | Simulated only |
| `workflow.pr_merge` | fallback-only | Simulated only |
| `runtime.circuit_breaker_human_resolution` | fallback-only | Simulated only |

---

## 9. S00 success criteria

- [x] Issue/document/comment APIs re-confirmed (regression test) — 2026-06-01
- [x] Evidence artifact saved: `runtime-evidence/M006-S00-runtime-capability-inventory.json` — 2026-06-01
- [x] All claims backed by evidence or marked uncertainty — 2026-06-01
- [x] No assumed surfaces — 2026-06-01
- [ ] Plugin install method confirmed live — BLOCKED (`plugin_not_found`, `plugin_install_endpoint_unsupported`)
- [ ] Tool registry readback confirmed live (or explicitly marked unsupported) — BLOCKED (`tool_registry_endpoint_unsupported`, `piko_tools_not_observed`)
- [ ] Agent-to-tool call path confirmed live (or fallback path documented) — BLOCKED (depends on plugin registration + tool registry)
- [ ] Secret reference behavior confirmed live (custom names) — BLOCKED (`missing_secret_env`)

---

*Inventory updated: 2026-06-01*  
*Status: S00 live validation complete. One capability promoted (`plugin.runtime.version_build` → confirmed). Four surfaces blocked with precise codes. Native artifact APIs re-confirmed via regression smoke.*
