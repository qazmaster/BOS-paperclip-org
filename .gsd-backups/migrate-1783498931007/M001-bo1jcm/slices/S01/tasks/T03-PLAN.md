---
estimated_steps: 1
estimated_files: 3
skills_used: []
---

# T03: Capture A1 validation evidence

Add A1 evidence documentation for the local import-readiness proof. The evidence should name the exact validation command, list validated assets, document what this proves, and explicitly state the remaining live Paperclip import/export unknown that S02 must retire. Done when the evidence file exists, is non-empty, and the handoff validator plus company template validator both pass.

## Inputs

- `scripts/validate_company_template.py`
- `scripts/validate_handoff.py`
- `company-template/import-notes.md`
- `docs/06_ACCEPTANCE_TESTS.md`

## Expected Output

- `company-template/a1-validation-evidence.md`

## Verification

python3 scripts/validate_handoff.py

## Observability Impact

Provides a durable human-readable evidence artifact for future agents to inspect before S02 runtime validation.
