---
id: T02
parent: S01
milestone: M001-bo1jcm
key_files:
  - company-template/import-notes.md
  - company-template/bos-company-template.json
  - agents/README.md
  - scripts/validate_company_template.py
  - scripts/test_validate_company_template.py
key_decisions:
  - Left the template JSON and agents README unchanged because the validator reported no concrete source-of-truth gaps.
  - Added validator invocation to import notes without claiming Paperclip runtime/import schema compatibility.
duration: 
verification_result: passed
completed_at: 2026-05-28T02:48:59.548Z
blocker_discovered: false
---

# T02: Added local validator guidance to the draft Paperclip import notes after confirming the BOS Light template assets already satisfy the validation contract.

**Added local validator guidance to the draft Paperclip import notes after confirming the BOS Light template assets already satisfy the validation contract.**

## What Happened

Ran `scripts/validate_company_template.py` against the current repository before editing and it already passed for seven divisions, seven agent profiles, org chart, routing, rituals, and `agents/README.md`. Because the validator exposed no concrete template or profile-reference gaps, `company-template/bos-company-template.json` and `agents/README.md` were left unchanged rather than weakening or churning the source-of-truth assets.

Updated `company-template/import-notes.md` to keep the draft-runtime caveat honest while adding the repository-local validation step operators should run before Paperclip schema export/mapping work. The note now explicitly tells users to run `python3 scripts/validate_company_template.py` from the repository root to confirm the local BOS Light package still has seven divisions, valid routing rules, listed rituals, and existing referenced AGENTS.md profiles.

## Failure Modes
- Filesystem dependency: the validator reads local JSON, markdown support assets, and referenced AGENTS.md profiles. Missing or unreadable files are explicitly reported by `scripts/validate_company_template.py`; the final validator run passed, proving no current missing/unreadable local asset path exists.
- JSON/schema dependency: malformed JSON, missing fields, malformed routes, unknown reporting targets, missing ritual references, missing division references, and profile compatibility gaps are covered by the validator and its negative tests; no external APIs, network calls, or subprocess dependencies are introduced by this documentation-only change.
- Paperclip runtime/import dependency: still intentionally not asserted as compatible. `company-template/import-notes.md` preserves that `bos-company-template.json` is a draft semantic template and instructs operators to export and compare a target Paperclip sample before producing an actual importable artifact.

## Load Profile
- This task has no runtime service load dimension. The only executable surface is a bounded local CLI validator over a fixed small asset set; at 10x expected template/support-doc size, local filesystem reads and JSON/text parsing would saturate first, but no concurrency, pools, rate limits, pagination, or caching are needed for this repository-level import proof.

## Negative Tests
- `scripts/test_validate_company_template.py::test_missing_required_division_field_reports_division_and_field` covers missing required division fields.
- `scripts/test_validate_company_template.py::test_missing_agent_profile_reports_referenced_path` covers missing referenced AGENTS.md files.
- `scripts/test_validate_company_template.py::test_malformed_route_reports_route_context_and_bad_target` covers malformed and unknown route targets.
- `scripts/test_validate_company_template.py::test_org_chart_compatibility_gap_reports_missing_division` covers cross-file compatibility drift.
- `scripts/test_validate_company_template.py::test_exactly_seven_divisions_boundary` covers the seven-division boundary and missing canonical division ids.

## Verification

`python3 scripts/validate_company_template.py` passes on the repository package after the import-notes update. `python3 scripts/test_validate_company_template.py` passes all six validator tests, including negative coverage for missing fields, missing profiles, malformed routes, org-chart drift, and division-count boundaries. A corrected local audit script also confirmed seven division ids, all profile paths exist and mention their ids, route targets cover all seven divisions, and the template rituals remain listed.

## Verification Evidence

| # | Command | Exit Code | Verdict | Duration |
|---|---------|-----------|---------|----------|
| 1 | `python3 scripts/validate_company_template.py` | 0 | ✅ pass | 58ms |
| 2 | `python3 scripts/test_validate_company_template.py` | 0 | ✅ pass | 103ms |
| 3 | `python3 - <<'PY'  # audit template/support asset consistency summary` | 0 | ✅ pass | 35ms |

## Deviations

No validator-exposed template or profile-reference gaps existed, so `company-template/bos-company-template.json` and `agents/README.md` were validated but intentionally left unchanged. An initial ad-hoc audit command over-escaped its route regex and produced an empty route-target summary; it was immediately rerun with the corrected pattern and passed.

## Known Issues

None.

## Files Created/Modified

- `company-template/import-notes.md`
- `company-template/bos-company-template.json`
- `agents/README.md`
- `scripts/validate_company_template.py`
- `scripts/test_validate_company_template.py`
