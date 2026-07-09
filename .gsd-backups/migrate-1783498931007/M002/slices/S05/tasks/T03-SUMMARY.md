---
id: T03
parent: S05
milestone: M002
key_files:
  - runtime-evidence/M002-S05-plugin-ui-surface-probe.json
  - scripts/validate_s05_plugin_ui_surface_probe.py
  - scripts/test_validate_s05_plugin_ui_surface_probe.py
key_decisions:
  - Preserved fail-closed classification: absent live sandbox configuration keeps all S05 plugin/UI surfaces fallback-only rather than promoting local intent or S04 proof.
  - Made the validator CLI backwards-compatible with the task-plan `--evidence --phase final` command instead of changing the task verification workflow.
duration: 
verification_result: passed
completed_at: 2026-05-29T11:42:02.377Z
blocker_discovered: false
---

# T03: Generated the canonical S05 plugin/UI surface evidence artifact and validated it fail-closed with all unproved surfaces fallback-only.

**Generated the canonical S05 plugin/UI surface evidence artifact and validated it fail-closed with all unproved surfaces fallback-only.**

## What Happened

Ran the bounded S05 probe against the current execution environment and materialized `runtime-evidence/M002-S05-plugin-ui-surface-probe.json`. No approved live Paperclip sandbox base URL/API key was present in this autonomous environment, so the probe did not perform HTTP route attempts and correctly produced a `fail-closed-unsupported` artifact. The evidence records `missing_live_probe_env` and `no_confirmed_s05_surfaces` diagnostics, runtime version/build as unknown, all requested plugin/UI surfaces (`plugin_registration`, `tools`, `data_providers`, `actions`, `dashboard_widgets`, and `issue_detail_tabs`) as `fallback-only`, and zero route requests, piko invocations, native approvals, approval requests, comments, documents, issue mutations, and action invocations.

The written task verification command used `python3 scripts/validate_s05_plugin_ui_surface_probe.py --evidence ... --phase final`, but the validator CLI only accepted a positional evidence path. I made a backwards-compatible validator CLI update so both the original positional form and the task-plan `--evidence --phase final` form work, and added a regression test for that exact flag style.

Quality gates addressed:

## Failure Modes
External dependencies are the filesystem JSON inputs/outputs, optional Paperclip HTTP sandbox, urllib network calls, JSON parsing, and Python subprocess execution for verification. The runner/validator handle missing auth/base URL by writing fail-closed diagnostics, timeout/connection errors by bounded route attempt diagnostics, HTTP 4xx/5xx by unsupported/fallback-only classifications, malformed JSON by validation errors instead of promotion, and filesystem/malformed evidence errors by validator nonzero exit. Regression tests cover missing auth, unsupported 404 routes, malformed JSON, timeout/5xx diagnostics, missing render IDs, and secret redaction.

## Load Profile
The runtime probe has a bounded load dimension: first saturation point is remote route count/response size, protected by `MAX_ROUTE_ATTEMPTS=24`, `MAX_RESPONSE_BYTES=98304`, bounded text snippets, per-request timeout, and no unbounded pagination or mutation loop. In the actual T03 artifact, live probing was disabled and `route_requests_attempted` remained 0, so the 10x live route load was not exercised; the guardrails are nevertheless validated by tests and validator checks.

## Negative Tests
Negative coverage is in `scripts/test_run_s05_plugin_ui_surface_probe.py` and `scripts/test_validate_s05_plugin_ui_surface_probe.py`: missing auth writes fail-closed evidence; unsupported 404 routes do not confirm surfaces; malformed JSON is bounded and diagnostic; timeout/5xx responses do not confirm surfaces; missing UI render IDs prevent UI confirmation; secret-like response values are redacted; missing required surface rows are rejected; nonzero native approvals are rejected; S04-only proof reuse is rejected; confirmed status without runtime/readback is rejected; unbounded route attempts are rejected; and the validator now accepts the task-plan CLI flags.

## Verification

Verified with the exact task-plan generation+validation command: `python3 scripts/run_s05_plugin_ui_surface_probe.py --output runtime-evidence/M002-S05-plugin-ui-surface-probe.json && python3 scripts/validate_s05_plugin_ui_surface_probe.py --evidence runtime-evidence/M002-S05-plugin-ui-surface-probe.json --phase final`, which exited 0 and reported `artifact_type: fail-closed-unsupported`, no confirmed surfaces, and no validation errors. Re-ran the S05 unit/regression suite with `python3 -m unittest scripts.test_run_s05_plugin_ui_surface_probe scripts.test_validate_s05_plugin_ui_surface_probe`, which exited 0. Also summarized the regenerated artifact to confirm `live_probe_enabled=False`, zero route attempts, all six surfaces `fallback-only`, zero side-effect counters, `validation_errors=[]`, and redaction enabled.

## Verification Evidence

| # | Command | Exit Code | Verdict | Duration |
|---|---------|-----------|---------|----------|
| 1 | `python3 scripts/run_s05_plugin_ui_surface_probe.py --output runtime-evidence/M002-S05-plugin-ui-surface-probe.json && python3 scripts/validate_s05_plugin_ui_surface_probe.py --evidence runtime-evidence/M002-S05-plugin-ui-surface-probe.json --phase final` | 0 | ✅ pass | 128ms |
| 2 | `python3 -m unittest scripts.test_run_s05_plugin_ui_surface_probe scripts.test_validate_s05_plugin_ui_surface_probe` | 0 | ✅ pass | 3296ms |
| 3 | `python artifact summary check for runtime-evidence/M002-S05-plugin-ui-surface-probe.json` | 0 | ✅ pass | 50ms |

## Deviations

Added a small validator CLI compatibility fix and regression test because the authoritative task-plan verification command used `--evidence --phase final`, while the existing validator accepted only a positional path.

## Known Issues

No live sandbox auth/base URL was available in the autonomous environment, so the canonical S05 artifact is truthful fail-closed evidence rather than live confirmed Paperclip plugin/UI support.

## Files Created/Modified

- `runtime-evidence/M002-S05-plugin-ui-surface-probe.json`
- `scripts/validate_s05_plugin_ui_surface_probe.py`
- `scripts/test_validate_s05_plugin_ui_surface_probe.py`
