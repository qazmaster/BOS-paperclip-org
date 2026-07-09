---
id: S08
parent: M002
milestone: M002
provides:
  - Selected runtime remediation path and evidence packet.
  - Hermes CLI environment remediation evidence under supported Paperclip process-adapter boundary.
  - T04 fail-closed runtime smoke artifact proving Paperclip owned the run but structured BOS execution remains blocked.
requires:
  []
affects:
  - M002 closeout remains conservative needs-attention for live runtime execution; no capability matrix promotion was made.
key_files:
  - runtime-evidence/M002-S08-provider-adapter-feasibility.json
  - runtime-evidence/M002-S08-execution-path-decision-packet.json
  - runtime-evidence/M002-S08-adapter-registration-evidence.json
  - runtime-evidence/M002-S08-hermes-cli-environment-remediation.json
  - runtime-evidence/M002-S08-runtime-execution-smoke.json
key_decisions:
  - D011 selected Paperclip-owned hermes_local with Hermes using Codex CLI internally as the safest BYOA-style remediation path, but only if Paperclip owns lifecycle/readback.
  - Use supported Paperclip process adapter runs for non-secret environment remediation; avoid Paperclip core patches, direct DB writes, private internals, and plaintext secrets.
  - Keep capability posture conservative because T04 did not return `resultJson.bos`.
patterns_established:
  - Use fail-closed JSON evidence artifacts for adapter readiness and runtime smoke decisions.
  - Separate environment/tool availability proof from provider execution proof.
  - Never promote runtime capability without structured result evidence (`resultJson.bos` or equivalent).
observability_surfaces:
  - Redacted Paperclip health/adapter/testEnvironment readbacks.
  - Paperclip heartbeat run IDs, log references, log hashes, exit codes, status, and resultJson/error summaries.
  - No-duplicate-wake check via heartbeat run count delta.
  - Explicit operation flags for provider execution, runtime smoke, core patch, DB mutation, private internals, and plaintext secrets.
drill_down_paths:
  - .gsd/milestones/M002/slices/S08/tasks/T01-SUMMARY.md
  - .gsd/milestones/M002/slices/S08/tasks/T02-SUMMARY.md
  - .gsd/milestones/M002/slices/S08/tasks/T03-SUMMARY.md
  - .gsd/milestones/M002/slices/S08/tasks/T05-SUMMARY.md
  - .gsd/milestones/M002/slices/S08/tasks/T04-SUMMARY.md
duration: ""
verification_result: passed
completed_at: 2026-05-29T18:12:11.024Z
blocker_discovered: false
---

# S08: Provider adapter execution remediation

**S08 selected and exercised a safe Paperclip-owned Hermes plus Codex remediation path, remediated missing Hermes CLI, and failed closed on the remaining non-interactive provider configuration blocker.**

## What Happened

S08 started by rechecking the prior Hermes and GSD-Pi blockers and comparing feasible runtime remediation paths. The selected path was Paperclip-owned `hermes_local` execution with Hermes configured for a Codex CLI backend, because it preserves Paperclip agent/run lifecycle and avoids treating local Codex execution as proof. Initial T03 readiness failed closed because the current Paperclip runtime could not find the Hermes CLI. After user-selected remediation, a supported process-adapter admin path installed `hermes-agent` into `/paperclip/hermes-runtime`, added `/paperclip/hermes-runtime/bin/hermes-paperclip`, and verified Codex host availability. Repeated readiness cleared the missing-CLI blocker but retained a generic no-API-keys warning. With fresh approval, T04 ran one bounded Paperclip-owned smoke. Paperclip created agent `5475a6a0-3668-4763-9bf8-651bbdf94f4a` and run `9f7c4b62-5970-4416-b4e5-a55b8f99fb0f`; no duplicate wake occurred. The run failed closed because Hermes itself was not configured for non-interactive provider use and therefore returned no `resultJson.bos`.

## Verification

Slice-level verification passed after the final artifact writes: `python3 -m json.tool` validated all five S08 runtime-evidence JSON files, `python3 scripts/validate_runtime_capabilities.py` printed `Paperclip runtime capabilities OK: manifest surfaces, adapter assumptions, and guardrail fields are mapped.`, and `python3 scripts/validate_m002_closeout.py --phase final` printed `M002 closeout OK: evidence, conservative matrix posture, docs, secrets, and no-core boundary guard passed.`

## Requirements Advanced

- R011 — S08 preserved stable supported boundaries while probing/remediating runtime execution; no core patches, private imports, direct DB mutation, or plaintext secrets were used.
- R009 — Runtime capability posture remains conservative and distinct from validated fixture/fallback evidence.
- R010 — No duplicate wake evidence was captured for the approved runtime smoke attempt, preserving conservative circuit-breaker/no-duplicate-run posture.

## Requirements Validated

None.

## New Requirements Surfaced

- Future requirement candidate: Hermes-local Codex backend must have a documented, non-interactive provider configuration path before capability promotion.

## Requirements Invalidated or Re-scoped

None.

## Operational Readiness

None.

## Deviations

Added T05 after T03 fail-closed on missing Hermes CLI, then executed T04 after fresh user approval once T05 cleared the CLI blocker. T04 intentionally failed closed on a new non-interactive Hermes provider configuration blocker, so S08 closes with conservative blocked evidence rather than passing runtime promotion.

## Known Limitations

T04 did not pass. Paperclip successfully created and invoked a `hermes_local` agent/run, but Hermes exited with `adapter_failed` because no non-interactive provider/API configuration was present. No structured `resultJson.bos` was produced, so runtime capability is not promoted.

## Follow-ups

A future remediation needs fresh approval to configure Hermes non-interactively through supported commands or documented config for `provider=openai-codex`; then rerun a bounded Paperclip-owned runtime smoke. Do not claim the original OpenAI/Xiaomi secret materialization issue is fixed from this slice.

## Files Created/Modified

- `runtime-evidence/M002-S08-provider-adapter-feasibility.json` — Feasibility inventory for Hermes, GSD-Pi, and Codex candidate paths.
- `runtime-evidence/M002-S08-execution-path-decision-packet.json` — Decision packet selecting Paperclip-owned hermes_local with Codex CLI backend under gated proof requirements.
- `runtime-evidence/M002-S08-adapter-registration-evidence.json` — Adapter registration and readiness-repeat evidence; first blocked on missing CLI, later updated to ready_with_warning after remediation.
- `runtime-evidence/M002-S08-hermes-cli-environment-remediation.json` — Supported Paperclip process-adapter environment remediation evidence for installing and wrapping Hermes CLI.
- `runtime-evidence/M002-S08-runtime-execution-smoke.json` — Approved T04 runtime smoke fail-closed artifact with Paperclip agent/run/readback diagnostics.
