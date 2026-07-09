# S05: Requirement Outcome Correction and Coverage Remediation — Research

## Summary

S05 must fix two categories of issues in M012's requirement outcome artifacts:

1. **Overclaiming native issue creation**: The S04 requirement outcomes table (`runtime-evidence/M012-S04-requirement-outcomes.md`) states "S02 created native mission issue" in the R022 row and "created native issues" in the summary. This is false. S02 produced **validated blocker evidence** with `liveIssueId: null`, `mutationAttempted: false`, `confirmationStatus: absent`, `fallbackPath: true`, and zero writes because Paperclip auth returned 401 across all 9 tested methods. The S04-SUMMARY.md also uses ambiguous language ("native mission issue/local flow progress") that could be read as claiming issue creation.

2. **R009, R010, R014 coverage gap**: These three requirements are validated from M003 but have no M012-specific coverage notes. M012's S03 local flow does exercise the relevant code paths locally (Div5 eval gates, Div1 circuit breaker state, Div5 QA review of local artifacts), but this is local-only corroboration, not live Paperclip proof. S05 needs explicit notes documenting what M012 contributed to each.

## Findings

### Overclaim Locations

| File | Line | Issue |
|---|---|---|
| `runtime-evidence/M012-S04-requirement-outcomes.md` | 7 | R022 row: "S02 created native mission issue; S03 proved local 7-division flow end-to-end" — S02 did NOT create a native issue |
| `runtime-evidence/M012-S04-requirement-outcomes.md` | 20 | Summary: "M012 proved local flow capabilities and created native issues" — same overclaim |
| `.gsd/milestones/M012-ihd2ez/slices/S04/S04-SUMMARY.md` | 93 | "Recorded native mission issue/local flow progress" — ambiguous, could imply creation |

### S02 Actual Evidence (from `runtime-evidence/M012-S02-native-mission-issue.json`)

- `liveIssueId`: null
- `mutationAttempted`: false
- `confirmationStatus`: absent
- `fallbackPath`: true
- `fallbackReason`: Paperclip auth is unauthorized (API key returns 401, browser login fails, registration fails)
- `resolutionRequired`: fresh credentials + explicit `paperclip_mutation_yes` confirmation
- No capability promotion occurred

### R009/R010/R014 Current State

All three are **validated** from M003 with M003-owned evidence. M012 S03 local flow provides corroboration:

- **R009 (Eval Gate)**: S03 Div5 QA runs 5 local eval gates (safety, completeness, accuracy, execution_mode, blocker_recording) — all pass locally. This confirms the eval gate code path works in local mode but does not prove live Paperclip eval gate visibility.
- **R010 (Circuit Breaker)**: S03 Div1 routing records `circuit_breaker_state: "closed"` with `circuit_breaker_reason: "no-prior-failures-on-this-mission"`. This is local-only state, not live Paperclip circuit breaker tracking.
- **R014 (Div5 Quarantine)**: S03 Div5 QA processes local production artifacts. No raw external evidence was quarantined because no live Paperclip surfaces were accessed. The quarantine code path was not exercised with real external data.

## Implementation Landscape

### Task 1: Correct Requirement Outcome Artifacts

**Files to create:**
- `runtime-evidence/M012-S05-requirement-outcomes-correction.json` — Structured correction artifact with schema_version, artifact_type, phase, corrected_outcomes array, correction_rationale, and validation_status.
- `runtime-evidence/M012-S05-requirement-outcomes-correction.md` — Human-readable correction document.
- `scripts/validate_m012_s05_requirement_outcomes.js` — Validator that reads the correction artifact and verifies no "S02 created" or "created native issue" overclaims remain.

**Files to modify:**
- `runtime-evidence/M012-S04-requirement-outcomes.md` — In-place correction of R022 row and summary language. The corrected R022 row should say: "S02 produced validated blocker evidence for the native mission issue path (auth-blocked, liveIssueId null, zero writes, no capability promotion); S03 proved local 7-division flow end-to-end."
- `.gsd/milestones/M012-ihd2ez/slices/S04/S04-SUMMARY.md` line 93 — Correct to: "R022 — Recorded native mission issue blocker evidence and local flow progress while leaving full Paperclip GUI E2E active/unvalidated."

**Validation approach:** The validator scans `runtime-evidence/M012-S04-requirement-outcomes.md` for forbidden phrases ("S02 created native", "created native issues", "native issue creation") and checks the correction JSON schema. Exit 0 on pass.

### Task 2: Add R009/R010/R014 Coverage Notes

**Files to modify:**
- `.gsd/REQUIREMENTS.md` — Append M012 notes to R009, R010, and R014. Notes should state: M012 S03 local flow exercises the relevant code path in local-only mode; this is corroboration, not live Paperclip proof; validated status from M003 is not changed.

**Approach:** Use `gsd_requirement_update` for each of R009, R010, R014 to append M012 S03 local-only corroboration notes without changing status.

**Files to create:**
- `runtime-evidence/M012-S05-coverage-remediation.json` — Structured artifact documenting R009/R010/R014 coverage evidence or descoping.
- `runtime-evidence/M012-S05-coverage-remediation.md` — Human-readable coverage remediation document.
- `scripts/validate_m012_s05_coverage.js` — Validator checking the coverage artifact has entries for all three requirements.

### Task 3: Regression and Closeout

**Files to create:**
- `scripts/validate_m012_s05_closeout.js` — Aggregate validator running both S05 sub-validators.

**Verification:** Run all S05 validators and confirm exit 0. Run the corrected S04 requirement outcomes validator to confirm no overclaiming.

## Constraints

1. **Do not change R009/R010/R014 status** — They remain validated from M003. M012 only adds local-only corroboration notes.
2. **Do not promote local evidence to live proof** — S03 local flow is explicitly `local_execution: true`. No Hermes, GSD-Pi, plugin runtime, or live Paperclip mutation occurred.
3. **Preserve S04 summary integrity** — The S04 summary references overclaiming language that needs correction, but the S04 summary should not be deleted; it should be amended.
4. **S06 depends on S05** — S05 must close before S06 (Live Paperclip Proof Remediation) can begin. S06 will attempt fresh auth + live issue creation.

## Recommendation

**Two-task decomposition:**

- **T01: Correct Requirement Outcomes and Add R009/R010/R014 Coverage** — Fix overclaiming in S04 artifacts, create correction artifacts, add M012 coverage notes to R009/R010/R014, create validators.
- **T02: Regression and S05 Closeout** — Run all S05 validators, verify correction integrity, create closeout artifact.

T01 is the single natural seam — the overclaiming correction and coverage remediation are tightly coupled (both update requirement-related artifacts). T02 is the verification gate.

## Risk

**Medium.** The main risk is that modifying S04 artifacts could break existing S04 validators. Mitigation: the S05 correction validator should check the corrected file; the S04 validators should still pass because we're fixing content, not structure. The `validate_m012_s04_final_reconciliation.js` checks the JSON schema, not the markdown outcomes file, so it should be unaffected.
