# S01 — Plugin Registration + Hermes Xiaomi Runtime Proof

**Date:** 2026-05-31
**Milestone:** M005
**Slice:** S01
**Risk:** HIGH

## Summary

Slice S01 must produce the first live Paperclip evidence for two historically blocked surfaces: **plugin registration** (tools, actions, data providers, dashboard widgets, issue detail tabs) and **Hermes agent execution** with the xiaomi mimo 2.5 pro provider. All prior milestones (M002–M004) left these surfaces as `fallback-only` or `unvalidated`. The critical difference for M005 is that `PAPERCLIP_API_KEY` is now present in the local `.env`, enabling live HTTP probes against Paperclip for the first time.

The plugin code is structurally ready: `plugin-bos-light/src/worker.ts` implements `registerBosLightPlugin(ctx)` with defensive optional chaining, and `manifest.paperclip-plugin.json` declares the full capability request. However, the capability matrix (`capabilities.paperclip-runtime.json`) still lists every plugin/UI surface as `fallback-only` because the M002 S05 probe lacked credentials. Hermes execution previously failed in M002 S02 with a `401 Missing Authentication header` because Xiaomi secret refs did not materialize in the Hermes subprocess environment (hermes-paperclip-adapter@0.2.0 persisted `adapterConfig.env` rather than resolving runtime secret refs). A subsequent M002 S08 remediation installed Hermes v0.15.2 inside the Paperclip container and switched the execution path to `hermes_local_with_codex_cli_backend`, but this did not fix the original Xiaomi materialization path.

For M005 S01, the recommended approach is: (1) run a fresh live S05-style plugin/UI surface probe using the available API key, and (2) attempt a bounded Hermes run with explicit xiaomi provider configuration (`--provider xiaomi --model mimo-v2.5-pro`) and encrypted `secret_ref` env, recording whether `resultJson.bos` is produced. Both attempts must write versioned evidence files; any remaining blocker must be captured as a fail-closed artifact, not simulated success.

## Recommendation

**Approach:** Execute two parallel bounded live probes:
1. **Plugin Registration Probe** — Re-run the S05 plugin UI surface probe script (or an M005 variant) with live `PAPERCLIP_BASE_URL` + `PAPERCLIP_API_KEY`. Record runtime version/build, observed registered keys, and readback proof for each surface. Update the capability matrix only for surfaces with live evidence.
2. **Hermes Xiaomi Runtime Probe** — Create a Paperclip agent configured with `adapterType: hermes_local`, `provider: xiaomi`, `model: mimo-v2.5-pro`, and `secret_ref` env for `XIAOMI_API_KEY` / `XIAOMI_BASE_URL`. Run one bounded invocation. If secret refs still fail, record the exact blocker code (e.g., `adapter_registry_auth_denied`, `missing_auth`, `test_environment_auth_denied`) and preserve the fail-closed posture.

**Why:** The user explicitly requires xiaomi mimo 2.5 pro for Hermes agents (D026). Prior evidence shows the Codex-backend path works for Hermes CLI availability but does not satisfy the user-selected provider. Plugin registration is a hard dependency for S02–S05. With credentials now available, the first live probe is the only way to move these surfaces from `fallback-only` to `confirmed` or to document exactly why they remain blocked.

## Implementation Landscape

### Key Files

- `plugin-bos-light/src/worker.ts` — Draft plugin registration. Uses optional chaining (`ctx.tools?.register`, `ctx.data?.register`, `ctx.actions?.register`) to avoid crashes on unvalidated surfaces. Registers 7 `piko:*` tools, 1 data provider (`betting-table`), and 1 action (`approve-batch`).
- `plugin-bos-light/manifest.paperclip-plugin.json` — Declares requested capabilities: `tools.register`, `data.register`, `actions.register`, `config.read/write`, `state.read/write`, `entities.read/write`, `issues.read/write`, `activity.write`, `events.subscribe`, plus UI widgets (`betting-table`) and issue tabs (`bos-status`, `circuit-state`, `gate-results`).
- `plugin-bos-light/capabilities.paperclip-runtime.json` — Evidence source of truth. Currently lists all plugin/UI surfaces as `fallback-only` or `unvalidated`. Must be updated only after live evidence is produced.
- `plugin-bos-light/src/registrationProbe.ts` — Local simulation probe. Returns `runtime_support_claimed: false`. Useful for unit tests, not for live confirmation.
- `plugin-bos-light/src/livePaperclipAdapter.ts` — HTTP-based adapter for confirmed native artifact surfaces (issues, documents, comments). Already confirmed in M002 S04. Can be reused for any live artifact creation S01 requires.
- `scripts/run_s05_plugin_ui_surface_probe.py` — Prior probe script. Ran with missing env and produced `fail-closed-unsupported` artifact. Should be reused/adapted for M005 live run.
- `scripts/run_s10_hermes_runtime_smoke.py` — Prior Hermes runtime smoke. M002 S10 produced `fail-closed-blocker` due to missing auth.
- `runtime-evidence/M002-S05-plugin-ui-surface-probe.json` — Canonical no-promotion ledger for plugin surfaces.
- `runtime-evidence/M002-S02-hermes-smoke.json` — Shows agent creation success but run failure (`401 Missing Authentication header`) due to Xiaomi secret ref materialization.
- `runtime-evidence/M002-S08-hermes-cli-environment-remediation.json` — Shows Hermes v0.15.2 installed and `testEnvironment` passing with `status=warn` (no API keys) under the Codex-backend path.
- `.env` — Now contains `PAPERCLIP_API_KEY` and `OPENAI_API_KEY` (Xiaomi token alias).

