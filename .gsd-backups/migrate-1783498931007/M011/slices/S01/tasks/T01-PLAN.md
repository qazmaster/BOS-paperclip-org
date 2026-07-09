---
estimated_steps: 1
estimated_files: 3
skills_used: []
---

# T01: Generate capability matrix from current evidence

Create a deterministic Node.js script that reads plugin-bos-light/capabilities.paperclip-runtime.json, selected runtime-evidence artifacts, and key source/test files, then writes runtime-evidence/M011-S01-capability-matrix.json plus a markdown summary. The script must classify capabilities as confirmed, local-only, fallback-only, blocked, or unknown and preserve blocker reasons for unsupported plugin/runtime surfaces.

## Inputs

- `plugin-bos-light/capabilities.paperclip-runtime.json`
- `runtime-evidence/M005-S02-company-template-runtime-probe-live.json`
- `runtime-evidence/M005-S03-resource-intake-runtime-probe-live.json`
- `runtime-evidence/M005-S04-git-hybrid-runtime-probe-live.json`
- `runtime-evidence/M005-S05-e2e-mission-runtime-probe-live.json`
- `runtime-evidence/M006-S01-plugin-live-registration.json`
- `plugin-bos-light/src/missionIntake.ts`
- `plugin-bos-light/src/hitlGovernance.ts`
- `plugin-bos-light/src/externalIO.ts`
- `plugin-bos-light/src/gitOperations.ts`
- `plugin-bos-light/src/qaReview.ts`

## Expected Output

- `scripts/generate_m011_capability_matrix.js`
- `runtime-evidence/M011-S01-capability-matrix.json`
- `runtime-evidence/M011-S01-capability-matrix.md`

## Verification

node scripts/generate_m011_capability_matrix.js

## Observability Impact

Matrix includes generated_at, source evidence paths, status counts, and blocker codes for future inspection.
