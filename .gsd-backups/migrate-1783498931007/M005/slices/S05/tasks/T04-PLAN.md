---
estimated_steps: 1
estimated_files: 2
skills_used: []
---

# T04: Create Div6.External GitHub API + PR/merge TypeScript module

Why: Div6 must open PR, request review, and merge after Div5 approval — not Div4 directly. Primary path uses gh CLI (structured JSON output, native PR/merge/CI support); fallback uses GitHub REST API via HTTP if gh is missing. Do: Create plugin-bos-light/src/externalIO.ts with ExternalIOGateway class. Implement discoverGhBinary() → checks gh --version availability. Implement GhCliAdapter (primary): spawn gh pr create --title ... --body ... --base main --head {branch} --json number,url; gh pr merge {number} --squash --auto; gh pr review --approve {number}; gh workflow run {workflow} --ref {branch}; gh run watch {run_id} --json status,conclusion. Implement GitHubHttpAdapter (fallback): HTTP requests to api.github.com for PR create/merge/review, workflow dispatch, and run status. Both adapters use GITHUB_TOKEN from env, redact secrets in diagnostics, and produce structured evidence envelopes. Detect missing GITHUB_TOKEN and produce clean blocker on both paths. Detect missing gh binary and transparently fall back to HTTP adapter. Create externalIO.test.ts covering: gh CLI PR creation, merge after approval, CI trigger, missing gh binary fallback to HTTP, missing token detection, secret redaction, structured JSON output parsing. Done when: unit tests pass.

## Inputs

- `plugin-bos-light/src/paperclipAdapter.ts`
- `plugin-bos-light/src/gitOperations.ts`

## Expected Output

- `plugin-bos-light/src/externalIO.ts`
- `plugin-bos-light/tests/externalIO.test.ts`

## Verification

cd plugin-bos-light && npx vitest run tests/externalIO.test.ts
