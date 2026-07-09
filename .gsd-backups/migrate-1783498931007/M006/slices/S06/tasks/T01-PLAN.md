---
estimated_steps: 1
estimated_files: 3
skills_used: []
---

# T01: Contract types and parsed_metadata interface

Add Div5QuarantineUnauthorized, QuarantineVerdict, and SanitizedRepoSnapshot to contracts.ts. Extend ExternalGitEvidence in div6ExternalGateway.ts with optional parsed_metadata field. Export SecurityFlag via index.ts by wiring qaReview exports so downstream slices can reference security scan results without importing across module boundaries.

## Inputs

- `plugin-bos-light/src/contracts.ts`
- `plugin-bos-light/src/div6ExternalGateway.ts`
- `plugin-bos-light/src/index.ts`
- `plugin-bos-light/src/qaReview.ts`

## Expected Output

- `plugin-bos-light/src/contracts.ts`
- `plugin-bos-light/src/div6ExternalGateway.ts`
- `plugin-bos-light/src/index.ts`

## Verification

npx tsc --noEmit
