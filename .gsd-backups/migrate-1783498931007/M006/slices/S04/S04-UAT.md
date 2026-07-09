# S04: Div3 Scoped Budget Access — UAT

**Milestone:** M006
**Written:** 2026-06-01T08:38:47.000Z

# UAT: Div3 Scoped Budget Access (S04)

- **UAT required:** no

This slice delivers contract-level infrastructure (types, resolver seam, grant issuer, adapter wiring) with no user-facing runtime or browser behavior. Acceptance is covered by automated tests.

## Preconditions
- plugin-bos-light installed and dependencies resolved
- `npm run typecheck` and `npx vitest run` available

## Steps
1. Run `npx vitest run tests/treasury.test.ts` — verify 26+ tests pass
2. Run `npx vitest run tests/secretResolver.test.ts` — verify 6 tests pass
3. Run `npx vitest run tests/gitOperations.test.ts tests/externalIO.test.ts` — verify all adapter tests pass
4. Run `npm run typecheck` — verify zero TypeScript errors

## Expected Outcomes
- Treasury tests pass with coverage of: caller auth (only Div3.Treasury succeeds), grant shape validation, packet emission to Div6.External and Div1.HCO, secret redaction, fail-closed PaperclipSecretRef, validation error paths
- Secret resolver tests pass with coverage of: InlineEnvRef resolution, missing/empty env, PaperclipSecretRef fail-closed, redaction
- Adapter tests pass with coverage of: SecretRef token injection, unavailable-secret auth_failure, process.env fallback
- TypeScript compiles with zero errors

## Edge Cases Verified
- All 7 Division values tested as caller; only Div3.Treasury succeeds
- Empty repoUrl, empty allowedOps, invalid secretRef shape all return TreasuryUnauthorized
- PaperclipSecretRef always returns unavailable (fail-closed)
- status_update payload contains redacted secret_ref, not raw secret_ref object
- Multiple grants accumulate correctly in division inboxes
- Resolved token injected into git env without mutating process.env
- No SecretRef provided falls back to existing process.env behavior

## UAT Type
Contract / automated test coverage
