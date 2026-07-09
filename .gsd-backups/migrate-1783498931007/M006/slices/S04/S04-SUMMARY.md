---
id: S04
parent: M006
milestone: M006
provides:
  - ScopedAccessGrant packet emission to Div6.External inbox for downstream S05 consumption
  - SecretRef type contract and resolver seam for all secret-dependent adapters
  - TreasuryUnauthorized failure shape consistent with MissionRouterUnauthorized
  - Fail-closed secret resolution with redacted auth_failure diagnostics in gitOperations and externalIO
requires:
  []
affects:
  []
key_files:
  - plugin-bos-light/src/contracts.ts
  - plugin-bos-light/src/secretResolver.ts
  - plugin-bos-light/src/treasury.ts
  - plugin-bos-light/src/gitOperations.ts
  - plugin-bos-light/src/externalIO.ts
  - plugin-bos-light/tests/treasury.test.ts
key_decisions:
  - Mirrored MissionRouterUnauthorized pattern for TreasuryUnauthorized to maintain consistency across division unauthorized shapes
  - Used discriminated union (PaperclipSecretRef | InlineEnvRef) for SecretRef with PaperclipSecretRef intentionally fail-closed
  - Resolved SecretRef at adapter boundary (construction/init time) rather than in core business logic
  - Set 24-hour expiration as default scoped access grant TTL
  - Trimmed repoUrl to prevent whitespace-only values from passing validation
patterns_established:
  - Division caller identity check pattern (strict caller === 'Div3.Treasury')
  - SecretRef discriminated union with fail-closed Paperclip variant and test-only InlineEnv fallback
  - Redaction helper pattern (redactSecretRef) for safe diagnostic/logging output
  - Adapter-boundary secret resolution keeping core logic agnostic of SecretRef shape
observability_surfaces:
  - TreasuryUnauthorized with caller, reason, rejected_at fields
  - SecretResolutionUnavailable with blocker code (secret_unavailable, missing_secret_env)
  - DivisionPacket emission to Div6.External (access_grant) and Div1.HCO (status_update)
  - Redacted diagnostics in auth_failure paths from gitOperations and externalIO adapters
drill_down_paths:
  []
duration: ""
verification_result: passed
completed_at: 2026-06-01T08:38:47.000Z
blocker_discovered: false
---

# S04: Div3 Scoped Budget Access

**Created SecretRef type contract, secret resolver seam, treasury grant issuer, and wired SecretRef into git/external IO adapters with fail-closed Paperclip resolution and 26 passing treasury tests.**

## What Happened

S04 delivered the bounded secret-access infrastructure for the autonomous company loop across five tasks:

T01 added treasury contract types to contracts.ts: SecretRef (PaperclipSecretRef | InlineEnvRef), AllowedGitOperation (clone/fetch/pull/push/read/write), ScopedAccessGrant (grant_id, mission_id, repo_url, allowed_ops, secret_ref, granted_by, granted_at, expires_at — no plaintext secret field), and TreasuryUnauthorized (mirroring MissionRouterUnauthorized). Also added 'access_grant' to DivisionPacketType. TypeScript typecheck passed cleanly.

T02 created secretResolver.ts with resolveSecretRef returning a discriminated union: {status:'resolved', value} or {status:'unavailable', blocker, code}. InlineEnvRef reads process.env[env_key] with 'missing_secret_env' on missing/empty; PaperclipSecretRef is intentionally fail-closed with 'secret_unavailable'. Added redactSecretRef for safe diagnostic/logging output. Exported from index.ts. 6 tests pass.

T03 created treasury.ts implementing issueScopedAccessGrant with strict caller === 'Div3.Treasury' identity check, runtime validation (repoUrl non-empty, allowedOps non-empty subset, secretRef valid shape), unique grant_id generation, ScopedAccessGrant construction with 24h expiration, 'access_grant' DivisionPacket emission to Div6.External (secret_ref only, no plaintext), and 'status_update' to Div1.HCO with redacted secret_ref. 23 treasury tests pass.

T04 wired SecretRef into gitOperations.ts and externalIO.ts. DefaultGitOperations accepts optional SecretRef, resolves via secretResolver before execution, returns auth_failure with redacted diagnostics on unavailable. buildAuthEnv accepts optional resolvedToken without mutating process.env. GitHubHttpAdapter and ExternalIOGateway accept optional SecretRef; preferredAdapter accounts for SecretRef presence. 8 new adapter tests added; all 58 git/externalIO tests pass.

T05 extended treasury.test.ts from 23 to 26 tests, adding explicit fail-closed PaperclipSecretRef resolution coverage, raw secret_ref redaction verification in status_update payloads, and multi-grant inbox accumulation coverage.

Full regression: 386/386 tests pass across 27 files. TypeScript typecheck: zero errors.

## Verification

All slice-level verification checks passed:
- TypeScript typecheck: tsc --noEmit completed with zero errors (3.1s)
- Treasury tests: 26/26 passed, exceeding the 25+ target (1.5s)
- Full regression suite: 386/386 tests passed across 27 files, exceeding the 346+ target (3.2s)
- gitOperations + externalIO tests: 58/58 passed (1.0s)
- Contract verification: ScopedAccessGrant contains SecretRef (not plaintext); TreasuryUnauthorized emitted on all unauthorized callers; only Div3.Treasury succeeds; PaperclipSecretRef returns status 'unavailable' with code 'secret_unavailable'; no secret value appears in any packet payload or diagnostic.

## Requirements Advanced

None.

## Requirements Validated

None.

## New Requirements Surfaced

None.

## Requirements Invalidated or Re-scoped

None.

## Operational Readiness

None.

## Deviations

None.

## Known Limitations

PaperclipSecretRef is fail-closed (always returns 'secret_unavailable') until live Paperclip runtime secret materialization is independently proven. Actual git operations against aipay.kz not yet validated — awaiting S05 (Div6 External Git Gateway).

## Follow-ups

None.

## Files Created/Modified

- `plugin-bos-light/src/contracts.ts` — Added SecretRef, AllowedGitOperation, ScopedAccessGrant, TreasuryUnauthorized types
- `plugin-bos-light/src/divisionPacketRouter.ts` — Added 'access_grant' to DivisionPacketType
- `plugin-bos-light/src/index.ts` — Exported secretResolver and treasury modules
- `plugin-bos-light/src/secretResolver.ts` — Created secret resolver seam with resolveSecretRef and redactSecretRef
- `plugin-bos-light/src/treasury.ts` — Created treasury grant issuer with strict Div3.Treasury auth and packet emission
- `plugin-bos-light/src/gitOperations.ts` — Wired optional SecretRef through DefaultGitOperations with fail-closed resolution
- `plugin-bos-light/src/externalIO.ts` — Wired optional SecretRef through GitHubHttpAdapter and ExternalIOGateway
- `plugin-bos-light/tests/treasury.test.ts` — 26 exhaustive tests for treasury grant issuer (created and extended)
- `plugin-bos-light/tests/secretResolver.test.ts` — 6 tests for secret resolver seam (created)
- `plugin-bos-light/tests/gitOperations.test.ts` — Extended with SecretRef-specific tests
- `plugin-bos-light/tests/externalIO.test.ts` — Extended with SecretRef-specific tests
