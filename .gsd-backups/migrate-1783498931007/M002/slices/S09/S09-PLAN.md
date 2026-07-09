# S09: Validation artifact reconciliation and requirement coverage repair

**Goal:** Reconcile S08 closeout artifacts and M002 requirement coverage so DB status, rendered slice artifacts, docs, validators, and conservative runtime capability posture all agree before S10 attempts runtime proof remediation.
**Demo:** After this: S08 has canonical SUMMARY, ASSESSMENT, and UAT artifacts or has been reopened and re-completed; M002 has a consistent context and verification-class source; closeout validators and git/filesystem audits prove DB and rendered artifacts agree.

## Must-Haves

- S08 has canonical slice-level `S08-SUMMARY.md`, `S08-ASSESSMENT.md`, and `S08-UAT.md` rebuilt from existing S08 task summaries and runtime evidence.
- Docs localize the post-S08 outcome: selected path `hermes_local_with_codex_cli_backend`, Hermes CLI blocker cleared, bounded Paperclip-owned smoke failed closed with `adapter_failed`, `wakeCountDelta=1`, and no passing `resultJson.bos`.
- R011 boundary posture, R009 conservative runtime capability posture, and R010 no-duplicate-wake posture remain explicit; no runtime capability is promoted from S08.
- A repository validation script asserts the S08 artifact/doc/evidence reconciliation contract and fails on missing artifacts, overclaim language, missing fail-closed markers, or capability promotion drift.
- Final verification passes: `python3 scripts/validate_s09_reconciliation.py --write-audit runtime-evidence/M002-S09-reconciliation-audit.json`, `python3 scripts/validate_m002_closeout.py --phase final`, `python3 scripts/validate_runtime_capabilities.py`, `python3 scripts/run_m002_regression_closure.py --output runtime-evidence/M002-S06-regression-closure.json`, and JSON validation of the S09 audit artifact.
- `gsd_milestone_status` still shows S08 complete and S09 planned/in progress; filesystem artifacts now agree with that status.

## Threat Surface

## Q3 exploit analysis

### Abuse scenarios considered
- **Parameter tampering:** S09 writes fixed repository-local artifacts (`S08-*` slice artifacts, `scripts/validate_s09_reconciliation.py`, and `runtime-evidence/M002-S09-*.json`) rather than accepting user-supplied paths or parameters. The planned validator should keep any `--write-audit` target bounded to the repository audit path and should fail closed on malformed evidence.
- **Replay / duplicate execution:** The slice explicitly does **not** perform live Paperclip runtime execution. Its required story preserves `adapter_failed`, `wakeCountDelta=1`, and no passing `resultJson.bos`, so it should not trigger duplicate runtime runs or present stale S08 evidence as a new successful execution.
- **Privilege escalation:** The plan introduces no Paperclip core patch, direct DB mutation, private import, monkey patch, or secret-materialization workaround. It reconciles docs/artifacts and re-runs local validators only.
- **Evidence fabrication / capability overclaim:** The main abuse mode is an operator or future agent misreading repaired artifacts as runtime proof. The slice mitigates this by requiring fail-closed language, no capability promotion, and validator checks for overclaim language and missing fail-closed markers.

### Data exposure risks
- Inputs are local S08 task summaries and runtime-evidence JSON. Risk is accidental leakage if evidence contains token-like strings or raw provider transcripts; findings should quote only redacted statuses, approved run/log references, paths, and summarized states.
- The S09 audit JSON should record paths, marker presence, status, and validator outcomes only; it should not persist plaintext secrets, provider credentials, auth headers, or raw transcripts.

### Trust boundaries
- Trust boundary is repository-local file IO: existing evidence and docs are treated as inputs; generated artifacts, docs, validator, and audit JSON are outputs.
- No untrusted request payload reaches Paperclip, a DB, provider API, or shell-executed runtime path as part of this slice.

### Gate conclusion
No exploitable external/auth/runtime surface is introduced before execution. Keep the planned redaction, fixed-path, fail-closed, and no-capability-promotion controls intact during implementation.

## Requirement Impact

## Q4 requirement impact

### R-IDs touched
- **R011 — stable external boundaries / no Paperclip core internals.** Directly touched. S09 reconciles S08 artifacts and docs to ensure the selected path `hermes_local_with_codex_cli_backend`, Hermes CLI remediation, Paperclip-owned bounded run, `adapter_failed`, and no passing `resultJson.bos` are represented without Paperclip core patches, private imports, direct DB mutation, monkey patches, plaintext secrets, or unsupported capability promotion.
- **R009 — conservative Eval Gate/runtime capability posture.** Indirectly touched. S09 updates/readchecks docs and the runtime capability matrix so S08 remediation evidence is not promoted into passing Eval Gate or Div4 runtime capability claims.
- **R010 — Circuit Breaker/no-duplicate-wake posture.** Indirectly touched. S09 preserves the `wakeCountDelta=1`/no-duplicate-wake story and must not convert a fail-closed S08 runtime smoke into a passing runtime execution claim.

