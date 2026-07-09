# S01: Import Doctrine Package — UAT

**Milestone:** M004-osbua3
**Written:** 2026-05-30T16:59:12.134Z

# UAT: S01 Import Doctrine Package

## UAT Type
Contract and documentation-inventory validation.

## Preconditions
- The repository checkout is at milestone `M004-osbua3` after S01 task execution.
- No live Paperclip runtime is required; this UAT validates static handoff contract files only.

## Steps
1. Confirm the canonical package files exist by running:
   `test -f docs/BOS_Light_v1_4_1_CANONICAL_ORG.md && test -f docs/BOS_Light_v1_4_1_Acceptance_Tests_A12_A20.md && test -f skills/SKILL_EXTERNAL_IO_GATEWAY.md`.
2. Run `python3 scripts/validate_handoff.py`.
3. Run `python3 -m unittest scripts/test_validate_handoff.py`.
4. Inspect the top-level onboarding path (`README.md`, `00_START_HERE_FOR_NEW_AI_AGENT.md`, `HANDOFF_PROMPT_FOR_NEW_AI_AGENT.md`, `BOS_M002_DEVELOPMENT_HANDOFF.md`, `HANDOFF_REAL_PAPERCLIP_IMPORT_TEST.md`, and `MANIFEST.md`) and confirm each points readers to the v1.4.1 doctrine package before relying on legacy/M002 historical material.
5. Inspect `scripts/validate_handoff.py` and confirm it enumerates all five `docs/BOS_Light_v1_4_1_*.md` files and all seven `skills/SKILL_*.md` protocol files.

## Expected Outcomes
- Step 1 exits 0.
- Step 2 exits 0 and reports `Handoff package OK` with 27 required files and 12 v1.4.1 package files.
- Step 3 exits 0 with 4 passing validator tests, including negative coverage for missing package files, stale manifest hashes, and stale entrypoint content.
- Entrypoint docs identify v1.4.1 as the canonical active doctrine package and describe older M001/M002/v1.2/v1.3 content as historical/deprecated where conflicts exist.
- The validator fails closed for missing or stale package inventory and does not execute imported markdown or depend on network/live Paperclip surfaces.

## Edge Cases
- If a v1.4.1 package file is removed, `validate_handoff.py` should fail with a path-specific missing-file message.
- If a package file changes without a manifest refresh, `validate_handoff.py` should fail with a stale manifest size/SHA256 mismatch.
- If an entrypoint stops pointing to v1.4.1, validator tests should catch stale entrypoint content.
- If live Paperclip runtime proof is absent, this UAT still passes because S01 intentionally proves only static doctrine/package inventory, not runtime capability.

## Operational Readiness
- Health signal: scheduled or manual `python3 scripts/validate_handoff.py` success with the `Handoff package OK` inventory count.
- Failure signal: non-zero validator output naming missing, stale-content, or stale-manifest paths.
- Recovery: restore/regenerate the named package or entrypoint file, refresh manifest rows, rerun validator unit tests, then rerun the handoff validator.
- Monitoring gap: no runtime monitor exists for this static package slice; downstream slices must continue runtime validation separately.
