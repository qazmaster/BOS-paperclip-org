# M006 S00 — Runtime Capability Inventory (Research)

> **Slice:** S00  
> **Milestone:** M006  
> **Depth:** Deep research — unfamiliar live runtime boundaries, auth-sensitive probes, multiple viable probe paths, and fail-closed evidence constraints.  
> **Research date:** 2026-06-01

---

## 1. Active Requirements Owned / Supported

| Requirement | Class | Slice ownership | Relevance to S00 |
|---|---|---|---|
| **R017** — Plugin (bos-light) registers with all declared tools/actions/data/widgets/tabs visible and callable | core-capability | M005/S01 (primary), M005/S02/S05 (supporting) | S00 inventories current runtime posture; S01 will attempt live registration. R017 status: `fallback-only` for all plugin surfaces. |
| **R019** — Hermes agent execution with xiaomi mimo 2.5 pro, secret refs materialize correctly | core-capability | M005/S01 (primary), M005/S04/S05 (supporting) | S00 notes Hermes as `fallback-only`/blocked; not required for M006 L3 target per plan docs. |
| **R020** — Local git CLI integration for Div4.Production | integration | M005/S04 (primary), M005/S05 (supporting) | S00 inventories `git.local_cli` as `fallback-only` (binary ok, remote auth blocked). |
| **R022** — One complete E2E mission cycle through Paperclip GUI | primary-user-loop | M005/S05 (primary), M005/S01-S04 (supporting) | S00 establishes baseline capability inventory before E2E. |
| **R024** — Hybrid state persistence (fast in-memory + native artifact mirroring) | quality-attribute | M005/S04 (primary), M005/S05 (supporting) | S00 inventories `state.hybrid_persistence` as `fallback-only` (simulated adapter passes, live auth missing). |
| **R025** — Eval Gate and Circuit Breaker produce live evidence in Paperclip | failure-visibility | M005/S05 (primary), M005/S04 (supporting) | S00 inventories these as `fallback-only` (local tests pass, live unexercised). |

**M006-specific acceptance tests requiring S00 evidence:**
- **M6-A05** — Secrets are scoped and not printed (S00, S04, all divisions)
- **M6-R01** — A12-A20 handoff remains valid (`validate_handoff.py`)
- **M6-R02** — Plugin unit tests still pass (`npm test`, 121 tests)

---

## 2. Summary: What Exists, What Is Missing, and Constraints

### 2.1 What exists (repository-local, proven)

| Asset | Status | Evidence |
|---|---|---|
| Plugin pure logic | **Complete** | `plugin-bos-light/src/` — BPI, Blueprint, Eval Gate, Circuit Breaker, Betting Table, decision artifacts, mission intake, HITL gates, QA review, external IO, git operations, hybrid persistence, state reconstruction. |
| Plugin tests | **Passing** | 28 test files, ~6300 lines. M005 evidence confirms 121/121 pass. |
| Runtime capability matrix | **Current** | `plugin-bos-light/capabilities.paperclip-runtime.json` — 29 capability rows, 3 `confirmed`, 19 `fallback-only`, 7 `unvalidated`. |
| Manifest | **Draft** | `plugin-bos-light/manifest.paperclip-plugin.json` — 13 requested capabilities, 7 tools, 1 dashboard widget, 3 issue detail tabs. |
| Worker registration skeleton | **Draft** | `plugin-bos-light/src/worker.ts` — `registerBosLightPlugin(ctx)` with optional chaining for `ctx.tools/data/actions.register`. |
| Existing probe scripts | **Reusable** | `scripts/run_s05_plugin_ui_surface_probe.py`, `scripts/run_m005_s01_hermes_xiaomi_probe.py`, `scripts/run_m005_s04_git_hybrid_probe.py`, `scripts/run_m005_s05_e2e_governance_probe.py` — all follow identical fail-closed Python standard-library pattern. |
| Existing validators | **Reusable** | `scripts/validate_runtime_capabilities.py`, `scripts/validate_s05_plugin_ui_surface_probe.py`, `scripts/validate_m005_s01_hermes_xiaomi_probe.py`, etc. |
| M006 planning docs | **Complete** | `docs/M006_RUNTIME_CAPABILITY_INVENTORY.md`, `docs/M006_AUTONOMOUS_COMPANY_PLAN.md`, `docs/M006_ACCEPTANCE_TESTS.md`, `docs/M006_PACKET_CONTRACTS.md` |
| Sandbox credentials | **Available** | `.env` contains `PAPERCLIP_API_KEY` and `PAPERCLIP_BASE_URL` — **this is a critical change from M005 where probes failed due to missing auth.** |