### Build Order

1. **First: Plugin Registration Live Probe** — Lowest incremental cost. Reuse the existing S05 script with credentials populated. If Paperclip returns runtime version/build and any registered keys, that immediately unblocks S02 planning by confirming the plugin load surface.
2. **Second: Hermes Xiaomi Bounded Smoke** — Higher risk. Requires agent creation, adapter config with `secret_ref`, and one invocation. If this passes, it confirms R019 and unblocks all downstream division agent execution. If it fails, the fail-closed artifact feeds into S03 resource-intake planning (credential request system).
3. **Third: Capability Matrix Update** — Only after evidence files are written. Update `capabilities.paperclip-runtime.json` for surfaces that gained live proof; leave others unchanged.

### Verification Approach

- **Plugin probe:** Run the probe script with live env. Verify output contains `runtime.version`, `runtime.build`, and `surfaces.*.observed_registered_keys` / `readback_proof` for at least `plugin_registration`, `tools`, `actions`, and `data_providers`. Validate with `python3 scripts/test_validate_s05_plugin_ui_surface_probe.py`.
- **Hermes smoke:** Create agent via Paperclip API, invoke once, poll run status. Verify `resultJson.bos` exists and is a structured object (not just `resultJson.result` string). Verify `wakeCounts.delta == 1`. Validate with `python3 scripts/test_validate_s10_hermes_runtime_smoke.py`.
- **Fail-closed validation:** If either probe fails, ensure the evidence file has `artifact_type: fail-closed-blocker`, lists exact `blocker_codes`, contains no plaintext secrets, and records `side_effect_counters` showing zero native mutations.

## Constraints

- **No capability promotion without live evidence:** Per MEM058, only bounded live Paperclip issue/document/comment create/readback evidence may promote native artifact surfaces. Plugin/UI surfaces require their own S05-style live proof with version/build + readback. Hermes execution requires bounded run/readback with `resultJson.bos`.
- **No plaintext credentials:** `.env` contains secrets. Probe scripts must redact them in evidence output (existing scripts already do this).
- **No Paperclip core patches or private imports:** All probes must use supported HTTP/admin/agent/adapter routes only.
- **GSD-Pi remains blocked:** `gsdpi_local` is not registered in Paperclip (MEM046). S01 must not attempt to use or promote it.
- **Hermes adapter version:** Paperclip uses hermes-paperclip-adapter behavior that may persist `adapterConfig.env` rather than resolving secret refs at runtime. If this is still true, the Xiaomi path may remain blocked regardless of correct config.

## Common Pitfalls

- **Reusing M002 S04 artifact evidence for plugin surfaces:** M002 S04 confirmed only native issue/document/comment APIs. It must not be used to claim plugin registration, tools, actions, widgets, or tabs.
- **Treating `testEnvironment: warn` as pass:** The S08 remediation showed `hermes_local_testEnvironment` status `warn` with code `hermes_no_api_keys`. This is not a passing runtime proof; it only clears the CLI-not-found blocker.
- **Confusing `resultJson.result` with `resultJson.bos`:** Older Hermes adapter versions store JSON output as `resultJson.result`. S01 validators must check for `resultJson.bos` specifically, per the M002 S12 closeout requirements.
- **Missing `wakeCountDelta=1`:** Hermes proof requires exactly one wake/run. Duplicate or missing wakes invalidate the evidence.

## Open Risks

- **Hermes secret_ref materialization still broken (HIGH):** If hermes-paperclip-adapter@0.2.0 still uses persisted env instead of resolved runtime config, the Xiaomi API key will not reach the Hermes subprocess even when configured correctly in Paperclip. This would leave Hermes execution `fallback-only` and force S01 to produce a fail-closed blocker.
- **Plugin manifest schema rejection (HIGH):** Paperclip may reject the draft manifest schema (`0.1-draft`) or deny registration of one or more requested capabilities. The S05 probe must capture exact validation errors.
- **Paperclip API key permissions (MEDIUM):** The key in `.env` has not been validated against the required endpoints (adapters, agents, runs). It may have insufficient scope for plugin load or agent creation.
- **Xiaomi API key validity (MEDIUM):** The `OPENAI_API_KEY` value in `.env` is an alias for the Xiaomi token. It may be expired or rate-limited.

## Skills Discovered

| Technology | Skill | Status |
|------------|-------|--------|
| Paperclip Plugin SDK | None found in available skills; local code only | N/A |
| Hermes Agent Runtime | None found in available skills; local scripts only | N/A |
| Xiaomi MiMo API | None found in available skills | N/A |

## Sources

- M002 S02 Hermes smoke evidence: `runtime-evidence/M002-S02-hermes-smoke.json` — Agent creation succeeded; run failed `401 Missing Authentication header`; `resultJson` lacked `.bos`.
- M002 S05 Plugin UI probe: `runtime-evidence/M002-S05-plugin-ui-surface-probe.json` — Fallback-only because `PAPERCLIP_BASE_URL` and `PAPERCLIP_API_KEY` were absent.
- M002 S08 Remediation: `runtime-evidence/M002-S08-hermes-cli-environment-remediation.json` — Hermes v0.15.2 installed; `testEnvironment` passed with `warn` (no API keys).
- M002 S10/S12 Runtime execution: `runtime-evidence/M002-S10-hermes-runtime-execution-proof.json`, `runtime-evidence/M002-S12-hermes-runtime-execution-proof.json` — Fail-closed blockers due to auth.
- M005 architecture decision: `.gsd/DECISIONS.md` D026 — Hermes + xiaomi for agents, local git CLI for aipay.kz, hybrid state persistence.
