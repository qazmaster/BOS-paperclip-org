---
estimated_steps: 1
estimated_files: 2
skills_used: []
---

# T01: Create git operations TypeScript module with tests

Why: Div4.Production needs local git CLI operations to modify the aipay.kz repository (MEM046: GSD-Pi remains blocked). Do: Create `GitOperations` interface and implementation in `gitOperations.ts` using `child_process` spawn. Support SSH via `GIT_SSH_KEY` and HTTPS via `GITHUB_TOKEN`/`GITLAB_TOKEN` auth discovery from environment. Implement `clone`, `checkoutBranch`, `add`, `commit`, `push` with structured evidence envelopes. Detect missing git binary and non-fast-forward conflicts. Redact all secrets in diagnostics. Create `gitOperations.test.ts` with vitest covering: successful command shaping, missing git binary detection, and secret redaction. Done when: unit tests pass.

## Inputs

- `plugin-bos-light/src/contracts.ts`
- `plugin-bos-light/src/paperclipAdapter.ts`
- `plugin-bos-light/package.json`

## Expected Output

- `plugin-bos-light/src/gitOperations.ts`
- `plugin-bos-light/tests/gitOperations.test.ts`

## Verification

cd plugin-bos-light && npx vitest run tests/gitOperations.test.ts
