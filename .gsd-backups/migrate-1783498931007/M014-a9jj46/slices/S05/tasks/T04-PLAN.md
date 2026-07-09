---
estimated_steps: 1
estimated_files: 2
skills_used: []
---

# T04: Reconcile capability posture after E2E gate

If the E2E gate passes, update capability posture only for surfaces directly proven by the evidence. If it fails, preserve blocker posture and document downstream remediation. Run the S05 validator and any capability matrix validator before closing.

## Inputs

- `runtime-evidence/M014-S05-bounded-e2e-evidence.json`

## Expected Output

- `runtime-evidence/M014-S05-capability-reconciliation.json`
- `runtime-evidence/M014-S05-capability-reconciliation.md`

## Verification

node --test scripts/validate_m014_s05_bounded_e2e.js

## Observability Impact

Makes capability promotions or preserved blockers auditable and prevents hidden overclaiming.
