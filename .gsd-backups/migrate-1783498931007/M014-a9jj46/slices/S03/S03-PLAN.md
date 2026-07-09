# S03: Runtime Lockfile and Script Hardening

**Goal:** Add a runtime source-of-truth contract and harden live scripts so stale IDs and missing auth cannot silently mutate Paperclip.
**Demo:** After this: mutation-capable Paperclip scripts fail closed when runtime target, auth, company visibility, adapter support, or confirmation is missing.

## Must-Haves

- Runtime lockfile or equivalent contract records verified target, stale/disposable IDs, safe restart command, and forbidden commands.
- Mutation scripts require explicit target and preflight before POST, PUT, PATCH, or DELETE.
- Hardcoded company IDs are removed from mutation defaults or kept only in stale/rejection lists.
- Tests or validators prove fail-closed behavior and zero mutation on missing prerequisites.

## Proof Level

- This slice proves: Contract and integration proof through local tests, validators, and script dry-run behavior.

## Integration Closure

Consumes S01/S02 findings and produces hardened script surfaces used by S04/S05.

## Verification

- Adds structured blocker outputs for auth, target, adapter, and confirmation failures without logging secrets.

## Tasks

- [ ] **T01: Define runtime lockfile and validator** `est:1h`
  Create a runtime lockfile or equivalent source-of-truth file that records the verified Paperclip base URL, provisional or verified company ID, stale and disposable IDs, compose project, container name, safe restart command, and forbidden commands. Add a validator that rejects missing fields and rejects using known stale IDs as mutation defaults.
  - Files: `paperclip-runtime.lock.json`, `scripts/validate_paperclip_runtime_lock.js`
  - Verify: node --test scripts/validate_paperclip_runtime_lock.js

- [ ] **T02: Add Paperclip preflight contract** `est:1.5h`
  Add a local preflight module or wrapper that checks health, auth presence, target company visibility, stale target rejection, adapter support when needed, and explicit confirmation requirement before any mutation. It must produce structured blocker output and zero mutation when prerequisites are missing.
  - Files: `scripts/lib/paperclip-preflight.js`, `scripts/test_paperclip_preflight.js`
  - Verify: node --test scripts/test_paperclip_preflight.js

- [ ] **T03: Guard mutation capable scripts** `est:2h`
  Update known mutation-capable scripts so they call the preflight contract before live POST, PUT, PATCH, or DELETE. Remove silent hardcoded company defaults from mutation paths or move known IDs into explicit stale/disposable rejection lists. Preserve dry-run behavior and existing evidence output shape where possible.
  - Files: `scripts/create_bos_v141_agents.py`, `scripts/m013_s02_create_tech_debt_issue.js`, `scripts/run_m005_s01_hermes_xiaomi_probe.py`, `scripts/run_s04_live_artifact_flow.py`
  - Verify: node --test scripts/test_paperclip_preflight.js

- [ ] **T04: Validate no unsafe live defaults remain** `est:1h`
  Add an executable audit that scans scripts for unguarded known company IDs, ad hoc Paperclip mutation calls without preflight, and forbidden command strings. The audit should allow historical docs and explicit stale/rejected ID lists but fail on mutation defaults.
  - Files: `scripts/validate_m014_s03_script_hardening.js`
  - Verify: node --test scripts/validate_m014_s03_script_hardening.js

## Files Likely Touched

- paperclip-runtime.lock.json
- scripts/validate_paperclip_runtime_lock.js
- scripts/lib/paperclip-preflight.js
- scripts/test_paperclip_preflight.js
- scripts/create_bos_v141_agents.py
- scripts/m013_s02_create_tech_debt_issue.js
- scripts/run_m005_s01_hermes_xiaomi_probe.py
- scripts/run_s04_live_artifact_flow.py
- scripts/validate_m014_s03_script_hardening.js
