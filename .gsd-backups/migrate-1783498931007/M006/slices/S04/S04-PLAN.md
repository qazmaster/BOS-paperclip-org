# S04: Div3 Scoped Budget Access

**Goal:** Git token is a scoped secret ref; repo URL and allowed operations are explicit; no plaintext secret appears anywhere; access grant artifact exists.
**Demo:** Git token is a scoped secret ref; repo URL and allowed operations are explicit; no plaintext secret appears anywhere; access grant artifact exists.

## Must-Haves

- TypeScript compiles with zero errors (npm run typecheck --prefix plugin-bos-light)
- Treasury tests pass with 25+ new tests (npx --prefix plugin-bos-light vitest run tests/treasury.test.ts)
- Full regression suite passes with 346+ total tests (npx --prefix plugin-bos-light vitest run)
- Only Div3.Treasury can issue scoped access grants; all other 6 divisions receive TreasuryUnauthorized
- ScopedAccessGrant contains SecretRef (not plaintext), repo_url, allowed_ops, and grant metadata
- Access grant DivisionPacket is emitted to Div6.External with 'access_grant' packet_type
- PaperclipSecretRef resolves fail-closed with blocker code 'secret_unavailable'
- No plaintext secret appears in any grant artifact, packet payload, diagnostic, or test assertion

## Proof Level

- This slice proves: contract

## Integration Closure

- Upstream surfaces consumed: contracts.ts Division types, divisionPacketRouter.ts packet emission, missionRouter.ts routing rules and caller-identity pattern
- New wiring introduced: treasury.ts grant issuer, secretResolver.ts resolution seam, SecretRef optional parameter in gitOperations.ts and externalIO.ts adapters
- What remains before the milestone is truly usable end-to-end: S05 (Div6 External Git Gateway) will consume the ScopedAccessGrant packet from Div6.External inbox and perform actual git operations using the resolved secret

## Verification

- Runtime signals: DivisionPacket emission with access_grant payload, status_update to Div1.HCO
- Inspection surfaces: divisionPacketRouter getDivisionInbox, treasury test artifacts
- Failure visibility: TreasuryUnauthorized with caller, reason, rejected_at; SecretResolutionUnavailable with blocker code
- Redaction constraints: Secret values never appear in diagnostics or packets; only secret_ref shapes and redacted representations

## Tasks

- [x] **T01: Add treasury contract types to contracts.ts** `est:20m`
  Add SecretRef (InlineEnvRef | PaperclipSecretRef), AllowedGitOperation, ScopedAccessGrant, and TreasuryUnauthorized types to contracts.ts. These pure types establish the bounded shape of scoped access grants without any runtime behavior. Update divisionPacketRouter.ts to add 'access_grant' to DivisionPacketType. Update index.ts wildcard exports. SecretRef must model Paperclip strict secret mode shape {type:'secret_ref', secret_id, version:'latest'} and test-only inline env fallback {type:'inline_env', env_key}. ScopedAccessGrant must contain grant_id, mission_id, repo_url, allowed_ops, secret_ref, granted_by, granted_at, expires_at — no plaintext secret field. TreasuryUnauthorized mirrors MissionRouterUnauthorized pattern.
  - Files: `plugin-bos-light/src/contracts.ts`, `plugin-bos-light/src/divisionPacketRouter.ts`, `plugin-bos-light/src/index.ts`
  - Verify: npm run typecheck --prefix plugin-bos-light

- [x] **T02: Create secret resolver seam** `est:25m`
  Create secretResolver.ts with resolveSecretRef(ref) that returns a discriminated union: {status:'resolved', value:string} | {status:'unavailable', blocker:string, code:string}. InlineEnvRef resolves by reading process.env[env_key]; if missing, returns code 'missing_secret_env'. PaperclipSecretRef returns fail-closed unavailable with code 'secret_unavailable'. Add redactSecretRef(ref) helper that returns a safe string representation for logging and diagnostics without exposing values. Export from index.ts. This seam allows adapters to accept SecretRef without knowing Paperclip internals.
  - Files: `plugin-bos-light/src/secretResolver.ts`, `plugin-bos-light/src/index.ts`
  - Verify: npm run typecheck --prefix plugin-bos-light

- [x] **T03: Create treasury grant issuer** `est:35m`
  Create treasury.ts implementing issueScopedAccessGrant(callerDivision, missionId, repoUrl, allowedOps, secretRef). Enforces strict caller === 'Div3.Treasury' identity check mirroring missionRouter.ts pattern. Validates repoUrl is non-empty, allowedOps is non-empty subset of AllowedGitOperation, and secretRef has valid shape. Generates grant_id. Constructs ScopedAccessGrant. Emits 'access_grant' DivisionPacket to Div6.External containing the grant (secret_ref only, no plaintext). Emits 'status_update' to Div1.HCO with redacted secret_ref and grant summary. Returns ScopedAccessGrant on success, TreasuryUnauthorized on any auth or validation failure. Export from index.ts.
  - Files: `plugin-bos-light/src/treasury.ts`, `plugin-bos-light/src/index.ts`
  - Verify: npm run typecheck --prefix plugin-bos-light

- [x] **T04: Wire SecretRef into git and external IO adapters** `est:40m`
  Modify gitOperations.ts DefaultGitOperations constructor to accept optional SecretRef parameter and thread it through all GitOperations methods. Modify internal runGit to resolve SecretRef via secretResolver.ts before execution; if unavailable, return auth_failure evidence with redacted diagnostics containing the blocker code. Modify buildAuthEnv to accept an optional envSource parameter so resolved tokens can be injected without mutating process.env. If no SecretRef provided, fall back to existing process.env behavior for backward compatibility. Modify externalIO.ts GitHubHttpAdapter and ExternalIOGateway constructors to accept optional SecretRef; resolve at construction or init time. Ensure redactSecrets still applies to all output. Verify existing adapter tests still pass unchanged.
  - Files: `plugin-bos-light/src/gitOperations.ts`, `plugin-bos-light/src/externalIO.ts`
  - Verify: npx --prefix plugin-bos-light vitest run tests/gitOperations.test.ts tests/externalIO.test.ts

- [x] **T05: Treasury contract and integration tests** `est:45m`
  Create tests/treasury.test.ts with exhaustive vitest coverage: (1) caller authorization — all 7 Division values as caller, only Div3.Treasury succeeds; (2) grant shape validation — repo_url, allowed_ops, secret_ref, granted_by, granted_at present and no plaintext secret; (3) packet emission — Div6.External inbox contains access_grant packet with ScopedAccessGrant payload, Div1.HCO inbox contains status_update with redacted secret_ref; (4) secret redaction — no secret value appears in any packet payload or diagnostic; (5) fail-closed PaperclipSecretRef — resolveSecretRef returns unavailable with code 'secret_unavailable'; (6) validation errors — empty repoUrl, empty allowedOps, invalid secretRef shape all return TreasuryUnauthorized; (7) router isolation via clearPacketRouter beforeEach. Use patterns from missionRouter.test.ts and externalIO.test.ts. Target 25+ tests.
  - Files: `plugin-bos-light/tests/treasury.test.ts`
  - Verify: npx --prefix plugin-bos-light vitest run tests/treasury.test.ts

## Files Likely Touched

- plugin-bos-light/src/contracts.ts
- plugin-bos-light/src/divisionPacketRouter.ts
- plugin-bos-light/src/index.ts
- plugin-bos-light/src/secretResolver.ts
- plugin-bos-light/src/treasury.ts
- plugin-bos-light/src/gitOperations.ts
- plugin-bos-light/src/externalIO.ts
- plugin-bos-light/tests/treasury.test.ts
