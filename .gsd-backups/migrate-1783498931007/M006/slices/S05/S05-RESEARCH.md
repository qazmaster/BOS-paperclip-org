# S05: Div6 External Git Gateway — Research

## Scope

Slice S05 must enable Div6.External to execute bounded git operations (ls-remote, clone, fetch) through an approved gateway path, consuming ScopedAccessGrant packets emitted by Div3.Treasury. Raw external output must be marked untrusted and forwarded to Div5.QualificationsLibraryLearning for quarantine. Div4.Production must not perform direct external IO.

## Architecture Invariants (D036, D037)

Two architecture invariants were established during M006 planning and govern all downstream slices including S05:

**Invariant #1 — No BOS Runtime (D036):** BOS Light remains a Paperclip-native plugin/doctrine overlay. It must not create its own runtime, scheduler, event ledger, approval engine, issue lifecycle, worker lifecycle, policy engine, or hidden system of record. The `div6ExternalGateway.ts` module must be a **plugin tool adapter / structured packet builder**, not an independent execution runtime or event bus. Paperclip owns the execution plane; BOS Light only provides validators, artifact generators, readback probes, and doctrine enforcement helpers.

**Invariant #2 — Single Hermes Substrate / Multiple Division Profiles (D037):** All seven logical divisions (Div7.MissionControl through Div1.HCO) are backed by the **same Hermes adapter/runtime path**. The Div6 gateway is one division profile among seven, not a separate Hermes runtime. S05 gateway code must not spawn its own Hermes session, scheduler, or adapter instance. Division-profile boundaries (allowed tools, forbidden tools, trust rules) are enforced through **profile configuration and caller-identity gates**, not through separate runtime instances.

> **S05 implication:** `div6ExternalGateway.ts` consumes `access_grant` packets and executes git operations, but it does so as a plugin-hosted tool adapter within the shared Hermes substrate. Any design that creates a standalone execution loop, independent adapter registration, or separate agent lifecycle would violate D036/D037 and must be rejected.

## Active Requirements

| Requirement | Class | Relevance to S05 |
|---|---|---|
| R013 | compliance/security | Div6-only external IO boundary must be enforced in gateway code; Div4 cannot bypass |
| R020 | integration | Local git CLI integration — S05 adds ls-remote and Div6-orchestrated clone/fetch |
| R022 | primary-user-loop | E2E mission cycle requires Div6 to produce visible artifacts |

## What Exists

### Treasury → Div6 Packet Emission (S04 delivered)
- `treasury.ts`: `issueScopedAccessGrant()` emits `access_grant` DivisionPacket to Div6.External containing `ScopedAccessGrant` (secret_ref only, no plaintext). Strict caller check: `caller === 'Div3.Treasury'`.
- `divisionPacketRouter.ts`: In-memory packet store with `getDivisionInbox(Div6.External)`, `peekDivisionInbox`, `clearPacketRouter`. Packet types include `access_grant`.
- Tests: 26 treasury tests pass, including PaperclipSecretRef fail-closed, redaction, and multi-grant inbox accumulation.

### Git Operations Primitives
- `gitOperations.ts`: `DefaultGitOperations` implements `clone`, `checkoutBranch`, `add`, `commit`, `push`. Uses `spawn("git", ...)` with `buildAuthEnv` supporting `GIT_SSH_KEY`, `GITHUB_TOKEN`, `GITLAB_TOKEN`, and resolved `SecretRef`. Evidence envelope: `GitCommandEvidence` with sha256-hashed stdout/stderr, redacted diagnostics, and error classification (`missing_binary`, `non_fast_forward`, `auth_failure`, `generic`).
- **Gap**: No `ls-remote` operation. The `GitOperations` interface does not include remote ref enumeration.
- Tests: 309 lines covering all 5 operations, secret redaction, missing binary detection, auth failure, environment auth discovery, and SecretRef injection.

### External IO Gateway (GitHub API–only)
- `externalIO.ts`: `ExternalIOGateway` with `GhCliAdapter` and `GitHubHttpAdapter` for PRs, workflow triggers, and reviews. Accepts optional `SecretRef`. Evidence type: `ExternalIOEvidence`.
- **Gap**: This is a GitHub REST API gateway, not a raw git gateway. It does not consume `access_grant` packets or execute `git` CLI operations.
- Tests: 456 lines covering all adapter methods, SecretRef resolution, missing-token blockers, and error classification.

