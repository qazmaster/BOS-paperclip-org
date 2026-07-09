# S09 Research: Validation artifact reconciliation and requirement coverage repair

## Summary
- S08 is complete in milestone status (`5/5 tasks done`), but the canonical slice-level artifacts are missing from the filesystem: `S08-SUMMARY.md`, `S08-ASSESSMENT.md`, and `S08-UAT.md` are not present under `.gsd/milestones/M002/slices/S08/`.
- The task-level evidence is intact: `T01` through `T05` summaries exist, along with the five S08 runtime evidence JSON files and the S08 plan/replan/continue artifacts.
- The approved execution path is `hermes_local_with_codex_cli_backend`; `T01`’s `codex_local_builtin` selection was only a feasibility probe and should not be collapsed into the final remediation story.
- S08 runtime execution remained fail-closed: the Paperclip-owned run recorded in `runtime-evidence/M002-S08-runtime-execution-smoke.json` returned `adapter_failed`, `exitCode=1`, `wakeCountDelta=1`, and no passing `resultJson.bos`.
- Current top-level docs still read as S02-centered and do not yet localize the S08 Hermes+Codex fail-closed smoke outcome.

## Active requirements and constraints
- **R011**: preserve supported boundaries only; no Paperclip core patches, private imports, direct DB mutation, or plaintext secrets.
- **R009**: keep runtime capability posture conservative and distinct from validated fixture/fallback evidence.
- **R010**: preserve conservative no-duplicate-wake / circuit-breaker posture; S08 captured exactly one wake delta and must not be promoted into capability support.
- Do not promote any capability status from S08. The slice proves fail-closed remediation evidence, not runtime support.

## Implementation landscape
- Present: `runtime-evidence/M002-S08-provider-adapter-feasibility.json`, `runtime-evidence/M002-S08-execution-path-decision-packet.json`, `runtime-evidence/M002-S08-adapter-registration-evidence.json`, `runtime-evidence/M002-S08-hermes-cli-environment-remediation.json`, and `runtime-evidence/M002-S08-runtime-execution-smoke.json`.
- Present: `.gsd/milestones/M002/slices/S08/tasks/T01-SUMMARY.md` through `T05-SUMMARY.md`, plus `S08-PLAN.md`, `S08-REPLAN.md`, and `S08-CONTINUE.md`.
- Missing: the canonical slice artifacts `S08-SUMMARY.md`, `S08-ASSESSMENT.md`, and `S08-UAT.md`.
- Drift: `PAPERCLIP_LIVE_VALIDATION_REPORT.md` and `docs/08_RUNTIME_CAPABILITY_HEALTH.md` still mention the S02 Hermes blocker, but they do not yet localize the S08 Hermes+Codex fail-closed smoke outcome.

## Files likely to touch
- `.gsd/milestones/M002/slices/S08/S08-SUMMARY.md`
- `.gsd/milestones/M002/slices/S08/S08-ASSESSMENT.md`
- `.gsd/milestones/M002/slices/S08/S08-UAT.md`
- `PAPERCLIP_LIVE_VALIDATION_REPORT.md`
- `docs/08_RUNTIME_CAPABILITY_HEALTH.md`
- `plugin-bos-light/capabilities.paperclip-runtime.json` only if the audit finds a real drift; otherwise leave the matrix unchanged.

## Verification plan
- File presence audit for the S08 canonical artifacts.
- `python3 scripts/validate_m002_closeout.py --phase final`
- `python3 scripts/validate_runtime_capabilities.py`
- `python3 scripts/run_m002_regression_closure.py --output runtime-evidence/M002-S06-regression-closure.json` if report/matrix text changes.
- Reconcile DB/rendered artifacts by comparing milestone status (`S08 complete`) with filesystem artifacts and the updated docs.

## Notes for the planner
- Preserve the distinction between T01 feasibility (`codex_local_builtin`) and the approved path (`hermes_local_with_codex_cli_backend`).
- Keep the S08 result conservative: readiness became `ready_with_warning`, the runtime smoke failed with `adapter_failed`, and capability promotion must remain blocked.
- The canonical docs should state the blocker as a runtime/provider configuration issue, not the original CLI-missing blocker, because T05 cleared `hermes_cli_not_found`.
