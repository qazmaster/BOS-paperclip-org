---
id: T02
parent: S01
milestone: M002
key_files:
  - .gsd/worktrees/M002/PAPERCLIP_LIVE_VALIDATION_REPORT.md
key_decisions:
  - (none)
duration: 
verification_result: passed
completed_at: 2026-05-28T12:38:30.018Z
blocker_discovered: false
---

# T02: Reproduced the BOS Light local baseline in the M002 worktree and recorded it without promoting live capability claims.

**Reproduced the BOS Light local baseline in the M002 worktree and recorded it without promoting live capability claims.**

## What Happened

Reproduced the full M001 local baseline from inside the M002 milestone worktree after creating the live validation report draft. The command set covered the integrated A1-A10 fixture runner, company-template validator tests, the complete plugin Vitest suite, TypeScript typecheck, runtime capability validator tests, runtime capability matrix validator, A1-A10 docs validator, and handoff validator. Updated the live validation report to record the local baseline as reproduced while preserving the proof boundary: all fixture surfaces remain local adapter-seam evidence and do not promote live Paperclip native support.

## Verification

Fresh verification in `.gsd/worktrees/M002` passed after the report edit: `python3 scripts/run_a1_a10_demo.py` exited 0; `python3 scripts/test_validate_company_template.py` passed 6/6; `npm --prefix plugin-bos-light test` passed 7 files and 63 tests; `npm --prefix plugin-bos-light run typecheck` exited 0; `python3 scripts/test_validate_runtime_capabilities.py` passed 12/12; `python3 scripts/validate_runtime_capabilities.py` printed `Paperclip runtime capabilities OK`; `python3 scripts/validate_a1_a10_demo_docs.py` printed `A1-A10 demo docs OK`; `python3 scripts/validate_handoff.py` printed `Handoff package OK`.

## Verification Evidence

| # | Command | Exit Code | Verdict | Duration |
|---|---------|-----------|---------|----------|
| 1 | `python3 scripts/run_a1_a10_demo.py >/tmp/m002_a1_a10_demo.json` | 0 | ✅ pass | 7200ms |
| 2 | `python3 scripts/test_validate_company_template.py` | 0 | ✅ pass — 6/6 tests OK | 7200ms |
| 3 | `npm --prefix plugin-bos-light test` | 0 | ✅ pass — 7 files, 63 tests | 7200ms |
| 4 | `npm --prefix plugin-bos-light run typecheck` | 0 | ✅ pass | 7200ms |
| 5 | `python3 scripts/test_validate_runtime_capabilities.py` | 0 | ✅ pass — 12/12 tests OK | 7200ms |
| 6 | `python3 scripts/validate_runtime_capabilities.py && python3 scripts/validate_a1_a10_demo_docs.py && python3 scripts/validate_handoff.py` | 0 | ✅ pass | 7200ms |

## Deviations

The A1-A10 demo JSON was redirected to `/tmp/m002_a1_a10_demo.json` during the fresh verification rerun to keep output bounded; no repository source or capability posture was changed.

## Known Issues

This is local fixture/contract proof only. Live Paperclip import/export, plugin registration, native artifacts, approvals, events, and Hermes/GSD-Pi adapters remain unvalidated until later S01/S02/S03 probes.

## Files Created/Modified

- `.gsd/worktrees/M002/PAPERCLIP_LIVE_VALIDATION_REPORT.md`
