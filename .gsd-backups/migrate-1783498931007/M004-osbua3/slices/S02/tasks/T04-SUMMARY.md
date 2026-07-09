---
id: T04
parent: S02
milestone: M004-osbua3
key_files:
  - scripts/validate_company_template.py
  - scripts/test_validate_company_template.py
  - scripts/test_probe_paperclip_runtime.py
key_decisions:
  - The company-template validator now enforces the v1.4.1 division map as an exact active contract for profile paths, reporting lines, and routing-rule strings instead of allowing any route that references known divisions.
duration: 
verification_result: passed
completed_at: 2026-05-30T17:12:11.335Z
blocker_discovered: false
---

# T04: Tightened company-template validation to reject legacy profile paths and stale v1.4.1 routing semantics with exact errors.

**Tightened company-template validation to reject legacy profile paths and stale v1.4.1 routing semantics with exact errors.**

## What Happened

Updated `scripts/validate_company_template.py` so the active v1.4.1 company-template contract is explicit rather than permissive: canonical division IDs now map to exact AGENTS.md profile paths, expected reporting lines, and expected routing-rule strings. Legacy v1.3-style division IDs now receive a dedicated compatibility error, stale profile paths report both the found path and the expected canonical profile, and stale route semantics report the exact route key plus expected/found route strings.

Updated `scripts/test_validate_company_template.py` with negative coverage for inactive legacy division IDs, stale legacy profile paths that otherwise exist, and routes that only differ semantically while still referencing valid divisions. Updated `scripts/test_probe_paperclip_runtime.py` so probe output proves these validator failures are surfaced through `local_contract.company_template.errors` with exact stale profile and stale route context.

## Failure Modes

- Filesystem dependency: the validator reads the template, support docs, and AGENTS.md files. Missing/unreadable files continue to produce path-specific validation errors; stale profile paths now additionally identify the canonical expected path when the path is non-canonical.
- JSON/template dependency: malformed JSON, missing fields, wrong division counts, legacy division IDs, incorrect reporting lines, malformed routes, missing routing rules, unknown extra routing rules, and stale route semantics bubble as deterministic error strings from `scripts/validate_company_template.py`.
- Probe dependency: `scripts/probe_paperclip_runtime.py` loads the validator dynamically and reports local contract errors without starting Paperclip; tests verify stale profile/route failures appear in the probe report rather than collapsing into generic health output.
- Network/API/subprocess dependency: no network or external API dependency was introduced. Verification subprocess failures bubble through non-zero command exits.

## Load Profile

No runtime load dimension was introduced. This remains a bounded local validator/probe over a seven-division JSON template and small Markdown/profile files. At 10x expected local asset size, filesystem reads and JSON/text parsing would saturate first; no service pool, rate limiter, pagination, or cache is required.

## Negative Tests

- `scripts/test_validate_company_template.py::test_legacy_division_id_is_rejected_as_inactive_contract` asserts legacy IDs are rejected as inactive and the missing canonical ID is named.
- `scripts/test_validate_company_template.py::test_stale_agent_profile_path_reports_expected_profile` asserts an existing stale legacy profile path reports the exact found and expected profile paths.
- `scripts/test_validate_company_template.py::test_unexpected_route_semantics_report_expected_route` asserts a semantically stale route with valid division tokens reports the exact expected/found route.
- Existing validator negative tests still cover missing required division fields, missing profile files, malformed/unknown route segments, org-chart compatibility gaps, and the exactly-seven-divisions boundary.
- `scripts/test_probe_paperclip_runtime.py::test_local_contract_reports_stale_profile_path_exactly` and `test_local_contract_reports_stale_route_exactly` assert probe-local-contract failures preserve exact stale profile/route diagnostics.

## Verification

Ran the required task verification `python3 scripts/test_validate_company_template.py && python3 scripts/test_probe_paperclip_runtime.py`; all validator and probe tests passed after the fixture helper was made idempotent for stale-profile fixtures. Also ran `python3 scripts/validate_company_template.py` against the active repository template; it passed under the tightened exact v1.4.1 contract.

## Verification Evidence

| # | Command | Exit Code | Verdict | Duration |
|---|---------|-----------|---------|----------|
| 1 | `python3 scripts/test_validate_company_template.py && python3 scripts/test_probe_paperclip_runtime.py` | 0 | ✅ pass | 233ms |
| 2 | `python3 scripts/validate_company_template.py` | 0 | ✅ pass | 52ms |

## Deviations

None.

## Known Issues

None.

## Files Created/Modified

- `scripts/validate_company_template.py`
- `scripts/test_validate_company_template.py`
- `scripts/test_probe_paperclip_runtime.py`
