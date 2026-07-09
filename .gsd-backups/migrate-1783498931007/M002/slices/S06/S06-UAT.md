# S06: Capability report and regression closure — UAT

**Milestone:** M002
**Written:** 2026-05-29T12:35:30.444Z

# S06 UAT: Capability report and regression closure

**UAT Type:** Repository-local validation / operational closeout review. Human live Paperclip interaction is not required for this slice; live runtime claims are accepted only from previously captured S04/S05 evidence.

## Preconditions

- Worktree is the M002 repository worktree.
- Prior slices S04 and S05 have produced their canonical evidence artifacts under `runtime-evidence/`.
- No fresh Paperclip credentials or live mutation are required.

## Steps

1. Run `python3 scripts/validate_m002_closeout.py --phase final`.
2. Run `python3 scripts/validate_runtime_capabilities.py`.
3. Run `python3 scripts/run_m002_regression_closure.py --output runtime-evidence/M002-S06-regression-closure.json`.
4. Open `runtime-evidence/M002-S06-regression-closure.json` and confirm `overall_verdict` is `pass` and all command entries have `exit_code: 0`, `verdict: pass`, and `timed_out: false`.
5. Review `PAPERCLIP_LIVE_VALIDATION_REPORT.md` and `docs/08_RUNTIME_CAPABILITY_HEALTH.md` for: S04-only native issue/document/comment confirmation, S02 Hermes execution-time secret-materialization blocker, remaining gap ledger, and no-core-modification audit.
6. Review `plugin-bos-light/capabilities.paperclip-runtime.json` for conservative capability counts and no promotion of S05 plugin/UI surfaces.

## Expected Outcomes

- Closeout validator prints `M002 closeout OK: evidence, conservative matrix posture, docs, secrets, and no-core boundary guard passed.`
- Runtime capability validator prints `Paperclip runtime capabilities OK: manifest surfaces, adapter assumptions, and guardrail fields are mapped.`
- Regression closure runner writes the canonical S06 JSON artifact with six passing commands.
- Reports do not expose secrets and do not claim support beyond the S04-backed native issue/document/comment surfaces.
- R011 is satisfied by an explicit no-core/private/direct-DB/monkey-patch/native-approval side-effect audit.

## Edge Cases

- If a future edit promotes Hermes, GSD-Pi, approvals, plugin/piko/data/action/widget/issue-tab, state/config/entity/activity/event, or import/export support without independent proof, the closeout validator should fail.
- If a secret-shaped token is introduced into report or evidence text, the validator should report it without echoing the value.
- If the regression runner output path escapes the repository or its parent directory is missing, the runner should fail closed.
- If npm dependencies or Python tests are unavailable, the aggregate artifact should record the failed command rather than allowing closeout.
