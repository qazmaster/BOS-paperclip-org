---
estimated_steps: 14
estimated_files: 3
skills_used: []
---

# T01: Create S13 requirement coverage ledger and validator

Why: S13 needs an authoritative local coverage record for active requirements R012 through R015 before documentation or closeout checks are changed. The worktree does not currently contain .gsd/REQUIREMENTS.md, so the executor must seed the ledger from the canonical GSD requirement text embedded in this task plan and then validate it against existing M002 evidence.

Expected task-plan frontmatter: estimated_steps: 8; estimated_files: 3; skills_used: [tdd, verify-before-complete].

Canonical requirement text to preserve exactly in the ledger:
- R012 active constraint: The canonical v1.4.1 division map must be the active company and org contract; legacy v1.3 division names may appear only in historical/deprecated context. Primary owning slice: M004-osbua3. Validation: active company template, AGENTS profiles, validators, and plugin contracts all use v1.4.1 division ids; deprecated ids remain only in historical notes or deprecated sections.
- R013 active compliance/security: Only Div6.External may interact with the external world; internal divisions must not receive raw web, API, customer, or vendor tools. Primary owning slice: M004-osbua3. Validation: tool permission matrix blocks external IO for Div1, Div2, Div3, Div4, Div5, and Div7; external requests route via Div1 and execute by Div6.
- R014 active compliance/security: Div5.QualificationsLibraryLearning must quarantine, validate, and sanitize raw external evidence before any internal division can consume it. Primary owning slice: M004-osbua3. Validation: ExternalEvidencePacket flows into a Div5-approved SanitizedKnowledgePacket before internal use.
- R015 active core-capability: Div1.HCO must own routing, escalation, Circuit Breaker control, and staffing/workload coordination while routine routing remains automated under Div1 policy. Primary owning slice: M004-osbua3. Validation: routing docs and contracts show Div1.HCO as policy owner; deterministic automation handles routine routes; escalations and staffing changes route through Div1.

Do: Create runtime-evidence/M002-S13-requirement-coverage.json with schema version, milestone M002, slice S13, generated_at, validation_round 1, source_of_truth note referencing the GSD requirements store context, one record for each of R012 through R015, M002 disposition, evidence citations, and a safety block preserving S12 approved_rescope and no capability promotions. Use dispositions such as out_of_scope_for_m002 or inherited_no_scope_change, not validated_by_m002_runtime, unless the existing M002 artifacts truly prove the specific requirement without changing scope. Add scripts/validate_s13_requirement_coverage.py as a standard-library-only validator with argparse flags --root, --ledger, --phase, and --write-audit. Add scripts/test_validate_s13_requirement_coverage.py using fixture data only; the tests must not read .gsd or other gitignored planning paths.

Threat Surface Q3: repo-controlled JSON and Markdown are the only inputs; fail closed on malformed JSON, unknown requirement IDs, secret-like strings, unsupported runtime proof claims, or changed S12 posture. Do not log credential values.

Requirement Impact Q4: touches active R012, R013, R014, and R015 only as coverage metadata; preserves validated R009, R010, and R011 and decisions D008 through D011.

Failure Modes Q5: If S12 disposition artifacts are missing or malformed, classify S13 as blocked rather than inferring proof. If requirement text drifts, emit contract diagnostics naming the requirement. If docs are not yet synced, phase ledger should still pass while phase final may fail until T02.

Load Profile Q6: trivial linear reads of small JSON and Markdown files; no shared runtime resources.

Negative Tests Q7: include tests for missing R015, wrong owner, runtime capability promotion, unknown extra requirement, missing S12 approved_rescope, secret-like diagnostics, malformed ledger JSON, duplicate requirement IDs, and invalid validation class names.

Done when: the ledger validates in ledger phase, unit tests pass, and no completed S10 or S12 artifacts are modified.

## Inputs

- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/.gsd/milestones/M002/M002-CONTEXT.md`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/.gsd/milestones/M002/M002-ASSESSMENT.md`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/.gsd/milestones/M002/slices/S11/S11-UAT.md`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/runtime-evidence/M002-S10-requirement-scope-resolution.json`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/runtime-evidence/M002-S12-runtime-proof-or-rescope.json`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/runtime-evidence/M002-S12-validation-closeout.json`

## Expected Output

- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/runtime-evidence/M002-S13-requirement-coverage.json`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/scripts/validate_s13_requirement_coverage.py`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/scripts/test_validate_s13_requirement_coverage.py`

## Verification

python3 -m unittest scripts/test_validate_s13_requirement_coverage.py && python3 scripts/validate_s13_requirement_coverage.py --phase ledger --ledger runtime-evidence/M002-S13-requirement-coverage.json

## Observability Impact

Introduces the S13 coverage ledger and validator diagnostics. Future agents can inspect the ledger and validator output to distinguish requirement contract drift, evidence gaps, and prohibited runtime promotion.
