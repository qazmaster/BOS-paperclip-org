# S04: Final Reconciliation and Requirement Outcomes

**Goal:** Close M012 by validating evidence, updating requirement status or notes truthfully, and producing the downstream gate for unresolved runtime surfaces.
**Demo:** After this: M012 has a final reconciled evidence package, requirement outcome notes, and a next milestone gate that names what is proven, partial, blocked, and still unsafe to promote.

## Must-Haves

- S01 through S03 evidence validators pass.
- Requirement outcomes for R003, R008, R018, R022, R023, R024, and R025 are updated or explicitly left active with proof rationale.
- R017, R019, unsupported document or comment APIs, plugin host, GSD-Pi, Hermes, and live GitHub remain blocked or active unless fresh independent proof exists.
- Final human-readable summary names exact evidence paths and next blockers.
- Full relevant regression verification passes.

## Proof Level

- This slice proves: Final assembly evidence reconciliation.

## Integration Closure

Consumes all M012 evidence at execution time and closes the milestone proof contract; produces downstream M013 gate if further runtime promotion is needed.

## Verification

- Adds final reconciliation artifact with requirement coverage, capability status deltas, blocker inventory, and verification command evidence.

## Tasks

- [x] **T01: Generate Final Reconciliation Artifact** `est:1h`
  Create a final M012 reconciliation generator and validator. The artifact must aggregate S01 through S03 evidence, identify what was proven live, what was proven locally, what remained blocked, and which capability rows must not be promoted. It must fail validation if plugin host, piko tools, Hermes, GSD-Pi, GitHub, Telegram, unsupported comments, or unsupported documents are promoted without fresh independent proof.
  - Files: `scripts/generate_m012_s04_final_reconciliation.js`, `scripts/validate_m012_s04_final_reconciliation.js`, `runtime-evidence/M012-S04-final-reconciliation.json`, `runtime-evidence/M012-S04-final-reconciliation.md`
  - Verify: node scripts/validate_m012_s04_final_reconciliation.js

- [x] **T02: Update Requirement Outcomes Truthfully** `est:45m`
  Use GSD requirement update tooling to update notes, validation, or status for requirements touched by M012. Mark requirements validated only when M012 evidence satisfies the actual requirement wording; otherwise leave active and add precise notes. R017 and R019 should remain active or blocked unless plugin runtime and Hermes execution receive fresh proof, which is outside M012 scope.
  - Files: `.gsd/REQUIREMENTS.md`, `runtime-evidence/M012-S04-requirement-outcomes.md`
  - Verify: test -s runtime-evidence/M012-S04-requirement-outcomes.md

- [x] **T03: Run Final Regression and Closeout Gate** `est:1h`
  Run all M012 evidence validators plus the relevant plugin-bos-light regression suite and typecheck. Write a closeout gate artifact containing commands, exit codes, evidence paths, known limitations, and downstream recommendations. Do not mark the slice or milestone complete unless verification output is fresh and passing.
  - Files: `scripts/validate_m012_closeout.js`, `runtime-evidence/M012-S04-closeout-gate.json`, `runtime-evidence/M012-S04-closeout-gate.md`
  - Verify: node scripts/validate_m012_closeout.js

## Files Likely Touched

- scripts/generate_m012_s04_final_reconciliation.js
- scripts/validate_m012_s04_final_reconciliation.js
- runtime-evidence/M012-S04-final-reconciliation.json
- runtime-evidence/M012-S04-final-reconciliation.md
- .gsd/REQUIREMENTS.md
- runtime-evidence/M012-S04-requirement-outcomes.md
- scripts/validate_m012_closeout.js
- runtime-evidence/M012-S04-closeout-gate.json
- runtime-evidence/M012-S04-closeout-gate.md
