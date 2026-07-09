---
estimated_steps: 1
estimated_files: 10
skills_used: []
---

# T02: Align template assets to validation contract

Run the new validator against the existing template and fix the template or profile references only where the validator exposes concrete gaps. Keep the template draft-status honest in import-notes.md, but make the local BOS Light contract internally consistent for seven divisions, routing rules, rituals, and referenced AGENTS.md files. Done when the validator passes without weakening the source-of-truth or draft-runtime caveats.

## Inputs

- `scripts/validate_company_template.py`
- `company-template/bos-company-template.json`
- `company-template/import-notes.md`
- `agents/README.md`

## Expected Output

- `company-template/bos-company-template.json`
- `company-template/import-notes.md`
- `agents/README.md`

## Verification

python3 scripts/validate_company_template.py

## Observability Impact

Keeps diagnostics actionable by preserving explicit draft-runtime caveats and local validation guidance.
