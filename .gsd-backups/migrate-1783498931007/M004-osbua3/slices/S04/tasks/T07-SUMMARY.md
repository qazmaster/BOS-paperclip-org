---
id: T07
parent: S04
milestone: M004-osbua3
key_files:
  - docs/05_PERSISTENCE_MATRIX.md
  - docs/06_ACCEPTANCE_TESTS.md
  - MANIFEST.md
key_decisions:
  - Kept A12-A20 as repo-local/fixture-first acceptance evidence unless the runtime capability matrix cites live Paperclip runtime proof for a specific surface.
duration: 
verification_result: passed
completed_at: 2026-05-31T10:05:35.716Z
blocker_discovered: false
---

# T07: Updated persistence and acceptance docs to expose the v1.4.1 A12-A20 doctrine, Div1/Div5/Div6 routing boundaries, and conservative fixture-first runtime proof boundary.

**Updated persistence and acceptance docs to expose the v1.4.1 A12-A20 doctrine, Div1/Div5/Div6 routing boundaries, and conservative fixture-first runtime proof boundary.**

## What Happened

Refreshed `docs/05_PERSISTENCE_MATRIX.md` by adding v1.4.1 routing/security persistence rows for HCO routing requests, external IO requests, raw external evidence bundles, sanitized knowledge packets, budget/access/tool grants, staffing/hat requests, HCO circuit-breaker control, and package inventory. Added explicit persistence boundary language that keeps Div6.External as the only external-world actor, routes raw external evidence only back to Div5.QualificationsLibraryLearning, preserves Div1.HCO routing control, and treats A12-A20 as repo-local/fixture-first unless the runtime capability matrix has live version/build proof for a specific surface. Updated `docs/06_ACCEPTANCE_TESTS.md` by extending the acceptance table with A12-A20 and adding a v1.4.1 runtime boundary section that cross-references the canonical A12-A20 doctrine while preserving A1-A11 and A1-A10 demo proof-boundary language. Because both edited docs are manifest-inventoried, updated only their `MANIFEST.md` rows so this task’s file changes do not introduce additional inventory drift.

## Verification

Ran the exact required verification command `python3 scripts/validate_runtime_capabilities.py`; it passed and reported that manifest surfaces, adapter assumptions, and guardrail fields are mapped. Also ran a focused acceptance-doc cross-reference validator with the runtime validator; both passed. A supplemental `python3 scripts/validate_handoff.py` check was attempted after updating the target manifest rows; it failed only on unrelated pre-existing stale manifest rows for files outside this task, so those unrelated rows were left untouched.

## Verification Evidence

| # | Command | Exit Code | Verdict | Duration |
|---|---------|-----------|---------|----------|
| 1 | `python3 scripts/validate_runtime_capabilities.py` | 0 | ✅ pass | 56ms |
| 2 | `python3 scripts/validate_runtime_capabilities.py && python3 scripts/validate_a1_a10_demo_docs.py` | 0 | ✅ pass | 118ms |

## Deviations

Updated `MANIFEST.md` rows for the two target docs because the repository inventory tracks their size and SHA256. No doctrine or runtime-surface scope was expanded beyond the task plan.

## Known Issues

`python3 scripts/validate_handoff.py` currently fails on unrelated stale manifest rows for `docs/04_DATA_CONTRACTS.md`, `agents/Div1_HCO/AGENTS.md`, `company-template/bos-company-template.json`, and `plugin-bos-light/tests/acceptance.test.ts`; those files were outside T07 and were not modified here.

## Files Created/Modified

- `docs/05_PERSISTENCE_MATRIX.md`
- `docs/06_ACCEPTANCE_TESTS.md`
- `MANIFEST.md`
