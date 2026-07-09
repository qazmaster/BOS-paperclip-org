---
id: S05
parent: M002
milestone: M002
provides:
  - S06 can rely on a validated S05 canonical evidence artifact and conservative matrix/doc updates.
  - Downstream agents can distinguish unvalidated/fallback-only plugin/UI surfaces from confirmed runtime capabilities.
  - A repeatable command chain exists for re-probing if live Paperclip auth becomes available.
requires:
  - slice: S04
    provides: Consumed Paperclip-visible BOS artifact flow context while explicitly refusing to reuse S04 native artifact evidence as S05 plugin/UI proof.
affects:
  - S06
key_files:
  - plugin-bos-light/src/registrationProbe.ts
  - plugin-bos-light/tests/registrationProbe.test.ts
  - plugin-bos-light/src/worker.ts
  - plugin-bos-light/src/index.ts
  - scripts/run_s05_plugin_ui_surface_probe.py
  - scripts/validate_s05_plugin_ui_surface_probe.py
  - scripts/test_run_s05_plugin_ui_surface_probe.py
  - scripts/test_validate_s05_plugin_ui_surface_probe.py
  - scripts/validate_runtime_capabilities.py
  - scripts/test_validate_runtime_capabilities.py
  - runtime-evidence/M002-S05-plugin-ui-surface-probe.json
  - plugin-bos-light/capabilities.paperclip-runtime.json
  - docs/14_PLUGIN_UI_SURFACE_PROBES.md
  - docs/08_RUNTIME_CAPABILITY_HEALTH.md
  - PAPERCLIP_LIVE_VALIDATION_REPORT.md
key_decisions:
  - Do not confirm Paperclip plugin/UI surfaces from local manifest intent or S04 native artifact evidence.
  - Treat missing live Paperclip auth/routes as bounded fallback-only diagnostics rather than fabricated success.
  - Fail validation on any secret leakage, stale evidence replay, confirmed status without S05 readback proof, or nonzero native approval side effect.
patterns_established:
  - Bounded allowlisted live-probe runner with deterministic output and no recursive route discovery.
  - Fail-closed evidence validator that separates requested manifest keys from observed live support.
  - Runtime capability matrix entries cite S05 canonical evidence and preserve conservative fallback-only statuses.
observability_surfaces:
  - Canonical JSON evidence artifact with runtime posture, route attempts, per-surface status, validation errors, redaction metadata, and side-effect counters.
  - Docs and live validation report sections that expose plugin/UI probe health, failure causes, and recovery steps.
  - Focused registration probe and runtime capability validators for repeatable closeout checks.
drill_down_paths:
  - .gsd/milestones/M002/slices/S05/tasks/T01-SUMMARY.md
  - .gsd/milestones/M002/slices/S05/tasks/T02-SUMMARY.md
  - .gsd/milestones/M002/slices/S05/tasks/T03-SUMMARY.md
  - .gsd/milestones/M002/slices/S05/tasks/T04-SUMMARY.md
  - .gsd/milestones/M002/slices/S05/tasks/T05-SUMMARY.md
duration: ""
verification_result: passed
completed_at: 2026-05-29T11:57:07.617Z
blocker_discovered: false
---

# S05: Plugin and UI surface probes

**S05 delivered a bounded, fail-closed BOS Light Paperclip plugin/UI probe and classified plugin registration, piko tools, data providers, actions, dashboard widgets, and issue-detail tabs as fallback-only without S05 live readback proof.**

## What Happened

S05 added a repository-local registration probe harness for `plugin-bos-light` and a canonical Python runner/validator pair for live Paperclip plugin and UI surface probing. The implementation records local manifest intent for the BOS Light plugin key, piko tool keys, Betting Table data provider/action/widget, and issue-detail tab keys, but treats local intent as non-confirming. The runner writes bounded evidence to `runtime-evidence/M002-S05-plugin-ui-surface-probe.json`; the validator requires S05-specific runtime/version/build posture plus per-surface registration, invocation, data-provider, action, or render readback before any surface can be promoted.

The canonical evidence generated during closeout is intentionally fail-closed: `artifact_type=fail-closed-unsupported`, `phase=live`, runtime `version=unknown`, runtime `build=unknown`, no route attempts because live Paperclip base URL/API key inputs were absent, all six S05 surfaces classified `fallback-only`, and all side-effect counters stayed zero including `native_approvals_created=0`, `approval_requests_created=0`, `action_invocations_attempted=0`, and `piko_invocations_attempted=0`. Secret posture is explicit and safe: `secrets_redacted=true`, `redaction_errors=[]`, and only secret key names are recorded.

The runtime capability matrix and documentation were updated conservatively. `plugin-bos-light/capabilities.paperclip-runtime.json`, `docs/14_PLUGIN_UI_SURFACE_PROBES.md`, `docs/08_RUNTIME_CAPABILITY_HEALTH.md`, and `PAPERCLIP_LIVE_VALIDATION_REPORT.md` now point at S05 canonical evidence and keep plugin registration, piko tools, data providers, actions, dashboard widgets, and issue-detail tabs fallback-only or unvalidated unless S05 live readback proof exists. S04 native artifact proof is not reused to confirm S05 plugin/UI surfaces.

## Operational Readiness

Health signal: operators and downstream agents should run `python3 scripts/run_s05_plugin_ui_surface_probe.py --output runtime-evidence/M002-S05-plugin-ui-surface-probe.json && python3 scripts/validate_s05_plugin_ui_surface_probe.py --evidence runtime-evidence/M002-S05-plugin-ui-surface-probe.json --phase final`. The slice is healthy when the validator exits 0, `validation_errors=[]`, redaction reports `secrets_redacted=true`, approval/action side-effect counters remain zero unless an explicitly supported non-mutating readback path is added, and every `confirmed` surface has S05-specific live readback/render/invocation proof.

