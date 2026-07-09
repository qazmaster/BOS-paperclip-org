---
estimated_steps: 1
estimated_files: 2
skills_used: []
---

# T01: Add ls-remote to GitOperations interface and DefaultGitOperations

The GitOperations interface currently supports clone, checkoutBranch, add, commit, push. Div6.External needs ls-remote to enumerate remote refs without cloning. Add lsRemote(repoUrl: string, refs?: string[]): Promise<GitCommandEvidence> to the GitOperations interface and implement it in DefaultGitOperations using spawn with args ["ls-remote", repoUrl, ...(refs || [])]. Extend gitOperations.test.ts with tests for: (1) ls-remote command shaping, (2) ls-remote with optional refs, (3) evidence envelope includes all required fields for ls-remote, (4) error classification (missing binary, auth failure) for ls-remote. Use the existing mock-spawn pattern.

## Inputs

- `plugin-bos-light/src/gitOperations.ts`
- `plugin-bos-light/tests/gitOperations.test.ts`

## Expected Output

- `plugin-bos-light/src/gitOperations.ts`
- `plugin-bos-light/tests/gitOperations.test.ts`

## Verification

cd plugin-bos-light && npx vitest run tests/gitOperations.test.ts
