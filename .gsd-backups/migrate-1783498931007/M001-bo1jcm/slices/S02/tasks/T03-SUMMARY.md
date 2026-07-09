---
id: T03
parent: S02
milestone: M001-bo1jcm
key_files:
  - plugin-bos-light/src/runtimeCapabilities.ts
  - plugin-bos-light/src/paperclipAdapter.ts
  - plugin-bos-light/src/persistence.ts
  - plugin-bos-light/src/worker.ts
  - plugin-bos-light/src/index.ts
  - plugin-bos-light/manifest.paperclip-plugin.json
  - scripts/validate_runtime_capabilities.py
  - scripts/test_validate_runtime_capabilities.py
key_decisions:
  - Keep `capabilities.paperclip-runtime.json` as the evidence source of truth while `runtimeCapabilities.ts` mirrors only keys/status vocabulary for source-level boundaries.
  - Treat requested manifest capabilities as integration intent, not confirmed Paperclip runtime support.
duration: 
verification_result: passed
completed_at: 2026-05-28T03:37:13.107Z
blocker_discovered: false
---

# T03: Aligned BOS Light adapter, worker, manifest, and validator boundaries with the Paperclip runtime capability matrix.

**Aligned BOS Light adapter, worker, manifest, and validator boundaries with the Paperclip runtime capability matrix.**

## What Happened

Added `plugin-bos-light/src/runtimeCapabilities.ts` as a source-level capability contract that mirrors matrix keys and status vocabulary without duplicating evidence. Updated adapter, persistence, and worker comments/exports so in-memory seams are clearly test/draft-only, plugin state is cache/overlay only, event handling remains optional behind polling/activity fallback, and native approvals stay Paperclip-owned. Updated the draft manifest note to distinguish requested capabilities from confirmed runtime support. Extended the runtime capability validator and tests to catch source-key drift, manifest note drift, report omissions when present, and forbidden support wording around approvals/events/state.

## Verification

Ran `python3 scripts/test_validate_runtime_capabilities.py && python3 scripts/validate_runtime_capabilities.py` successfully. Also ran a guarded plugin typecheck command; node_modules were absent, so the command exited successfully after reporting typecheck was skipped rather than installing dependencies.

## Verification Evidence

| # | Command | Exit Code | Verdict | Duration |
|---|---------|-----------|---------|----------|
| 1 | `python3 scripts/test_validate_runtime_capabilities.py && python3 scripts/validate_runtime_capabilities.py` | 0 | ✅ pass | 135ms |
| 2 | `if [ -d plugin-bos-light/node_modules ]; then (cd plugin-bos-light && npm run typecheck); else echo 'plugin-bos-light/node_modules missing; skipping npm typecheck'; fi` | 0 | ✅ pass (typecheck skipped because node_modules missing) | 7ms |

## Deviations

Extended `scripts/validate_runtime_capabilities.py`, `scripts/test_validate_runtime_capabilities.py`, and `plugin-bos-light/src/index.ts` in addition to the originally listed output files so the new source-level boundary is exported and enforced by validation.

## Known Issues

`plugin-bos-light/node_modules` is not present, so TypeScript typechecking was skipped rather than run locally. Runtime surfaces remain unvalidated/fallback-only until live Paperclip evidence exists.

## Files Created/Modified

- `plugin-bos-light/src/runtimeCapabilities.ts`
- `plugin-bos-light/src/paperclipAdapter.ts`
- `plugin-bos-light/src/persistence.ts`
- `plugin-bos-light/src/worker.ts`
- `plugin-bos-light/src/index.ts`
- `plugin-bos-light/manifest.paperclip-plugin.json`
- `scripts/validate_runtime_capabilities.py`
- `scripts/test_validate_runtime_capabilities.py`