### 2.2 What is missing / unconfirmed

| Gap | Risk | Why it matters for S00 |
|---|---|---|
| **Plugin install path** | High | No live proof that `bos-light` plugin can be installed into Paperclip 0.3.1. Hypothesized methods (`paperclipai plugin install`, web UI upload, Docker volume) are all unconfirmed. |
| **Tool registry readback** | High | No evidence that `piko:*` tools appear in Paperclip's registered tool list. M002/M005 probes returned `registered_tool_keys=[]`. |
| **Agent-to-tool invocation** | High | No `piko:*` tool has ever been invoked through Paperclip agent context. All invocations are local/subprocess. |
| **Secret materialization (custom names)** | Critical | `GITHUB_TOKEN_AIPAY` is configured in Paperclip secrets but never proven to materialize in agent env. M005 S04 blocked on `missing_git_credentials`. |
| **Plugin runtime version/build** | Medium | Historical `0.3.1` from M002 S04. No current readback confirming plugin-compatible runtime version. |
| **Live artifact regression** | Medium | Issue/document/comment APIs confirmed in M002 S04 but not re-tested since. Runtime upgrade could break them. |
| **M006-specific evidence artifact** | Required | `runtime-evidence/M006-S00-runtime-capability-inventory.json` does not exist. |
| **M006-specific validator** | Required | No `scripts/validate_m006_s00_runtime_capability_inventory.py` exists. |

### 2.3 Constraints

1. **Fail-closed evidence mandate (MEM054, MEM058):** Every probe must write a valid evidence artifact even when blocked. No capability promotion without live version/build + surface-specific readback.
2. **No core patch / no secret leakage (R011):** Probes must use only supported Paperclip HTTP/admin routes. Secret values must be redacted in all evidence.
3. **Standard-library-only Python:** Existing probe scripts use only Python stdlib + filesystem. This constraint must be preserved for validator portability.
4. **Auth model:** Paperclip sandbox runs in `authenticated` mode. Board/admin access returns 403 historically. Plugin install may require elevated permissions.
5. **Hermes/GSD-Pi not required for M006:** Per `docs/M006_AUTONOMOUS_COMPANY_PLAN.md` section 4, Hermes Xiaomi and GSD-Pi execution are out of scope for M006 (target L3, not L5). S00 must inventory but not resolve these.
6. **Three-way consistency rule (MEM181):** Adding a new capability row requires simultaneous updates to `capabilities.paperclip-runtime.json`, `src/runtimeCapabilities.ts` (PAPERCLIP_RUNTIME_CAPABILITY_KEYS), and `docs/08_RUNTIME_CAPABILITY_HEALTH.md`.

---

## 3. Implementation Landscape

### 3.1 Files to create / modify

