---
estimated_steps: 9
estimated_files: 5
skills_used: []
---

# T02: Sync M002 coverage docs and closure gate

Why: Once the ledger exists, closeout-facing M002 docs and the aggregate closure runner must consume it so validators see coherent active requirement coverage for R012 through R015. This task must not rewrite prior runtime evidence or promote Hermes or GSD-Pi capability.

Expected task-plan frontmatter: estimated_steps: 7; estimated_files: 5; skills_used: [write-docs, verify-before-complete].

Do: Update .gsd/milestones/M002/M002-CONTEXT.md and .gsd/milestones/M002/M002-ASSESSMENT.md with a concise S13 requirement coverage reconciliation section. The section must explicitly say R012 through R015 are active requirements owned by M004-osbua3, M002 does not alter or satisfy the v1.4.1 org-boundary contract, S13 provides coverage traceability only, and S12 remains approved_rescope with no capability promotions. Add .gsd/milestones/M002/slices/S13/S13-ASSESSMENT.md summarizing the accepted ledger, evidence citations, validation classes, do-not-claim guidance, and remaining M004-owned validation responsibility. Wire scripts/run_m002_regression_closure.py to run scripts/validate_s13_requirement_coverage.py in final phase after the existing S12 validation gate and before M002 closeout. Update scripts/test_run_m002_regression_closure.py to assert command ordering, shell-disabled command arrays, output artifact path, and inclusion of the new S13 gate.

Threat Surface Q3: Documentation could accidentally broaden scope or expose unsupported runtime claims. Keep the wording proof-gated and no-promotion, and do not include secrets, tokens, or raw operator credentials.

Requirement Impact Q4: re-verifies R012, R013, R014, and R015 coverage notes while preserving R009, R010, R011 and decisions D008, D009, D010, and D011.

Failure Modes Q5: If final validation fails because docs are incomplete, fix docs rather than weakening the validator. If aggregate closure ordering fails, adjust command metadata and tests rather than bypassing S12 or M002 closeout. If prior artifacts conflict, cite the conflict and fail closed.

Load Profile Q6: closure runner adds one local Python process with small JSON and Markdown reads; no runtime load or network calls.

Negative Tests Q7: add runner tests for missing S13 gate, S13 before S12, S13 after closeout, shell=True, string commands, and missing audit output path.

Done when: the final S13 validator passes against synced docs and the aggregate runner tests prove the new gate order and shell-disabled execution.

## Inputs

- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/runtime-evidence/M002-S13-requirement-coverage.json`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/scripts/validate_s13_requirement_coverage.py`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/.gsd/milestones/M002/M002-CONTEXT.md`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/.gsd/milestones/M002/M002-ASSESSMENT.md`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/scripts/run_m002_regression_closure.py`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/scripts/test_run_m002_regression_closure.py`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/runtime-evidence/M002-S12-runtime-proof-or-rescope.json`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/runtime-evidence/M002-S12-validation-closeout.json`

## Expected Output

- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/.gsd/milestones/M002/M002-CONTEXT.md`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/.gsd/milestones/M002/M002-ASSESSMENT.md`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/.gsd/milestones/M002/slices/S13/S13-ASSESSMENT.md`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/scripts/run_m002_regression_closure.py`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/scripts/test_run_m002_regression_closure.py`

## Verification

python3 -m unittest scripts/test_run_m002_regression_closure.py && python3 scripts/validate_s13_requirement_coverage.py --phase final --ledger runtime-evidence/M002-S13-requirement-coverage.json

## Observability Impact

Makes S13 coverage visible in M002 closeout docs and aggregate closure command metadata. Ordering and shell-disabled execution become test-enforced diagnostics.
