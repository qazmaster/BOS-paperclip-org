---
id: S01
parent: M001-bo1jcm
milestone: M001-bo1jcm
provides:
  - Validated seven-division BOS Light semantic company-template package.
  - Repeatable local validation command for downstream capability checks.
  - A1 evidence artifact documenting assets, proof boundary, and Paperclip runtime unknowns.
requires:
  []
affects:
  - S02 consumes the validated template package and must retire live Paperclip import/export/runtime unknowns.
  - S06 consumes the A1 evidence as part of the integrated A1-A10 baseline demo.
key_files:
  - scripts/validate_company_template.py
  - scripts/test_validate_company_template.py
  - company-template/bos-company-template.json
  - company-template/import-notes.md
  - company-template/a1-validation-evidence.md
  - agents/README.md
  - agents/Div1_Executive/AGENTS.md
  - agents/Div2_MasterPlanner/AGENTS.md
  - agents/Div3_Production/AGENTS.md
  - agents/Div4_Operations/AGENTS.md
  - agents/Div5_Qualifications/AGENTS.md
  - agents/Div6_Resources/AGENTS.md
  - agents/Div7_Strategy/AGENTS.md
  - scripts/validate_handoff.py
key_decisions:
  - Keep S01 proof deterministic, repository-local, and standard-library-only so it can run before Paperclip runtime/import tooling exists.
  - Preserve draft import caveats instead of claiming live Paperclip schema compatibility from local validation.
  - Treat live Paperclip import/export compatibility as an explicit S02 unknown rather than simulating runtime success.
patterns_established:
  - Local import-readiness checks accumulate contextual validation errors with file, division, field, route, and compatibility context.
  - Negative validator tests use inline fixture repositories via `--root`, avoiding ignored local state and external dependencies.
  - A1 evidence separates what the repository contract proves from what runtime capability validation must still prove.
observability_surfaces:
  - CLI health signal: `python3 scripts/validate_company_template.py` exit 0 plus OK line for seven divisions/profiles/org chart/routing/rituals/README compatibility.
  - CLI failure signal: non-zero validator exit with contextual messages for missing fields, missing files, malformed routes, unknown targets, or compatibility gaps.
  - Handoff health signal: `python3 scripts/validate_handoff.py` exit 0.
drill_down_paths:
  - .gsd/milestones/M001-bo1jcm/slices/S01/tasks/T01-SUMMARY.md
  - .gsd/milestones/M001-bo1jcm/slices/S01/tasks/T02-SUMMARY.md
  - .gsd/milestones/M001-bo1jcm/slices/S01/tasks/T03-SUMMARY.md
duration: ""
verification_result: passed
completed_at: 2026-05-28T02:53:44.296Z
blocker_discovered: false
---

# S01: Company Template Import Proof

**Validated the BOS Light seven-division company template as a deterministic, repository-local import-readiness package with A1 evidence and explicit Paperclip runtime caveats.**

## What Happened

S01 converted the draft BOS Light company-template package into a validated local contract for A1 evidence. The work added `scripts/validate_company_template.py`, a standard-library-only validator that parses `company-template/bos-company-template.json`, enforces exactly the seven canonical division ids, verifies required division fields, checks `agent_profile` paths and profile compatibility, validates `reports_to` and routing targets, and confirms org chart, routing, rituals, and `agents/README.md` compatibility.

The template alignment pass ran the validator against the existing assets and found no concrete template/profile-reference gaps, so the JSON template and AGENTS index were intentionally left unchanged rather than weakening the source of truth. `company-template/import-notes.md` now documents the local validation command while preserving the draft-status warning that live Paperclip import/export schema compatibility is not yet proven.

A1 evidence was captured in `company-template/a1-validation-evidence.md`. The artifact names the exact validation command, lists the validated assets, documents what the local import-readiness proof covers, and states the remaining S02 unknown: validating a real Paperclip export/import path and schema mapping before runtime compatibility is trusted.

## Operational Readiness

