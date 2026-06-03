# 14 - Plugin and UI Surface Probes

This ledger is the S05 reader-facing companion to `runtime-evidence/M002-S05-plugin-ui-surface-probe.json`. The JSON artifact is the canonical machine-readable evidence; this document explains the current classification and the no-go boundary for BOS Light plugin registration, piko tools, data providers, actions, dashboard widgets, and issue detail tabs.

## Summary Verdict

S05 is **fail-closed**. No BOS Light plugin or UI surface is confirmed.

- Canonical evidence: `runtime-evidence/M002-S05-plugin-ui-surface-probe.json`
- Validator: `python3 scripts/validate_s05_plugin_ui_surface_probe.py --evidence runtime-evidence/M002-S05-plugin-ui-surface-probe.json --phase final`
- Artifact type: `fail-closed-unsupported`
- Phase: `live`
- Runtime version/build: `unknown` / `unknown`
- Live probe enabled: `false`
- Route attempts: `0`
- Native action invocations attempted: `0`
- Approval requests/native approvals created: `0` / `0`
- Documents/comments/issue mutations created by S05: `0` / `0` / `0`
- Redaction: `secrets_redacted=true`; secret env names are listed by key only.

The blocker is diagnostic, not a product capability: S05 did not run live HTTP probes because `PAPERCLIP_BASE_URL` was absent in the autonomous environment. That absence keeps every requested plugin/UI surface fallback-only or unvalidated; it does not prove the surfaces are unavailable in Paperclip.

## Requested Manifest Keys

S05 inspected the draft BOS Light manifest request set:

| Family | Requested keys |
|---|---|
| Plugin | `bos-light` |
| Capabilities | `config.read`, `config.write`, `events.subscribe`, `state.read`, `state.write`, `entities.read`, `entities.write`, `issues.read`, `issues.write`, `activity.write`, `data.register`, `actions.register`, `tools.register` |
| Tools | `piko:bpi-score`, `piko:blueprint-gen`, `piko:bpi-blueprint-artifact`, `piko:eval-gate`, `piko:eval-gate-evidence`, `piko:circuit-breaker-observe`, `piko:decide` |
| Data providers | `betting-table` |
| Actions | `approve-batch` |
| Dashboard widgets | `betting-table` |
| Issue detail tabs | `bos-status`, `circuit-state`, `gate-results` |

Manifest entries are request intent only. They do not prove that the Paperclip host can load, register, invoke, or render those surfaces.

## Probe Ledger

| Surface | Matrix key | S05 status | Observed keys/render ids | Readback proof | Fallback reason | Current posture |
|---|---|---|---|---|---|---|
| Plugin entrypoint and runtime registration | `plugin.runtime.registration` | `fallback-only` | `[]` | `null` | Live Paperclip base URL/API key not supplied. | Keep pure BOS Light logic callable directly; do not claim plugin load. |
| piko tool registration and invocation | `registration.tools` | `fallback-only` | `[]` | `null` | Live Paperclip base URL/API key not supplied. | Run pure TypeScript functions locally or mirror evidence to confirmed native document/comment artifacts. |
| Betting Table data provider | `registration.data` | `fallback-only` | `[]` | `null` | Live Paperclip base URL/API key not supplied. | Render Betting Table through confirmed native artifacts or markdown until provider hydration is proven. |
| Approve Batch action | `registration.actions` | `fallback-only` | `[]` | `null` | Live Paperclip base URL/API key not supplied. | Use managed issue/comment/document review workflows; do not mark native approval status from fallbacks. |
| Dashboard Betting Table widget | `ui.dashboard_widgets` | `fallback-only` | `{}` | `null` | Live Paperclip base URL/API key not supplied. | Publish Betting Table as confirmed native artifacts or markdown; do not promise dashboard rendering. |
| Issue detail tabs | `ui.issue_detail_tabs` | `fallback-only` | `{}` | `null` | Live Paperclip base URL/API key not supplied. | Surface BOS status, circuit state, and gate results through labels/comments/documents or markdown. |
| Plugin runtime version/build | `plugin.runtime.version_build` | `unvalidated` | `unknown` / `unknown` | none | No live S05 runtime route readback. | Do not set minimum plugin runtime version or breaking-change posture. |

