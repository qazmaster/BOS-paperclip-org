# S05: Bounded BOS Light E2E Gate

**Goal:** Define and execute the first bounded BOS-shaped E2E gate only after runtime truth, forensics, hardening, and persistence proof have passed.
**Demo:** After this: one minimal BOS Light workflow either produces schema-valid resultJson.bos plus native Paperclip readback, or records a fail-closed E2E blocker without overclaiming capability.

## Must-Haves

- User explicitly confirms the bounded E2E target and allowed mutation.
- Workflow respects BOS Light v1.4.1 plus R026 routing boundaries.
- Evidence includes terminal run status, schema-valid resultJson.bos, native Paperclip artifact readback, and side-effect accounting.
- No Hermes, GSD-Pi, plugin, piko, import/export, or E2E capability is promoted unless matching proof exists.
- If execution fails, blocker codes identify the failing runtime boundary.

## Proof Level

- This slice proves: Final assembly proof through bounded live workflow evidence or fail-closed blocker.

## Integration Closure

Consumes S01-S04 proof gates and produces downstream readiness evidence.

## Verification

- Adds explicit E2E status, result schema, native readback, side-effect, and blocker diagnostics.

## Tasks

- [ ] **T01: Define bounded E2E scenario and result schema** `est:1h`
  Define the smallest BOS Light workflow that can prove value without broad mutation after S01-S04 pass. The scenario must name expected v1.4.1 plus R026 routing, allowed Paperclip native artifacts, expected resultJson.bos schema, side-effect budget, and explicit confirmation wording. Do not execute live runtime in this task.
  - Files: `runtime-evidence/M014-S05-bounded-e2e-contract.json`, `runtime-evidence/M014-S05-bounded-e2e-contract.md`
  - Verify: test -s runtime-evidence/M014-S05-bounded-e2e-contract.json

- [ ] **T02: Implement E2E evidence validator** `est:1h`
  Create a validator that accepts either passing E2E evidence or a fail-closed blocker. Passing evidence must include terminal status, resultJson.bos schema validity, native Paperclip artifact readback, side-effect accounting, and capability-promotion justification. The validator must reject stdout-only Hermes evidence.
  - Files: `scripts/validate_m014_s05_bounded_e2e.js`
  - Verify: node --test scripts/validate_m014_s05_bounded_e2e.js

- [ ] **T03: Execute confirmed bounded E2E gate or blocker** `est:1.5h`
  Only after S01-S04 pass and the user explicitly confirms the bounded target, run the minimal E2E gate through hardened preflight. Record terminal status, resultJson.bos, native readback, side effects, and blocker codes. If any prerequisite is missing, write a fail-closed blocker instead of mutating.
  - Files: `runtime-evidence/M014-S05-bounded-e2e-evidence.json`, `runtime-evidence/M014-S05-bounded-e2e-evidence.md`
  - Verify: test -s runtime-evidence/M014-S05-bounded-e2e-evidence.json

- [ ] **T04: Reconcile capability posture after E2E gate** `est:1h`
  If the E2E gate passes, update capability posture only for surfaces directly proven by the evidence. If it fails, preserve blocker posture and document downstream remediation. Run the S05 validator and any capability matrix validator before closing.
  - Files: `runtime-evidence/M014-S05-capability-reconciliation.json`, `runtime-evidence/M014-S05-capability-reconciliation.md`
  - Verify: node --test scripts/validate_m014_s05_bounded_e2e.js

## Files Likely Touched

- runtime-evidence/M014-S05-bounded-e2e-contract.json
- runtime-evidence/M014-S05-bounded-e2e-contract.md
- scripts/validate_m014_s05_bounded_e2e.js
- runtime-evidence/M014-S05-bounded-e2e-evidence.json
- runtime-evidence/M014-S05-bounded-e2e-evidence.md
- runtime-evidence/M014-S05-capability-reconciliation.json
- runtime-evidence/M014-S05-capability-reconciliation.md
