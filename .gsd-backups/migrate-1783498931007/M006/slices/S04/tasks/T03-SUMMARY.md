---
id: T03
parent: S04
milestone: M006
key_files:
  - plugin-bos-light/src/treasury.ts
  - plugin-bos-light/src/index.ts
  - plugin-bos-light/tests/treasury.test.ts
key_decisions:
  - Mirrored missionRouter.ts identity-check pattern (strict caller === 'Div3.Treasury' with TreasuryUnauthorized on failure)
  - Used unknown input types for allowedOps and secretRef with runtime type guards to enforce strict validation before grant construction
  - Set 24-hour expiration as default scoped access grant TTL
  - Trimmed repoUrl to prevent whitespace-only values from passing validation
duration: 
verification_result: passed
completed_at: 2026-06-01T08:20:54.348Z
blocker_discovered: false
---

# T03: Created treasury.ts implementing issueScopedAccessGrant with strict Div3.Treasury auth, runtime validation, packet emission, and 23 passing tests

**Created treasury.ts implementing issueScopedAccessGrant with strict Div3.Treasury auth, runtime validation, packet emission, and 23 passing tests**

## What Happened

Implemented plugin-bos-light/src/treasury.ts with issueScopedAccessGrant enforcing strict caller === 'Div3.Treasury' identity check, mirroring the missionRouter.ts pattern. Added runtime validation guards: repoUrl must be non-empty string (trimmed), allowedOps must be non-empty subset of AllowedGitOperation, and secretRef must have valid PaperclipSecretRef or InlineEnvRef shape. On success, generates a unique grant_id, constructs a ScopedAccessGrant with 24-hour expiration, emits an 'access_grant' DivisionPacket to Div6.External containing only secret_ref shapes (no plaintext), and emits a 'status_update' to Div1.HCO with redacted secret_ref and grant summary. Returns TreasuryUnauthorized on any auth or validation failure. Exported from index.ts. Added comprehensive tests covering auth rejection, all validation failures, packet emission to both divisions, redaction constraints, expiration timing, and packet router isolation. Typecheck passes and all 375 tests pass.

## Verification

Typecheck passes (tsc --noEmit). All 23 treasury tests pass. Full test suite 375/375 passes. Verified access_grant packet payload contains only SecretRef shape, no plaintext secret value. Verified status_update payload uses redactSecretRef. Verified TreasuryUnauthorized exposes caller, reason, rejected_at.

## Verification Evidence

| # | Command | Exit Code | Verdict | Duration |
|---|---------|-----------|---------|----------|
| 1 | `npm run typecheck --prefix plugin-bos-light` | 0 | ✅ pass | 3500ms |
| 2 | `npx vitest run tests/treasury.test.ts --prefix plugin-bos-light` | 0 | ✅ pass | 353ms |
| 3 | `npx vitest run --prefix plugin-bos-light` | 0 | ✅ pass | 2640ms |

## Deviations

None

## Known Issues

None

## Files Created/Modified

- `plugin-bos-light/src/treasury.ts`
- `plugin-bos-light/src/index.ts`
- `plugin-bos-light/tests/treasury.test.ts`
