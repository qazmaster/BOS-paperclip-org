# S01 Research: Plugin Live Registration

## Scope
Attempt to register the BOS Light plugin (`bos-light`) in the live Paperclip 0.3.1 sandbox, prove that `piko:*` tools appear in the tool registry, and capture invocation readback evidence. Produce a fail-closed artifact if registration is not achievable via available API paths.

## Active Requirements
- **R017** (primary owning slice M005/S01, supporting M005/S02, M005/S05): BOS Light plugin must register and load in Paperclip runtime with all declared tools (`piko:*`), actions (`approve-batch`), data provider (`betting-table`), dashboard widget (`betting-table`), and issue detail tabs (`bos-status`, `circuit-state`, `gate-results`) visible and callable through the Paperclip GUI.
- **M6-A03**: Tool registry readback JSON with `piko:*` tools visible.
- **M6-A04**: Tool invocation result JSON visible in issue artifact.

## What Exists

### Plugin Source
- `plugin-bos-light/manifest.paperclip-plugin.json` — Draft requested-capability manifest. Explicitly notes: "Draft requested-capability manifest only. Runtime confirmation lives in `capabilities.paperclip-runtime.json`."
- `plugin-bos-light/src/worker.ts` — `registerBosLightPlugin(ctx)` registers 7 `piko:*` tools, 1 data provider (`betting-table`), and 1 action (`approve-batch`) using optional chaining (`ctx.tools?.register`, `ctx.data?.register`, `ctx.actions?.register`). All calls are defensive: if the host surface is missing, they skip with a log warning. No crash, no support claim.
- `plugin-bos-light/src/registrationProbe.ts` — Local-only `probeBosLightRegistration()` that records intended registrations with `runtime_support_claimed: false`. Used for diagnostics only; does not imply Paperclip host support.
- `plugin-bos-light/capabilities.paperclip-runtime.json` — Capability matrix. All plugin/UI surfaces (`plugin.runtime.registration`, `registration.tools`, `registration.data`, `registration.actions`, `ui.dashboard_widgets`, `ui.issue_detail_tabs`) are currently `fallback-only`.

### S00 Baseline Evidence
`runtime-evidence/M006-S00-runtime-capability-inventory.json` (2026-06-01) confirms:
- Paperclip runtime version 0.3.1 live (`GET /api/health` → 200).
- Native issue/document/comment APIs re-confirmed via regression smoke.
- **Plugin install path BLOCKED**:
  - `GET /api/companies/{companyId}/plugins` → 404
  - `GET /api/plugins` → 200, empty array `[]`
  - `GET /api/plugins/bos-light` → 404
- **Tool registry BLOCKED**:
  - `GET /api/companies/{companyId}/plugins/bos-light/tools` → 404
  - `GET /api/plugins/bos-light/tools` → 404
- Blocker codes: `plugin_not_found`, `plugin_install_endpoint_unsupported`, `tool_registry_endpoint_unsupported`, `piko_tools_not_observed`.

### Historical Evidence
- `runtime-evidence/M002-S05-plugin-ui-surface-probe.json` — fail-closed-unsupported, zero route attempts (missing env at the time).
- `runtime-evidence/M005-S01-plugin-ui-surface-probe.json` — fail-closed-unsupported, zero route attempts (missing env at the time).
- `runtime-evidence/M005-S01-hermes-xiaomi-runtime-probe.json` — Hermes blocked by auth (`adapter_registry_auth_denied`, `missing_xiaomi_api_key`). Not directly relevant to plugin registration, but shows the sandbox has strict auth gating.

## What Is Missing
1. **Known plugin install mechanism for Paperclip 0.3.1** — No documented API route, SDK method, or company-template field for installing a third-party plugin has been observed live.
2. **Plugin load trigger** — The `/api/plugins` endpoint returns an empty array, suggesting no plugins are currently loaded. There is no confirmed POST/PUT/PATCH route to add one.
3. **Tool registry readback** — Even if the plugin were installed, the only probed tool-list routes returned 404, implying either (a) the routes do not exist, (b) they require a different path structure, or (c) they require admin-scope auth.
4. **Agent-to-tool invocation path** — Unproven. Depends on plugin registration + tool registry + agent execution (Hermes also blocked).

## Constraints & Guardrails
- **MEM058 / MEM198**: Only live Paperclip version/build plus surface-specific create/readback evidence may promote a capability. S04 issue/document/comment evidence must never be reused to claim plugin, tool, UI, or action support.
- **MEM062 / MEM063**: Plugin/UI surfaces remain fallback-only unless independent S01-specific runtime evidence records version/build and per-surface readback/render/invocation proof.
- **Fail-closed artifact required**: If registration is not achievable, S01 must write a schema-valid `fail-closed-blocker` or `fail-closed-unsupported` artifact with precise blocker codes, zero capability promotions, and zero native approval/action side effects.
- **No core patches, no unsupported internals**: Must use only stable external boundaries (REST API, manifest, optional SDK calls).
- **Redaction**: All evidence must pass SECRET_VALUE_RE audit; no plaintext secrets in artifacts.

