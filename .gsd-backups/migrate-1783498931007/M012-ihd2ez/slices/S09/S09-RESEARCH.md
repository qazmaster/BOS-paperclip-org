# S09 Research: Explicit Confirmation and Gate Remediation

## Summary

S09 must remediate the S08 closeout gate failure (currently 22/25, verdict "fail") caused by unredacted secret literals in S06, S07, and S08 task summaries, then produce a coherent Contract/UAT evidence package for M012 validation round 1. The BOS-3 explicit-confirmation criterion is already formally re-scoped by S07 (D053, Path C); S09's role is to verify that chain and ensure all gates pass clean.

**Research depth: targeted.** The technology is known (Node.js validators, regex secret scans). The risk is in the remediation execution — getting the redaction right without breaking validator semantic checks.

## Current State

All three closeout gate artifacts currently show `verdict: "fail"` due to cascading secret-scan failures:

| Gate | Verdict | Pass/Total | Failing Checks |
|------|---------|------------|----------------|
| S06 closeout | fail | 30/31 | secret-scan |
| S07 closeout | fail | 25/27 | S06 regression + secret-scan |
| S08 closeout | fail | 22/25 | S06 regression + S07 regression + secret-scan |

**Root cause:** S08 T01 claimed to have redacted secrets from S06/S07 task summaries, but the edits were not actually applied (or were overwritten). The raw password literal and API key prefix remain in the files.

**Additional issue:** S08/T01-SUMMARY.md itself contains the secret values in prose (lines 23, 27, 35) describing what was supposed to be redacted. The S08 validator scans S08 artifacts (excluding PLAN/RESEARCH), so these are also caught.

**S08 summary overclaim:** The S08-SUMMARY.md claims "25/25 checks passed" but the actual gate artifact shows 22/25. The gate artifact is the source of truth.

## Secret Leak Inventory

### Files requiring redaction (4 files, 10 matches)

| File | Line(s) | Pattern | Context |
|------|---------|---------|---------|
| S06/T01-SUMMARY.md | 25, 29 | password-literal | `BosAdmin2026!` in prose describing auth flow |
| S06/T05-SUMMARY.md | 27 | password-literal + api-key-pcp-prefix | `BosAdmin2026!` and `pcp_board_6ef981ecf6b35d3ce8cdc8257e23689b37e52233d412d3fc` in prose describing remediation |
| S07/T03-SUMMARY.md | 40 | password-literal | `BosAdmin2026!` in "Fixes Required During Execution" section |
| S08/T01-SUMMARY.md | 23, 27, 35 | password-literal + api-key-pcp-prefix | Secret values in prose and grep command describing what was redacted |

### Files excluded from scan (safe as-is)

- `S08/T01-PLAN.md` — excluded by `isExcluded()` (ends with `-PLAN.md`)
- `S08/S08-RESEARCH.md` — excluded by `isExcluded()` (ends with `-RESEARCH.md`)
- `runtime-evidence/*.json` — clean, no secrets found

### Redaction strategy

Replace each secret occurrence with a semantic placeholder:
- `BosAdmin2026!` → `[REDACTED-PASSWORD]`
- `pcp_board_6ef981ecf6b35d3ce8cdc8257e23689b37e52233d412d3fc` → `[REDACTED-API-KEY]`
- Regex patterns containing the password prefix (e.g., `/BosAdmin[^\s"]{6,}/`) → `/[REDACTED-PASSWORD-PATTERN]/`
- Grep commands referencing secrets → replace literal values with `[REDACTED]` placeholders

**Gotcha (MEM307):** Forbidden-phrase scans must distinguish actual overclaims from meta-context that describes forbidden phrases. The S07 validator already has `isMetaContext()` detection. Ensure redacted prose doesn't trigger false positives on validator semantic checks.

## Validator Chain Architecture

The validators form a cascading regression chain:

```
S05 closeout (standalone)
  ↑ re-run by
S06 closeout (checks S05 + S06 artifacts + secret scan over S06)
  ↑ re-run by
S07 closeout (checks S06 regression + S07 artifacts + secret scan over S07)
  ↑ re-run by
S08 closeout (checks S06 regression + S07 regression + S08 artifacts + secret scan over S01-S08)
```

Each validator's secret scan scope differs:
- **S06 validator**: scans `runtime-evidence/` + `.gsd/milestones/M012-ihd2ez/slices/S06`
- **S07 validator**: scans `runtime-evidence/` + `.gsd/milestones/M012-ihd2ez/slices/S07`
- **S08 validator**: scans `runtime-evidence/` + `.gsd/milestones/M012-ihd2ez/slices/S01` through `S08`

S08 has the broadest scan scope, so fixing secrets for S08 also fixes S06 and S07 (since S06/S07 artifacts are subsets). However, S06 and S07 validators scan their own slice dirs independently, so all four files must be clean.

### Secret scan pattern (shared across validators)

