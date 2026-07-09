# S00: Runtime Capability Inventory

**Goal:** Validate live Paperclip runtime assumptions before M006 implementation: plugin install path, tool registry, agent-to-tool invocation, secret reference materialization, and artifact readback. Produce fail-closed evidence artifact.
**Demo:** Live Paperclip runtime assumptions validated: plugin install path, tool registry, agent-to-tool invocation, secret reference, artifact readback. Evidence saved.

## Must-Haves

- Evidence artifact exists at runtime-evidence/M006-S00-runtime-capability-inventory.json and passes validator
- Every runtime assumption is either confirmed with live version/build readback or explicitly marked uncertainty/fallback-only
- Plugin install path status recorded (confirmed, blocked, or unsupported)
- Tool registry readback status recorded
- Secret materialization status recorded for GITHUB_TOKEN_AIPAY
- Issue/document/comment APIs regression-tested with results
- No assumed surfaces remain
- Three-way capability consistency passes if matrix updated
- M6-R01 handoff validation passes
- M6-R02 plugin unit tests pass (121/121)

## Proof Level

- This slice proves: operational

## Integration Closure

- Upstream surfaces consumed: Existing M005 probe patterns, .env credentials, Paperclip sandbox HTTP API
- New wiring introduced: S00 probe script and validator become reusable assets for future runtime capability checks
- What remains before milestone usable end-to-end: S01 must attempt actual plugin registration; S00 only inventories current posture

## Verification

- Probe and validator produce structured JSON evidence with precise blocker codes, response summaries, and redaction audit results. Future agents can inspect runtime-evidence/M006-S00-runtime-capability-inventory.json to understand which runtime surfaces are confirmed vs blocked vs unvalidated without re-running probes.

## Tasks

- [x] **T01: Write S00 live probe script** `est:1h 30m`
  Create scripts/run_m006_s00_runtime_capability_inventory.py following the canonical M005 S05 probe pattern (stdlib-only Python, bounded routes, redaction, timeout guards). The probe performs five sequential probes: (1) Paperclip health/version readback via GET /api/health, (2) plugin install path discovery via GET /api/companies/{companyId}/plugins and fallback admin routes, (3) tool registry readback attempting to observe piko:* tools, (4) secret materialization test for GITHUB_TOKEN_AIPAY via Hermes testEnvironment or agent env endpoint, (5) issue/document/comment regression smoke (lightweight create + readback). Each probe writes a bounded result with status_code, duration_ms, response_summary, and blocker codes when blocked. The script reads PAPERCLIP_API_KEY and PAPERCLIP_BASE_URL from environment. Output is a single canonical evidence artifact at runtime-evidence/M006-S00-runtime-capability-inventory.json. Even when fully blocked, the artifact must be schema-valid and contain precise blocker codes per fail-closed mandate.
  - Files: `scripts/run_m006_s00_runtime_capability_inventory.py`
  - Verify: test -x scripts/run_m006_s00_runtime_capability_inventory.py

- [x] **T02: Write S00 evidence validator** `est:1h`
  Create scripts/validate_m006_s00_runtime_capability_inventory.py (stdlib-only Python) that validates the S00 evidence artifact against schema version m006-s00-runtime-capability-inventory/v1. Validation layers: (1) JSON schema structure checks (required top-level keys, probe array shape, timestamp validity), (2) redaction audit scanning all text fields for unredacted secrets using the same SECRET_VALUE_RE pattern as probe scripts, (3) no-promotion enforcement ensuring blocker artifacts cannot promote capabilities to confirmed, (4) capability matrix consistency check against plugin-bos-light/capabilities.paperclip-runtime.json if the artifact claims promotions. The validator exits 0 on valid evidence (including valid blocker artifacts), exits 1 on schema violations or redaction failures, and prints structured diagnostics. Supports --evidence and --allow-blocker CLI flags.
  - Files: `scripts/validate_m006_s00_runtime_capability_inventory.py`
  - Verify: test -x scripts/validate_m006_s00_runtime_capability_inventory.py

- [x] **T03: Execute live probe and validate evidence** `est:30m`
  Run the S00 probe against the live Paperclip sandbox using environment credentials from .env, then run the validator against the produced evidence artifact. Steps: (1) export credentials from .env, (2) run python3 scripts/run_m006_s00_runtime_capability_inventory.py with default output path, (3) run python3 scripts/validate_m006_s00_runtime_capability_inventory.py --evidence runtime-evidence/M006-S00-runtime-capability-inventory.json --allow-blocker, (4) capture both exit codes and stdout. The probe is expected to produce either live-evidence or fail-closed-blocker artifacts depending on runtime posture. Any live confirmations must include runtime version/build readback. No capability promotion is allowed without version/build plus surface-specific readback per MEM058.
  - Files: `scripts/run_m006_s00_runtime_capability_inventory.py`, `scripts/validate_m006_s00_runtime_capability_inventory.py`
  - Verify: python3 scripts/validate_m006_s00_runtime_capability_inventory.py --evidence runtime-evidence/M006-S00-runtime-capability-inventory.json --allow-blocker

- [x] **T04: Update capability matrix and documentation** `est:45m`
  Conditionally update the three-way capability consistency boundary per MEM181 if T03 produced live confirmations. Files to update: (1) plugin-bos-light/capabilities.paperclip-runtime.json — add/update rows for any M006-validated surfaces with live version/build evidence, (2) plugin-bos-light/src/runtimeCapabilities.ts — mirror any new PAPERCLIP_RUNTIME_CAPABILITY_KEYS, (3) docs/08_RUNTIME_CAPABILITY_HEALTH.md — update per-surface table and status totals, (4) docs/M006_RUNTIME_CAPABILITY_INVENTORY.md — update section 9 S00 success criteria with checkmarks and timestamp. If no live confirmations were achieved, update docs only with blocker/fallback status and documented uncertainty. After any matrix edits, run scripts/validate_runtime_capabilities.py to verify three-way consistency.
  - Files: `plugin-bos-light/capabilities.paperclip-runtime.json`, `plugin-bos-light/src/runtimeCapabilities.ts`, `docs/08_RUNTIME_CAPABILITY_HEALTH.md`, `docs/M006_RUNTIME_CAPABILITY_INVENTORY.md`
  - Verify: python3 scripts/validate_runtime_capabilities.py

- [x] **T05: Regression closure and acceptance gates** `est:15m`
  Run the two mandatory M006 regression acceptance tests to ensure S00 work does not break existing A12-A20 handoff or plugin unit tests. Steps: (1) run python3 scripts/validate_handoff.py to verify M6-R01 (A12-A20 handoff remains valid), (2) run npm --prefix plugin-bos-light test to verify M6-R02 (plugin unit tests still pass, 121 tests expected). If either fails, record failure in slice notes and block slice completion until resolved.
  - Verify: python3 scripts/validate_handoff.py

## Files Likely Touched

- scripts/run_m006_s00_runtime_capability_inventory.py
- scripts/validate_m006_s00_runtime_capability_inventory.py
- plugin-bos-light/capabilities.paperclip-runtime.json
- plugin-bos-light/src/runtimeCapabilities.ts
- docs/08_RUNTIME_CAPABILITY_HEALTH.md
- docs/M006_RUNTIME_CAPABILITY_INVENTORY.md