## Candidate Paths to Explore

### Path A — Broader API route discovery
S00 probed 3 plugin-list routes and 2 tool-registry routes. S01 should expand:
- `POST /api/plugins` (install by payload)
- `POST /api/companies/{companyId}/plugins` (company-scoped install)
- `PUT /api/plugins/bos-light` (upsert)
- `GET /api/plugins/bos-light/status` or `/health`
- `GET /api/companies/{companyId}/settings/plugins` (settings-based plugin list)
- `GET /api/company/{companyId}/plugins` (alternate path segment)
- Any `POST /api/admin/...` routes if admin scope is available (unlikely with current key)

### Path B — Company template import carries plugin reference
The company template (`company-template/bos-company-template.json`) does not currently reference `bos-light`. S01 should verify whether:
- A `plugins` field in the company template schema is supported by Paperclip 0.3.1
- Importing an updated template would auto-load the plugin
- This is blocked because company-template import itself is unvalidated (R018)

### Path C — Hermes agent execution as plugin host
If the plugin cannot be loaded into Paperclip core, an alternative is:
- Agent runs with the BOS Light code bundled in its workspace
- Agent calls local `piko:*` functions directly (not via `ctx.tools.register`)
- This is a fallback, not a plugin registration proof, but may satisfy M6-A04 (tool invocation) without M6-A03 (registry visibility)

### Path D — Manual operator install via UI
If no API path works, the fallback is:
- Document that plugin installation requires operator action in Paperclip admin UI
- S01 produces fail-closed evidence with blocker code `plugin_install_requires_manual_ui`
- Downstream slices (S02-S10) plan fallback-only execution paths

## Implementation Landscape

### Reusable patterns from S00
- `scripts/run_m006_s00_runtime_capability_inventory.py` provides the canonical probe pattern: stdlib-only Python, `HttpClient` class, bounded routes, redaction, timeout guards, structured artifact generation.
- `scripts/validate_m006_s00_runtime_capability_inventory.py` provides the validator pattern: schema checks, redaction audit, no-promotion enforcement, capability matrix consistency.
- These should be extended/copied for S01, not rewritten.

### Files to create/modify
1. `scripts/run_m006_s01_plugin_live_registration.py` — Extended probe script trying broader plugin routes, company settings, and potential install POSTs.
2. `scripts/validate_m006_s01_plugin_live_registration.py` — S01-specific validator with schema version `m006-s01-plugin-live-registration/v1`.
3. `runtime-evidence/M006-S01-plugin-live-registration.json` — Evidence artifact.
4. `plugin-bos-light/capabilities.paperclip-runtime.json` — Update only if live evidence permits promotion (unlikely); otherwise append evidence reference.
5. `docs/08_RUNTIME_CAPABILITY_HEALTH.md` — Update plugin registration section with S01 findings.
6. `docs/M006_RUNTIME_CAPABILITY_INVENTORY.md` — Update sections 2-3 with S01 timestamp and blocker codes.

### Natural seams for task planning
- **T01: Extended route discovery probe** — Write and run broader plugin route discovery script. Independent from other tasks.
- **T02: Company-template plugin field research** — Check if company template supports plugin references. Independent from T01.
- **T03: S01 evidence validator** — Write validator for S01 artifact. Depends on T01 schema.
- **T04: Evidence generation and capability matrix update** — Run probe, validate artifact, update docs/matrix. Depends on T01, T02, T03.
- **T05: Regression gates** — Run M6-R01 and M6-R02 to ensure no breakage. Independent, can run in parallel with T04.

### First proof / highest risk
The highest risk is that Paperclip 0.3.1 simply does not support third-party plugin installation via API. T01 (extended route discovery) is the first proof because it determines whether any of the downstream acceptance tests (M6-A03, M6-A04) are achievable in this runtime.

### Verification commands
- `python3 scripts/validate_m006_s01_plugin_live_registration.py --evidence runtime-evidence/M006-S01-plugin-live-registration.json --allow-blocker` → exit 0
- `python3 scripts/validate_runtime_capabilities.py` → exit 0
- `python3 scripts/validate_handoff.py` → exit 0 (M6-R01)
- `npm --prefix plugin-bos-light test` → 121/121 pass (M6-R02)

## Recommendation
Treat S01 as a **targeted research-with-fallback slice**. The planner should:
1. Start with T01 (extended route discovery) using the S00 probe scaffold.
2. Run T02 (company-template plugin field check) in parallel.
3. If all routes fail, accept the fail-closed outcome immediately: write the blocker artifact, update docs/matrix with precise codes, and do not spend context trying to force an unsupported Paperclip surface.
4. Do **not** attempt to patch Paperclip core, bypass auth, or fabricate registry responses.
5. If any route returns a non-404 (e.g., 401, 403, 422, or a schema response), that becomes the anchor for a replanned T01-follow-up task.

The most probable outcome is `fail-closed-unsupported` with additional blocker codes, which is a valid and valuable S01 completion per MEM198.
