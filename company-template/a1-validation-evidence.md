# A1 Validation Evidence: Company Template Import Readiness

This artifact captures the repository-local proof for acceptance test **A1** from `docs/06_ACCEPTANCE_TESTS.md`:

> Fresh Paperclip company + imported BOS template => 7 agents created with AGENTS.md; org chart rendered.

## Exact Local Validation Command

Run from the repository root:

```bash
python3 scripts/validate_company_template.py
```

Captured successful output during `M004-osbua3 / S02 / T03`:

```text
Company template OK: 7 divisions, 7 agent profiles, org chart, routing, rituals, and agents README are compatible.
```

## Validated Assets

The local validator inspected the BOS Light company package without calling Paperclip or any external service:

- `company-template/bos-company-template.json`
  - required top-level fields: `schema_version`, `name`, `mission`, `divisions`, `routing_rules`, `rituals`
  - exactly seven canonical BOS Light division ids
  - valid `reports_to` references
  - valid `agent_profile` paths
  - valid routing-rule target references
- `agents/Div7_MissionControl/AGENTS.md`
- `agents/Div1_HCO/AGENTS.md`
- `agents/Div2_MasterPlanner/AGENTS.md`
- `agents/Div3_Treasury/AGENTS.md`
- `agents/Div4_Production/AGENTS.md`
- `agents/Div5_QualificationsLibraryLearning/AGENTS.md`
- `agents/Div6_External/AGENTS.md`
- `agents/README.md`
- `company-template/org-chart.mmd`
- `company-template/task-routing.md`
- `company-template/rituals.md`

## What This Proves

This proves the draft BOS Light organization package is internally consistent and import-ready at the repository asset level:

- the semantic company template defines the seven expected BOS Light divisions;
- every division points to an existing `AGENTS.md` profile;
- each referenced profile mentions its own division id;
- reporting relationships do not point to missing divisions or self-reference;
- routing rules only reference known BOS Light division ids;
- support documents for the org chart, task routing, rituals, and agents overview mention the expected division/ritual concepts.

This also preserves the S01 slice requirement that validation output identifies concrete file/field/route/compatibility failures locally and deterministically, without printing secrets or depending on external services.

## What This Does Not Prove

This does **not** prove that `company-template/bos-company-template.json` currently matches the live Paperclip import/export schema. The template remains a draft semantic package until validated against a real Paperclip instance. S02's runtime health report (`docs/08_RUNTIME_CAPABILITY_HEALTH.md`) records the current status as `company_template.import_export=unvalidated` and `agents.syntax=unvalidated` because there is no live Paperclip runtime evidence.

## Remaining S02 Unknown

S02 published `docs/08_RUNTIME_CAPABILITY_HEALTH.md` to make the live Paperclip import/export unknown explicit. The unknown is **not retired** yet: C4 and C5 remain `unvalidated` until an actual Paperclip company export/import path and AGENTS.md syntax validator confirm the current runtime schema. This preserves the S01 proof as local readiness evidence only.

## Failure Modes

- Local filesystem dependency: missing or unreadable JSON, markdown support assets, or `AGENTS.md` profiles are expected to fail `scripts/validate_company_template.py` with the relative file path and context.
- Local JSON/schema dependency: malformed JSON, missing required fields, malformed routing targets, unknown division ids, and cross-file compatibility gaps are expected to fail with file, field, route, or division context.
- External API/network dependency: none for this A1 local proof; live Paperclip compatibility is explicitly deferred to S02 rather than inferred.

## Load Profile

This evidence has no runtime load dimension. The validator is a bounded local CLI over a small fixed asset set; at 10x the expected template/support-document size, local filesystem reads and JSON/text parsing would saturate first, but no service pools, rate limits, pagination, or caching are required for this repository-level proof.

## Negative Tests

Negative coverage for the validator lives in `scripts/test_validate_company_template.py`:

- `test_missing_required_division_field_reports_division_and_field` covers missing required division fields.
- `test_missing_agent_profile_reports_referenced_path` covers missing referenced AGENTS profiles.
- `test_malformed_route_reports_route_context_and_bad_target` covers malformed and unknown route targets.
- `test_org_chart_compatibility_gap_reports_missing_division` covers cross-file compatibility drift.
- `test_exactly_seven_divisions_boundary` covers the seven-division boundary and missing canonical ids.
