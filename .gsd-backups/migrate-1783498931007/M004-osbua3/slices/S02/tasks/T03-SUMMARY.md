---
id: T03
parent: S02
milestone: M004-osbua3
key_files:
  - agents/README.md
  - company-template/a1-validation-evidence.md
  - scripts/validate_handoff.py
  - MANIFEST.md
  - agents/Div1_Executive/AGENTS.md (removed)
  - agents/Div3_Production/AGENTS.md (removed)
  - agents/Div4_Operations/AGENTS.md (removed)
  - agents/Div5_Qualifications/AGENTS.md (removed)
  - agents/Div6_Resources/AGENTS.md (removed)
  - agents/Div7_Strategy/AGENTS.md (removed)
key_decisions:
  - Deprecated v1.3 profile directories were removed rather than retained as aliases so repository-level profile discovery exposes only active v1.4.1 divisions.
duration: 
verification_result: passed
completed_at: 2026-05-30T17:07:53.827Z
blocker_discovered: false
---

# T03: Replaced repository-facing agent profile exposure with the v1.4.1 division map and removed deprecated v1.3 profile directories.

**Replaced repository-facing agent profile exposure with the v1.4.1 division map and removed deprecated v1.3 profile directories.**

## What Happened

The active company template, org chart, routing doc, rituals doc, and seven v1.4.1 AGENTS.md profiles were already aligned to Div7.MissionControl, Div1.HCO, Div2.MasterPlanner, Div3.Treasury, Div4.Production, Div5.QualificationsLibraryLearning, and Div6.External at task start. I verified that baseline before making repository-facing cleanup changes.

I then made the profile exposure match the active template: `agents/README.md` now lists the canonical active profile paths explicitly, the A1 validation evidence artifact now records the v1.4.1 profile paths instead of the deprecated profile folders, and `scripts/validate_handoff.py` now requires the seven active v1.4.1 profile files. I removed the deprecated profile directories `agents/Div1_Executive`, `agents/Div3_Production`, `agents/Div4_Operations`, `agents/Div5_Qualifications`, `agents/Div6_Resources`, and `agents/Div7_Strategy` so agent discovery no longer exposes old division names as peer canonical profiles. Finally, I regenerated `MANIFEST.md` through `scripts/validate_handoff.py --write-manifest`.

## Failure Modes

- Local filesystem dependency: missing or unreadable company-template assets, agent profiles, README, or manifest entries are surfaced by `scripts/validate_company_template.py` and `scripts/validate_handoff.py` with file-specific errors.
- Local JSON/Markdown dependency: malformed JSON, missing division fields, stale/missing agent profile paths, malformed routes, or support-asset compatibility gaps bubble as deterministic validation failures rather than generic template errors.
- Network/API/subprocess dependency: no network or external API dependency was introduced. Subprocess verification failures bubble via non-zero command exits.

## Load Profile

No runtime load dimension was introduced. This task changes bounded repository assets and deterministic local validators; at 10x the current template/support-document size, local file reads and JSON/text parsing would saturate first, with no service pool, rate limiter, pagination, or cache required.

## Negative Tests

Negative coverage remains in `scripts/test_validate_company_template.py`: missing required division fields, missing AGENTS.md profile paths, malformed/unknown route targets, org-chart compatibility gaps, and the exactly-seven-divisions boundary all passed in the final verification run.

## Verification

Ran the required slice verification `python3 scripts/validate_company_template.py`, which confirmed 7 divisions, 7 agent profiles, org chart, routing, rituals, and agents README compatibility. Also ran `python3 scripts/test_validate_company_template.py` to verify negative validator behavior and `python3 scripts/validate_handoff.py` to confirm the regenerated manifest and v1.4.1 profile inventory are consistent. A final profile inventory check showed exactly the seven active profile directories: Div1_HCO, Div2_MasterPlanner, Div3_Treasury, Div4_Production, Div5_QualificationsLibraryLearning, Div6_External, and Div7_MissionControl.

## Verification Evidence

| # | Command | Exit Code | Verdict | Duration |
|---|---------|-----------|---------|----------|
| 1 | `python3 scripts/validate_company_template.py && python3 scripts/test_validate_company_template.py && python3 scripts/validate_handoff.py` | 0 | ✅ pass | 210ms |
| 2 | `python3 - <<'PY'
from pathlib import Path
print('profile_dirs=', ', '.join(p.name for p in sorted(Path('agents').glob('Div*')) if p.is_dir()))
PY` | 0 | ✅ pass | 32ms |

## Deviations

The core company template JSON, org chart, routing doc, rituals doc, and active v1.4.1 profile contents were already aligned when inspected, so the implementation focused on removing deprecated profile exposure, updating repository-facing evidence/inventory, and regenerating the manifest rather than rewriting already-correct template content.

## Known Issues

Historical handoff/runtime-evidence/migration documents still mention deprecated division names as historical context. They were not changed because the task scope was the active company template/profile exposure, and the active template, agents README, evidence artifact, handoff validator baseline, and manifest no longer point at the deprecated profile directories.

## Files Created/Modified

- `agents/README.md`
- `company-template/a1-validation-evidence.md`
- `scripts/validate_handoff.py`
- `MANIFEST.md`
- `agents/Div1_Executive/AGENTS.md (removed)`
- `agents/Div3_Production/AGENTS.md (removed)`
- `agents/Div4_Operations/AGENTS.md (removed)`
- `agents/Div5_Qualifications/AGENTS.md (removed)`
- `agents/Div6_Resources/AGENTS.md (removed)`
- `agents/Div7_Strategy/AGENTS.md (removed)`
