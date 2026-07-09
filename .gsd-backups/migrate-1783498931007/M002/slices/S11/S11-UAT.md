# S11: Validation artifact repair — UAT

**Milestone:** M002
**Written:** 2026-05-30T06:08:29.275Z

## UAT Type

Artifact-gate / closeout-consumer acceptance test. This UAT is local and deterministic; it does not require live Paperclip runtime access.

## Preconditions

- Work from the M002 worktree root.
- S09 and S10 are complete in the GSD milestone state.
- The canonical artifacts exist: `M002-CONTEXT.md`, `M002-ASSESSMENT.md`, `S09-ASSESSMENT.md`, and `S10-ASSESSMENT.md`.
- No secrets are needed and no live Paperclip mutation is permitted.

## Steps

1. Run `python3 scripts/validate_m002_validation_artifacts.py --root . --write-audit runtime-evidence/M002-S11-validation-artifact-repair.json`.
2. Open the generated audit and confirm it reports `passed=true`, seven checked paths, `diagnostics.error_count=0`, and no shell/network/database access.
3. Run `python3 scripts/run_m002_regression_closure.py --output runtime-evidence/M002-S06-regression-closure.json`.
4. Open the regression closure artifact and confirm `overall_verdict=pass` and command id `s11-validation-artifact-repair-validator` appears after `s10-runtime-execution-final-validator` and before `m002-closeout-validator`.
5. Read the milestone assessment posture and confirm it treats S01 as historical baseline evidence, uses S09/S10 as current closeout sources, and does not claim Hermes `resultJson.bos` or GSD-Pi `BosAdapterResult` runtime proof.

## Expected Outcomes

- The standalone S11 validator exits 0 and writes a passing audit.
- Regression closure exits 0 and includes a passing S11 command entry before final closeout.
- The artifacts preserve R009/R010/R011 by treating failed/auth-denied runtime evidence as non-proof and keeping runtime capability promotion proof-gated.
- R012-R015 remain out of scope for this M002 artifact repair slice and are not reinterpreted.
- No plaintext secret values, direct DB mutation, private/internal imports, Paperclip core patches, or unsupported capability promotions are introduced.

## Edge Cases

- If any required assessment file is missing or empty, the standalone validator must fail nonzero.
- If text claims failed/auth-denied Hermes or GSD-Pi evidence is runtime proof, the validator must fail nonzero.
- If secret-looking content appears in diagnostics or checked artifacts, the validator must fail closed without echoing secret values.
- If the regression closure runner omits S11 or orders it after final closeout, unit tests must fail.
- If S10 final proof remains fail-closed rather than passing runtime proof, S11 must still pass only as an artifact-completeness/proof-gating gate, not as runtime capability proof.
