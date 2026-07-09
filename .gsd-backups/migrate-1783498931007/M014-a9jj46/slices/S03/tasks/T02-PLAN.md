---
estimated_steps: 1
estimated_files: 2
skills_used: []
---

# T02: Add Paperclip preflight contract

Add a local preflight module or wrapper that checks health, auth presence, target company visibility, stale target rejection, adapter support when needed, and explicit confirmation requirement before any mutation. It must produce structured blocker output and zero mutation when prerequisites are missing.

## Inputs

- `paperclip-runtime.lock.json`

## Expected Output

- `scripts/lib/paperclip-preflight.js`
- `scripts/test_paperclip_preflight.js`

## Verification

node --test scripts/test_paperclip_preflight.js

## Observability Impact

Adds structured fail-closed diagnostics for auth, target, adapter, and confirmation failures.
