# S06 Research: Div5 Quarantine and Verification

## Summary

Slice S06 must build the Div5.QualificationsLibraryLearning quarantine module that receives `completion_report` packets from Div6.External, verifies `ExternalGitEvidence`, performs secret-leak scanning, records branch/ref inventory and commit SHAs, and produces a `SanitizedRepoSnapshot` approved for Div4.Production.

The primary risk is that S05’s `ExternalGitEvidence` only stores SHA256 hashes of stdout/stderr, so the actual ls-remote ref/SHA content is irretrievable by Div5. The recommended mitigation is an optional additive `parsed_metadata` field on `ExternalGitEvidence`.

## Requirements This Slice Owns/Supports

- **R022 (primary-user-loop)** — S06 is a critical link in the E2E mission cycle: Div6 → Div5 → Div4. Without quarantine verification, Div4 cannot receive an approved workspace.
- **R020 (integration)** — Git operations produce evidence that Div5 must verify before Div4 works on the repo.
- **R025 (failure-visibility)** — Div5 must produce visible verdict artifacts (gate decisions, status updates).

## What Exists

### Division Packet Infrastructure
- `divisionPacketRouter.ts` — in-memory packet store with `emitDivisionPacket`, `getDivisionInbox`, `clearPacketRouter`.
- `DivisionPacketType` includes `completion_report`, `gate_decision`, `status_update`, `escalation`, `work_assignment`.
- S05’s `div6ExternalGateway.ts` emits `completion_report` to `Div5.QualificationsLibraryLearning` with an `ExternalGitEvidence` payload, and `status_update` to `Div1.HCO`.

### Evidence and Security Primitives
- `ExternalGitEvidence` (S05): contains `trust_level: 'untrusted'`, `grant_id`, `mission_id`, `operation`, `git_evidence: GitCommandEvidence`, `quarantine_ref`.
- `GitCommandEvidence`: `command`, `args`, `cwd`, `env_keys`, `exit_code`, `stdout_hash`, `stderr_hash`, `duration_ms`, `success`, `error_category`, `redacted_diagnostics`.
- `SECRET_PATTERNS` and `redactSecrets` in `gitOperations.ts` — patterns for GitHub tokens, GitLab tokens, SSH keys, RSA/EC keys, and 40-char hex SHAs.
- `qaReview.ts` has `scanSecurity` for diff text, but nothing for git evidence envelopes.

### Contracts and Types
- `contracts.ts` has `ExternalGitGatewayUnauthorized`, `ScopedAccessGrant`, `EvalGateResult`, `CircuitBreakerRecord`, etc.
- No `QuarantineVerdict`, `SanitizedRepoSnapshot`, or `Div5QuarantineUnauthorized` types exist yet.

### Company Template Routing
- `external_io_request`: `Div1.HCO -> Div5.QualificationsLibraryLearning -> Div6.External -> Div5.QualificationsLibraryLearning`
- After quarantine, Div5 should route approved work to Div4.Production.

## What Is Missing

1. **Div5 quarantine module** — no code receives or processes Div6 `completion_report` packets.
2. **Quarantine-specific contracts** — types for `QuarantineVerdict`, `SanitizedRepoSnapshot`, and `Div5QuarantineUnauthorized`.
3. **Secret scan for git evidence** — `redactSecrets` exists but no scanner targets `ExternalGitEvidence` text fields.
4. **Ref/SHA inventory extraction** — `GitCommandEvidence` only stores hashes of stdout/stderr; actual ls-remote output is lost.
5. **Div5 → Div4 packet emission** — no `gate_decision` or `work_assignment` builder for sanitized snapshots.

## Key Constraints and Surprises

### Evidence Parsing Gap (Highest Risk)
S05’s `runGit` redacts stdout/stderr, then SHA256-hashes the redacted text:
```typescript
stdout_hash: sha256(redactedStdout),
stderr_hash: sha256(redactedStderr),
```
Div5 receives only the hash, not the content. For `ls-remote`, the ref names and commit SHAs are inside stdout. Without the raw stdout, Div5 cannot verify branch/ref inventory or record commit SHAs.

**Mitigation**: Add an optional `parsed_metadata` field to `ExternalGitEvidence` (non-breaking, additive). For `ls-remote`, Div6 can populate it with extracted refs:
```typescript
parsed_metadata?: {
  refs?: Array<{ ref: string; sha: string }>;
  files?: string[];
  branches?: string[];
};
```
For `clone`/`fetch`, it can remain absent or include `local_path`.

### Secret Scanning Scope
Div5 should scan:
- `git_evidence.redacted_diagnostics` for unredacted secrets (indicates a bug in Div6 redaction).
- Any `parsed_metadata` text fields.
- The evidence envelope itself for accidental secret inclusion.

Scanning should reuse `SECRET_PATTERNS` from `gitOperations.ts` and report findings as `SecurityFlag[]` (same shape as `qaReview.ts`).

