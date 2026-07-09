# S07 Research: Div4 Production on Approved Workspace

## Slice Objective
Implement the Div4.Production module that receives an approved SanitizedRepoSnapshot via gate_decision packets from Div5, performs bounded local-only git work (test-branch creation, harmless file edit, commit), and emits structured completion evidence. Must enforce: no main-branch push, no production deployment, no raw external IO.

---

## What Exists (Reusable Patterns)

### Contracts & Types
- `SanitizedRepoSnapshot` (`contracts.ts`): `snapshot_id`, `quarantine_ref`, `mission_id`, `approved_for_division: 'Div4.Production'`, `branch_inventory`, `ref_inventory`, `commit_shas`, `secret_scan_passed`, `approved_at`, `approved_by`.
- `QuarantineVerdict` & `ExternalGitEvidence` (`div6ExternalGateway.ts`): envelope with `git_evidence`, `parsed_metadata`, `trust_level: 'untrusted'`.
- Strict unauthorized types exist for Div3 (`TreasuryUnauthorized`), Div5 (`Div5QuarantineUnauthorized`), Div6 (`ExternalGitGatewayUnauthorized`).

### Division Packet Router (`divisionPacketRouter.ts`)
- In-memory packet store with `emitDivisionPacket`, `getDivisionInbox`, `peekDivisionInbox`, `clearPacketRouter`.
- Packet types: `gate_decision`, `completion_report`, `status_update`, `escalation`, `access_grant`, `work_assignment`.
- Test isolation: `clearPacketRouter()` in `beforeEach`.

### Div5 Quarantine (`div5Quarantine.ts`)
- `verifyAndQuarantine(callerDivision, quarantineRef, expectedGrantId)`:
  - Strict caller auth: only `Div5.QualificationsLibraryLearning`.
  - Reads `completion_report` from Div5 inbox.
  - Validates evidence, scans secrets, builds `QuarantineVerdict` + `SanitizedRepoSnapshot`.
  - On approval: emits `gate_decision` → Div4.Production + `status_update` → Div1.HCO.
  - On rejection: emits `escalation` + `status_update` → Div1.HCO.
- Tests use a 6-division rejection matrix, packet emission assertions, and snapshot field validation.

### Git Operations (`gitOperations.ts`)
- `DefaultGitOperations` provides: `clone`, `checkoutBranch`, `add`, `commit`, `push`, `lsRemote`, `fetch`.
- All operations return `GitCommandEvidence` with hashes, exit codes, redaction, error classification.
- `SECRET_PATTERNS` exported for cross-module scanning.
- Tests mock `child_process.spawn` via `vi.mock`.

### Div6 External Gateway (`div6ExternalGateway.ts`)
- `executeExternalGitOperation(callerDivision, grantId, operation, localPath?, refs?)`:
  - Strict caller auth: only `Div6.External`.
  - Consumes `access_grant` from Div6 inbox.
  - Executes git via `DefaultGitOperations`.
  - Emits `completion_report` → Div5 + `status_update` → Div1.HCO.

---

## Critical Gap Discovered

**The approved workspace path is not propagated through the handoff chain.**

- Div6 receives `localPath` as a runtime argument to `executeExternalGitOperation`, but `ExternalGitEvidence` does **not** persist it.
- Div5 builds `SanitizedRepoSnapshot` and `gate_decision` payload without any `local_path` field.
- Div4 has no way to know which local directory it is authorized to work in.

This is a blocking contract gap. S07 cannot proceed without backward-compatible extensions to S05/S06 contracts.

---

## Recommended Approach

### 1. Backward-Compatible Contract Extensions
Add optional `local_path` fields so existing S05/S06 tests continue to pass without modification:

- **`ExternalGitEvidence`** (`div6ExternalGateway.ts`): add `local_path?: string` — populated by Div6 when `operation === 'clone'` or when `localPath` is provided.
- **`SanitizedRepoSnapshot`** (`contracts.ts`): add `local_path?: string` — copied from `ExternalGitEvidence.local_path` by Div5 during quarantine.
- **`gate_decision` payload** (`div5Quarantine.ts`): include `local_path` from the snapshot so Div4 receives it.

These are purely additive; no existing S06 test assertions need to change.

### 2. New Contract Types for Div4
Add to `contracts.ts`:
- `Div4ProductionUnauthorized` — mirrors pattern of Div5/Div6 unauthorized types.
- `ProductionWorkEvidence` — structured evidence of what Div4 did:
  - `schema_version: "1.0"`
  - `work_id`, `mission_id`, `snapshot_id`, `grant_id`
  - `branch_created`: string (test branch name)
  - `files_changed`: string[]
  - `commit_sha`: string
  - `diff_hash`: string (SHA256 of the diff)
  - `local_path`: string
  - `completed_at`, `completed_by: 'Div4.Production'`
  - `pushed`: boolean (should be false for S07 smoke test)

### 3. Div4 Production Module (`div4Production.ts`)
Implement `executeProductionWork(callerDivision, snapshotId)`:

- **Caller auth**: reject if caller !== `Div4.Production`.
- **Inbox read**: find `gate_decision` packet in Div4 inbox where `payload.snapshot_id === snapshotId`.
- **Validation**: verify `approved_for_division === 'Div4.Production'`, `secret_scan_passed === true`, `local_path` is present and non-empty.
- **Local git ops only** (use `DefaultGitOperations` without secretRef — local repo already has remotes configured by Div6 clone):
  1. `checkoutBranch(local_path, testBranch, true)` — create test branch.
  2. Write harmless file (e.g., `BOS_LIGHT_SMOKE_TEST.md`) with timestamp + mission_id via `fs.writeFileSync`.
  3. `add(local_path, [filePath])`.
  4. `commit(local_path, "BOS Light smoke test: harmless edit on test branch")`.
  5. **Do NOT push.**