### Mission Router
- `missionRouter.ts`: Routing rules `external_io_request` and `paid_credentialed_external_io_request` already route through Div5 → Div6 → Div5 (and Div3 before Div6 for paid/credentialed). No code changes needed here.

### Boundary Enforcement Pattern
- `ownerBoundary.ts`: `enforceOwnerBoundary(caller, allowed)` — pure function. Div7 can cross any boundary; a division may act as itself; all else unauthorized.
- Treasury and MissionRouter already use this pattern (strict `caller === required_role` checks).

## What's Missing

### 1. `ls-remote` Git Operation
The `GitOperations` interface and `DefaultGitOperations` class lack `ls-remote(repoUrl, refs?)`, which is the primary read-only external git operation Div6 needs to enumerate branches/tags/HEAD without cloning.

### 2. Div6 External Gateway Module
No module exists that:
- Reads `access_grant` packets from the Div6 inbox via `getDivisionInbox`
- Validates grant origin (from Div3.Treasury), expiration, and allowed_ops subset
- Resolves `secret_ref` via `resolveSecretRef`
- Executes only allowed operations (`ls-remote`, `clone`, `fetch` — NOT `push`, `add`, `commit`, `write`)
- Marks all raw output as **untrusted**
- Emits evidence to Div5.QualificationsLibraryLearning for quarantine
- Emits `status_update` to Div1.HCO

### 3. Untrusted Evidence Contract
Need a new evidence type (e.g., `ExternalGitEvidence`) that:
- Explicitly carries `trust_level: "untrusted"`
- Contains SHA256 hashes of stdout/stderr (not raw content) — already done in `GitCommandEvidence`
- Includes grant_id, mission_id, operation performed, and error classification
- Is distinct from `GitCommandEvidence` (which is a primitive) and `ExternalIOEvidence` (which is GitHub API–specific)

### 4. Div4 Direct-IO Blocker
Div4.Production must not invoke `DefaultGitOperations.clone()` or `.fetch()` directly. Need a caller-identity gate or a "grant-required" wrapper so that Div4 operations on external remotes fail unless mediated by Div6. The simplest approach: a `Div4ProductionGitAdapter` that rejects external-repo operations without a `ScopedAccessGrant` reference, or a seam where Div4 only works on local paths after Div6 has produced a sanitized snapshot.

### 5. Packet Emission from Div6 → Div5
`divisionPacketRouter.ts` supports `status_update`, `escalation`, `resource_request`, `gate_decision`, `completion_report`, `work_assignment`, `access_grant`. Need to determine whether a new packet type (e.g., `external_evidence`) is warranted, or whether `completion_report` with an untrusted payload is sufficient. The company template routing says Div6 → Div5, so a `completion_report` or `status_update` to Div5 with the evidence payload is appropriate.

## Key Architecture Decisions Ahead

All decisions below are bounded by **D036** (no BOS runtime — gateway must be a plugin tool adapter, not an independent execution plane) and **D037** (single Hermes substrate — Div6 is one profile among seven, not a separate runtime). Any option that creates a standalone scheduler, event bus, adapter registration, or agent lifecycle outside Paperclip's Hermes path must be rejected.

1. **Gateway module name and location**: `plugin-bos-light/src/div6ExternalGateway.ts` is the natural placement, following the `treasury.ts` naming convention (division-specific logic in its own module).

2. **Untrusted evidence type**: Should it extend `GitCommandEvidence` with `trust_level`, or be a completely separate envelope? Recommendation: separate envelope (`ExternalGitEvidence`) that embeds a `GitCommandEvidence` plus `trust_level: "untrusted"`, `grant_id`, `quarantine_ref`. This keeps the primitive clean while adding division-policy metadata.

3. **Div4 boundary enforcement**: Two viable approaches:
   - **Option A**: `DefaultGitOperations` remains a primitive; add a `ProductionGitMediator` in a new `div4ProductionGit.ts` that checks for a `ScopedAccessGrant` before allowing clone/fetch on external URLs.
   - **Option B**: Keep enforcement in Div6 gateway only; Div4 uses a different interface (`LocalGitOperations`) that only operates on local paths, and the sanitized snapshot is passed to Div4 via file path or packet.
   - **S04 pattern**: S04 used adapter-boundary secret resolution (in `gitOperations.ts`/`externalIO.ts`) while keeping core logic agnostic. S05 should follow the same pattern: the gateway is the adapter boundary.

