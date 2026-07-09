---
id: T01
parent: S01
milestone: M001-bo1jcm
key_files:
  - scripts/validate_company_template.py
  - scripts/test_validate_company_template.py
key_decisions:
  - Kept the validator standard-library-only and repository-local so it can run before Paperclip import tooling or external services are configured.
  - Added a `--root` option to make negative tests use inline fixture repositories rather than ignored local state.
duration: 
verification_result: passed
completed_at: 2026-05-28T02:46:37.580Z
blocker_discovered: false
---

# T01: Added a deterministic BOS Light company-template validator with inline negative coverage for malformed import assets.

**Added a deterministic BOS Light company-template validator with inline negative coverage for malformed import assets.**

## What Happened

Created `scripts/validate_company_template.py` as a standard-library-only repository validator. It loads `company-template/bos-company-template.json`, verifies required top-level and division fields, enforces exactly the seven canonical BOS Light division ids, checks each `agent_profile` path exists and mentions its division id, validates `reports_to` targets, parses routing rule targets, and checks org chart, routing, rituals, and `agents/README.md` compatibility without contacting external services or printing asset contents.

Added `scripts/test_validate_company_template.py` with inline fixture repositories and unittest cases for the meaningful negative surface.

## Failure Modes
- Filesystem dependency: missing template/support/profile files are collected as contextual validation errors with the relative file path and field context; unreadable files bubble as validation errors with OS read context.
- JSON dependency: malformed or non-object JSON is reported with `company-template/bos-company-template.json`, line/column where available, and no file contents or secrets.
- Schema/content dependency: missing division fields, unknown reporting targets, malformed routing targets, and cross-file compatibility gaps are reported with division id, route name, or asset path.
- Network/API/subprocess dependencies: none; the validator uses only local filesystem reads and Python standard library parsing.

## Load Profile
- This is a bounded local CLI, not a service with runtime concurrency. At 10x the current expected package size, local filesystem reads and JSON/text parsing would saturate first, but the validator performs one pass over a small fixed asset set and accumulates errors in memory; no pools, rate limits, pagination, or caching are needed for the repository-level import proof.

## Negative Tests
- `scripts/test_validate_company_template.py::test_missing_required_division_field_reports_division_and_field` covers missing required division fields with file, division id, and field context.
- `scripts/test_validate_company_template.py::test_missing_agent_profile_reports_referenced_path` covers missing `agent_profile` files.
- `scripts/test_validate_company_template.py::test_malformed_route_reports_route_context_and_bad_target` covers malformed/unknown routing targets.
- `scripts/test_validate_company_template.py::test_org_chart_compatibility_gap_reports_missing_division` covers cross-file compatibility drift.
- `scripts/test_validate_company_template.py::test_exactly_seven_divisions_boundary` covers the seven-division boundary and missing canonical ids.

## Verification

`python3 scripts/test_validate_company_template.py` ran 6 unittest cases for valid and malformed inline fixtures. `python3 scripts/validate_company_template.py` passed on the current repository package and printed the expected OK inspection line. This also satisfies the slice verification requirement that validation output is local, contextual, and independent of external services.

## Verification Evidence

| # | Command | Exit Code | Verdict | Duration |
|---|---------|-----------|---------|----------|
| 1 | `python3 scripts/test_validate_company_template.py` | 0 | ✅ pass | 136ms |
| 2 | `python3 scripts/validate_company_template.py` | 0 | ✅ pass | 58ms |

## Deviations

Added `scripts/test_validate_company_template.py` in addition to the planned validator so the mandatory negative-test gate has durable coverage.

## Known Issues

None.

## Files Created/Modified

- `scripts/validate_company_template.py`
- `scripts/test_validate_company_template.py`
