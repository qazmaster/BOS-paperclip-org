# S13: Requirement coverage reconciliation

**Goal:** Create and validate a coherent M002 requirement coverage record for active R012 through R015, preserving the S12 approved rescope and no promotion runtime posture while rerunning Contract, Integration, Operational, and UAT validation round 1.
**Demo:** After this: M002 requirement coverage is coherent with current active requirements, including explicit out of scope notes or validation evidence for R012 through R015, and Contract Integration Operational and UAT checks are rerun for validation round 1.

## Must-Haves

- Done means runtime-evidence/M002-S13-requirement-coverage.json records canonical active requirement coverage for R012, R013, R014, and R015; each requirement has an explicit M002 disposition of out of scope or supporting evidence without broadening M002 scope; M002 context and assessment name the S13 ledger and do not reinterpret M004 ownership; scripts/validate_s13_requirement_coverage.py writes a passing audit with Contract, Integration, Operational, and UAT rows for validation round 1; scripts/run_m002_regression_closure.py includes the S13 validator after S12 and before final M002 closeout; runtime-evidence/M002-S06-regression-closure.json is refreshed with all gates passing and no capability promotion, secret leakage, Paperclip core patching, direct DB mutation, private imports, unsupported paths, or shell string execution.

## Threat Surface

## Q3 Exploitability assessment

S13 reconciles requirement coverage metadata and closeout validation artifacts; it does not introduce a user-facing API, authentication surface, network call, database mutation, Paperclip core patch, or runtime adapter invocation.

### Abuse scenarios considered

- **Requirement/ledger tampering:** A malicious or stale `runtime-evidence/M002-S13-requirement-coverage.json` could omit R012-R015, add unknown requirements, change owners, or claim M002 validated M004-owned organization-boundary requirements. Planned mitigation: standard-library validator must fail closed on missing/duplicate/unknown R-IDs, owner drift, invalid validation classes, unsupported runtime proof claims, and changed S12 posture.
- **Capability-promotion spoofing:** Docs or closeout artifacts could incorrectly transform S12 `approved_rescope` blocker evidence into Hermes/GSD-Pi runtime proof. Planned mitigation: S13 explicitly preserves S12 `approved_rescope`, no capability promotions, and final validation checks for no runtime promotion.
- **Secret or sensitive diagnostic leakage:** Repo-controlled JSON/Markdown could include credential-like strings that get copied into audits or logs. Planned mitigation: validator must fail on secret-like strings and avoid logging credential values.
- **Command execution hardening:** Aggregate closure wiring could become exploitable if command metadata uses shell strings or `shell=True`. Planned mitigation: tests must enforce command arrays, shell-disabled execution, gate ordering after S12, and output artifact paths.

### Trust boundaries

Inputs are local repository-controlled JSON and Markdown files plus Python validator arguments. They reach local filesystem reads/writes and subprocess command metadata only; they do not cross into Paperclip runtime, external network, database, or credential stores.

### Data exposure

Expected artifacts contain requirement IDs, dispositions, evidence paths, validation class summaries, and redacted diagnostics. No PII, tokens, raw operator credentials, or secret material should be emitted.

### Verdict rationale

The slice is exploitable mainly through local evidence tampering or false documentation claims, but the plan contains explicit fail-closed validation and no-promotion controls, so there are no unresolved pre-execution security concerns.

## Requirement Impact

## Q4 Requirement impact assessment

### Requirements touched

- **R012** — Active constraint for the canonical v1.4.1 division map. S13 must mark it as active and M004-owned, with M002 providing traceability only rather than validation of the org-boundary contract.
- **R013** — Active compliance/security requirement that only `Div6.External` may interact with the external world. S13 must record it as active and M004-owned, not newly validated by M002 runtime evidence.
- **R014** — Active compliance/security requirement for Div5 quarantine/validation/sanitization of external evidence before internal use. S13 must record it as active and M004-owned, not satisfied by M002.
- **R015** — Active core capability for Div1.HCO routing, escalation, Circuit Breaker control, and staffing/workload ownership. S13 must record it as active and M004-owned, not satisfied by M002.

### Requirements to preserve / re-check for regression

- **R009** — Proof-gated capability posture must remain intact; S12 `approved_rescope` must not become runtime proof.
- **R010** — Future Hermes proof requirements remain unchanged; no bounded Hermes runtime execution should be promoted by S13.
- **R011** — Supported-boundary constraints remain mandatory: no Paperclip core patch, private internal dependency, direct DB mutation, shell-string execution, unsupported path, or plaintext credential logging.

### Required re-tests after shipping S13

- Run the S13 ledger validator in `ledger` and `final` phases.
- Run unit tests for `scripts/test_validate_s13_requirement_coverage.py`.
- Run aggregate closure tests for `scripts/test_run_m002_regression_closure.py`.
- Run final validation round 1 with audit output at `runtime-evidence/M002-S13-validation-closeout.json`.
- Run `scripts/run_m002_regression_closure.py --output runtime-evidence/M002-S06-regression-closure.json` and verify the S13 gate appears after S12 and before closeout.
- Confirm validation classes include **Contract**, **Integration**, **Operational**, and **UAT**.

