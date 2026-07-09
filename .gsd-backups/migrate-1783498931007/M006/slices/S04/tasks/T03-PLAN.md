---
estimated_steps: 1
estimated_files: 2
skills_used: []
---

# T03: Create treasury grant issuer

Create treasury.ts implementing issueScopedAccessGrant(callerDivision, missionId, repoUrl, allowedOps, secretRef). Enforces strict caller === 'Div3.Treasury' identity check mirroring missionRouter.ts pattern. Validates repoUrl is non-empty, allowedOps is non-empty subset of AllowedGitOperation, and secretRef has valid shape. Generates grant_id. Constructs ScopedAccessGrant. Emits 'access_grant' DivisionPacket to Div6.External containing the grant (secret_ref only, no plaintext). Emits 'status_update' to Div1.HCO with redacted secret_ref and grant summary. Returns ScopedAccessGrant on success, TreasuryUnauthorized on any auth or validation failure. Export from index.ts.

## Inputs

- `plugin-bos-light/src/contracts.ts`
- `plugin-bos-light/src/divisionPacketRouter.ts`
- `plugin-bos-light/src/secretResolver.ts`
- `plugin-bos-light/src/missionRouter.ts`
- `plugin-bos-light/src/index.ts`

## Expected Output

- `plugin-bos-light/src/treasury.ts`
- `plugin-bos-light/src/index.ts`

## Verification

npm run typecheck --prefix plugin-bos-light

## Observability Impact

DivisionPacket emission with access_grant payload containing ScopedAccessGrant; future agents inspect via getDivisionInbox('Div6.External') and getDivisionInbox('Div1.HCO'); TreasuryUnauthorized exposes caller, reason, and rejected_at on failure
