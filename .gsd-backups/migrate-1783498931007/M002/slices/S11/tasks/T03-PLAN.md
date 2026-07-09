---
estimated_steps: 32
estimated_files: 1
skills_used: []
---

# T03: Wire S11 artifact gate into closeout

---
estimated_steps: 6
estimated_files: 5
skills_used:
  - verify-before-complete
---
Why: A standalone validator is not enough for milestone closeout. M002 regression closure must run the S11 artifact gate so downstream validation and future closeout runs cannot skip repaired artifacts.

Inputs to read:
- `scripts/run_m002_regression_closure.py`
- `scripts/test_run_m002_regression_closure.py`
- `scripts/validate_m002_validation_artifacts.py`
- `scripts/test_validate_m002_validation_artifacts.py`
- `runtime-evidence/M002-S10-runtime-execution-closeout.json`
- `runtime-evidence/M002-S11-validation-artifact-repair.json`

Do:
1. Update `scripts/run_m002_regression_closure.py` so `build_command_plan()` includes a deterministic S11 command after the S10 runtime execution final validator and before the M002 closeout validator. The command should run `scripts/validate_m002_validation_artifacts.py --root . --write-audit runtime-evidence/M002-S11-validation-artifact-repair.json` using the selected Python executable.
2. Update `scripts/test_run_m002_regression_closure.py` to assert the S11 command id, ordering, command array shape, and audit path are present.
3. If the closure runner test fixture enumerates unittest files, include `scripts/test_validate_m002_validation_artifacts.py` in the regression unittest command plan.
4. Run the closure runner to refresh `runtime-evidence/M002-S06-regression-closure.json`; expect it to also refresh the S10 and S11 audit artifacts.
5. Confirm the refreshed closure artifact reports an overall pass and includes the S11 artifact gate command without changing any runtime capability posture.

Expected outputs:
- `scripts/run_m002_regression_closure.py`
- `scripts/test_run_m002_regression_closure.py`
- `runtime-evidence/M002-S06-regression-closure.json`
- `runtime-evidence/M002-S10-runtime-execution-closeout.json`
- `runtime-evidence/M002-S11-validation-artifact-repair.json`

Done when: the full M002 regression closure passes with S11 included, and the closure evidence records both S10 and S11 gates as pass.

Requirement Impact Q4: Supports R009, R010, and R011 by making the artifact repair gate part of the repeatable closeout path. Does not revisit D008 through D011 or promote any runtime capability.

Threat Surface Q3: No external runtime surface is added. Continue to redact command digests through the existing closure runner secret hygiene.

Failure Modes Q5: If the S11 validator fails, the regression closure must fail with that command id and preserve redacted diagnostics. If the S11 audit cannot be written, the command must fail rather than report pass.

Load Profile Q6: Adds one small local validation command to the closeout runner. At 10x document size, the bottleneck remains local file IO and bounded digest collection.

Negative Tests Q7: Regression closure tests should fail if the S11 command is omitted, ordered after the final closeout validator, uses a shell string instead of a command array, or omits the write-audit path.

## Inputs

- None specified.

## Expected Output

- Update the implementation and proof artifacts needed for this task.

## Verification

python3 -m unittest scripts/test_validate_m002_validation_artifacts.py scripts/test_run_m002_regression_closure.py && python3 scripts/run_m002_regression_closure.py --output runtime-evidence/M002-S06-regression-closure.json

## Observability Impact

Extends the existing regression closure evidence so missing validation artifacts are visible as a named command failure in `runtime-evidence/M002-S06-regression-closure.json`.