- Health signal: `python3 scripts/validate_company_template.py` exits 0 and prints `Company template OK: 7 divisions, 7 agent profiles, org chart, routing, rituals, and agents README are compatible.` The broader handoff health signal is `python3 scripts/validate_handoff.py` exiting 0.
- Failure signal: either validator exits non-zero with contextual messages naming the file, division id, missing field, malformed route, missing profile, or compatibility gap. These failures should block import-readiness claims and any downstream runtime capability work that consumes the S01 assets.
- Recovery procedure: inspect the named file/division/field/route in the validator error, restore the required BOS Light division/profile/routing/ritual reference, rerun `python3 scripts/validate_company_template.py`, then rerun `python3 scripts/validate_handoff.py` before handing assets to S02.
- Monitoring gaps: this slice has no runtime service, dashboard, alerting, or live Paperclip import monitor. The validator is suitable for manual and CI-style repository checks only; live Paperclip import/export compatibility remains an S02 capability-health responsibility.

## Verification

Fresh closeout verification was run through `gsd_exec` as required:

- `python3 scripts/validate_company_template.py` — exit 0; output: `Company template OK: 7 divisions, 7 agent profiles, org chart, routing, rituals, and agents README are compatible.` Evidence id: `e7fb1ab1-5b44-44bd-ac57-75c19f1e28af`.
- `python3 scripts/validate_handoff.py` — exit 0; output: `Handoff package OK: /home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm`. Evidence id: `c858c024-9eaa-4067-9601-236d2e02a0e4`.
- `python3 scripts/test_validate_company_template.py` — exit 0; six unittest cases passed, covering valid fixtures plus missing division fields, missing AGENTS profiles, malformed/unknown routes, org-chart drift, and seven-division boundary behavior. Evidence id: `05cfe74e-a1c9-426f-afd6-051da9f09fb5`.
- A1 evidence artifact check — exit 0; confirmed `company-template/a1-validation-evidence.md` contains the exact validation command, validated assets, proof boundary, and S02 Paperclip import/export unknown. Evidence id: `dc14b8ab-2e6e-42ab-b19b-1bd0efee46f0`.

All planned slice-level checks passed, including the handoff validator and company-template validator. No source changes were made during closeout.

## Requirements Advanced

- R004 — Explicitly documented that live Paperclip import/export schema compatibility remains untrusted until S02 runtime capability validation.
- R011 — Added contract-level proof and A1 evidence for the first milestone demonstration baseline.

## Requirements Validated

- R001 — `scripts/validate_company_template.py` validates exactly seven canonical BOS Light divisions, referenced profiles, org chart, routing, rituals, and agents README compatibility within the repository-local import-readiness contract.
- R002 — The validator and A1 evidence confirm division profiles and support assets preserve local role semantics, routing, rituals, and guardrail references for all seven BOS Light divisions.

## New Requirements Surfaced

- None.

## Requirements Invalidated or Re-scoped

None.

## Operational Readiness

None.

## Deviations

T01 added `scripts/test_validate_company_template.py` for durable negative coverage beyond the originally listed validator file. T02 found no validator-exposed template/profile-reference gaps, so `company-template/bos-company-template.json` and `agents/README.md` were validated but intentionally left unchanged. No closeout deviations.

## Known Limitations

Live Paperclip import/export schema compatibility is not proven by S01 and remains an explicit S02 runtime capability-health unknown. There is no runtime monitoring surface because this slice delivers local repository validators and documentation, not a running service.

## Follow-ups

S02 must validate the actual Paperclip export/import path, AGENTS.md compatibility behavior, runtime capability set, and any schema mapping needed to turn the locally validated semantic template into a live Paperclip import artifact.

## Files Created/Modified

- `scripts/validate_company_template.py` — Added deterministic repository-level company-template validator.
- `scripts/test_validate_company_template.py` — Added unittest coverage for valid and malformed template/profile/routing/org-chart fixtures.
- `company-template/import-notes.md` — Documented local validation command while preserving draft Paperclip runtime/schema caveats.
- `company-template/a1-validation-evidence.md` — Added reusable A1 validation evidence with command, validated assets, proof boundary, and S02 unknown.
