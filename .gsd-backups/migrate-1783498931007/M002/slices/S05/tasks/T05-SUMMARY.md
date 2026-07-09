---
id: T05
parent: S05
milestone: M002
key_files:
  - plugin-bos-light/src/registrationProbe.ts
  - plugin-bos-light/tests/registrationProbe.test.ts
  - scripts/run_s05_plugin_ui_surface_probe.py
  - scripts/validate_s05_plugin_ui_surface_probe.py
  - scripts/test_run_s05_plugin_ui_surface_probe.py
  - scripts/test_validate_s05_plugin_ui_surface_probe.py
  - scripts/test_validate_runtime_capabilities.py
  - scripts/validate_runtime_capabilities.py
  - runtime-evidence/M002-S05-plugin-ui-surface-probe.json
  - plugin-bos-light/capabilities.paperclip-runtime.json
  - docs/14_PLUGIN_UI_SURFACE_PROBES.md
key_decisions:
  - No new durable decisions; preserved the existing S05 fail-closed classification and zero-side-effect probe posture.
duration: 
verification_result: passed
completed_at: 2026-05-29T11:53:27.525Z
blocker_discovered: false
---

# T05: Ran the S05 closeout regression chain and confirmed plugin/UI surfaces remain fail-closed fallback-only with zero native side effects.

**Ran the S05 closeout regression chain and confirmed plugin/UI surfaces remain fail-closed fallback-only with zero native side effects.**

## What Happened

Executed the closeout regression task without changing project files. I first inspected the S05 evidence artifact, runtime capability matrix, docs, registration probe, runner, validators, and tests for overclaims, secret leakage, nonzero native approval/action side effects, accidental Hermes/GSD-Pi execution, and Paperclip core/private import dependency posture. The inspection found all required files present, all S05 plugin/UI surfaces still `fallback-only` or `unvalidated`, side-effect counters at zero, and no evidence/doc runtime secrets; the only secret-like strings were deliberate validator test fixtures. I then ran the full task-plan closeout command successfully: registration probe Vitest tests, S05 runner/validator unittest suites, final S05 evidence validator, runtime capability validator, and plugin TypeScript typecheck. Finally, I extracted the negative-test and bounded-runner coverage so Q5-Q7 are closed with concrete evidence.

## Failure Modes
External dependencies for this task are local filesystem reads/writes of JSON/docs, npm/vitest/tsc subprocesses, Python unittest/validator subprocesses, and optional Paperclip sandbox HTTP routes in `scripts/run_s05_plugin_ui_surface_probe.py`. The runner handles missing auth by writing fail-closed evidence without route attempts; HTTP 4xx/5xx, `URLError`, `TimeoutError`, `OSError`, and malformed JSON are captured as bounded diagnostics instead of promoted support. Validators explicitly fail via `SystemExit` for malformed JSON, missing surface rows, overclaims, unredacted secrets, nonzero native approvals, unbounded route attempts, confirmed surfaces without runtime version/build/readback, and S04-only proof reuse. The closeout command verified these paths through 38 Python tests and 6 TypeScript tests.

## Load Profile
This is a bounded diagnostic/proof task rather than a production runtime path. The first resource that would saturate at 10x expected probe scope is live route probing/response capture. Protection is implemented by `DEFAULT_TIMEOUT_SECONDS = 10.0`, `MAX_ROUTE_ATTEMPTS = 24`, `MAX_RESPONSE_BYTES = 96 KiB`, `MAX_TEXT_SNIPPET = 800`, validator evidence cap `MAX_EVIDENCE_BYTES = 384 KiB`, and hard zero native action/approval side-effect counters. The validator rejects artifacts with route attempts or side-effect counters outside those bounds.

## Negative Tests
Negative coverage is present in `scripts/test_run_s05_plugin_ui_surface_probe.py` for missing auth, unsupported 404 routes, malformed JSON, timeout/5xx diagnostics, missing UI render IDs, and secret-value redaction. `scripts/test_validate_s05_plugin_ui_surface_probe.py` rejects missing surface rows, unredacted secrets, nonzero native approvals, S04-only proof reuse, confirmed status without runtime build/readback, malformed route responses, unbounded route attempts, confirmed UI surfaces missing render IDs, and passing artifacts where surfaces are not all confirmed. `scripts/test_validate_runtime_capabilities.py` rejects malformed matrix JSON, missing capability/manifest coverage, unsupported statuses without fallback/blocker, confirmed statuses without proof/version/build evidence, missing source contract keys, forbidden plugin-owned approval wording, incomplete health report sections, S04 proof misuse, and S05 plugin/UI confirmations that lack canonical S05 evidence.

## Verification

Fresh verification passed. The artifact inspection command exited 0 and confirmed no missing files, no evidence/doc overclaims, zero native approval/action side effects, and no runtime secret leakage. The full closeout command exited 0: `tests/registrationProbe.test.ts` ran 6 passing Vitest tests, Python unittest ran 38 passing tests, `validate_s05_plugin_ui_surface_probe.py --evidence runtime-evidence/M002-S05-plugin-ui-surface-probe.json --phase final` passed, `validate_runtime_capabilities.py` passed, and `npm --prefix plugin-bos-light run typecheck` completed with `tsc --noEmit`.

## Verification Evidence

| # | Command | Exit Code | Verdict | Duration |
|---|---------|-----------|---------|----------|
| 1 | `python gsd_exec artifact inspection for S05 overclaims/secrets/side effects/import posture` | 0 | ✅ pass | 79ms |
| 2 | `npm --prefix plugin-bos-light test -- registrationProbe && python3 -m unittest scripts/test_run_s05_plugin_ui_surface_probe.py scripts/test_validate_s05_plugin_ui_surface_probe.py scripts/test_validate_runtime_capabilities.py && python3 scripts/validate_s05_plugin_ui_surface_probe.py --evidence runtime-evidence/M002-S05-plugin-ui-surface-probe.json --phase final && python3 scripts/validate_runtime_capabilities.py && npm --prefix plugin-bos-light run typecheck` | 0 | ✅ pass | 5746ms |
| 3 | `python gsd_exec summary of S05 negative tests and dependency handling for Q5-Q7` | 0 | ✅ pass | 60ms |
| 4 | `python gsd_exec extraction of S05 runner/validator bounded constants` | 0 | ✅ pass | 33ms |

## Deviations

None.

## Known Issues

None.

## Files Created/Modified

- `plugin-bos-light/src/registrationProbe.ts`
- `plugin-bos-light/tests/registrationProbe.test.ts`
- `scripts/run_s05_plugin_ui_surface_probe.py`
- `scripts/validate_s05_plugin_ui_surface_probe.py`
- `scripts/test_run_s05_plugin_ui_surface_probe.py`
- `scripts/test_validate_s05_plugin_ui_surface_probe.py`
- `scripts/test_validate_runtime_capabilities.py`
- `scripts/validate_runtime_capabilities.py`
- `runtime-evidence/M002-S05-plugin-ui-surface-probe.json`
- `plugin-bos-light/capabilities.paperclip-runtime.json`
- `docs/14_PLUGIN_UI_SURFACE_PROBES.md`