Failure signal: validator failure, malformed evidence, any secret-like value in artifacts, a `confirmed` surface without S05 proof, stale S04 evidence masquerading as S05 proof, route probing outside the fixed allowlist, nonzero native approval creation, or documentation/matrix overclaiming live support should block closeout and alert the operator reviewing M002 evidence.

Recovery procedure: restore the evidence to a fail-closed classification, remove any unproved `confirmed` statuses from matrix/docs, inspect side-effect counters before continuing, fix Paperclip auth/route/manifest inputs or validator schema defects, then rerun the full S05 verification chain. If live Paperclip credentials become available later, rerun the runner/validator and only promote surfaces with fresh S05 version/build and surface-specific readback proof.

Monitoring gaps: S05 is a bounded validation artifact, not a continuously running service. There is no background polling or production dashboard; health is established by the explicit local verification commands and by S06 consuming the canonical evidence/report.

## Verification

Fresh closeout verification passed through `gsd_exec` run `c9b2f491-86d9-4567-8b08-e02479cac349` with exit code 0 in 5779ms.

Commands and evidence:
1. `npm --prefix plugin-bos-light test -- registrationProbe` passed: Vitest ran `tests/registrationProbe.test.ts`, 1 test file passed, 6 tests passed.
2. `python3 -m unittest scripts/test_run_s05_plugin_ui_surface_probe.py scripts/test_validate_s05_plugin_ui_surface_probe.py` passed: 19 tests ran OK and validator fixture output passed.
3. `python3 scripts/run_s05_plugin_ui_surface_probe.py --output runtime-evidence/M002-S05-plugin-ui-surface-probe.json && python3 scripts/validate_s05_plugin_ui_surface_probe.py --evidence runtime-evidence/M002-S05-plugin-ui-surface-probe.json --phase final` passed: generated `artifact_type=fail-closed-unsupported`, `confirmed_surfaces=[]`, and `validation_errors=[]`.
4. `python3 -m unittest scripts/test_validate_runtime_capabilities.py && python3 scripts/validate_runtime_capabilities.py && npm --prefix plugin-bos-light run typecheck` passed: runtime capability validator reported `Paperclip runtime capabilities OK: manifest surfaces, adapter assumptions, and guardrail fields are mapped`, and TypeScript `tsc --noEmit` completed successfully.

Additional closeout inspection via `gsd_exec` run `c8ad69c4-7320-440e-9b41-9e480f631315` confirmed the canonical evidence exists, runtime version/build remain unknown because live Paperclip base URL/API key inputs were absent, route attempts count is 0, all six probe surfaces are fallback-only, `secrets_redacted=true`, `redaction_errors=[]`, and all side-effect counters are zero.

## Requirements Advanced

- R011 — Advanced stable Paperclip external-boundary integration by proving plugin/UI probing remains within plugin API/runtime capability boundaries and records fail-closed evidence without Paperclip core patches, private imports, direct DB mutation, or native approval side effects.

## Requirements Validated

None.

## New Requirements Surfaced

- No new requirements surfaced; S05 reinforced the need for S05-specific runtime proof before capability promotion.

## Requirements Invalidated or Re-scoped

None.

## Operational Readiness

None.

## Deviations

T03 added a small backwards-compatible validator CLI update so the validator accepts the task-plan form `--evidence ... --phase final`; this aligned implementation with the authoritative S05 verification command without weakening validation.

## Known Limitations

Live Paperclip base URL/API key inputs were absent during closeout, so S05 produced a valid fail-closed unsupported artifact rather than confirming live plugin/UI support. Runtime version/build remain unknown for S05, and all plugin/UI surfaces remain fallback-only until fresh live readback proof exists.

## Follow-ups

S06 should consume the S05 canonical evidence, keep capability reporting conservative, and include the remaining live-plugin/UI proof gap. If approved live Paperclip auth becomes available, rerun the S05 runner/validator and update matrix/docs only for surfaces with fresh S05 proof.

## Files Created/Modified

- `plugin-bos-light/src/registrationProbe.ts` — Added local registration probe collection for plugin, tool, data provider, action, widget, and issue-tab intent.
- `plugin-bos-light/tests/registrationProbe.test.ts` — Added focused tests for registration probe behavior and guardrails.
- `scripts/run_s05_plugin_ui_surface_probe.py` — Added bounded S05 evidence runner with redaction, allowlisted route attempts, and side-effect counters.
- `scripts/validate_s05_plugin_ui_surface_probe.py` — Added fail-closed S05 evidence validation and compatible `--evidence --phase final` CLI.
- `scripts/test_run_s05_plugin_ui_surface_probe.py` — Added unit tests for runner behavior, negative cases, and bounded diagnostics.
- `scripts/test_validate_s05_plugin_ui_surface_probe.py` — Added unit tests for validator fail-closed semantics and malformed/stale evidence rejection.
- `runtime-evidence/M002-S05-plugin-ui-surface-probe.json` — Generated canonical S05 fail-closed evidence artifact.
- `plugin-bos-light/capabilities.paperclip-runtime.json` — Updated runtime capability matrix with S05 fallback-only/unvalidated plugin/UI statuses and evidence references.
- `docs/14_PLUGIN_UI_SURFACE_PROBES.md` — Documented S05 plugin/UI surface classifications, proof requirements, and fallback reasons.
- `docs/08_RUNTIME_CAPABILITY_HEALTH.md` — Updated runtime capability health with S05 probe status and operational guidance.
- `PAPERCLIP_LIVE_VALIDATION_REPORT.md` — Updated live validation report with S05 conservative evidence and remaining gaps.
