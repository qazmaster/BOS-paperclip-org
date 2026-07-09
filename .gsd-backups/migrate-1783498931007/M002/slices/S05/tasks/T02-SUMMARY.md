---
id: T02
parent: S05
milestone: M002
key_files:
  - scripts/run_s05_plugin_ui_surface_probe.py
  - scripts/validate_s05_plugin_ui_surface_probe.py
  - scripts/test_run_s05_plugin_ui_surface_probe.py
  - scripts/test_validate_s05_plugin_ui_surface_probe.py
  - runtime-evidence/M002-S05-plugin-ui-surface-probe.json
key_decisions:
  - Confirmed S05 surface status requires S05-specific runtime version/build plus surface route readback proof; S04 issue/document/comment proof and local registration intent remain fallback diagnostics only.
  - The runner does not invoke native approve-batch actions and fixes native approval/action side-effect counters at zero.
  - Persisted route evidence is bounded and redacted: JSON responses are summarized by shape/top-level keys while text diagnostics are capped and scrubbed.
duration: 
verification_result: passed
completed_at: 2026-05-29T11:39:17.201Z
blocker_discovered: false
---

# T02: Added a bounded S05 live probe runner, fail-closed validator, unit tests, and canonical unsupported evidence artifact for BOS Light plugin/UI surfaces.

**Added a bounded S05 live probe runner, fail-closed validator, unit tests, and canonical unsupported evidence artifact for BOS Light plugin/UI surfaces.**

## What Happened

Created `scripts/run_s05_plugin_ui_surface_probe.py`, a standard-library-only runner that reads the BOS Light manifest/runtime matrix, optionally uses Paperclip sandbox env (`PAPERCLIP_BASE_URL`, `PAPERCLIP_API_KEY`, company/issue IDs), probes a fixed route set, records runtime version/build if observed, captures requested/observed plugin registration/tool/data/action/UI keys, records piko invocation diagnostics when tools are supported, captures dashboard/issue-tab render IDs, and writes bounded redacted S05 evidence. The runner keeps native approval/action side effects at zero and does not promote any surface without S05 runtime version/build plus surface readback proof.

Created `scripts/validate_s05_plugin_ui_surface_probe.py`, a fail-closed validator that requires all canonical surface rows, rejects secret-like values, nonzero native approvals, S04-only proof reuse, confirmed statuses without S05 version/build/readback, malformed or truncated route responses, missing UI render IDs for confirmed UI surfaces, and unbounded route evidence.

Added unittest coverage for live-success fixtures, missing auth, unsupported 404 routes, malformed JSON, timeout/5xx diagnostics, missing render IDs, redaction, positive validator contract, fail-closed validator contract, and validator rejection cases. Wrote `runtime-evidence/M002-S05-plugin-ui-surface-probe.json` with live env explicitly unset; it validates as `fail-closed-unsupported` with no confirmed surfaces.

## Failure Modes
- Filesystem/JSON inputs: runner reads the manifest/runtime matrix and will fail visibly on missing/malformed files; validator reports missing/malformed evidence files with line/column diagnostics.
- Missing auth/env: runner emits fail-closed evidence with `missing_live_probe_env`, zero route attempts, fallback-only surfaces, and no support claims; covered by `test_missing_auth_writes_fail_closed_without_route_attempts` and validator fail-closed acceptance.
- Unsupported routes/404: runner records bounded route attempts and marks affected surfaces unsupported/fallback-only instead of confirmed; covered by `test_unsupported_404_routes_remain_fail_closed`.
- Malformed JSON/truncated text: runner records bounded text snippets and validation errors; validator rejects malformed/truncated route responses; covered by runner and validator malformed-response tests.
- Timeout/connection/5xx: HTTP errors, URL errors, OS errors, and timeouts are captured as route diagnostics without promotion; covered by `test_timeout_and_5xx_are_recorded_as_diagnostics`.
- Secret leakage: URL/auth values are not persisted, text diagnostics are redacted, and validator rejects secret-shaped values; covered by redaction tests.

## Load Profile
The runner probes a fixed bounded contract rather than a variable workload: at most 24 route attempts and 96 KiB per response, with persisted snippets capped at 800 characters. At 10x the current expected surface count, the first saturation point would be route-attempt count/evidence size; protection is the hard `MAX_ROUTE_ATTEMPTS` guard, no pagination or background pools, and shape-only JSON summaries rather than raw response persistence.

## Negative Tests
- `scripts/test_run_s05_plugin_ui_surface_probe.py` covers missing auth, unsupported 404 routes, malformed JSON, timeout/5xx diagnostics, missing UI render IDs, and secret redaction.
- `scripts/test_validate_s05_plugin_ui_surface_probe.py` rejects missing surface rows, secret-like values, nonzero native approvals, S04-only proof reuse, confirmed statuses without runtime build/readback, malformed route responses, unbounded route attempts, missing render IDs, and `live-evidence` artifacts where not all surfaces are confirmed.

## Observability Impact
The S05 evidence artifact now exposes runtime version/build, requested manifest keys, observed surface keys, route attempts/status codes, phase timestamps, side-effect counters, redaction status, fallback diagnostics, and validation errors so future agents can inspect support posture without inferring from optional chaining or local React scaffolds.

## Verification

Ran the required focused unittest command successfully: `python3 -m unittest scripts/test_run_s05_plugin_ui_surface_probe.py scripts/test_validate_s05_plugin_ui_surface_probe.py` passed 19 tests. Ran the S05 runner with live Paperclip env explicitly unset and wrote `runtime-evidence/M002-S05-plugin-ui-surface-probe.json` as fail-closed unsupported evidence with no validation errors. Validated the canonical artifact successfully with `python3 scripts/validate_s05_plugin_ui_surface_probe.py runtime-evidence/M002-S05-plugin-ui-surface-probe.json`.

## Verification Evidence

| # | Command | Exit Code | Verdict | Duration |
|---|---------|-----------|---------|----------|
| 1 | `python3 -m unittest scripts/test_run_s05_plugin_ui_surface_probe.py scripts/test_validate_s05_plugin_ui_surface_probe.py` | 0 | ✅ pass — 19 tests passed | 3371ms |
| 2 | `env -u PAPERCLIP_BASE_URL -u PAPERCLIP_API_KEY -u PAPERCLIP_API_KEY_ENV -u PAPERCLIP_AUTH_HEADER -u PAPERCLIP_COMPANY_ID -u PAPERCLIP_SANDBOX_COMPANY_ID -u PAPERCLIP_ISSUE_ID -u PAPERCLIP_SANDBOX_ISSUE_ID python3 scripts/run_s05_plugin_ui_surface_probe.py` | 0 | ✅ pass — wrote fail-closed unsupported S05 evidence with no runner validation errors | 84ms |
| 3 | `python3 scripts/validate_s05_plugin_ui_surface_probe.py runtime-evidence/M002-S05-plugin-ui-surface-probe.json` | 0 | ✅ pass — canonical S05 evidence validated | 53ms |

## Deviations

None.

## Known Issues

No live Paperclip sandbox env was available in autonomous execution, so the canonical artifact is intentionally `fail-closed-unsupported` with no confirmed plugin/UI surfaces.

## Files Created/Modified

- `scripts/run_s05_plugin_ui_surface_probe.py`
- `scripts/validate_s05_plugin_ui_surface_probe.py`
- `scripts/test_run_s05_plugin_ui_surface_probe.py`
- `scripts/test_validate_s05_plugin_ui_surface_probe.py`
- `runtime-evidence/M002-S05-plugin-ui-surface-probe.json`