| File | Purpose | Action |
|---|---|---|
| `scripts/run_m006_s00_runtime_capability_inventory.py` | **New** — Live probe script for S00. Probes: health/version, plugin install path, tool registry, secret materialization, issue/doc/comment regression. | Create |
| `scripts/validate_m006_s00_runtime_capability_inventory.py` | **New** — Validator for S00 evidence artifact. Schema checks, redaction audit, no-promotion enforcement. | Create |
| `runtime-evidence/M006-S00-runtime-capability-inventory.json` | **New** — Canonical evidence artifact produced by probe. | Create (at runtime) |
| `plugin-bos-light/capabilities.paperclip-runtime.json` | **Modify** — Add/update capability rows for M006-validated surfaces (if any live proof achieved). | Conditionally update |
| `plugin-bos-light/src/runtimeCapabilities.ts` | **Modify** — Mirror any new capability keys per MEM181. | Conditionally update |
| `docs/08_RUNTIME_CAPABILITY_HEALTH.md` | **Modify** — Update per-surface table + status totals per MEM181. | Conditionally update |
| `docs/M006_RUNTIME_CAPABILITY_INVENTORY.md` | **Modify** — Update section 9 (S00 success criteria) with checkmarks after execution. | Update post-execution |

### 3.2 Natural task seams (independent work units)

**Task A: Write S00 probe script** (`run_m006_s00_runtime_capability_inventory.py`)
- Probe 1: Paperclip health/version readback (`GET /api/health`)
- Probe 2: Plugin install path discovery (`GET /api/companies/{id}/plugins` or admin routes)
- Probe 3: Tool registry readback (`GET /api/companies/{id}/tools` or equivalent)
- Probe 4: Secret materialization test (agent env simulation or Hermes testEnvironment with env dump)
- Probe 5: Issue/document/comment regression smoke (create + readback bounded artifact)
- Write `runtime-evidence/M006-S00-runtime-capability-inventory.json`

**Task B: Write S00 validator script** (`validate_m006_s00_runtime_capability_inventory.py`)
- Schema validation against `m006-s00-runtime-capability-inventory/v1`
- Redaction audit (no plaintext secrets)
- No-promotion enforcement (blocker artifacts cannot promote capabilities)
- Capability matrix consistency check (if updates made)

**Task C: Execute live probe and update docs**
- Run probe with `.env` credentials
- Run validator
- Update capability matrix / health report if live proof achieved
- Update M006 inventory doc with results

**Task D: Regression closure (S00 acceptance)**
- Run `python3 scripts/validate_handoff.py` (M6-R01)
- Run `npm --prefix plugin-bos-light test` (M6-R02)
- Confirm 121 tests pass

### 3.3 First proof (highest risk / biggest unblocker)

**Plugin install path + tool registry readback** is the highest-risk, highest-value S00 proof.
- Without it, S01 cannot claim tool visibility (M6-A03).
- Without S01, the entire M006 autonomy loop collapses because agents cannot invoke `piko:*` tools.
- If plugin install is blocked (e.g., requires board access), S00 must document the fallback: operator manual install + subsequent S01 re-probe.

**Secondary first proof:** Secret materialization for `GITHUB_TOKEN_AIPAY`.
- Without it, S05 (Div6 git) will fail identically to M005 S04.
- This is a fast probe if agent env inspection is available.

---

## 4. Recommendation

### 4.1 Approach

**Targeted deep research → executable probe.** S00 should not be a passive survey; it should be an active, fail-closed probe that writes evidence. The existing M005 probe scripts provide a battle-tested template.

1. **Reuse the M005 S05 probe script pattern** (`run_s05_plugin_ui_surface_probe.py`) as the structural base for `run_m006_s00_runtime_capability_inventory.py`.
2. **Extend probes** with:
   - Secret materialization test via Hermes `testEnvironment` or agent env endpoint
   - Issue/document/comment regression smoke (lightweight S04-style create/readback)
   - Plugin install path discovery (try multiple endpoints: `/api/companies/{id}/plugins`, `/api/admin/plugins`, etc.)
3. **Keep all probes bounded:** MAX_RESPONSE_BYTES, timeouts, no unbounded loops.
4. **Write evidence even when fully blocked:** If auth fails or endpoints 404, the artifact must still be schema-valid and contain precise blocker codes.

### 4.2 Risk mitigation