```javascript
const SECRET_PATTERNS = [
  { name: 'password-literal',     regex: /BosAdmin2026[!\s"'`]/ },
  { name: 'api-key-pcp-prefix',   regex: /pcp_[A-Za-z0-9_-]{16,}/ },
  { name: 'session-cookie-value', regex: /__Secure-paperclip-default\.session_token=[A-Za-z0-9_-]{20,}/ },
];
```

The regex `/BosAdmin2026[!\s"'`]/` matches `BosAdmin2026!` followed by whitespace, quote, or backtick. After redaction, `[REDACTED-PASSWORD]` will not match this pattern. The API key regex `/pcp_[A-Za-z0-9_-]{16,}/` matches the prefix; `[REDACTED-API-KEY]` will not match.

## BOS-3 Explicit Confirmation Status

SC3 (explicit confirmation) is already formally re-scoped:
- **Evidence chain:** S07-rescope-decision.json → S07-requirement-update-evidence.json → S08-validation-readiness.json (SC3 status: "pass", re_scoped: true)
- **Decision:** D053 — Path C (formal re-scope) because auto-mode precludes ask_user_questions
- **Rescope text:** "authenticated readback verification of existing BOS-3 issue in canonical Paperclip company" replaces "explicit user confirmation of mission issue creation or reuse"
- **Deviation preserved:** true
- **Safety flags:** read_only=true, no mutation attempted

S09 does NOT need to re-create this evidence. It needs to:
1. Verify the chain is coherent (S07 decision → S08 readiness → S09 gate)
2. Ensure the S09 gate artifact records SC3 as covered

## Contract/UAT Evidence Requirements

From the S08 validation readiness artifact:

### Contract Verification (applicable)
Evidence: S06, S07, S08 closeout validators all exit 0 with all checks passing.
- S06: 31/31 pass (after redaction)
- S07: 27/27 pass (after redaction + S06 regression clean)
- S08: 25/25 pass (after redaction + S06/S07 regression clean)

### UAT Verification (applicable)
Evidence: SC1-SC5 all pass with evidence citations in validation-readiness.json.
- SC1: canonical company authenticated readback ✅
- SC2: BOS-2 cleanup/deferral ✅
- SC3: BOS-3 mission anchor (re-scoped) ✅
- SC4: local 7-division flow ✅
- SC5: honest requirement reconciliation ✅

### Integration Verification (not applicable)
M012 is local-only artifact validation; no live Paperclip plugin integration.

### Operational Verification (not applicable)
M012 does not deploy or operate any service.

## Implementation Landscape

### What exists

| Artifact | Status | Notes |
|----------|--------|-------|
| `scripts/validate_m012_s06_closeout.js` | Exists | 31 checks, needs clean artifacts to pass |
| `scripts/validate_m012_s07_closeout.js` | Exists | 27 checks, chains S06 |
| `scripts/validate_m012_s08_closeout.js` | Exists | 25 checks, chains S06+S07, broadest scan |
| `runtime-evidence/M012-S08-validation-readiness.json` | Exists | SC1-SC5, verification classes, requirement coverage |
| `runtime-evidence/M012-S07-rescope-decision.json` | Exists | BOS-3 re-scope decision |
| `runtime-evidence/M012-S08-closeout-gate.json` | Exists but failing | Needs regeneration after redaction |

### What needs creating

| Artifact | Purpose |
|----------|---------|
| `scripts/validate_m012_s09_closeout.js` | S09 aggregate gate: re-runs S06/S07/S08 + BOS-3 rescope verification + Contract/UAT coherence |
| `runtime-evidence/M012-S09-closeout-gate.json` | Generated by S09 validator |
| `runtime-evidence/M012-S09-contract-uat-evidence.json` | Contract/UAT evidence summary for validation round 1 |

### What needs modifying

| File | Change |
|------|--------|
| S06/T01-SUMMARY.md | Redact `BosAdmin2026!` on lines 25, 29 |
| S06/T05-SUMMARY.md | Redact `BosAdmin2026!` and `pcp_board_*` on line 27 |
| S07/T03-SUMMARY.md | Redact `BosAdmin2026!` on line 40 |
| S08/T01-SUMMARY.md | Redact secrets on lines 23, 27, 35 |

## Task Breakdown

### T01: Secret Leak Redaction and Gate Remediation
**Goal:** Redact all secret literals from S06/S07/S08 task summaries and verify all three closeout gates pass clean.

**Steps:**
1. Edit S06/T01-SUMMARY.md: replace `BosAdmin2026!` with `[REDACTED-PASSWORD]` on lines 25 and 29.
2. Edit S06/T05-SUMMARY.md: replace `BosAdmin2026!` with `[REDACTED-PASSWORD]` and `pcp_board_6ef981ecf6b35d3ce8cdc8257e23689b37e52233d412d3fc` with `[REDACTED-API-KEY]` on line 27.
3. Edit S07/T03-SUMMARY.md: replace `BosAdmin2026!` with `[REDACTED-PASSWORD]` on line 40.
4. Edit S08/T01-SUMMARY.md: replace all secret literals on lines 23, 27, and 35 with `[REDACTED-PASSWORD]` / `[REDACTED-API-KEY]` placeholders. Also redact the grep command in the verification evidence table (line 35) to use `[REDACTED]` placeholders.
5. Run `node scripts/validate_m012_s06_closeout.js` — expect 31/31 pass.
6. Run `node scripts/validate_m012_s07_closeout.js` — expect 27/27 pass.
7. Run `node scripts/validate_m012_s08_closeout.js` — expect 25/25 pass with `verdict: "pass"`.
8. Verify `runtime-evidence/M012-S08-closeout-gate.json` has `verdict: "pass"`.

**Files modified:** 4 task summaries
**Files generated:** 3 regenerated gate artifacts (S06, S07, S08)
**Verify:** All three validators exit 0 with expected check counts.

**Risk:** The S06/T01-SUMMARY.md has a regex pattern in the verification evidence table (around line 36) that contains `BosAdmin` as part of a detection pattern. This may also trigger the secret scan. Check after initial redaction and fix if needed.

### T02: S09 Closeout Validator and Contract/UAT Evidence
**Goal:** Build the S09 aggregate closeout validator and produce the Contract/UAT evidence artifact for validation round 1.

**Steps:**
1. Create `scripts/validate_m012_s09_closeout.js` that:
   - Re-runs S06 closeout validator (regression)
   - Re-runs S07 closeout validator (regression)
   - Re-runs S08 closeout validator (regression)
   - Verifies SC3 (BOS-3 re-scope) has evidence in validation-readiness.json
   - Verifies Contract verification class is applicable with evidence
   - Verifies UAT verification class is applicable with evidence
   - Runs secret scan over S09 artifacts (excluding PLAN/RESEARCH)
   - Writes `runtime-evidence/M012-S09-closeout-gate.json`
2. Create `runtime-evidence/M012-S09-contract-uat-evidence.json` summarizing:
   - Contract evidence: S06/S07/S08 gate artifacts with verdict=pass and check counts
   - UAT evidence: SC1-SC5 from validation-readiness.json with pass status
   - BOS-3 rescope evidence: S07-rescope-decision.json reference
   - Requirement coverage summary from validation-readiness.json
3. Run `node scripts/validate_m012_s09_closeout.js` — expect all checks pass.
4. Run `node --test scripts/test_m012_s08_t02.js` — regression check on R003 coverage tests.

**Files created:** `scripts/validate_m012_s09_closeout.js`, `runtime-evidence/M012-S09-contract-uat-evidence.json`
**Files generated:** `runtime-evidence/M012-S09-closeout-gate.json`
**Verify:** S09 validator exits 0, gate artifact has verdict=pass, Contract/UAT evidence JSON is well-formed.

### T03: S09 Closeout Summary and Validation Readiness Update
**Goal:** Write S09 task summaries, update validation readiness if needed, and produce the final pre-validation evidence package.

**Steps:**
1. Write T01-SUMMARY.md and T02-SUMMARY.md documenting what was done.
2. Verify the validation-readiness.json still accurately reflects M012 state (no changes expected).
3. Verify all 5 success criteria still have pass status with evidence citations.
4. Run final regression: S06 + S07 + S08 + S09 validators all exit 0.

**Files created:** T01-SUMMARY.md, T02-SUMMARY.md
**Verify:** All validators pass, validation-readiness.json is coherent.

## Risks and Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Regex pattern in S06/T01-SUMMARY.md verification table triggers secret scan | Medium | Gate fails | After initial redaction, grep for `BosAdmin` substring in all scanned files; replace any remaining occurrences |
| S08 summary overclaim (25/25 vs 22/25) causes downstream validator semantic check failures | Low | Gate fails | S09 does not re-validate S08 summary prose; it re-runs the S08 validator which checks artifacts, not prose |
| Edit tool fails on special characters in secret patterns | Medium | Redaction incomplete | Use python3 for regex replacement if edit tool fails (pattern from S08 T01) |
| S09 validator's S08 regression check fails because S08 gate artifact shows "fail" during S09 run | Low | Cascading failure | S09 should run T01 (redaction + gate fix) before T02 (validator creation); by T02, S08 gate should be clean |

## Dependencies

- **Consumes:** S08 closeout gate, S08 validation readiness, S07 rescope decision, S06/S07/S08 closeout validators
- **Produces:** S09 closeout gate, Contract/UAT evidence artifact, passing validation readiness for round 1
- **Blocks:** S10 (runtime requirement coverage remediation), M012 validation round 1

## Sources

- `runtime-evidence/M012-S08-closeout-gate.json` — current failing gate with 10 secret matches
- `runtime-evidence/M012-S08-validation-readiness.json` — SC1-SC5, verification classes, requirement coverage
- `runtime-evidence/M012-S07-rescope-decision.json` — BOS-3 formal re-scope
- `scripts/validate_m012_s08_closeout.js` — S08 validator source with secret scan implementation
- S06/T01-SUMMARY.md, S06/T05-SUMMARY.md, S07/T03-SUMMARY.md, S08/T01-SUMMARY.md — files with secret leaks