### Caller Authorization
Following the S05 pattern, the quarantine function must reject all non-Div5 callers with `Div5QuarantineUnauthorized`.

### Trust Levels
- Div6 marks evidence as `untrusted`.
- Div5, after verification and sanitization, should mark the snapshot as `sanitized` or `rejected`.
- Div4 must only work on snapshots with `trust_level === 'sanitized'`.

## Natural Seams / Task Decomposition

### T01: Contract Types
**File**: `plugin-bos-light/src/contracts.ts`
Add:
- `Div5QuarantineUnauthorized` — mirror `ExternalGitGatewayUnauthorized` with `required_role: 'Div5.QualificationsLibraryLearning'`.
- `QuarantineVerdict` — `schema_version`, `quarantine_ref`, `grant_id`, `mission_id`, `verdict: 'APPROVED' | 'REJECTED' | 'NEEDS_REVIEW'`, `reason`, `git_evidence_valid`, `secret_scan_clean`, `snapshot_ref`, `produced_at`, `produced_by`.
- `SanitizedRepoSnapshot` — `schema_version`, `snapshot_id`, `mission_id`, `grant_id`, `quarantine_ref`, `repo_url`, `verified_refs`, `file_inventory`, `secret_scan_result`, `trust_level`, `produced_at`, `produced_by`.
- Optional: extend `ExternalGitEvidence` with `parsed_metadata`.

### T02: Div5 Quarantine Module
**File**: `plugin-bos-light/src/div5Quarantine.ts`
Build `verifyAndQuarantine` function:
1. **Caller auth** — reject if caller !== `Div5.QualificationsLibraryLearning`.
2. **Packet retrieval** — find `completion_report` in Div5 inbox matching `quarantine_ref`.
3. **Evidence validation** — verify `trust_level === 'untrusted'`, `git_evidence` exists, `grant_id` matches.
4. **Git success check** — if `git_evidence.success === false`, reject with `REJECTED`.
5. **Secret scan** — scan `redacted_diagnostics` and `parsed_metadata` for `SECRET_PATTERNS`; report `SecurityFlag[]`.
6. **Inventory recording** — build `verified_refs` from `parsed_metadata.refs` or from `git_evidence.args` (fallback).
7. **Snapshot creation** — build `SanitizedRepoSnapshot` with `trust_level: 'sanitized'` if all checks pass, else `rejected`.
8. **Packet emission** — on approval, emit `gate_decision` to `Div4.Production` with snapshot; on rejection, emit `escalation` to `Div1.HCO`; always emit `status_update` to `Div1.HCO`.

### T03: Optional ExternalGitEvidence Extension
**File**: `plugin-bos-light/src/div6ExternalGateway.ts`
- Add optional `parsed_metadata` to `ExternalGitEvidence` interface.
- Populate it in `executeExternalGitOperation` for `ls-remote` by parsing stdout before redaction/hashing.
- Update S05 tests to cover the new optional field (non-breaking).

### T04: Comprehensive Tests
**File**: `plugin-bos-light/tests/div5Quarantine.test.ts`
Cover:
- Caller auth rejection for all non-Div5 divisions.
- Missing `completion_report` in inbox.
- Evidence validation failures (wrong trust_level, missing git_evidence).
- Git failure rejection.
- Secret scan detection (inject fake secret in redacted_diagnostics).
- Secret scan pass (clean diagnostics).
- Snapshot creation with correct `trust_level`.
- Packet emission: `gate_decision` to Div4 on approval, `escalation` to Div1 on rejection, `status_update` to Div1 in both cases.
- Isolation between tests via `clearPacketRouter()`.

### T05: Export Wiring and Regression
**File**: `plugin-bos-light/src/index.ts`
- Export new module and types.
- Run `tsc --noEmit` and full vitest suite scoped to `plugin-bos-light/`.

## Verification Commands

```bash
# Type check
npx tsc --noEmit

# New module tests
npx vitest run plugin-bos-light/tests/div5Quarantine.test.ts

# Full regression
npx vitest run plugin-bos-light/
```

## Sources

- `plugin-bos-light/src/div6ExternalGateway.ts` — S05 completion_report emission
- `plugin-bos-light/src/divisionPacketRouter.ts` — packet routing primitives
- `plugin-bos-light/src/contracts.ts` — existing type contracts
- `plugin-bos-light/src/gitOperations.ts` — secret patterns and redaction
- `plugin-bos-light/src/qaReview.ts` — security scanning precedent
- `plugin-bos-light/src/evalGates.ts` — eval gate result shape
- `company-template/bos-company-template.json` — routing rules
- `agents/Div5_QualificationsLibraryLearning/AGENTS.md` — division responsibilities
- `agents/Div4_Production/AGENTS.md` — division inputs/outputs
- `agents/Div6_External/AGENTS.md` — external evidence routing rules
