# S05: Div6 External Git Gateway — UAT

**Milestone:** M006
**Written:** 2026-06-01T09:11:52.501Z

# S05 UAT: Div6 External Git Gateway

- UAT required: no

This slice delivers contract-level code and unit-test coverage, not user-facing/browser/runtime behavior. Acceptance is proven by automated test suite and TypeScript compilation.

## Preconditions
- `plugin-bos-light` dependencies installed (`npm ci` or `npm install`)
- Node.js and git available in PATH

## Contract Verification Steps
1. **TypeScript compilation**: `cd plugin-bos-light && npx tsc --noEmit` → exit 0, zero errors.
2. **Git operations tests**: `cd plugin-bos-light && npx vitest run tests/gitOperations.test.ts` → 30 tests pass (including 5 lsRemote tests).
3. **Gateway tests**: `cd plugin-bos-light && npx vitest run tests/div6ExternalGateway.test.ts` → 36 tests pass.
4. **Full regression**: `cd plugin-bos-light && npx vitest run` → 28 test files, 427 tests pass, zero failures.

## Expected Outcomes
- `lsRemote` exists on `GitOperations` interface and `DefaultGitOperations`
- `executeExternalGitOperation` rejects every non-Div6 caller with `ExternalGitGatewayUnauthorized`
- Grant validation enforces Div3.Treasury origin, expiration, and allowed_ops mapping
- All `ExternalGitEvidence` payloads have `trust_level: 'untrusted'`
- No raw stdout/stderr in evidence; only SHA256 hashes and `redacted_diagnostics`
- `completion_report` packet appears in Div5 inbox after execution
- `status_update` packet appears in Div1 inbox after execution

## Edge Cases Covered
- Missing grant_id in Div6 inbox → Unauthorized
- Expired grant → Unauthorized
- Wrong grant origin → Unauthorized
- Missing allowed_ops for operation → Unauthorized
- Missing `localPath` for clone/fetch → Unauthorized
- PaperclipSecretRef unavailable → `auth_failure` evidence (not Unauthorized)
- Git binary missing (ENOENT) → `missing_binary` evidence
- Git auth failure → `auth_failure` evidence

## UAT Type
Contract verification via automated unit tests.
