# S05: Div6 External Git Gateway

**Goal:** Enable Div6.External to execute bounded git operations (ls-remote, clone, fetch) through an approved gateway path, consuming ScopedAccessGrant packets from Div3.Treasury, marking all raw output as untrusted, and forwarding evidence to Div5.QualificationsLibraryLearning for quarantine. Div4.Production must not perform direct external IO.
**Demo:** Git ls-remote or clone/fetch executed by approved external gateway path; Div4 does not perform direct external IO; raw output marked untrusted.

## Must-Haves

- ls-remote operation added to GitOperations interface with passing tests
- div6ExternalGateway.ts module created with strict caller identity check, grant validation (origin, expiration, allowed_ops), secret resolution, and git execution
- ExternalGitEvidence type marks all output trust_level: 'untrusted' with SHA256-hashed stdout/stderr
- Gateway emits completion_report to Div5.QualificationsLibraryLearning and status_update to Div1.HCO
- 25+ new tests pass for gateway and ls-remote combined
- Full regression: 386+ total tests pass, zero TypeScript typecheck errors

## Proof Level

- This slice proves: contract

## Integration Closure

- Upstream surfaces consumed: ScopedAccessGrant packets from Div3.Treasury via divisionPacketRouter, SecretRef resolution via secretResolver.ts, GitCommandEvidence from gitOperations.ts
- New wiring introduced: div6ExternalGateway.ts as the sole external-git execution path for Div6.External; executeExternalGitOperation is the only function that should perform external git CLI operations
- What remains before milestone is truly usable end-to-end: S06 (Div5 Quarantine and Verification) must consume untrusted ExternalGitEvidence and produce a sanitized snapshot for Div4; S07 (Div4 Production on Approved Workspace) must work only on the sanitized local path; actual live Paperclip runtime proof is S10 scope

## Verification

- Runtime signals: ExternalGitEvidence with trust_level, error_category, and redacted_diagnostics; ExternalGitGatewayUnauthorized with caller, reason, rejected_at
- Inspection surfaces: Division packet inboxes (getDivisionInbox) for Div5 and Div1 contain gateway emissions
- Failure visibility: auth failures produce evidence with error_category 'auth_failure' and redacted_diagnostics; grant validation failures return ExternalGitGatewayUnauthorized with precise reason
- Redaction constraints: No raw external output in evidence; only SHA256 hashes and redacted diagnostics

## Tasks

- [x] **T01: Add ls-remote to GitOperations interface and DefaultGitOperations** `est:30m`
  The GitOperations interface currently supports clone, checkoutBranch, add, commit, push. Div6.External needs ls-remote to enumerate remote refs without cloning. Add lsRemote(repoUrl: string, refs?: string[]): Promise<GitCommandEvidence> to the GitOperations interface and implement it in DefaultGitOperations using spawn with args ["ls-remote", repoUrl, ...(refs || [])]. Extend gitOperations.test.ts with tests for: (1) ls-remote command shaping, (2) ls-remote with optional refs, (3) evidence envelope includes all required fields for ls-remote, (4) error classification (missing binary, auth failure) for ls-remote. Use the existing mock-spawn pattern.
  - Files: `plugin-bos-light/src/gitOperations.ts`, `plugin-bos-light/tests/gitOperations.test.ts`
  - Verify: cd plugin-bos-light && npx vitest run tests/gitOperations.test.ts

- [x] **T02: Add ExternalGitGatewayUnauthorized contract and create div6ExternalGateway.ts module** `est:1h`
  Create the division-policy types and the Div6 External Gateway module. Add ExternalGitGatewayUnauthorized to contracts.ts mirroring TreasuryUnauthorized (schema_version, authorized:false, caller, required_role:'Div6.External', reason, rejected_at). Create plugin-bos-light/src/div6ExternalGateway.ts containing: (1) ExternalGitEvidence type with trust_level:'untrusted', grant_id, mission_id, operation:'ls-remote'|'clone'|'fetch', git_evidence:GitCommandEvidence, quarantine_ref, produced_at, produced_by:'Div6.External'; (2) executeExternalGitOperation function accepting callerDivision, grantId, operation, optional localPath, optional refs; (3) strict caller === 'Div6.External' identity check; (4) consume access_grant packets from Div6 inbox via getDivisionInbox('Div6.External') and locate matching grant_id; (5) validate grant origin (granted_by === 'Div3.Treasury'), expiration (expires_at > now()), and allowed_ops mapping: ls-remote requires 'read'|'clone'|'fetch', clone requires 'clone', fetch requires 'fetch'|'pull'; (6) resolve secret_ref via resolveSecretRef and execute git via DefaultGitOperations; (7) on any validation failure return ExternalGitGatewayUnauthorized; (8) on execution success or git failure build ExternalGitEvidence; (9) emit completion_report to Div5.QualificationsLibraryLearning with the evidence payload; (10) emit status_update to Div1.HCO with redacted summary (grant_id, mission_id, operation, repo_url, success, error_category, trust_level, quarantine_ref); (11) export the module from index.ts. Follow treasury.ts patterns for caller identity, redaction via redactSecretRef, and packet emission.
  - Files: `plugin-bos-light/src/contracts.ts`, `plugin-bos-light/src/div6ExternalGateway.ts`, `plugin-bos-light/src/index.ts`
  - Verify: cd plugin-bos-light && npx tsc --noEmit

- [x] **T03: Create comprehensive div6ExternalGateway.test.ts** `est:1h`
  Write exhaustive unit tests for the Div6 External Gateway covering: (a) Caller authorization — rejects every non-Div6 division (Div1, Div2, Div3, Div4, Div5, Div7); (b) Grant lookup — fails when grant_id not found in Div6 inbox; (c) Grant validation — fails for grants with granted_by !== 'Div3.Treasury', expired grants, and grants missing required allowed_ops; (d) Operation enforcement — ls-remote rejected when allowed_ops lacks read/clone/fetch, clone rejected without clone permission, fetch rejected without fetch/pull; (e) Secret resolution — PaperclipSecretRef returns auth_failure evidence (not Unauthorized) with redacted diagnostics; InlineEnvRef success path; (f) Git execution — mock child_process spawn to test success, missing binary (ENOENT), and auth failure for ls-remote, clone, and fetch; (g) Packet emission — verify completion_report reaches Div5 inbox with ExternalGitEvidence payload, and status_update reaches Div1 inbox; (h) Evidence integrity — trust_level is always 'untrusted', no raw stdout/stderr in evidence (only SHA256 hashes), redacted_diagnostics present. Use vitest with vi.mock('child_process') following the gitOperations.test.ts and externalIO.test.ts pattern. Clear packet router in beforeEach.
  - Files: `plugin-bos-light/tests/div6ExternalGateway.test.ts`
  - Verify: cd plugin-bos-light && npx vitest run tests/div6ExternalGateway.test.ts

- [x] **T04: Full regression — typecheck and complete test suite** `est:15m`
  Run the complete verification suite to confirm zero TypeScript compilation errors and all unit tests passing. Target: maintain all 386+ existing tests from prior slices plus 25+ new tests added in S05, with zero typecheck errors.
  - Verify: cd plugin-bos-light && npx tsc --noEmit && npx vitest run

## Files Likely Touched

- plugin-bos-light/src/gitOperations.ts
- plugin-bos-light/tests/gitOperations.test.ts
- plugin-bos-light/src/contracts.ts
- plugin-bos-light/src/div6ExternalGateway.ts
- plugin-bos-light/src/index.ts
- plugin-bos-light/tests/div6ExternalGateway.test.ts
