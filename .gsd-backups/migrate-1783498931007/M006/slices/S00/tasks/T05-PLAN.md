---
estimated_steps: 1
estimated_files: 2
skills_used: []
---

# T05: Regression closure and acceptance gates

Run the two mandatory M006 regression acceptance tests to ensure S00 work does not break existing A12-A20 handoff or plugin unit tests. Steps: (1) run python3 scripts/validate_handoff.py to verify M6-R01 (A12-A20 handoff remains valid), (2) run npm --prefix plugin-bos-light test to verify M6-R02 (plugin unit tests still pass, 121 tests expected). If either fails, record failure in slice notes and block slice completion until resolved.

## Inputs

- `scripts/validate_handoff.py`
- `plugin-bos-light/package.json`

## Expected Output

- Update the implementation and proof artifacts needed for this task.

## Verification

python3 scripts/validate_handoff.py
