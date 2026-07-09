---
estimated_steps: 1
estimated_files: 4
skills_used: []
---

# T04: Update capability matrix and documentation

Conditionally update the three-way capability consistency boundary per MEM181 if T03 produced live confirmations. Files to update: (1) plugin-bos-light/capabilities.paperclip-runtime.json — add/update rows for any M006-validated surfaces with live version/build evidence, (2) plugin-bos-light/src/runtimeCapabilities.ts — mirror any new PAPERCLIP_RUNTIME_CAPABILITY_KEYS, (3) docs/08_RUNTIME_CAPABILITY_HEALTH.md — update per-surface table and status totals, (4) docs/M006_RUNTIME_CAPABILITY_INVENTORY.md — update section 9 S00 success criteria with checkmarks and timestamp. If no live confirmations were achieved, update docs only with blocker/fallback status and documented uncertainty. After any matrix edits, run scripts/validate_runtime_capabilities.py to verify three-way consistency.

## Inputs

- `runtime-evidence/M006-S00-runtime-capability-inventory.json`
- `plugin-bos-light/capabilities.paperclip-runtime.json`
- `plugin-bos-light/src/runtimeCapabilities.ts`
- `docs/08_RUNTIME_CAPABILITY_HEALTH.md`
- `docs/M006_RUNTIME_CAPABILITY_INVENTORY.md`
- `scripts/validate_runtime_capabilities.py`

## Expected Output

- `plugin-bos-light/capabilities.paperclip-runtime.json`
- `plugin-bos-light/src/runtimeCapabilities.ts`
- `docs/08_RUNTIME_CAPABILITY_HEALTH.md`
- `docs/M006_RUNTIME_CAPABILITY_INVENTORY.md`

## Verification

python3 scripts/validate_runtime_capabilities.py
