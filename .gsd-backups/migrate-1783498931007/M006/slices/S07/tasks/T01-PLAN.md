---
estimated_steps: 1
estimated_files: 1
skills_used: []
---

# T01: Extend contracts with local_path and Div4 types

Add backward-compatible optional local_path fields to ExternalGitEvidence and SanitizedRepoSnapshot so the approved workspace path can propagate from Div6 → Div5 → Div4. Add Div4ProductionUnauthorized and ProductionWorkEvidence contract types to contracts.ts. These are purely additive; no existing S05/S06 test assertions need to change. Done when: contracts.ts compiles and includes the new optional fields and Div4 types.

## Inputs

- `plugin-bos-light/src/contracts.ts`

## Expected Output

- `plugin-bos-light/src/contracts.ts`

## Verification

cd plugin-bos-light && npx tsc --noEmit