| Risk | Mitigation |
|---|---|
| Plugin install requires board access (403) | Document fallback install path for operator. S00 artifact records `install_path.status=blocked_admin_required`. |
| Tool registry endpoint unknown | Probe multiple hypothesized endpoints sequentially. Record each response. |
| Secret materialization fails | Record blocker code `secret_materialization_failed`. S05 will use manual env injection fallback. |
| Issue/doc/comment APIs regressed | Record regression failure with runtime version. S00 fails; requires runtime fix before M006 proceeds. |
| Credential leak in evidence | Reuse `_redact_value` / `_redact_string` functions from existing probes. Automated regex scan in validator. |

### 4.3 Verification commands

```bash
# Run S00 probe
python3 scripts/run_m006_s00_runtime_capability_inventory.py \
  --output runtime-evidence/M006-S00-runtime-capability-inventory.json

# Validate S00 evidence
python3 scripts/validate_m006_s00_runtime_capability_inventory.py \
  --evidence runtime-evidence/M006-S00-runtime-capability-inventory.json \
  --allow-blocker

# Regression closure
python3 scripts/validate_handoff.py
npm --prefix plugin-bos-light test

# Aggregate capability consistency
python3 scripts/validate_runtime_capabilities.py
```

---

## 5. Skill Recommendations

No additional installed skills are required. The work is entirely within the established BOS Light repository patterns. The existing probe scripts (`run_s05_plugin_ui_surface_probe.py`, `run_m005_s01_hermes_xiaomi_probe.py`) serve as the canonical reference implementation.

If a planner wants external reference:
- **observability** skill could inform structured logging in the probe script
- **api-design** skill could inform the REST route discovery strategy

Neither is required; existing patterns are sufficient.

---

## 6. Forward Intelligence

### Fragility
- `.env` credentials are present **now** but may expire or be rotated. Probes must not assume permanent credential availability.
- Paperclip sandbox `0.3.1` has not been upgraded during M002→M005→M006. A runtime upgrade could change endpoint behavior, plugin install path, or auth model.
- The `paperclipai plugin install` CLI command is hypothesized from conventions but never observed. It may not exist.

### Changed assumptions from M005
- **M005 assumption:** No live auth available → all probes fail-closed-blocker.
- **M006 S00 assumption:** `.env` has `PAPERCLIP_API_KEY` + `PAPERCLIP_BASE_URL` → live probes are possible for the first time in M006.
- **Impact:** S00 can potentially confirm surfaces that M005 could only mark `fallback-only`. However, MEM058 still applies: no promotion without version/build + surface-specific readback.

### Watch-outs
- Do **not** reuse M002 S04 issue/document/comment evidence to promote plugin surfaces (MEM054).
- Do **not** treat `.env` presence as proof that secrets materialize in agent env. They are distinct auth layers.
- Do **not** attempt to fix Hermes Xiaomi or GSD-Pi execution in S00. These are explicitly out of scope for M006 per plan docs.
- If plugin install is blocked, **do not** patch Paperclip core or use private imports (R011 violation).

---

## 7. Sources

- `docs/M006_RUNTIME_CAPABILITY_INVENTORY.md` — Pre-existing S00 planning doc
- `docs/M006_AUTONOMOUS_COMPANY_PLAN.md` — M006 architecture, blockers, risk register
- `docs/M006_ACCEPTANCE_TESTS.md` — Test taxonomy and execution plan
- `plugin-bos-light/capabilities.paperclip-runtime.json` — Machine-readable capability matrix
- `plugin-bos-light/src/runtimeCapabilities.ts` — TypeScript source boundary
- `plugin-bos-light/manifest.paperclip-plugin.json` — Draft requested-capability manifest
- `runtime-evidence/M005-S01-evidence-summary.json` — M005 cumulative posture
- `runtime-evidence/M005-S05-evidence-summary.json` — M005 cumulative posture
- `scripts/run_s05_plugin_ui_surface_probe.py` — Canonical probe pattern
- `scripts/run_m005_s01_hermes_xiaomi_probe.py` — Canonical probe pattern
- `scripts/validate_runtime_capabilities.py` — Capability consistency validator
