---
estimated_steps: 1
estimated_files: 3
skills_used: []
---

# T05: Run bounded GSD-Pi adapter smoke

If environment and registration pass, create one bounded Paperclip agent/run using adapterType gsdpi_local for a harmless Div4 no-source-write quality job. Require a structured BosAdapterResult or resultJson.bos, one wake, zero approvals, no source writes, and no duplicate side effects. If prerequisites are blocked, preserve the blocker artifact and do not simulate execution success.

## Inputs

- `runtime-evidence/M002-S03-gsdpi-environment.json`
- `runtime-evidence/M002-S03-gsdpi-registration.json`

## Expected Output

- `runtime-evidence/M002-S03-gsdpi-smoke.json`

## Verification

python3 scripts/validate_s03_gsdpi_smoke.py --phase execute --evidence runtime-evidence/M002-S03-gsdpi-smoke.json --allow-blocker

## Observability Impact

Captures run ID, agent ID, BosAdapterResult/resultJson, wake/approval counts, exit status, and bounded log excerpts with redaction.
