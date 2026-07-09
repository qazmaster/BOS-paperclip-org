---
estimated_steps: 1
estimated_files: 2
skills_used: []
---

# T01: Define runtime lockfile and validator

Create a runtime lockfile or equivalent source-of-truth file that records the verified Paperclip base URL, provisional or verified company ID, stale and disposable IDs, compose project, container name, safe restart command, and forbidden commands. Add a validator that rejects missing fields and rejects using known stale IDs as mutation defaults.

## Inputs

- `docs/handoffs/HANDOFF_PAPERCLIP_RUNTIME_FORENSICS.md`
- `.gsd/workflows/spikes/260607-1-start-a-gsd-milestone-for-paperclip-runt/RECOMMENDATION.md`

## Expected Output

- `paperclip-runtime.lock.json`
- `scripts/validate_paperclip_runtime_lock.js`

## Verification

node --test scripts/validate_paperclip_runtime_lock.js

## Observability Impact

Creates a single inspection surface for runtime identity and forbidden operations.
