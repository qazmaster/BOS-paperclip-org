---
estimated_steps: 1
estimated_files: 3
skills_used: []
---

# T01: Add treasury contract types to contracts.ts

Add SecretRef (InlineEnvRef | PaperclipSecretRef), AllowedGitOperation, ScopedAccessGrant, and TreasuryUnauthorized types to contracts.ts. These pure types establish the bounded shape of scoped access grants without any runtime behavior. Update divisionPacketRouter.ts to add 'access_grant' to DivisionPacketType. Update index.ts wildcard exports. SecretRef must model Paperclip strict secret mode shape {type:'secret_ref', secret_id, version:'latest'} and test-only inline env fallback {type:'inline_env', env_key}. ScopedAccessGrant must contain grant_id, mission_id, repo_url, allowed_ops, secret_ref, granted_by, granted_at, expires_at — no plaintext secret field. TreasuryUnauthorized mirrors MissionRouterUnauthorized pattern.

## Inputs

- `plugin-bos-light/src/contracts.ts`
- `plugin-bos-light/src/divisionPacketRouter.ts`
- `plugin-bos-light/src/index.ts`

## Expected Output

- `plugin-bos-light/src/contracts.ts`
- `plugin-bos-light/src/divisionPacketRouter.ts`
- `plugin-bos-light/src/index.ts`

## Verification

npm run typecheck --prefix plugin-bos-light
