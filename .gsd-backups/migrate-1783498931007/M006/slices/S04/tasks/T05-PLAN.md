---
estimated_steps: 1
estimated_files: 1
skills_used: []
---

# T05: Treasury contract and integration tests

Create tests/treasury.test.ts with exhaustive vitest coverage: (1) caller authorization — all 7 Division values as caller, only Div3.Treasury succeeds; (2) grant shape validation — repo_url, allowed_ops, secret_ref, granted_by, granted_at present and no plaintext secret; (3) packet emission — Div6.External inbox contains access_grant packet with ScopedAccessGrant payload, Div1.HCO inbox contains status_update with redacted secret_ref; (4) secret redaction — no secret value appears in any packet payload or diagnostic; (5) fail-closed PaperclipSecretRef — resolveSecretRef returns unavailable with code 'secret_unavailable'; (6) validation errors — empty repoUrl, empty allowedOps, invalid secretRef shape all return TreasuryUnauthorized; (7) router isolation via clearPacketRouter beforeEach. Use patterns from missionRouter.test.ts and externalIO.test.ts. Target 25+ tests.

## Inputs

- `plugin-bos-light/src/treasury.ts`
- `plugin-bos-light/src/secretResolver.ts`
- `plugin-bos-light/src/contracts.ts`
- `plugin-bos-light/src/divisionPacketRouter.ts`
- `plugin-bos-light/tests/missionRouter.test.ts`
- `plugin-bos-light/tests/externalIO.test.ts`

## Expected Output

- `plugin-bos-light/tests/treasury.test.ts`

## Verification

npx --prefix plugin-bos-light vitest run tests/treasury.test.ts