### Must be re-tested after shipping S09
- `python3 scripts/validate_s09_reconciliation.py --write-audit runtime-evidence/M002-S09-reconciliation-audit.json`
- `python3 scripts/validate_m002_closeout.py --phase final`
- `python3 scripts/validate_runtime_capabilities.py`
- `python3 scripts/run_m002_regression_closure.py --output runtime-evidence/M002-S06-regression-closure.json`
- `python3 -m json.tool runtime-evidence/M002-S09-reconciliation-audit.json`
- Confirm `gsd_milestone_status` still reports S08 complete and S09 active/planned without structurally modifying completed DB state.

### Decisions to revisit
- **D011** remains in force for the selected remediation path, but S09 must keep it framed as selected-in-principle/fail-closed until supported Paperclip execution returns passing structured BOS evidence.
- No D008/D009/D010 reversal is justified. Revisit decisions only if implementation discovers that reconciliation requires Paperclip core changes, private adapter registry imports, direct DB mutation, plaintext secret handling, or capability promotion beyond S08 evidence.

## Proof Level

- This slice proves: Final-assembly artifact and operational validation. No live Paperclip runtime execution is required in S09; proof is consistency across existing S08 evidence, canonical GSD artifacts, human-readable docs, runtime capability validators, and a new reconciliation assertion script.

## Integration Closure

Consumes S08 task summaries, S08 runtime-evidence JSON, D011, existing M002 closeout docs, runtime capability matrix, and closeout validators. Introduces no Paperclip runtime wiring and no capability promotion. Closes the source-of-truth gap so S10 can focus only on runtime adapter execution proof or explicit re-scope decisions.

## Verification

- Adds an S09 reconciliation validator and audit JSON so future agents can inspect checked S08 artifacts, evidence fields, doc markers, and capability-posture guards. Records only redacted statuses, paths, run IDs/log references already present in evidence, and no plaintext secrets.

## Tasks

- [x] **T01: Rebuild canonical S08 closeout artifacts from existing evidence** `est:45m`
  Expected executor skills: write-docs, verify-before-complete.
  - Files: `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/runtime-evidence/M002-S09-s08-artifact-reconstruction.json`
  - Verify: test -s .gsd/milestones/M002/slices/S08/S08-SUMMARY.md && test -s .gsd/milestones/M002/slices/S08/S08-ASSESSMENT.md && test -s .gsd/milestones/M002/slices/S08/S08-UAT.md && python3 -m json.tool runtime-evidence/M002-S09-s08-artifact-reconstruction.json

- [x] **T02: Add S09 reconciliation validator** `est:1h`
  Expected executor skills: tdd, verify-before-complete.
  - Files: `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/scripts/validate_s09_reconciliation.py`
  - Verify: python3 -m py_compile scripts/validate_s09_reconciliation.py

- [x] **T03: Update M002 docs with S08 fail-closed runtime story** `est:1h`
  Expected executor skills: write-docs, verify-before-complete.
  - Files: `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/PAPERCLIP_LIVE_VALIDATION_REPORT.md`, `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/docs/08_RUNTIME_CAPABILITY_HEALTH.md`, `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/plugin-bos-light/capabilities.paperclip-runtime.json`
  - Verify: python3 scripts/validate_s09_reconciliation.py

- [x] **T04: Run final closeout reconciliation and persist S09 audit evidence** `est:45m`
  Expected executor skills: verify-before-complete.
  - Files: `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/runtime-evidence/M002-S09-reconciliation-audit.json`, `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/runtime-evidence/M002-S06-regression-closure.json`, `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/scripts/validate_s09_reconciliation.py`, `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/PAPERCLIP_LIVE_VALIDATION_REPORT.md`, `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/docs/08_RUNTIME_CAPABILITY_HEALTH.md`
  - Verify: python3 scripts/validate_s09_reconciliation.py --write-audit runtime-evidence/M002-S09-reconciliation-audit.json && python3 scripts/validate_m002_closeout.py --phase final && python3 scripts/validate_runtime_capabilities.py && python3 scripts/run_m002_regression_closure.py --output runtime-evidence/M002-S06-regression-closure.json && python3 -m json.tool runtime-evidence/M002-S09-reconciliation-audit.json

## Files Likely Touched

- /home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/runtime-evidence/M002-S09-s08-artifact-reconstruction.json
- /home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/scripts/validate_s09_reconciliation.py
- /home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/PAPERCLIP_LIVE_VALIDATION_REPORT.md
- /home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/docs/08_RUNTIME_CAPABILITY_HEALTH.md
- /home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/plugin-bos-light/capabilities.paperclip-runtime.json
- /home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/runtime-evidence/M002-S09-reconciliation-audit.json
- /home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/runtime-evidence/M002-S06-regression-closure.json
