---
id: T01
parent: S04
milestone: M006
key_files:
  - plugin-bos-light/src/contracts.ts
  - plugin-bos-light/src/divisionPacketRouter.ts
  - plugin-bos-light/src/index.ts
key_decisions:
  - Mirrored MissionRouterUnauthorized pattern for TreasuryUnauthorized to maintain consistency across division unauthorized shapes
  - Used discriminated union (PaperclipSecretRef | InlineEnvRef) for SecretRef to enforce strict secret mode with test-only inline fallback
duration: 
verification_result: passed
completed_at: 2026-06-01T08:10:36.372Z
blocker_discovered: false
---

# T01: Added treasury contract types (SecretRef, AllowedGitOperation, ScopedAccessGrant, TreasuryUnauthorized) and access_grant packet type

**Added treasury contract types (SecretRef, AllowedGitOperation, ScopedAccessGrant, TreasuryUnauthorized) and access_grant packet type**

## What Happened

Added four new treasury contract types to contracts.ts:

1. SecretRef — a discriminated union of PaperclipSecretRef {type:'secret_ref', secret_id, version:'latest'} and test-only InlineEnvRef {type:'inline_env', env_key}. No plaintext secret value appears in either variant.

2. AllowedGitOperation — union of "clone" | "fetch" | "pull" | "push" | "read" | "write".

3. ScopedAccessGrant — bounded grant shape with grant_id, mission_id, repo_url, allowed_ops, secret_ref, granted_by, granted_at, expires_at. No plaintext secret field is present; the secret is referenced via SecretRef.

4. TreasuryUnauthorized — mirrors MissionRouterUnauthorized pattern with required_role: "Div3.Treasury".

Also added "access_grant" to DivisionPacketType in divisionPacketRouter.ts. The existing wildcard export from contracts.ts in index.ts already covers the new types, so no index.ts change was required.

## Verification

Ran npm run typecheck --prefix plugin-bos-light. tsc --noEmit completed with zero errors. All new types compile cleanly.

## Verification Evidence

| # | Command | Exit Code | Verdict | Duration |
|---|---------|-----------|---------|----------|
| 1 | `cd plugin-bos-light && npm run typecheck` | 0 | ✅ pass | 9496ms |

## Deviations

None.

## Known Issues

None.

## Files Created/Modified

- `plugin-bos-light/src/contracts.ts`
- `plugin-bos-light/src/divisionPacketRouter.ts`
- `plugin-bos-light/src/index.ts`
