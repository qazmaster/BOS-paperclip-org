---
estimated_steps: 5
estimated_files: 3
skills_used: []
---

# T02: Add fail closed coverage validator

Expected task-plan frontmatter: estimated_steps: 9; estimated_files: 2; skills_used: [tdd, error-handling-patterns, verify-before-complete].

Why: The coverage ledger must be machine-checkable so future edits cannot silently drop a requirement, broaden scope, rewrite ownership provenance, leak secrets, or promote unproven Paperclip capabilities.

Do: Add `scripts/validate_m004_requirement_coverage.py` as a standard-library-only validator modeled on `scripts/validate_s13_requirement_coverage.py`, but scoped to M004 S06 and R012-R016. It should accept `--root`, `--ledger`, `--phase` with at least `ledger` and `final`, and `--write-audit`. It must load JSON with duplicate-key rejection, validate schema metadata, require exactly the five requirement ids, require validated and covered status, require bounded non-empty coverage summaries and citations, require citation validation classes covering Contract, Integration, Operational, and UAT where applicable, require R015 to remain M004-originated while inherited requirements keep explicit owner provenance, require safety flags for no capability promotions, and redact or fail on secret-like values. Add `scripts/test_validate_m004_requirement_coverage.py` with unittest fixtures that use temporary roots only and do not read real `.gsd` paths. Include positive ledger and final phase tests plus negative tests for missing R016, extra R999, wrong status, missing coverage, R015 owner drift, inherited owner normalization, missing validation class, capability promotion, secret-like diagnostics, malformed JSON, and duplicate requirement ids.

Done when: the unittest suite passes and the validator passes on the T01 ledger in ledger phase.

Failure Modes Q5: malformed ledger JSON fails closed with concise diagnostics; missing or unreadable ledger returns non-zero; malformed citations fail with requirement id, validation class, artifact path, and problem kind; no exception tracebacks should be required for ordinary user errors. Load Profile Q6: local file reads only; per-operation cost is O(number of requirements plus citation count). Negative Tests Q7: include malformed inputs, missing keys, duplicate ids, extra ids, bad booleans, and secret-like strings.

## Inputs

- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M004-osbua3/runtime-evidence/M004-S06-requirement-coverage.json`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M004-osbua3/scripts/validate_s13_requirement_coverage.py`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M004-osbua3/scripts/test_validate_s13_requirement_coverage.py`

## Expected Output

- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M004-osbua3/scripts/validate_m004_requirement_coverage.py`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M004-osbua3/scripts/test_validate_m004_requirement_coverage.py`

## Verification

python3 -m unittest scripts/test_validate_m004_requirement_coverage.py && python3 scripts/validate_m004_requirement_coverage.py --phase ledger

## Observability Impact

Adds the main diagnostic surface for coverage drift, including structured failure categories and redaction checks.
