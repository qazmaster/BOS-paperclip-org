---
estimated_steps: 1
estimated_files: 2
skills_used: []
---

# T04: Regression gates

Run M6-R01 handoff validation to ensure all required files are present and structurally valid. Run M6-R02 plugin unit tests to ensure no test regressions from S01 work. These gates ensure S01 probe/validator additions do not break existing validated surfaces.

## Inputs

- `scripts/validate_handoff.py`
- `plugin-bos-light/package.json`

## Expected Output

- Update the implementation and proof artifacts needed for this task.

## Verification

python3 scripts/validate_handoff.py && npm --prefix plugin-bos-light test
