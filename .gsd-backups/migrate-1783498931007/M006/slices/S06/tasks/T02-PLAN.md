---
estimated_steps: 1
estimated_files: 3
skills_used: []
---

# T02: Div6 ls-remote parsed_metadata population

Extend GitCommandEvidence in gitOperations.ts with optional metadata field and auto-populate it for ls-remote by parsing stdout into structured refs before redaction/hashing. In div6ExternalGateway.ts, copy git_evidence.metadata into evidence.parsed_metadata. Update div6ExternalGateway.test.ts with non-breaking assertions: parsed_metadata.refs is present and structured on ls-remote success, absent on clone/fetch, and empty on ls-remote failure.

## Inputs

- `plugin-bos-light/src/gitOperations.ts`
- `plugin-bos-light/src/div6ExternalGateway.ts`
- `plugin-bos-light/tests/div6ExternalGateway.test.ts`

## Expected Output

- `plugin-bos-light/src/gitOperations.ts`
- `plugin-bos-light/src/div6ExternalGateway.ts`
- `plugin-bos-light/tests/div6ExternalGateway.test.ts`

## Verification

npx vitest run plugin-bos-light/tests/div6ExternalGateway.test.ts