4. **Allowed ops enforcement**: The `ScopedAccessGrant.allowed_ops` already uses `AllowedGitOperation = "clone" | "fetch" | "pull" | "push" | "read" | "write"`. Div6 should map:
   - `ls-remote` → requires `"read"` or `"clone"` or `"fetch"` in allowed_ops
   - `clone` → requires `"clone"`
   - `fetch` → requires `"fetch"` or `"pull"`
   - `push`, `add`, `commit` → **rejected** by Div6 (these are Div4 operations)

## Natural Task Seams

| Task | Scope | Files | Unblocks |
|---|---|---|---|
| T01 | Add `ls-remote` to `gitOperations.ts` + tests | `gitOperations.ts`, `gitOperations.test.ts` | T02, T03 |
| T02 | Create `div6ExternalGateway.ts` with grant consumption, validation, and git execution | `div6ExternalGateway.ts`, `div6ExternalGateway.test.ts` | T03 |
| T03 | Add `ExternalGitEvidence` type, untrusted marking, and packet emission to Div5 + Div1 | `contracts.ts`, `div6ExternalGateway.ts` | T04 |
| T04 | Add Div4 direct-IO blocker / production git mediator | `div4ProductionGit.ts` (or modify `gitOperations.ts`) | T05 |
| T05 | Full regression, integration tests, typecheck | All test files | Slice closeout |

## First Proof / Highest Risk

The `div6ExternalGateway.ts` module is the highest-risk deliverable: it orchestrates packet consumption, grant validation (security-critical), secret resolution, git execution, evidence emission, and division boundary enforcement. However, it depends on `ls-remote` (T01), so T01 is the logical first task to unblock the rest.

## Verification Commands

- `cd plugin-bos-light && npx tsc --noEmit` — TypeScript typecheck (zero errors)
- `cd plugin-bos-light && npx vitest run` — All unit tests pass
- Target: maintain 386+ passing tests, exceed 25+ new tests for gateway

## Constraints & Gotchas

- **MEM078**: Div6-only external IO boundary is mandatory. Div4 must not receive raw web/API/customer/vendor tools.
- **MEM216**: Treasury already uses strict `caller === 'Div3.Treasury'` identity check. Div6 gateway should mirror this pattern for grant validation.
- **R013**: Only Div6.External may interact with external world. Any code path that allows Div4 to reach external remotes directly violates a validated compliance requirement.
- **D036 — No BOS Runtime**: `div6ExternalGateway.ts` must be a plugin tool adapter / packet builder only. It must not create its own scheduler, event ledger, approval engine, or hidden system of record. Paperclip owns execution; BOS Light provides doctrine enforcement and structured packets.
- **D037 — Single Hermes Substrate**: Div6 is one of seven division profiles on the same Hermes adapter/runtime path. The gateway must not spawn a separate Hermes session, adapter instance, or agent lifecycle. Profile boundaries are enforced by caller-identity gates and allowed-tools lists, not by separate runtimes.
- **Secret redaction**: `GitCommandEvidence` already hashes stdout/stderr. Ensure `ExternalGitEvidence` preserves this pattern and never includes raw external output.
- **Fail-closed PaperclipSecretRef**: `resolveSecretRef` returns `unavailable` for `PaperclipSecretRef`. The gateway must handle this gracefully (emit failure evidence to Div5, not crash).

## No-Go Zones

- Do NOT add `push`, `add`, `commit` to Div6 gateway. These are Div4.Production operations.
- Do NOT allow Div4 to resolve secrets or call external remotes without a grant.
- Do NOT reuse S04 evidence or claim live Paperclip runtime proof. S05 is code-level delivery; live runtime proof is S10 scope.
- Do NOT create a standalone BOS runtime, scheduler, event ledger, or adapter registration in the gateway. Per **D036**, BOS Light does not own execution plane — only plugin tool adapters and packet builders.
- Do NOT spawn a separate Hermes session, adapter instance, or agent lifecycle for Div6. Per **D037**, all seven divisions share one Hermes substrate; Div6 is a profile, not an independent runtime.
