# S01: Source Inventory and Runtime Truth Map

**Goal:** Reconcile current repo, sibling handoff packages, project memory, and runtime evidence into a source truth map before any live runtime action.
**Demo:** After this: a future agent can read one evidence-cited map and know which BOS doctrine, company IDs, runtime surfaces, and proof gaps are authoritative or still uncertain.

## Must-Haves

- Source truth map cites current repo, both sibling source packages, project memory, and key runtime evidence.
- Company IDs are classified with confidence levels and no ID is promoted as authoritative without fresh proof.
- Runtime surfaces are classified as confirmed, fallback-only, blocked, unvalidated, or conflicting.
- Hermes, GSD-Pi, plugin, import/export, and live mutation governance gaps are explicit.

## Proof Level

- This slice proves: Contract proof through evidence-cited artifact validation; no live runtime required.

## Integration Closure

Produces the target and assumption map consumed by VPS forensics and script hardening.

## Verification

- Adds a human-readable diagnostic map for future agents to inspect runtime truth before acting.

## Tasks

- [ ] **T01: Inventory doctrine and forensic source inputs** `est:45m`
  Read current repo handoffs, runtime evidence summaries, project memory, and both sibling source packages named in the milestone context. Produce a concise inventory of authoritative doctrine sources, R026 boundary inputs, existing forensic handoff inputs, and evidence files that must be cited downstream. Do not run live Paperclip or VPS commands.
  - Files: `runtime-evidence/M014-S01-source-inventory.md`
  - Verify: test -s runtime-evidence/M014-S01-source-inventory.md

- [ ] **T02: Classify runtime identities and capability surfaces** `est:1h`
  Build a machine-readable truth map classifying Paperclip company IDs, source epochs, auth status, confirmed surfaces, blocked surfaces, fallback-only surfaces, and proof gaps. Mark all canonical company claims provisional until fresh authenticated readback exists.
  - Files: `runtime-evidence/M014-S01-runtime-truth-map.json`, `runtime-evidence/M014-S01-runtime-truth-map.md`
  - Verify: test -s runtime-evidence/M014-S01-runtime-truth-map.json

- [ ] **T03: Add source truth validator** `est:1h`
  Create a lightweight validator for the S01 truth map. It should fail if required sections are absent, if known stale or disposable IDs are missing from classification, or if Hermes and GSD-Pi are promoted without the required proof fields. Keep validation local and fixture or artifact based.
  - Files: `scripts/validate_m014_s01_truth_map.js`
  - Verify: node --test scripts/validate_m014_s01_truth_map.js

## Files Likely Touched

- runtime-evidence/M014-S01-source-inventory.md
- runtime-evidence/M014-S01-runtime-truth-map.json
- runtime-evidence/M014-S01-runtime-truth-map.md
- scripts/validate_m014_s01_truth_map.js
