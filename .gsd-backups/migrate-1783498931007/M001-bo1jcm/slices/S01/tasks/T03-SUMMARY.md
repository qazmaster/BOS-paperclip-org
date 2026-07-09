---
id: T03
parent: S01
milestone: M001-bo1jcm
key_files:
  - company-template/a1-validation-evidence.md
key_decisions:
  - Scoped A1 evidence to deterministic repository-local import readiness and explicitly deferred live Paperclip schema compatibility to S02.
duration: 
verification_result: passed
completed_at: 2026-05-28T02:50:58.290Z
blocker_discovered: false
---

# T03: Added A1 validation evidence documenting the local BOS Light company-template proof and the remaining live Paperclip schema unknown.

**Added A1 validation evidence documenting the local BOS Light company-template proof and the remaining live Paperclip schema unknown.**

## What Happened

Created `company-template/a1-validation-evidence.md` after confirming no prior evidence artifact existed. The artifact cites A1 from `docs/06_ACCEPTANCE_TESTS.md`, names the exact local command `python3 scripts/validate_company_template.py`, records the successful validator output, lists the validated template/support/AGENTS assets, explains what repository-local import readiness proves, and explicitly states that live Paperclip import/export schema compatibility remains an S02 unknown.

## Failure Modes
- Local filesystem dependency: missing or unreadable JSON, markdown support assets, or `AGENTS.md` profiles are expected to fail `scripts/validate_company_template.py` with relative file path and context.
- Local JSON/schema dependency: malformed JSON, missing required fields, malformed routing targets, unknown division ids, and cross-file compatibility gaps are expected to fail with file, field, route, or division context.
- External API/network dependency: none for this A1 local proof; live Paperclip compatibility is explicitly deferred to S02 rather than inferred.

## Load Profile
This task has no runtime service load dimension. The validator is a bounded local CLI over a small fixed asset set; at 10x the expected template/support-document size, local filesystem reads and JSON/text parsing would saturate first, but no service pools, rate limits, pagination, or caching are required for this repository-level proof.

## Negative Tests
Negative coverage for the validator remains in `scripts/test_validate_company_template.py`: missing required division fields, missing referenced AGENTS profiles, malformed and unknown route targets, org-chart compatibility drift, and the seven-division boundary/missing canonical ids.

## Verification

`test -s company-template/a1-validation-evidence.md` confirmed the evidence artifact exists and is non-empty. `python3 scripts/validate_company_template.py` passed and reported seven divisions, seven agent profiles, org chart, routing, rituals, and agents README compatibility. `python3 scripts/test_validate_company_template.py` passed all six validator tests, including negative coverage. `python3 scripts/validate_handoff.py` passed the handoff package check. A readback of `company-template/a1-validation-evidence.md` confirmed the artifact contains the exact command, validated assets, proof boundary, S02 unknown, and Q5/Q6/Q7 sections.

## Verification Evidence

| # | Command | Exit Code | Verdict | Duration |
|---|---------|-----------|---------|----------|
| 1 | `test -s company-template/a1-validation-evidence.md` | 0 | ✅ pass | 13ms |
| 2 | `python3 scripts/validate_company_template.py` | 0 | ✅ pass | 43ms |
| 3 | `python3 scripts/test_validate_company_template.py` | 0 | ✅ pass | 92ms |
| 4 | `python3 scripts/validate_handoff.py` | 0 | ✅ pass | 28ms |

## Deviations

None.

## Known Issues

Live Paperclip import/export schema compatibility remains intentionally unproven and must be retired by S02 using an actual Paperclip export/import path.

## Files Created/Modified

- `company-template/a1-validation-evidence.md`