### Decisions to revisit

No existing decision requires revision before execution. The task plan explicitly preserves decisions D008-D011 and the conservative no-promotion posture.

## Proof Level

- This slice proves: Final assembly artifact proof. Real Paperclip runtime is not required and must not be claimed. Human UAT is not required; the UAT class is satisfied by human-readable artifact coverage and out-of-scope notes. Verification must exercise contract, integration, operational, and UAT checks through repository scripts and JSON artifacts.

## Integration Closure

Consumes completed S12 approved-rescope artifacts and existing M002 closeout validators, then adds one S13 validation gate to the aggregate M002 closure runner. This is a reconciliation slice only: no Paperclip runtime wiring, no GSD-Pi adapter registration, no Hermes proof attempt, no requirement promotion, and no changes to completed S10 or S12 evidence artifacts. After completion, M002 validation can audit active requirement coverage without missing R012 through R015.

## Verification

- Adds machine-readable inspection surfaces at runtime-evidence/M002-S13-requirement-coverage.json and runtime-evidence/M002-S13-validation-closeout.json. Failure visibility should include named requirement IDs, validation class, failing artifact path, and whether the problem is contract drift, documentation mismatch, operational posture, or UAT readability. Redaction posture remains no plaintext credentials and no secret-like diagnostics.

## Tasks

- [x] **T01: Create S13 requirement coverage ledger and validator** `est:1h`
  Why: S13 needs an authoritative local coverage record for active requirements R012 through R015 before documentation or closeout checks are changed. The worktree does not currently contain .gsd/REQUIREMENTS.md, so the executor must seed the ledger from the canonical GSD requirement text embedded in this task plan and then validate it against existing M002 evidence.
  - Files: `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/runtime-evidence/M002-S13-requirement-coverage.json`, `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/scripts/validate_s13_requirement_coverage.py`, `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/scripts/test_validate_s13_requirement_coverage.py`
  - Verify: python3 -m unittest scripts/test_validate_s13_requirement_coverage.py && python3 scripts/validate_s13_requirement_coverage.py --phase ledger --ledger runtime-evidence/M002-S13-requirement-coverage.json

- [x] **T02: Sync M002 coverage docs and closure gate** `est:1h`
  Why: Once the ledger exists, closeout-facing M002 docs and the aggregate closure runner must consume it so validators see coherent active requirement coverage for R012 through R015. This task must not rewrite prior runtime evidence or promote Hermes or GSD-Pi capability.
  - Files: `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/.gsd/milestones/M002/M002-CONTEXT.md`, `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/.gsd/milestones/M002/M002-ASSESSMENT.md`, `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/.gsd/milestones/M002/slices/S13/S13-ASSESSMENT.md`, `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/scripts/run_m002_regression_closure.py`, `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/scripts/test_run_m002_regression_closure.py`
  - Verify: python3 -m unittest scripts/test_run_m002_regression_closure.py && python3 scripts/validate_s13_requirement_coverage.py --phase final --ledger runtime-evidence/M002-S13-requirement-coverage.json

- [x] **T03: Run validation round one and refresh aggregate closure** `est:30m`
  Why: S13 is complete only when the reconciled coverage ledger, docs, and aggregate closure runner have been exercised together and recorded as validation round 1 evidence. This task produces the durable closeout artifacts; it does not add new runtime claims.
  - Files: `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/runtime-evidence/M002-S13-validation-closeout.json`, `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/runtime-evidence/M002-S06-regression-closure.json`
  - Verify: python3 -m unittest scripts/test_validate_s13_requirement_coverage.py scripts/test_run_m002_regression_closure.py && python3 scripts/validate_s13_requirement_coverage.py --phase final --ledger runtime-evidence/M002-S13-requirement-coverage.json --write-audit runtime-evidence/M002-S13-validation-closeout.json && python3 scripts/run_m002_regression_closure.py --output runtime-evidence/M002-S06-regression-closure.json

## Files Likely Touched

- /home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/runtime-evidence/M002-S13-requirement-coverage.json
- /home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/scripts/validate_s13_requirement_coverage.py
- /home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/scripts/test_validate_s13_requirement_coverage.py
- /home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/.gsd/milestones/M002/M002-CONTEXT.md
- /home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/.gsd/milestones/M002/M002-ASSESSMENT.md
- /home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/.gsd/milestones/M002/slices/S13/S13-ASSESSMENT.md
- /home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/scripts/run_m002_regression_closure.py
- /home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/scripts/test_run_m002_regression_closure.py
- /home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/runtime-evidence/M002-S13-validation-closeout.json
- /home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/runtime-evidence/M002-S06-regression-closure.json
