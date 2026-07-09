---
id: T03
parent: S06
milestone: M001-bo1jcm
key_files:
  - docs/10_A1_A10_DEMO.md
  - docs/06_ACCEPTANCE_TESTS.md
  - docs/08_RUNTIME_CAPABILITY_HEALTH.md
  - docs/09_BACKLOG.md
  - scripts/validate_a1_a10_demo_docs.py
  - scripts/test_validate_a1_a10_demo_docs.py
key_decisions:
  - Keep the A1-A10 documentation validator standard-library only and fail-closed on missing command, A-step, fixture-boundary, and gap-ledger references.
  - Treat the integrated demo runbook as fixture-first evidence only; live Paperclip runtime support remains unconfirmed until capability-matrix proof fields are populated from a real runtime.
duration: 
verification_result: passed
completed_at: 2026-05-28T06:39:59.488Z
blocker_discovered: false
---

# T03: Published the A1-A10 baseline demo runbook, live runtime gap ledger, docs cross-references, and a deterministic documentation validator with negative tests.

**Published the A1-A10 baseline demo runbook, live runtime gap ledger, docs cross-references, and a deterministic documentation validator with negative tests.**

## What Happened

Created `docs/10_A1_A10_DEMO.md` as the S06 runbook for reproducing `python3 scripts/run_a1_a10_demo.py`, mapping A1-A10 to evidence paths, expected fixture outputs, runtime posture fields, and live runtime smoke instructions. The runbook explicitly preserves the fixture proof boundary (`native_support_confirmed: false`) and records a live runtime gap ledger for unvalidated Paperclip surfaces instead of promoting adapter-seam fixture success to runtime support.

Updated `docs/06_ACCEPTANCE_TESTS.md`, `docs/08_RUNTIME_CAPABILITY_HEALTH.md`, and `docs/09_BACKLOG.md` so future agents can find the integrated demo runner, runbook, gap ledger, runtime posture fields, and remaining live Paperclip proof blockers from the existing acceptance/runtime/backlog surfaces. Added `scripts/validate_a1_a10_demo_docs.py`, a standard-library documentation validator that checks required runbook sections, A1-A10 labels, runner command references, fixture proof boundary wording, output field references, and gap-ledger headings across the docs. Added `scripts/test_validate_a1_a10_demo_docs.py` with negative coverage for missing A-step entries, fixture boundary wording, gap-ledger heading, and runner command references.

Failure Modes (Q5): documented and validated filesystem/doc drift, malformed JSON/output, subprocess non-zero exits, subprocess timeout behavior, optional runtime path gaps, and documentation drift. The demo runner already surfaces command labels, phases, exit codes, bounded stdout/stderr digests, and gap-ledger entries; the new docs validator fails closed on missing runbook sections or stale command/boundary/gap references.

Load Profile (Q6): documented that this task has a bounded local CLI/docs-validation load profile. At 10x seed size, TypeScript fixture/Vitest subprocess runtime and JSON output size are the likely first saturation points; protections are per-subprocess timeout, bounded digests, local-only inputs, no background service, and no unbounded Paperclip scans.

Negative Tests (Q7): added `scripts/test_validate_a1_a10_demo_docs.py` to mutate inline tracked fixtures and assert failures for missing A-step entry, missing fixture proof boundary wording, missing live runtime gap-ledger heading, and missing runner command references.

## Verification

Ran the new docs validator, its negative unittest coverage, the existing runtime capability validator, and the full integrated A1-A10 baseline demo. All final checks passed. The integrated demo returned `status: passed` with five seed issues and an honest-unvalidated runtime posture.

## Verification Evidence

| # | Command | Exit Code | Verdict | Duration |
|---|---------|-----------|---------|----------|
| 1 | `python3 scripts/validate_a1_a10_demo_docs.py` | 0 | ✅ pass | 80ms |
| 2 | `python3 -m unittest scripts/test_validate_a1_a10_demo_docs.py` | 0 | ✅ pass | 83ms |
| 3 | `python3 scripts/validate_runtime_capabilities.py` | 0 | ✅ pass | 66ms |
| 4 | `python3 scripts/run_a1_a10_demo.py` | 0 | ✅ pass | 1373ms |

## Deviations

Added `scripts/test_validate_a1_a10_demo_docs.py` in addition to the planned validator so Q7 negative documentation drift coverage is executable.

## Known Issues

Live Paperclip runtime support remains unvalidated by design; the runbook and gap ledger document the remaining blockers.

## Files Created/Modified

- `docs/10_A1_A10_DEMO.md`
- `docs/06_ACCEPTANCE_TESTS.md`
- `docs/08_RUNTIME_CAPABILITY_HEALTH.md`
- `docs/09_BACKLOG.md`
- `scripts/validate_a1_a10_demo_docs.py`
- `scripts/test_validate_a1_a10_demo_docs.py`