No S05 validation errors are present in the artifact. Absence of validation errors means the fallback evidence is structurally valid and redacted; it is not support confirmation.

## Route Attempts and Status Codes

S05 recorded no route attempts and no HTTP status codes because live probing was disabled. Future retry evidence must list bounded route attempts with IDs, surfaces, methods, paths, status codes, redacted summaries, and readback proof references. A matrix row may become `confirmed` only if the S05 artifact has runtime version/build plus that exact surface's live 2xx registration, invocation, or render readback.

S04 `runtime-evidence/M002-S04-live-artifact-flow.json` cannot promote any row in this ledger. S04 confirms only native issue, native document, and native comment artifact APIs in its bounded proof scope.

## Phase Timestamps

The current S05 artifact records these phase timestamps:

| Phase | Timestamp |
|---|---|
| start | `2026-05-29T11:42:06Z` |
| inputs_loaded | `2026-05-29T11:42:06Z` |
| evidence_written | `2026-05-29T11:42:06Z` |

## Side-Effect and Zero-Approval Posture

S05 is safe to inspect because it did not mutate approval/action state:

| Counter | Value |
|---|---:|
| `route_requests_attempted` | 0 |
| `piko_invocations_attempted` | 0 |
| `action_invocations_attempted` | 0 |
| `issue_mutations_attempted` | 0 |
| `documents_created` | 0 |
| `comments_created` | 0 |
| `approval_requests_created` | 0 |
| `native_approvals_created` | 0 |

A future action probe must keep approval creation as a separate explicitly safe step. `registration.actions` does not imply `approvals.native`.

## Failure Modes

External dependencies and their fail-closed paths:

- Paperclip HTTP API: missing base URL/API key disables live probing and writes fallback-only evidence instead of overclaiming support.
- Filesystem: missing or malformed evidence/matrix files are reported by `scripts/validate_s05_plugin_ui_surface_probe.py` and `scripts/validate_runtime_capabilities.py` with explicit file/context errors.
- Network responses: future non-2xx, malformed JSON, or truncated route summaries cannot be used as confirmed S05 readback proof.
- Secret-bearing inputs: secret env names may be listed, but values must stay redacted; secret-like unredacted values fail S05 validation.

## Load Profile

This task has no production runtime load dimension. The probe/validator path is bounded for operator safety: at most 24 route attempts, 96 KiB response summaries per route, and standard-library JSON/file validation. At 10x the expected S05 probe size, the first saturation risk is unbounded evidence volume; the validators protect it with route-count, response-size, and malformed/truncated-response checks.

## Negative Tests

Negative protection lives in:

- `scripts/test_validate_s05_plugin_ui_surface_probe.py`: malformed evidence, unredacted secrets, overlarge/truncated responses, missing fallback diagnostics, confirmed surfaces without runtime version/build/readback proof, S04 proof reuse, missing UI render IDs, missing piko invocation result, and non-zero approval/action side effects.
- `scripts/test_validate_runtime_capabilities.py`: S05 confirmations must name `runtime-evidence/M002-S05-plugin-ui-surface-probe.json`; fallback-only S05 artifacts cannot confirm plugin/UI rows; live S05 fixture evidence can confirm only when exact surface readback/render requirements are present; S04 evidence cannot confirm unrelated plugin/UI surfaces.

## Remaining No-Go Gaps

- BOS Light plugin installation/load has no live readback.
- `ctx.tools.register`, `ctx.data.register`, and `ctx.actions.register` have no live host readback.
- No `piko:*` tool has been invoked through Paperclip.
- No Betting Table data-provider hydration or dashboard widget render exists.
- No `bos-status`, `circuit-state`, or `gate-results` issue detail tab render exists.
- No native approval/request creation proof exists.
- Runtime version/build has not been captured in the same S05 artifact as plugin/UI surface proof.
