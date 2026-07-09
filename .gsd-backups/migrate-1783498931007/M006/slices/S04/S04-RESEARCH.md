# S04 Research: Div3 Scoped Budget Access

## Slice Objective
> After this: Git token is a scoped secret ref; repo URL and allowed operations are explicit; no plaintext secret appears anywhere; access grant artifact exists.

## Requirements Mapping
| Requirement | Relevance |
|-------------|-----------|
| **R020** (Local git CLI integration for aipay.kz) | Div3 must issue scoped access grants that downstream Div4/Div6 consume for git operations. |
| **R024** (Hybrid state persistence) | Access grant artifacts must mirror to Paperclip native surfaces when available; in-memory cache overlay otherwise. |

## Existing Codebase Inventory

### Secret / Token Handling (pre-S04)
- `plugin-bos-light/src/externalIO.ts` — `GitHubHttpAdapter` reads `process.env.GITHUB_TOKEN` directly (plaintext env). `hasGitHubToken()` checks env. `redactSecrets()` strips `ghp_`, `glpat-`, SSH keys.
- `plugin-bos-light/src/gitOperations.ts` — `buildAuthEnv()` reads `GITHUB_TOKEN`, `GITLAB_TOKEN`, `GIT_SSH_KEY` from `process.env`. `redactSecrets()` hashes stdout/stderr after redaction.
- **Gap:** Neither module accepts a `SecretRef` abstraction. Both are hard-wired to raw env vars.

### Routing & Contracts (S03 completed)
- `plugin-bos-light/src/missionRouter.ts` — `routeApprovedMission()` emits `work_assignment` packets to activated divisions. Derives `budget_capacity` rule for Div3-only, and `paid_credentialed_external_io_request` when Div3 + Div5 + Div6 are activated.
- `plugin-bos-light/src/contracts.ts` — Has `BOSConfig.company_token_budget_ref`, `BPIScore.hard_gates.budget_snapshot_available`, `DivisionPacketType` includes `work_assignment` and `resource_request`. No `SecretRef`, no `AccessGrant` types.
- `plugin-bos-light/src/divisionPacketRouter.ts` — In-memory packet store with `emitDivisionPacket`, `getDivisionInbox`, `clearPacketRouter`.

### Tests
- `tests/externalIO.test.ts` — 38 tests covering `GhCliAdapter`, `GitHubHttpAdapter`, `ExternalIOGateway`, redaction, auth discovery.
- `tests/gitOperations.test.ts` — 17 tests covering clone, checkout, add, commit, push, missing binary, non-fast-forward, auth failure, secret redaction, env auth discovery.
- No treasury-specific tests exist.

### Environment
- `.env` lacks `GITHUB_TOKEN_AIPAY` (MEM194). Live secret materialization is blocked.
- `.env` has `PAPERCLIP_API_KEY`, `XIAOMI_API_KEY`, etc.
- `PAPERCLIP_COMPANY_ID` is missing from `.env` but known from docs (`43c74adb-b194-44d1-8f8e-ba142544bb9d`).

## Key Constraints & Gotchas

1. **MEM041 — Paperclip secret_ref pattern**  
   Paperclip strict secret mode expects `{type:'secret_ref', secretId, version:'latest'}`. Inline env values are rejected. S04 contracts must model this shape even if live materialization is unvalidated.

2. **MEM194 — Missing GITHUB_TOKEN_AIPAY**  
   No live git token exists in the environment. Any S04 runtime probe must fail-closed with precise blocker codes, not fabricate credentials.

3. **Div3.Treasury guardrails (AGENTS.md)**  
   - Div3 does not perform external IO.  
   - Div3 grants permissions but does not use external tools directly.  
   - Div3 must not expose plaintext secrets.  
   - Div3 must not authorize wildcard permissions.  
   - No web/search tools.

4. **Company template routing**  
   `paid_credentialed_external_io_request` path: Div1 → Div5 → Div3 → Div6 → Div5.  
   This means Div3 issues the grant, Div6 performs the actual git/GitHub IO. Div4.Production works on the sanitized snapshot post-quarantine (S06/S07).

