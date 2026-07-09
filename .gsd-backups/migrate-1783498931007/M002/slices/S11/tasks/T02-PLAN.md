---
estimated_steps: 35
estimated_files: 1
skills_used: []
---

# T02: Add validation artifact completeness check

---
estimated_steps: 7
estimated_files: 3
skills_used:
  - write-docs
  - verify-before-complete
---
Why: The repaired artifacts need an executable gate so validation cannot silently regress back to missing S09 or S10 assessments, stale S01 interpretation, or accidental runtime-promotion language.

Inputs to read:
- `.gsd/milestones/M002/M002-CONTEXT.md`
- `.gsd/milestones/M002/M002-ASSESSMENT.md`
- `.gsd/milestones/M002/slices/S09/S09-ASSESSMENT.md`
- `.gsd/milestones/M002/slices/S10/S10-ASSESSMENT.md`
- `runtime-evidence/M002-S10-requirement-scope-resolution.json`
- `runtime-evidence/M002-S10-runtime-execution-closeout.json`
- `plugin-bos-light/capabilities.paperclip-runtime.json`
- `scripts/validate_s10_runtime_execution.py`
- `scripts/test_validate_s10_runtime_execution.py`

Do:
1. Add `scripts/validate_m002_validation_artifacts.py` as a standard-library-only validator with shell disabled and no network access. It should accept `--root .` and optional `--write-audit runtime-evidence/M002-S11-validation-artifact-repair.json`.
2. Validate that `.gsd/milestones/M002/M002-CONTEXT.md`, `.gsd/milestones/M002/M002-ASSESSMENT.md`, `.gsd/milestones/M002/slices/S09/S09-ASSESSMENT.md`, and `.gsd/milestones/M002/slices/S10/S10-ASSESSMENT.md` exist and are non-empty.
3. Validate required posture signals in the docs: S01 is historical or superseded for closeout, S09/S10 are current closeout sources, Hermes and GSD-Pi execution remain fail-closed or unpromoted, fail-closed blocker evidence is not runtime proof, and R009/R010/R011 are preserved.
4. Validate machine evidence alignment by reading `runtime-evidence/M002-S10-requirement-scope-resolution.json`, `runtime-evidence/M002-S10-runtime-execution-closeout.json`, and `plugin-bos-light/capabilities.paperclip-runtime.json` enough to reject runtime capability promotions without passing S10 proof. Keep diagnostics concise and redacted.
5. Add `scripts/test_validate_m002_validation_artifacts.py` using temporary fixture directories for unit coverage. Cover success, missing artifact, empty artifact, absent S01 supersession, runtime proof overclaim, missing S10 audit pass state, non-empty capability promotions, and secret-looking content rejection.
6. When `--write-audit` is provided, write a JSON artifact with schema/version, pass boolean, checked paths, diagnostics, and no secret values.

Expected outputs:
- `scripts/validate_m002_validation_artifacts.py`
- `scripts/test_validate_m002_validation_artifacts.py`
- `runtime-evidence/M002-S11-validation-artifact-repair.json`

Done when: unit tests pass and the validator writes a passing S11 audit against the real worktree artifacts.

Requirement Impact Q4: Supports R009 through R011 by converting documentation posture into executable checks. No requirement rescope is allowed in this task.

Threat Surface Q3: The validator reads local docs and JSON only. Main abuse risk is leaking secrets in diagnostics or accepting overclaiming text; redact secret-looking values and fail closed on suspicious content.

Failure Modes Q5: Missing files, malformed JSON, empty docs, or unsupported capability promotions must produce nonzero exit and explicit diagnostics. Malformed audit output should fail rather than silently pass.

Load Profile Q6: Per run cost is small local file reads. At 10x more artifacts the validator remains filesystem-bound and should keep diagnostics bounded.

Negative Tests Q7: Include fixture tests for missing files, empty docs, malformed JSON, plaintext secret patterns, S01 not marked historical, and Hermes/GSD-Pi promoted without passing S10 proof.

## Inputs

- None specified.

## Expected Output

- Update the implementation and proof artifacts needed for this task.

## Verification

python3 -m unittest scripts/test_validate_m002_validation_artifacts.py && python3 scripts/validate_m002_validation_artifacts.py --root . --write-audit runtime-evidence/M002-S11-validation-artifact-repair.json

## Observability Impact

Adds a machine-readable S11 audit artifact with checked paths and diagnostics so future agents can localize missing or contradictory validation artifacts quickly.
