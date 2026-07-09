# S01: Plugin Registration + Hermes Xiaomi Runtime Proof

**Goal:** Plugin Registration + Hermes Xiaomi Runtime Proof
**Demo:** The BOS Light plugin is loaded in Paperclip, dashboard widget and issue tabs are visible, and a bounded Hermes agent run with xiaomi mimo 2.5 pro produces resultJson.bos output.

## Must-Haves

- Plugin registration probe produces runtime-evidence/M005-S01-plugin-ui-surface-probe.json that passes S05 validation (either confirmed surfaces or valid fail-closed blocker).
- Hermes Xiaomi probe produces runtime-evidence/M005-S01-hermes-xiaomi-runtime-probe.json that passes M005 S01 Xiaomi validator (either resultJson.bos proof or valid fail-closed blocker with exact blocker codes).
- Capability matrix updated only for surfaces with live evidence; all others remain unchanged.
- No plaintext secrets in any evidence file.
- Zero native approvals, documents, comments, or issue mutations from probe scripts (side_effect_counters must show zero).

## Proof Level

- This slice proves: integration

## Integration Closure

Upstream surfaces consumed: plugin-bos-light/manifest.paperclip-plugin.json (declared capabilities), plugin-bos-light/src/worker.ts (registration intent), plugin-bos-light/capabilities.paperclip-runtime.json (current matrix), prior M002 runtime evidence (base_url, company_id discovery). New wiring introduced: M005-S01 Hermes Xiaomi probe script and validator, M005-S01 evidence artifacts. What remains before milestone is truly usable end-to-end: S02 company template import + agent profile activation; S03 resource intake; S04 git integration; S05 full E2E mission cycle.

## Verification

- Slice produces two versioned evidence files (plugin probe + Hermes Xiaomi probe) and a summary artifact. Future agents can inspect runtime-evidence/M005-S01-evidence-summary.json for a single-file posture readout, or read the individual probe artifacts for full diagnostics including blocker codes, route attempts, and redaction audits.

## Tasks

- [x] **T01: Create M005 S01 Hermes Xiaomi probe script and validator** `est:1h`
  Why: The existing S10 Hermes runtime smoke script is hardcoded for openai-codex backend (`selected_path: hermes_local_with_codex_cli_backend`, provider: openai-codex, model: gpt-5.3-codex) and cannot validate xiaomi mimo 2.5 pro provider configuration. M005 S01 needs a dedicated probe that targets the xiaomi provider path with `adapterType: hermes_local`, `provider: xiaomi`, `model: mimo-v2.5-pro`, and encrypted `secret_ref` env for `XIAOMI_API_KEY` / `XIAOMI_BASE_URL`.
  - Files: `scripts/run_m005_s01_hermes_xiaomi_probe.py`, `scripts/validate_m005_s01_hermes_xiaomi_probe.py`, `scripts/test_validate_m005_s01_hermes_xiaomi_probe.py`
  - Verify: python3 -m py_compile scripts/run_m005_s01_hermes_xiaomi_probe.py && python3 -m py_compile scripts/validate_m005_s01_hermes_xiaomi_probe.py && python3 -m py_compile scripts/test_validate_m005_s01_hermes_xiaomi_probe.py

- [x] **T02: Execute live plugin registration probe** `est:30m`
  Why: Plugin registration is a hard dependency for S02-S05. With `PAPERCLIP_API_KEY` now available, we can run the first live S05-style probe to attempt confirming plugin load, tool registration, data provider registration, action registration, dashboard widgets, and issue detail tabs in Paperclip.
  - Files: `scripts/run_s05_plugin_ui_surface_probe.py`, `plugin-bos-light/manifest.paperclip-plugin.json`, `plugin-bos-light/capabilities.paperclip-runtime.json`
  - Verify: python3 scripts/run_s05_plugin_ui_surface_probe.py --output runtime-evidence/M005-S01-plugin-ui-surface-probe.json && test -f runtime-evidence/M005-S01-plugin-ui-surface-probe.json

- [x] **T03: Execute Hermes Xiaomi bounded runtime smoke** `est:30m`
  Why: Hermes execution with xiaomi mimo 2.5 pro is explicitly required by D026 and R019. Prior M002 attempts failed with 401 Missing Authentication header due to secret ref materialization issues in hermes-paperclip-adapter@0.2.0. M005 must attempt a fresh bounded run and produce either live proof or a precise fail-closed blocker.
  - Files: `scripts/run_m005_s01_hermes_xiaomi_probe.py`
  - Verify: python3 scripts/run_m005_s01_hermes_xiaomi_probe.py --output runtime-evidence/M005-S01-hermes-xiaomi-runtime-probe.json && test -f runtime-evidence/M005-S01-hermes-xiaomi-runtime-probe.json

- [x] **T04: Validate evidence and update capability matrix** `est:30m`
  Why: The capability matrix (`capabilities.paperclip-runtime.json`) is the source of truth for what surfaces are confirmed. Per MEM058, only bounded live evidence with version/build plus surface-specific readback may promote a capability. S01 must update the matrix for any surfaces that gained live proof, and leave others unchanged.
  - Files: `plugin-bos-light/capabilities.paperclip-runtime.json`, `scripts/validate_s05_plugin_ui_surface_probe.py`, `scripts/validate_m005_s01_hermes_xiaomi_probe.py`
  - Verify: python3 scripts/validate_s05_plugin_ui_surface_probe.py --evidence runtime-evidence/M005-S01-plugin-ui-surface-probe.json --phase final && python3 scripts/validate_m005_s01_hermes_xiaomi_probe.py --evidence runtime-evidence/M005-S01-hermes-xiaomi-runtime-probe.json --phase hermes && test -f runtime-evidence/M005-S01-evidence-summary.json

## Files Likely Touched

- scripts/run_m005_s01_hermes_xiaomi_probe.py
- scripts/validate_m005_s01_hermes_xiaomi_probe.py
- scripts/test_validate_m005_s01_hermes_xiaomi_probe.py
- scripts/run_s05_plugin_ui_surface_probe.py
- plugin-bos-light/manifest.paperclip-plugin.json
- plugin-bos-light/capabilities.paperclip-runtime.json
- scripts/validate_s05_plugin_ui_surface_probe.py
