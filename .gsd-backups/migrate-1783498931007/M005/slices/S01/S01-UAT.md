# S01: Plugin Registration + Hermes Xiaomi Runtime Proof — UAT

**Milestone:** M005
**Written:** 2026-05-31T19:10:12.535Z

- UAT required: no

This slice is backend/integration evidence collection with no user-facing GUI changes to manually test. Acceptance is determined by validator scripts and artifact inspection.

### Preconditions
- Python 3 available
- PAPERCLIP_API_KEY configured in environment (for live probe path; probe degrades gracefully without it)
- Hermes runtime installed (v0.15.2 observed)

### Steps
1. Run plugin probe: `python3 scripts/run_s05_plugin_ui_surface_probe.py --output runtime-evidence/M005-S01-plugin-ui-surface-probe.json`
2. Validate plugin probe: `python3 scripts/validate_s05_plugin_ui_surface_probe.py --evidence runtime-evidence/M005-S01-plugin-ui-surface-probe.json --phase final`
3. Run Hermes probe: `python3 scripts/run_m005_s01_hermes_xiaomi_probe.py --output runtime-evidence/M005-S01-hermes-xiaomi-runtime-probe.json`
4. Validate Hermes probe: `python3 scripts/validate_m005_s01_hermes_xiaomi_probe.py --evidence runtime-evidence/M005-S01-hermes-xiaomi-runtime-probe.json --allow-blocker`
5. Inspect evidence summary: `cat runtime-evidence/M005-S01-evidence-summary.json`

### Expected Outcomes
- Both validators exit 0
- Evidence summary shows zero side effects, no capability promotions, MEM058 compliant posture
- If live credentials unavailable: plugin artifact type is fail-closed-unsupported; Hermes artifact type is fail-closed-blocker with precise blocker codes
- If live credentials available and Hermes Xiaomi configured: Hermes artifact type is runtime-proof with resultJson.bos and wakeCountDelta=1

### Edge Cases
- Missing env vars: probe degrades to fail-closed with documented blocker codes
- Malformed evidence: validator exits non-zero with specific schema violation
- Capability matrix syntax error: validate JSON with `python3 -m json.tool` before completing slice
