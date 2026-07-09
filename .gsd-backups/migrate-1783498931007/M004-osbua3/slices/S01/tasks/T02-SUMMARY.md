---
id: T02
parent: S01
milestone: M004-osbua3
key_files:
  - README.md
  - 00_START_HERE_FOR_NEW_AI_AGENT.md
  - HANDOFF_PROMPT_FOR_NEW_AI_AGENT.md
  - BOS_M002_DEVELOPMENT_HANDOFF.md
  - HANDOFF_REAL_PAPERCLIP_IMPORT_TEST.md
  - MANIFEST.md
  - scripts/validate_handoff.py
  - scripts/test_validate_handoff.py
key_decisions:
  - v1.4.1 doctrine and protocol markdown is the canonical first-read package for new agents; M001/M002/v1.2 materials remain historical where they conflict.
  - `scripts/validate_handoff.py` now treats MANIFEST.md size/SHA256 rows as the package staleness surface and excludes hidden local tooling/state paths from generated inventory.
duration: 
verification_result: passed
completed_at: 2026-05-30T16:56:31.074Z
blocker_discovered: false
---

# T02: Refreshed the handoff entrypoints and manifest so v1.4.1 is the canonical first-read doctrine package, with validator enforcement for missing and stale inventory files.

**Refreshed the handoff entrypoints and manifest so v1.4.1 is the canonical first-read doctrine package, with validator enforcement for missing and stale inventory files.**

## What Happened

Updated the root onboarding path so new agents start with the v1.4.1 doctrine package before reading historical M001/M002 runtime material. `README.md`, `00_START_HERE_FOR_NEW_AI_AGENT.md`, and `HANDOFF_PROMPT_FOR_NEW_AI_AGENT.md` now put `docs/BOS_Light_v1_4_1_*.md` and `skills/SKILL_*.md` first, explain the active seven-division ownership model, and preserve older v1.2/M002 files as historical context where conflicts exist. Added canonical-doctrine warning banners to `BOS_M002_DEVELOPMENT_HANDOFF.md` and `HANDOFF_REAL_PAPERCLIP_IMPORT_TEST.md` so runtime handoff readers preserve their proof boundaries while using v1.4.1 for ownership, permissions, trust boundaries, external IO routing and A12-A20 acceptance. Replaced `scripts/validate_handoff.py` with a structured, testable validator that checks root entrypoints, original baseline files, all five v1.4.1 doctrine docs, all seven v1.4.1 skill protocols, required content terms, and `MANIFEST.md` size/SHA256 rows. The validator now reports explicit `Missing required file`, `Stale or incomplete content`, and `Stale manifest` failures instead of only checking the original baseline. Regenerated `MANIFEST.md` through the validator, with hidden tool/state paths excluded so the manifest remains package-scoped. Added `scripts/test_validate_handoff.py` with inline temporary fixtures for positive validation and negative cases.

Failure Modes (Q5): this task depends on the local filesystem and Python subprocess execution only. Missing required files are accumulated and reported with explicit paths; empty files are reported; malformed/no-row manifests are reported; missing manifest entries, size mismatches and SHA256 mismatches are reported per file; stale entrypoint/package content is reported by file and missing term. Verification subprocess failures bubble through non-zero exits, as seen during the initial case-sensitive term check that was fixed before final verification.

Load Profile (Q6): no production runtime load path was added. The only load dimension is local validator runtime over repository files. Hashing streams files in 1 MiB chunks instead of reading large package artifacts into memory, and manifest generation excludes hidden/tooling/state paths such as `.gsd`, `.agents`, `.opencode` and `.bg-shell` to avoid accidental state/tool-cache inventory growth.

Negative Tests (Q7): `scripts/test_validate_handoff.py` covers a valid inline fixture, a missing v1.4.1 skill file, a stale v1.4.1 manifest hash after file mutation, and an entrypoint missing the v1.4.1 pointer while keeping the manifest current to isolate content-staleness detection.

## Verification

Ran validator unit tests, Python syntax compilation, and the required slice-level verification command. `python3 -m unittest scripts/test_validate_handoff.py` passed 4 tests including negative coverage. `python3 -m py_compile scripts/validate_handoff.py scripts/test_validate_handoff.py` passed. `python3 scripts/validate_handoff.py` passed and reported 27 required files including 12 v1.4.1 package files.

## Verification Evidence

| # | Command | Exit Code | Verdict | Duration |
|---|---------|-----------|---------|----------|
| 1 | `python3 -m unittest scripts/test_validate_handoff.py` | 0 | ✅ pass (4 tests, including missing file, stale hash and stale entrypoint negative cases) | 121ms |
| 2 | `python3 -m py_compile scripts/validate_handoff.py scripts/test_validate_handoff.py` | 0 | ✅ pass | 58ms |
| 3 | `python3 scripts/validate_handoff.py` | 0 | ✅ pass (27 required files; 12 v1.4.1 package files) | 65ms |

## Deviations

Added `scripts/test_validate_handoff.py` to satisfy the task's negative-test gate even though it was not listed among the seven expected output files. During manifest regeneration, tightened generation to exclude hidden tool/state directories so the manifest stayed scoped to handoff package content rather than local agent/tool caches.

## Known Issues

None.

## Files Created/Modified

- `README.md`
- `00_START_HERE_FOR_NEW_AI_AGENT.md`
- `HANDOFF_PROMPT_FOR_NEW_AI_AGENT.md`
- `BOS_M002_DEVELOPMENT_HANDOFF.md`
- `HANDOFF_REAL_PAPERCLIP_IMPORT_TEST.md`
- `MANIFEST.md`
- `scripts/validate_handoff.py`
- `scripts/test_validate_handoff.py`
