# S01: Canonical Paperclip State and Cleanup Gate

**Goal:** Establish the truthful live Paperclip starting state for M012 using the canonical company ID and prepare a safe cleanup gate for stale test artifacts.
**Demo:** After this: a fresh authenticated readback proves the current BOS Light company, route inventory, active issues, and BOS-2 cleanup or deferral state without external mutation unless explicitly confirmed.

## Must-Haves

- Canonical company ID `9feb4c22-05b9-401e-ba67-0e866e3056da` is read back successfully or a precise auth blocker is recorded.
- Sandbox company ID `43c74adb-b194-44d1-8f8e-ba142544bb9d` is not used as the M012 target.
- Agents, issues, projects, goals, and supported route inventory are recorded.
- BOS-1 and BOS-2 state is classified; BOS-2 cleanup is either executed only after explicit confirmation or deferred with rationale.
- Evidence records no plaintext secrets, no direct DB mutation, and no capability promotion.

## Proof Level

- This slice proves: Integration readback with optional explicitly confirmed cleanup mutation.

## Integration Closure

Consumes M011 gate and continue notes; produces the canonical route and state contract that S02 uses for live mission issue creation.

## Verification

- Adds M012 S01 evidence with route statuses, timestamps, blocker codes, company ID, issue IDs, and safety flags.

## Tasks

- [x] **T01: Build Canonical Readback Probe** `est:1h`
  Implement a Paperclip readback probe and validator for the canonical BOS Light company. The probe must load auth without printing secrets, use only supported GET routes, reject the stale sandbox company ID as a target, normalize company, agents, issues, projects, goals, and route statuses, and write JSON plus markdown evidence. The validator must fail if plaintext secrets appear, if direct DB mutation is recorded, if the company ID is not canonical, or if unsupported surfaces are promoted.
  - Files: `scripts/m012_s01_canonical_paperclip_readback.js`, `scripts/validate_m012_s01_readback.js`, `runtime-evidence/M012-S01-canonical-paperclip-readback.json`, `runtime-evidence/M012-S01-canonical-paperclip-readback.md`
  - Verify: node scripts/validate_m012_s01_readback.js

- [x] **T02: Classify Stale Issues and Cleanup Gate** `est:45m`
  Use the readback artifact to classify BOS-1 and BOS-2. If BOS-2 cleanup requires a live mutation, pause for explicit user confirmation naming the exact issue and action before executing it; otherwise record cleanup as deferred. Write a cleanup gate artifact that proves whether no mutation happened, mutation was explicitly confirmed, or cleanup remains pending. Never use direct database mutation or plugin routes.
  - Files: `scripts/m012_s01_cleanup_gate.js`, `scripts/validate_m012_s01_cleanup_gate.js`, `runtime-evidence/M012-S01-cleanup-gate.json`, `runtime-evidence/M012-S01-cleanup-gate.md`
  - Verify: node scripts/validate_m012_s01_cleanup_gate.js

## Files Likely Touched

- scripts/m012_s01_canonical_paperclip_readback.js
- scripts/validate_m012_s01_readback.js
- runtime-evidence/M012-S01-canonical-paperclip-readback.json
- runtime-evidence/M012-S01-canonical-paperclip-readback.md
- scripts/m012_s01_cleanup_gate.js
- scripts/validate_m012_s01_cleanup_gate.js
- runtime-evidence/M012-S01-cleanup-gate.json
- runtime-evidence/M012-S01-cleanup-gate.md
