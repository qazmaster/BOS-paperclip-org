---
estimated_steps: 1
estimated_files: 3
skills_used: []
---

# T02: Add ExternalGitGatewayUnauthorized contract and create div6ExternalGateway.ts module

Create the division-policy types and the Div6 External Gateway module. Add ExternalGitGatewayUnauthorized to contracts.ts mirroring TreasuryUnauthorized (schema_version, authorized:false, caller, required_role:'Div6.External', reason, rejected_at). Create plugin-bos-light/src/div6ExternalGateway.ts containing: (1) ExternalGitEvidence type with trust_level:'untrusted', grant_id, mission_id, operation:'ls-remote'|'clone'|'fetch', git_evidence:GitCommandEvidence, quarantine_ref, produced_at, produced_by:'Div6.External'; (2) executeExternalGitOperation function accepting callerDivision, grantId, operation, optional localPath, optional refs; (3) strict caller === 'Div6.External' identity check; (4) consume access_grant packets from Div6 inbox via getDivisionInbox('Div6.External') and locate matching grant_id; (5) validate grant origin (granted_by === 'Div3.Treasury'), expiration (expires_at > now()), and allowed_ops mapping: ls-remote requires 'read'|'clone'|'fetch', clone requires 'clone', fetch requires 'fetch'|'pull'; (6) resolve secret_ref via resolveSecretRef and execute git via DefaultGitOperations; (7) on any validation failure return ExternalGitGatewayUnauthorized; (8) on execution success or git failure build ExternalGitEvidence; (9) emit completion_report to Div5.QualificationsLibraryLearning with the evidence payload; (10) emit status_update to Div1.HCO with redacted summary (grant_id, mission_id, operation, repo_url, success, error_category, trust_level, quarantine_ref); (11) export the module from index.ts. Follow treasury.ts patterns for caller identity, redaction via redactSecretRef, and packet emission.

## Inputs

- `plugin-bos-light/src/contracts.ts`
- `plugin-bos-light/src/gitOperations.ts`
- `plugin-bos-light/src/divisionPacketRouter.ts`
- `plugin-bos-light/src/secretResolver.ts`
- `plugin-bos-light/src/treasury.ts`
- `plugin-bos-light/src/index.ts`

## Expected Output

- `plugin-bos-light/src/contracts.ts`
- `plugin-bos-light/src/div6ExternalGateway.ts`
- `plugin-bos-light/src/index.ts`

## Verification

cd plugin-bos-light && npx tsc --noEmit
