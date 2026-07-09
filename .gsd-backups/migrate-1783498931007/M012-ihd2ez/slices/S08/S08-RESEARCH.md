# S08 Research: Coverage Boundary and Secret Scan Remediation

## Summary

S08 has three concrete responsibilities: (1) remediate 5 remaining secret leaks in S06/S07 task summaries so both the S06 and S07 closeout validators pass, (2) provide truthful R003 coverage or descoping evidence and ensure S05/S06/S07 handoffs are reflected in the milestone state, and (3) prepare validation round 1 by defining success criteria, verification classes, and requirement coverage. The scope is primarily documentation remediation and validation scaffolding — no runtime code, no Paperclip API calls, no live mutations.

## Current State

### Secret Scan Failures

Both the S06 and S07 closeout gate artifacts currently show `verdict: "fail"`:

- **S06 closeout gate**: 30/31 checks pass. The 1 failure is the secret scan: 4 matches across 2 files.
- **S07 closeout gate**: 25/27 checks pass. The 2 failures are (a) the S06 regression check (which re-runs the S06 validator, which fails on secrets), and (b) the S07's own secret scan finding 1 match.

The secret leaks are in 3 files, all password literals (`BosAdmin2026!`) and one API key prefix (`pcp_board_*`):

| File | Lines | Pattern |
|------|-------|---------|
| `.gsd/milestones/M012-ihd2ez/slices/S06/tasks/T01-SUMMARY.md` | 25, 29, 36 | password-literal (text + regex pattern in verification table) |
| `.gsd/milestones/M012-ihd2ez/slices/S06/tasks/T05-SUMMARY.md` | 27 | password-literal + api-key-pcp-prefix (in narrative describing the sanitization) |
| `.gsd/milestones/M012-ihd2ez/slices/S07/tasks/T03-SUMMARY.md` | 40 | password-literal (in narrative describing the S06 fix) |

S06 T05 and S07 T03 both *claim* to have sanitized these secrets, but the actual file contents still contain them. The T05/T03 task narratives leaked the secret values while describing the remediation work. This is the classic "the fix description contains the thing being fixed" pattern.

### R003 Coverage Gap

R003 is `active`, owned by M003 S02/S03, with notes: "Decision artifacts must preserve Paperclip as system of record and avoid plugin-owned governance state." M012 S04 requirement outcomes did not include R003. M012 produced decision artifacts (D053 rescope decision, M012-S07-rescope-decision.json) that are GSD-internal milestone governance — they do not create plugin-owned governance state and they preserve Paperclip as system of record. R003 coverage for M012 is: M012 decision artifacts are repo-local governance documentation, not Paperclip runtime state, and do not violate the Paperclip-ownership boundary.

### S05/S06/S07 Handoff Status

The roadmap already marks S05, S06, S07 as completed with `[x]`. The handoff chain is:
- S05 corrected overclaiming in S04 artifacts and added R009/R010/R014 corroboration notes.
- S06 refreshed live Paperclip auth, verified BOS-3, updated R022 outcomes with deviation language.
- S07 formally re-scoped R022/R023 milestone criteria for auto-mode constraint.

All three slice summaries exist and have `verification_result: passed`. The handoffs are coherent: each slice consumed its predecessor's outputs. The one gap is that the closeout gate artifacts are stale (showing `fail` due to secrets), which S08 must fix.

### Validation Round 1 Preparation

M012 has no explicit verification contract or definition of done in the roadmap. S08 must define these before validation can proceed. The 5 roadmap success criteria are:

1. Canonical BOS Light company authenticated-readback verified.
2. BOS-2 stale issue either cleaned up or deferred without hidden mutation.
3. One bounded mission issue created or reused with readback artifact.
4. Local BOS Light flow runs across Div7-Div5 with auditable evidence.
5. Final reconciliation updates requirement outcomes truthfully.

M012 is a documentation/evidence milestone with no runtime code changes to the BOS Light plugin. Verification classes should be:
- **Contract**: Validate that evidence artifacts conform to their JSON schemas and that validators pass.
- **UAT**: Validate that the human-readable success criteria are met with specific evidence citations.
- **Integration** and **Operational**: Not applicable — M012 did not produce runtime integration or operational surfaces.

## Constraints

- This is a **research lane** unit. All implementation (file edits, validator scripts, gate artifacts) belongs in the execute-task lane.
- The S06 validator (`scripts/validate_m012_s06_closeout.js`) scans both `runtime-evidence/` and `.gsd/milestones/M012-ihd2ez/slices/S06/` for secrets. The S07 validator scans `runtime-evidence/` and `.gsd/milestones/M012-ihd2ez/slices/S07/`. Both must pass.
- R003 is owned by M003, not M012. M012 should add coverage notes without changing ownership or status.
- Validation round 1 artifacts should be consumable by `gsd_validate_milestone`.

