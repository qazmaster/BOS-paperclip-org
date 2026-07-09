---
estimated_steps: 1
estimated_files: 1
skills_used: []
---

# T04: Validate no unsafe live defaults remain

Add an executable audit that scans scripts for unguarded known company IDs, ad hoc Paperclip mutation calls without preflight, and forbidden command strings. The audit should allow historical docs and explicit stale/rejected ID lists but fail on mutation defaults.

## Inputs

- `paperclip-runtime.lock.json`
- `scripts/lib/paperclip-preflight.js`

## Expected Output

- `scripts/validate_m014_s03_script_hardening.js`

## Verification

node --test scripts/validate_m014_s03_script_hardening.js

## Observability Impact

Provides a repeatable diagnostic check for future agents before live runtime work.
