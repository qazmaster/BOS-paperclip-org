# S09: Validation artifact reconciliation and requirement coverage repair — UAT

**Milestone:** M002
**Written:** 2026-05-30T03:30:30.397Z

## UAT Type
Operational artifact reconciliation and conservative validation audit; no live Paperclip runtime execution.

## Preconditions
- M002 is active.
- S08 is complete in GSD DB state.
- S09 tasks T01-T04 are complete in GSD DB state.
- Local dependencies for `plugin-bos-light` are hydrated from the existing lockfile if the regression closure runner needs them.
- No secrets, Paperclip core patches, direct DB mutations, or private Paperclip internals are introduced.

## Steps
1. Confirm canonical S08 artifacts exist and are non-empty: `.gsd/milestones/M002/slices/S08/S08-SUMMARY.md`, `S08-ASSESSMENT.md`, and `S08-UAT.md`.
2. Run `python3 scripts/validate_s09_reconciliation.py --write-audit runtime-evidence/M002-S09-reconciliation-audit.json`.
3. Run `python3 scripts/validate_m002_closeout.py --phase final`.
4. Run `python3 scripts/validate_runtime_capabilities.py`.
5. Run `python3 scripts/run_m002_regression_closure.py --output runtime-evidence/M002-S06-regression-closure.json`.
6. Run `python3 -m json.tool runtime-evidence/M002-S09-reconciliation-audit.json`.
7. Inspect the S09 audit and runtime docs for the selected path `hermes_local_with_codex_cli_backend`, `adapter_failed`, `wakeCountDelta=1`, no passing `resultJson.bos`, and no Hermes/GSD-Pi execution capability promotion.
8. Confirm `gsd_milestone_status(M002)` still reports S08 complete and S10 pending while S09 is the slice being closed.

## Expected Outcomes
- The S09 reconciliation validator exits 0 and writes a redacted audit with `result.ok=true` and no plaintext secrets or raw transcripts.
- M002 closeout, runtime-capability, regression-closure, and audit JSON validation all exit 0.
- S08 artifacts and M002 docs consistently state that the Paperclip-owned bounded smoke failed closed with `adapter_failed`, `wakeCountDelta=1`, and no passing `resultJson.bos`.
- The runtime capability matrix remains conservative: no Hermes or GSD-Pi runtime execution capability is marked confirmed from S08 evidence.
- S10 receives a clean handoff: runtime execution proof is still unresolved and must either be produced through supported Paperclip boundaries or explicitly re-scoped.

## Edge Cases
- If an S08 artifact is missing or empty, UAT fails; rebuild from existing S08 task summaries/evidence, not invented runtime facts.
- If evidence JSON is malformed or lacks fail-closed markers, UAT fails and the validator should identify the exact path.
- If docs mention only the older S02 blocker and omit the S08 Hermes/Codex fail-closed result, UAT fails as stale context.
- If any capability row promotes Hermes/GSD-Pi execution without passing supported Paperclip evidence, UAT fails as overclaiming.
- If local regression closure fails because `plugin-bos-light/node_modules` is missing, restore dependencies from the checked-in lockfile and rerun; do not weaken validators or change package metadata as part of S09.