## Recommendation

### Task Decomposition

**T01: Secret Scan Remediation and Validator Refresh**
- Redact secrets from S06/T01-SUMMARY.md, S06/T05-SUMMARY.md, S07/T03-SUMMARY.md.
- Replace password literals with `[REDACTED-PASSWORD]` and API key prefixes with `[REDACTED-API-KEY]`.
- Also redact the regex pattern in T01-SUMMARY.md verification table line 36 that matches the password.
- Re-run `node scripts/validate_m012_s06_closeout.js` — expect 31/31 pass.
- Re-run `node scripts/validate_m012_s07_closeout.js` — expect 27/27 pass.
- Write aggregate S08 closeout validator (`scripts/validate_m012_s08_closeout.js`) that checks:
  - S06 closeout validator passes (regression)
  - S07 closeout validator passes (regression)
  - Secret scan across all M012 slice artifacts passes
  - No new secret patterns introduced by S08
- Write `runtime-evidence/M012-S08-closeout-gate.json`.

**T02: R003 Coverage and Requirement Reconciliation**
- Create `runtime-evidence/M012-S08-r003-coverage.json` documenting:
  - R003 requirement text and ownership
  - M012 decision artifacts (D053, M012-S07-rescope-decision.json) as evidence
  - Assessment: M012 decision artifacts are GSD-internal milestone governance, not plugin-owned governance state, and preserve Paperclip as system of record
  - Coverage verdict: M012 advances R003 with honest coverage notes (not validation)
- Update R003 notes in REQUIREMENTS.md to include M012 coverage evidence.
- Update M012-S04-requirement-outcomes.md to add R003 row.
- Verify S05/S06/S07 handoff coherence: confirm each slice's `provides`/`requires` chain is satisfied.
- Write validation readiness evidence artifact.

**T03: Validation Round 1 Preparation**
- Define success criteria checklist aligned to the 5 roadmap success criteria, with specific evidence citations.
- Define verification classes: Contract (artifact schema + validator pass) and UAT (human-readable success criteria met).
- Build requirement coverage matrix mapping all M012-touched active requirements to evidence.
- Create `runtime-evidence/M012-S08-validation-readiness.json` with:
  - success_criteria_checklist
  - verification_classes
  - requirement_coverage
  - slice_delivery_audit
  - cross_slice_integration assessment
- Write aggregate S08 closeout validator that gates on all prior validators plus the validation readiness artifact.

### Implementation Landscape

The work is entirely file editing (redacting secrets in 3 task summaries, updating requirement notes, updating requirement outcomes) plus writing 2-3 new validator scripts and 2-3 new evidence artifacts. No API calls, no runtime code, no Paperclip mutations.

The existing validator infrastructure (S06 `validate_m012_s06_closeout.js`, S07 `validate_m012_s07_closeout.js`) provides the regression gates. S08's aggregate validator chains these plus adds its own secret scan and validation readiness checks.

### First Proof

The highest-risk item is the secret redaction — if the redaction changes structural context (e.g., the password was part of a diagnostic explanation), the narrative must remain coherent without the secret. The validator must then pass, proving the redaction was clean.

### Verification

```bash
# T01: After redaction
node scripts/validate_m012_s06_closeout.js  # expect 31/31
node scripts/validate_m012_s07_closeout.js  # expect 27/27

# T02: After R003 coverage
# Verify REQUIREMENTS.md has R003 M012 note
# Verify M012-S04-requirement-outcomes.md has R003 row

# T03: After validation readiness
node scripts/validate_m012_s08_closeout.js  # aggregate gate
```

## Key Findings

1. **Secrets are in task narratives, not artifacts**: The `runtime-evidence/` JSON artifacts are clean. The leaks are in `.gsd/milestones/.../tasks/T*-SUMMARY.md` files — GSD-generated task completion summaries. T05 and T03 leaked secrets while describing their own remediation work.

2. **S06 gate artifact is stale**: T05 claimed to have updated it to verdict:pass, but the file shows verdict:fail. After S08 redaction, the S06 validator will regenerate the gate artifact with the correct verdict.

3. **R003 is traceability-only for M012**: R003's "system of record" and "plugin-owned governance" concerns are about BOS Light architecture decisions from M003. M012 did not create any plugin-owned governance state. The coverage is: M012's GSD decision artifacts (D053, rescope decision) are repo-local milestone governance that preserves Paperclip ownership.

4. **No verification contract exists**: The M012 roadmap has success criteria but no explicit verification contract, definition of done, or verification classes. S08 must define these for validation round 1.

5. **S08 is the last slice before validation**: S08 is the final pre-validation slice. Its output must be a coherent validation package that `gsd_validate_milestone` can consume.
