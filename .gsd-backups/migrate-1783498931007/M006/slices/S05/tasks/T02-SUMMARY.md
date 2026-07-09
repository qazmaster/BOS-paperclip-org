---
id: T02
parent: S05
milestone: M006
key_files:
  - plugin-bos-light/src/contracts.ts
  - plugin-bos-light/src/div6ExternalGateway.ts
  - plugin-bos-light/src/gitOperations.ts
  - plugin-bos-light/src/index.ts
  - plugin-bos-light/tests/div6ExternalGateway.test.ts
key_decisions:
  - Added fetch method to DefaultGitOperations instead of duplicating spawn logic in div6ExternalGateway.ts, keeping git execution under a single abstraction
duration: 
verification_result: passed
completed_at: 2026-06-01T09:01:19.822Z
blocker_discovered: false
---

# T02: Added ExternalGitGatewayUnauthorized contract, created div6ExternalGateway.ts module with bounded git execution, and added fetch to DefaultGitOperations

**Added ExternalGitGatewayUnauthorized contract, created div6ExternalGateway.ts module with bounded git execution, and added fetch to DefaultGitOperations**

## What Happened

Added ExternalGitGatewayUnauthorized to contracts.ts mirroring TreasuryUnauthorized with required_role: 'Div6.External'. Created plugin-bos-light/src/div6ExternalGateway.ts containing ExternalGitEvidence type (trust_level: 'untrusted') and executeExternalGitOperation async function. The function enforces strict caller identity (Div6.External only), consumes access_grant packets from the Div6 inbox, validates grant origin (Div3.Treasury), expiration, and allowed_ops mapping (ls-remote requires read/clone/fetch, clone requires clone, fetch requires fetch/pull). On validation failure it returns ExternalGitGatewayUnauthorized with precise reason. On execution it resolves secret_ref and runs git via DefaultGitOperations, builds ExternalGitEvidence with SHA256 hashes and redacted diagnostics only, emits completion_report to Div5.QualificationsLibraryLearning, and emits status_update to Div1.HCO. Also added fetch method to GitOperations interface and DefaultGitOperations class to keep execution consistent. Exported the new module from index.ts. Added 30 comprehensive tests covering auth failures, grant validation, operation permissions, packet emissions, redaction, and state isolation.

## Verification

TypeScript compilation passed with no errors. Full test suite (421 tests) passed, including 30 new tests for div6ExternalGateway covering caller identity, grant origin/expiration/ops validation, ls-remote/clone/fetch execution, evidence redaction, packet emission to Div5 and Div1, and state isolation.

## Verification Evidence

| # | Command | Exit Code | Verdict | Duration |
|---|---------|-----------|---------|----------|
| 1 | `cd plugin-bos-light && npx tsc --noEmit` | 0 | ✅ pass | 2000ms |
| 2 | `cd plugin-bos-light && npx vitest run tests/div6ExternalGateway.test.ts` | 0 | ✅ pass | 500ms |
| 3 | `cd plugin-bos-light && npx vitest run` | 0 | ✅ pass | 2500ms |

## Deviations

Added fetch method to GitOperations interface and DefaultGitOperations class (not explicitly in task plan) to avoid duplicating child_process spawn logic in div6ExternalGateway.ts and maintain consistency with existing git execution patterns.

## Known Issues

None

## Files Created/Modified

- `plugin-bos-light/src/contracts.ts`
- `plugin-bos-light/src/div6ExternalGateway.ts`
- `plugin-bos-light/src/gitOperations.ts`
- `plugin-bos-light/src/index.ts`
- `plugin-bos-light/tests/div6ExternalGateway.test.ts`
