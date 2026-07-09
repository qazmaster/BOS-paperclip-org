---
estimated_steps: 1
estimated_files: 4
skills_used: []
---

# T01: Build Canonical Readback Probe

Implement a Paperclip readback probe and validator for the canonical BOS Light company. The probe must load auth without printing secrets, use only supported GET routes, reject the stale sandbox company ID as a target, normalize company, agents, issues, projects, goals, and route statuses, and write JSON plus markdown evidence. The validator must fail if plaintext secrets appear, if direct DB mutation is recorded, if the company ID is not canonical, or if unsupported surfaces are promoted.

## Inputs

- `runtime-evidence/M011-S03-reconciled-capability-gate.json`
- `.gsd/milestones/M011/continue.md`

## Expected Output

- `runtime-evidence/M012-S01-canonical-paperclip-readback.json`
- `runtime-evidence/M012-S01-canonical-paperclip-readback.md`

## Verification

node scripts/validate_m012_s01_readback.js

## Observability Impact

Records route statuses, blocker codes, timestamps, issue IDs, canonical company ID, and redaction flags.