- **Evidence build**: compute diff hash, capture commit SHA from git evidence, build `ProductionWorkEvidence`.
- **Packet emission**:
  - `completion_report` → `Div1.HCO` with `ProductionWorkEvidence` payload.
  - `status_update` → `Div5.QualificationsLibraryLearning` with summary.
- **Return**: `{ authorized: true, evidence: ProductionWorkEvidence, emitted: {...} }` or `Div4ProductionUnauthorized`.

### 4. Export Wiring (`index.ts`)
Add `export * from './div4Production'` alongside existing division exports.

---

## Natural Task Seams

| Task | Scope | Files | Risk |
|------|-------|-------|------|
| T01 | Extend contracts with `local_path` and Div4 types | `contracts.ts` | Low — additive only |
| T02 | Extend Div6 to persist `local_path` in evidence | `div6ExternalGateway.ts` | Low — optional field |
| T03 | Extend Div5 to propagate `local_path` through snapshot/gate_decision | `div5Quarantine.ts` | Low — optional field |
| T04 | Implement `div4Production.ts` module | `div4Production.ts` | Medium — new module, local FS + git |
| T05 | Tests + full regression | `div4Production.test.ts`, `index.ts` | Medium — verify no S05/S06 regressions |

**First proof / biggest unblocker**: T01–T03 contract extensions. Without `local_path`, Div4 has no workspace target.

---

## Implementation Landscape

### Technologies
- TypeScript, Node.js built-in `fs` module (no external dependency needed)
- `child_process` via `DefaultGitOperations` (already used and mocked in tests)
- Vitest for testing

### Skills Check
No installed skill directly covers this narrow plugin-contract extension work. The `api-design` skill could inform the evidence envelope shape, but the pattern is already established in the codebase. No new skill installation needed.

### Conventions to Follow
- `const DIV4_PRODUCTION = "Div4.Production" as const;`
- Unauthorized-first pattern: `buildUnauthorized(caller, reason)` helper.
- `now()` helper returning `new Date().toISOString()`.
- `generateWorkId()` helper: `` `work_${Date.now()}_${Math.random().toString(36).slice(2, 8)}` ``.
- Packet emission via `emitDivisionPacket` + return `DivisionPacketDiagnostic`.
- Test matrix for caller auth rejection across all 6 non-Div4 divisions.
- `clearPacketRouter()` per-test isolation.

### Git Test Strategy
Two viable approaches:
1. **Mock `child_process.spawn`** (consistent with S05/S06 tests) — deterministic, no filesystem cleanup, but requires more setup for multi-step git sequences.
2. **Real git + temp directory** — closer to real behavior, simpler assertions, but requires `git` binary in CI and temp-dir cleanup.

**Recommendation**: Use real git + `fs.mkdtempSync(os.tmpdir())` for S07. Div4’s value is proving local git ops actually work on a real repo structure. Mocking would hide integration issues. Cleanup with `fs.rmSync(tmpDir, { recursive: true })` in `afterEach`.

---

## Verification

- `npx tsc --noEmit` — zero type errors.
- `npx vitest run` — all existing tests pass (455+), new Div4 tests pass.
- Div4-specific test coverage should include:
  - Caller auth rejection for all non-Div4 divisions
  - Missing gate_decision in inbox
  - Missing `local_path` in snapshot
  - `approved_for_division` mismatch
  - Successful test-branch creation, file write, add, commit
  - `pushed: false` in evidence
  - Packet emission to Div1.HCO and Div5
  - `diff_hash` and `commit_sha` populated

---

## Requirements Mapping

| Requirement | Slice Ownership | S07 Role |
|-------------|----------------|----------|
| R020 — Local git CLI for Div4.Production | M005/S04 (primary), M005/S05 (supporting) | S07 owns the *local-only* git ops boundary: checkout, add, commit on approved snapshot. Does not own clone/push (Div6). |
| R022 — E2E mission cycle with Div4 code changes | M005/S05 (primary) | S07 is the Div4.Production link in the 7-division chain. Must emit visible evidence for downstream S08 Eval Gate. |
| R025 — Eval Gate and Circuit Breaker live evidence | M005/S05 (primary), M005/S04 (supporting) | S07 produces `ProductionWorkEvidence` that S08 Div5 Eval Gate will evaluate. |

---

## Watch-Outs

1. **Contract drift**: Adding `local_path` to S05/S06 contracts is safe because fields are optional, but any S06 test that does deep equality on `ExternalGitEvidence` or `SanitizedRepoSnapshot` may fail. The S06 div5Quarantine.test.ts uses `toEqual` on snapshot fields in some assertions — verify those still pass after contract extension.
2. **Main branch guard**: Div4 must not checkout or commit to `main`/`master`. The module should reject snapshots where the intended branch is main, or explicitly create a `bos-light-smoke-test` branch regardless of incoming branch inventory.
3. **No push enforcement**: `DefaultGitOperations.push` exists; Div4 module must never call it. This is an architectural boundary, not a runtime gate (per D035).
4. **Filesystem side effects**: Tests that use real git must clean up temp directories to avoid polluting the workspace.
5. **MEM046 / MEM058 compliance**: S07 evidence must not claim live Paperclip native artifact support. Use `ProductionWorkEvidence` as the primary envelope; Paperclip mirroring (if any) is S08+ scope.