5. **R013 compliance**  
   Only Div6.External may interact with the external world. S04 must not give raw git/GitHub tools to Div3 or Div4.

## Design Landscape

### Option A: Add SecretRef + ScopedAccessGrant to contracts.ts; create treasury.ts
- `SecretRef` union: `InlineEnvRef` (test-only) | `PaperclipSecretRef` (production target)
- `ScopedAccessGrant` includes: `grant_id`, `mission_id`, `repo_url`, `allowed_ops: GitOp[]`, `secret_ref: SecretRef`, `granted_by: "Div3.Treasury"`, `granted_at`, `expires_at?`
- `treasury.ts` exposes `issueScopedAccessGrant(callerDivision, mission, repoUrl, ops)` with strict `caller === "Div3.Treasury"` check (mirrors missionRouter.ts caller identity pattern).
- Access grant artifact emitted as `DivisionPacket` to Div6.External and status_update to Div1.HCO.

### Option B: Extend existing externalIO.ts/gitOperations.ts to accept SecretRef
- Modify `GitHubHttpAdapter` and `DefaultGitOperations` constructors to accept a `SecretRef` instead of reading env directly.
- Add a `resolveSecretRef(ref)` seam that currently only resolves `InlineEnvRef` (fail-closed for `PaperclipSecretRef` with blocker diagnostic).
- Keeps change localized to existing modules.

### Recommendation
**Hybrid: Option A for contracts + treasury logic; Option B for git/IO adapter seams.**  
This follows the established pattern: contracts in `contracts.ts`, division logic in its own module (`treasury.ts`), and adapter seams in existing infrastructure modules. The treasury module owns the grant decision; git/IO modules own secret resolution at execution time.

## Natural Task Seams

1. **Contracts (contracts.ts)** — Add `SecretRef`, `ScopedAccessGrant`, `TreasuryUnauthorized`, `AllowedGitOperation` types. Pure types, zero runtime risk.
2. **Treasury grant issuer (treasury.ts)** — `issueScopedAccessGrant()` with strict caller identity, routing rule validation, packet emission to Div6. Depends on contracts + divisionPacketRouter.
3. **Secret resolution seam (secretResolver.ts)** — `resolveSecretRef()` that handles `InlineEnvRef` locally and returns `secret_unavailable` for `PaperclipSecretRef`. Used by gitOperations.ts and externalIO.ts.
4. **Adapter wiring (gitOperations.ts + externalIO.ts)** — Accept optional `SecretRef` parameter; fall back to existing env behavior for backward compatibility; redact all diagnostics.
5. **Tests (tests/treasury.test.ts)** — Caller authorization, grant shape validation, packet emission, secret redaction, fail-closed on PaperclipSecretRef.

## First Proof / Highest Risk
The **treasury.ts caller-identity enforcement** is the highest risk: if any division can spoof Div3 and issue grants, the security boundary collapses. This must be tested exhaustively (all 7 divisions as caller, only Div3 authorized).

## Verification Plan
- TypeScript typecheck: `npm run typecheck`
- Treasury tests: `npx vitest run tests/treasury.test.ts`
- Full regression: `npx vitest run` (must remain 346+ passing)
- Runtime evidence: fail-closed artifact if `GITHUB_TOKEN_AIPAY` unavailable, with blocker codes (`secret_unavailable`, `missing_secret_env`, `plaintext_fallback_only`).

## Live Runtime Claims
- **No live Paperclip secret materialization can be claimed** in S04 because `GITHUB_TOKEN_AIPAY` is absent and Paperclip secret APIs were not probed in S00/S01.
- S04 produces **local-only contracts and fail-closed evidence** with precise blocker diagnostics, consistent with MEM058 (only bounded live issue/document/comment surfaces are confirmed; all other capabilities remain fallback-only or unvalidated).

## Follow-up for S05/S06
- S05 (Div6 External Git Gateway) will consume the `ScopedAccessGrant` packet and attempt actual git operations.
- S06 (Div5 Quarantine) will verify the grant artifact, scan for secret leaks, and approve the sanitized snapshot for Div4.
