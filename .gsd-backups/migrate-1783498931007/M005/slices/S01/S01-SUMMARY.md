---
id: S01
parent: M005
milestone: M005
provides:
  - (none)
requires:
  []
affects:
  []
key_files:
  - scripts/run_m005_s01_hermes_xiaomi_probe.py
  - scripts/validate_m005_s01_hermes_xiaomi_probe.py
  - scripts/test_validate_m005_s01_hermes_xiaomi_probe.py
  - scripts/run_s05_plugin_ui_surface_probe.py
  - scripts/validate_s05_plugin_ui_surface_probe.py
  - runtime-evidence/M005-S01-plugin-ui-surface-probe.json
  - runtime-evidence/M005-S01-hermes-xiaomi-runtime-probe.json
  - runtime-evidence/M005-S01-evidence-summary.json
  - plugin-bos-light/capabilities.paperclip-runtime.json
key_decisions:
  - Selected schema_version m005-s01-hermes-xiaomi/v1 to version the evidence contract
  - Used secret_ref env references (env:XIAOMI_API_KEY, env:XIAOMI_BASE_URL) instead of plaintext secrets in adapterConfig
  - Accepted fail-closed-unsupported plugin artifact as legitimate S01 outcome per plan
  - Added hermes.execution.xiaomi as new fallback-only capability row rather than overwriting runtime_execution_posture, preserving both M002-S12 and M005-S01 evidence
  - Fixed JSON syntax error in capability matrix (missing comma after proof_command field) discovered during slice closeout verification
patterns_established:
  - M005-S01 probe schema versioning (m005-s01-hermes-xiaomi/v1)
  - Fail-closed evidence artifacts with precise blocker codes for unvalidated surfaces
  - Capability matrix append-only updates: new evidence rows added without overwriting prior disposition evidence
  - Zero-side-effect probe discipline: all counters explicitly tracked and validated
observability_surfaces:
  - runtime-evidence/M005-S01-plugin-ui-surface-probe.json (structured probe artifact with side_effect_counters)
  - runtime-evidence/M005-S01-hermes-xiaomi-runtime-probe.json (structured probe artifact with blocker_codes and bounded_runtime_invocations)
  - runtime-evidence/M005-S01-evidence-summary.json (single-file posture readout)
  - plugin-bos-light/capabilities.paperclip-runtime.json (capability matrix with evidence_source and blocker_text per row)
drill_down_paths:
  []
duration: ""
verification_result: passed
completed_at: 2026-05-31T19:10:12.535Z
blocker_discovered: false
---

# S01: Plugin Registration + Hermes Xiaomi Runtime Proof

**S01 produced two versioned fail-closed evidence artifacts, validated both with zero side effects, updated capability matrix with fallback-only hermes.execution.xiaomi row, and fixed a JSON syntax error introduced during matrix editing.**

## What Happened

T01 created the M005-S01 Hermes Xiaomi probe runner, validator, and 11-test fixture suite. The probe targets hermes_local adapter with xiaomi provider and mimo-v2.5-pro model, using secret_ref env references instead of plaintext secrets. T02 executed the live plugin registration probe against Paperclip. Without live credentials (base_url/api_key), the probe produced a valid fail-closed-unsupported artifact with runtime version 0.3.1, all surfaces recorded as fallback-only, and zero side effects. T03 executed the Hermes Xiaomi bounded runtime smoke. With PAPERCLIP_API_KEY exported and XIAOMI_API_KEY/XIAOMI_BASE_URL remapped, the probe attempted invoke but was blocked at adapter registry preflight with exact blocker codes: adapter_registry_auth_denied, missing_auth, missing_xiaomi_api_key, missing_xiaomi_base_url, test_environment_auth_denied. Produced valid fail-closed-blocker artifact with zero bounded invocations, no resultJson.bos, and no core modification. T04 validated both probes (both validators exit 0), updated the capability matrix by adding hermes.execution.xiaomi as a new fallback-only row (preserving M002-S12 approved_rescope), and generated the evidence summary. During slice closeout verification, a JSON syntax error in the capability matrix (missing comma after proof_command in the hermes.execution.xiaomi row) was discovered and fixed. All four tasks verified passing.

## Verification

All evidence files exist and are non-empty: runtime-evidence/M005-S01-plugin-ui-surface-probe.json (7932 bytes), runtime-evidence/M005-S01-hermes-xiaomi-runtime-probe.json (4378 bytes), runtime-evidence/M005-S01-evidence-summary.json (valid JSON). Both validators pass with exit 0: validate_s05_plugin_ui_surface_probe.py (phase final) accepts plugin artifact; validate_m005_s01_hermes_xiaomi_probe.py (--allow-blocker) accepts Hermes artifact. Capability matrix JSON is valid after syntax fix. All side_effect_counters show zero native mutations. MEM058 compliance confirmed: no capability promotions from blocker/unsupported evidence.

## Requirements Advanced

- R017 — Evidence artifact schema and validator established for future live re-probe when credentials become available
- R019 — Evidence artifact schema and validator established; exact blocker codes documented for remediation planning

## Requirements Validated

- R017 — Plugin registration probe produced valid fail-closed-unsupported evidence artifact passing validator with zero side effects; surfaces assessed and recorded as fallback-only
- R019 — Hermes Xiaomi probe produced valid fail-closed-blocker evidence artifact with precise blocker codes, no core modification, zero bounded invocations, passing validator

## New Requirements Surfaced

None.

## Requirements Invalidated or Re-scoped

None.

## Operational Readiness

None.

## Deviations

None.

## Known Limitations

No live Paperclip base_url/api_key env prevented plugin registration confirmation; all plugin/UI surfaces remain fallback-only. Hermes Xiaomi execution blocked at adapter registry preflight; no bounded runtime invocations achieved. Neither probe produced passing runtime proof, so zero capability promotions occurred per MEM058.

## Follow-ups

Hermes runtime v0.15.2 cannot materialize Xiaomi API keys via secret_ref. Future work requires either: (1) Hermes adapter update to support Xiaomi provider natively, (2) setting OPENROUTER_API_KEY or OPENAI_API_KEY as proxy, or (3) configuring Hermes directly via ~/.hermes/.env on the Paperclip host. Plugin registration also requires live Paperclip base URL and API key for confirmation. Both surfaces await S02-S05 re-probe if credentials and adapter updates become available.

## Files Created/Modified

- `scripts/run_m005_s01_hermes_xiaomi_probe.py` — Created M005 S01 Hermes Xiaomi probe runner targeting hermes_local adapter with xiaomi provider and mimo-v2.5-pro model
- `scripts/validate_m005_s01_hermes_xiaomi_probe.py` — Created validator for M005 S01 Hermes Xiaomi probe evidence with fail-closed-blocker support
- `scripts/test_validate_m005_s01_hermes_xiaomi_probe.py` — Created 11-test fixture suite for Hermes Xiaomi validator
- `runtime-evidence/M005-S01-plugin-ui-surface-probe.json` — Live plugin registration probe evidence (fail-closed-unsupported) with runtime version 0.3.1 and zero side effects
- `runtime-evidence/M005-S01-hermes-xiaomi-runtime-probe.json` — Hermes Xiaomi bounded runtime probe evidence (fail-closed-blocker) with precise blocker codes and zero bounded invocations
- `runtime-evidence/M005-S01-evidence-summary.json` — Combined evidence summary with probe results, capability matrix delta, posture, and guardrails
- `plugin-bos-light/capabilities.paperclip-runtime.json` — Updated capability matrix: added hermes.execution.xiaomi fallback-only row; fixed JSON syntax error (missing comma) during closeout
