---
id: T04
parent: S05
milestone: M002
key_files:
  - plugin-bos-light/capabilities.paperclip-runtime.json
  - scripts/validate_runtime_capabilities.py
  - scripts/test_validate_runtime_capabilities.py
  - docs/14_PLUGIN_UI_SURFACE_PROBES.md
  - docs/08_RUNTIME_CAPABILITY_HEALTH.md
  - PAPERCLIP_LIVE_VALIDATION_REPORT.md
key_decisions:
  - Kept S05 plugin/UI surfaces fail-closed: plugin registration, tools, data provider, action, dashboard widget, and issue detail tabs are fallback-only; plugin runtime version/build remains unvalidated.
  - Required canonical S05 evidence plus exact live surface readback/render/invocation proof for any future plugin/UI confirmation; S04 native artifact proof cannot promote these surfaces.
duration: 
verification_result: passed
completed_at: 2026-05-29T11:50:53.249Z
blocker_discovered: false
---

# T04: Published the S05 plugin/UI capability matrix and probe ledger with fail-closed fallback-only classifications and S05-only confirmation guardrails.

**Published the S05 plugin/UI capability matrix and probe ledger with fail-closed fallback-only classifications and S05-only confirmation guardrails.**

## What Happened

Updated `plugin-bos-light/capabilities.paperclip-runtime.json` so S05 is the canonical source for plugin runtime registration, piko tool registration, data provider, action, dashboard widget, and issue-detail tab classifications. `plugin.runtime.version_build` remains `unvalidated` because S05 recorded runtime version/build as `unknown`; plugin registration, tools, data, actions, dashboard widget, and issue-detail tabs are now `fallback-only` with explicit references to `runtime-evidence/M002-S05-plugin-ui-surface-probe.json`. S04 native issue/document/comment rows remain the only confirmed rows.

Extended `scripts/validate_runtime_capabilities.py` with S05 matrix guardrails: any future confirmed plugin/UI row must name `runtime-evidence/M002-S05-plugin-ui-surface-probe.json`, require live S05 artifact type, runtime version/build, and exact surface readback/render/invocation proof. This prevents S04 native artifact proof, local registration intent, optional chaining, or draft manifest requests from promoting plugin/UI surfaces. Added fixture tests covering missing S05 canonical path, fallback-only S05 evidence rejection, and a positive live S05 fixture case.

Created `docs/14_PLUGIN_UI_SURFACE_PROBES.md` as the S05 probe ledger with requested manifest keys, observed keys/render ids, route/status posture, timestamps, redaction flags, side-effect counters, fallback reasons, validation posture, zero-approval posture, remaining no-go gaps, and explicit Q5/Q6/Q7 sections. Updated `docs/08_RUNTIME_CAPABILITY_HEALTH.md` and `PAPERCLIP_LIVE_VALIDATION_REPORT.md` to point to the S05 artifact/doc, reflect status totals (`confirmed`=3, `fallback-only`=10, `unvalidated`=7), and avoid claiming plugin/UI support.

## Verification

Verified runtime capability unit tests, runtime capability validator, and plugin typecheck in one required command chain: `python3 -m unittest scripts/test_validate_runtime_capabilities.py && python3 scripts/validate_runtime_capabilities.py && npm --prefix plugin-bos-light run typecheck` passed with 19 tests and successful `tsc --noEmit`. Also ran the S05 evidence validator directly: `python3 scripts/validate_s05_plugin_ui_surface_probe.py --evidence runtime-evidence/M002-S05-plugin-ui-surface-probe.json --phase final` passed. A final status summary confirmed only `issues.native`, `documents.native`, and `comments.native` remain confirmed, while all targeted S05 plugin/UI rows reference S05 evidence and are fallback-only or unvalidated.

Q5 Failure Modes: documented in `docs/14_PLUGIN_UI_SURFACE_PROBES.md`; missing sandbox inputs disable live probing and produce fallback-only evidence, malformed/missing files fail validators, malformed/non-2xx/truncated route responses cannot confirm surfaces, and secret-like unredacted values fail validation.

Q6 Load Profile: documented in `docs/14_PLUGIN_UI_SURFACE_PROBES.md`; no production runtime load exists, but probe evidence is bounded by route count and response-size limits, with evidence volume as the first 10x saturation risk.

Q7 Negative Tests: covered by `scripts/test_validate_runtime_capabilities.py` S05 cases and existing `scripts/test_validate_s05_plugin_ui_surface_probe.py` cases for malformed inputs, fallback artifacts, proof reuse, missing readbacks/render ids, and non-zero side effects.

## Verification Evidence

| # | Command | Exit Code | Verdict | Duration |
|---|---------|-----------|---------|----------|
| 1 | `python3 -m unittest scripts/test_validate_runtime_capabilities.py && python3 scripts/validate_runtime_capabilities.py && npm --prefix plugin-bos-light run typecheck` | 0 | ✅ pass | 1614ms |
| 2 | `python3 scripts/validate_s05_plugin_ui_surface_probe.py --evidence runtime-evidence/M002-S05-plugin-ui-surface-probe.json --phase final` | 0 | ✅ pass | 47ms |
| 3 | `status summary inspection of S05 matrix/doc references` | 0 | ✅ pass | 38ms |

## Deviations

None.

## Known Issues

No new issues. Existing no-go gaps remain: live sandbox inputs were absent for S05, so plugin/UI surfaces are fallback-only and require future live S05-style readback proof before promotion.

## Files Created/Modified

- `plugin-bos-light/capabilities.paperclip-runtime.json`
- `scripts/validate_runtime_capabilities.py`
- `scripts/test_validate_runtime_capabilities.py`
- `docs/14_PLUGIN_UI_SURFACE_PROBES.md`
- `docs/08_RUNTIME_CAPABILITY_HEALTH.md`
- `PAPERCLIP_LIVE_VALIDATION_REPORT.md`
