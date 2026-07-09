# M002 — S06 Research

## Summary

S06 is a closeout slice, not a new runtime integration slice. The repository already has the canonical evidence split: S04 confirms only bounded native issue/document/comment surfaces, S05 remains fail-closed for plugin/UI surfaces, and the runtime capability matrix currently has 20 entries with 3 confirmed, 10 fallback-only, and 7 unvalidated. The main recommendation is to keep the capability matrix and reader-facing reports conservative, and only change them when fresh live evidence exists; do not promote any surface from local manifest intent or S04 proof alone.

Current regression validation is healthy. `python3 scripts/validate_runtime_capabilities.py` and `python3 -m unittest scripts/test_validate_runtime_capabilities.py` pass, which means S06 is mostly about report drift control and evidence hygiene rather than discovering a new runtime path. The validator enforces both the JSON matrix and the health-report wording/structure, so any prose or matrix edits must stay aligned or the closeout gate will fail.

## Recommendation

Freeze capability promotion rules around the canonical evidence files. The closeout should center on `plugin-bos-light/capabilities.paperclip-runtime.json`, `docs/08_RUNTIME_CAPABILITY_HEALTH.md`, and `PAPERCLIP_LIVE_VALIDATION_REPORT.md`, with S04 and S05 JSON evidence as immutable proof inputs. Only promote surfaces when the evidence includes runtime version/build plus surface-specific live readback; otherwise keep entries `unvalidated` or `fallback-only`. This preserves R011, avoids accidental core-coupled claims, and keeps the report honest when live auth or host surfaces are absent.

## Implementation Landscape

### Key Files

- `plugin-bos-light/capabilities.paperclip-runtime.json` — machine-readable source of truth; holds the 20 capability rows, statuses, proof commands, fallback paths, blocker text, and evidence references.
- `plugin-bos-light/src/runtimeCapabilities.ts` — TypeScript mirror of the matrix key/status vocabulary; the validator checks that it stays aligned with the JSON contract.
- `scripts/validate_runtime_capabilities.py` — main closure gate; validates matrix shape, manifest coverage, source-contract wording, forbidden claims, S04/S05 canonical evidence paths, and required health-report headings/phrases.
- `scripts/test_validate_runtime_capabilities.py` — fixture regression coverage for overclaim prevention, canonical evidence rules, and report/matrix contract drift.
- `docs/08_RUNTIME_CAPABILITY_HEALTH.md` — operator-facing status report; must preserve the validator-required headings and conservative wording.
- `PAPERCLIP_LIVE_VALIDATION_REPORT.md` — narrative evidence ledger; should only mirror confirmed S04 surfaces and fallback-only/unvalidated S05 surfaces.
- `runtime-evidence/M002-S04-live-artifact-flow.json` and `runtime-evidence/M002-S05-plugin-ui-surface-probe.json` — canonical live evidence files the reports and validators key off.
- `scripts/validate_s04_live_artifact_flow.py` / `scripts/validate_s05_plugin_ui_surface_probe.py` — keep these as separate regression gates if the evidence artifacts or their references change.

### Build Order

1. Re-check the matrix/report contract first; the validator already encodes the no-overclaim rules.
2. Re-run closure regressions after any matrix or doc edits.
3. Update the narrative report last so the prose matches the validated matrix and evidence files.
4. Only then mark the slice closed.

### Verification Approach

- `python3 scripts/validate_runtime_capabilities.py`
- `python3 -m unittest scripts/test_validate_runtime_capabilities.py`
- If S04/S05 evidence files or their references change: rerun `python3 scripts/validate_s04_live_artifact_flow.py --evidence runtime-evidence/M002-S04-live-artifact-flow.json --phase final` and `python3 scripts/validate_s05_plugin_ui_surface_probe.py --evidence runtime-evidence/M002-S05-plugin-ui-surface-probe.json --phase final`
- If TypeScript boundary files are touched, run plugin typecheck as the final guard.

## Constraints

- R011 stays active: no core patches, direct DB writes, private imports, or native approval side effects.
- `confirmed` statuses require runtime version/build plus surface-specific live readback; local manifest intent is never proof.
- S05 plugin/UI surfaces remain fallback-only until S05-style live proof exists.
- S04 native issue/document/comment evidence must not be reused to promote unrelated plugin/UI or approval surfaces.
- `docs/08_RUNTIME_CAPABILITY_HEALTH.md` is validator-checked, so required headings and phrases must be preserved if the report is edited.

## Common Pitfalls

- Using local manifest or optional chaining as proof of host support.
- Promoting S04 native artifact proof into plugin/UI capability claims.
- Letting the report drift away from the matrix or the validator's required headings/phrases.
- Forgetting that `native_support_confirmed` must remain false in fixture-first workflows unless separate live proof exists.

## Open Risks

- Company template import/export and AGENTS.md syntax are still unvalidated.
- Hermes execution still has the secret-materialization blocker; GSD-Pi registration/execution remains unproven.
- No live plugin load, piko tool invocation, data-provider hydration, dashboard widget render, issue tab render, or native approval proof exists yet.

## Skills Discovered

| Domain | Skill | Note |
|---|---|---|
| Docs/report consolidation | write-docs | Installed; suitable if the slice needs to polish the validation report or add a handoff note. |
| Change review | review | Installed; useful for checking the final matrix/report diff before closeout. |
| Validation/telemetry framing | observability | Installed; useful if closeout adds persistent blocker or audit signals. |

## Sources

- `plugin-bos-light/capabilities.paperclip-runtime.json`
- `plugin-bos-light/src/runtimeCapabilities.ts`
- `scripts/validate_runtime_capabilities.py`
- `scripts/test_validate_runtime_capabilities.py`
- `docs/08_RUNTIME_CAPABILITY_HEALTH.md`
- `PAPERCLIP_LIVE_VALIDATION_REPORT.md`
- `runtime-evidence/M002-S04-live-artifact-flow.json`
- `runtime-evidence/M002-S05-plugin-ui-surface-probe.json`
