# S08: Div5 Eval Gate — Research

## Summary

S08 implements Div5's post-production verification gate: after Div4.Production completes local git work, Div5 verifies that the claimed ProductionWorkEvidence (commit SHA, branch, files, pushed:false) matches reality on the local workspace. This is the acceptance gate before the mission can proceed to S09 (Circuit Breaker) and S10 (E2E).

## What S07 Produced (Forward Intelligence)

S07 delivered:
- `div4Production.ts` — async `executeProductionWork(callerDivision, snapshotId, gitOps?)` that creates test branch, writes `.bos-smoke-test.md`, git add/commit, returns `ProductionWorkEvidence`
- `ProductionWorkEvidence` contract: `{ schema_version, mission_id, snapshot_id, commit_sha, diff_hash, branch_created, files_changed, pushed:false, produced_at, produced_by }`
- Div4 emits `status_update` to Div5 with `{ mission_id, snapshot_id, commit_sha, branch_created, pushed:false, status:"COMPLETED" }`
- Div4 emits `completion_report` to Div1 with full evidence
- Working local git workspace on test branch for S08 to verify
- local_path propagation chain: Div6 → Div5 → Div4 (via gate_decision payload)

**Fragility:** Div4's status_update to Div5 is a plain object, not the full `ProductionWorkEvidence` type. S08 must read the status_update payload fields directly (commit_sha, branch_created, snapshot_id) rather than casting to ProductionWorkEvidence.

**Changed assumptions:** None — S07 completed as planned with no scope changes.

## What S08 Needs to Do

### Input
- Read `status_update` packets from Div5 inbox (sent by Div4.Production)
- Extract: mission_id, snapshot_id, commit_sha, branch_created
- Need local_path — this is NOT in Div4's status_update to Div5. Two options:
  1. Read it from the original gate_decision in Div5's own records (Div5 sent gate_decision to Div4 with local_path)
  2. Add local_path to Div4's status_update payload (requires S07 code change)

**Decision:** Option 1 is cleaner — Div5 already has the gate_decision it sent to Div4 in its own state. The status_update contains snapshot_id which can be used to correlate back. However, looking at the code, Div5 doesn't store its own outbound packets. The gate_decision was emitted via `emitDivisionPacket` which puts it in Div4's inbox, not Div5's. So S08 needs to either:
- Look in Div4's inbox for the gate_decision (reads another division's inbox — breaks encapsulation)
- Have Div4 include local_path in its status_update to Div5 (cleanest — minor S07 enhancement)
- Have S08 accept local_path as a parameter (pushes responsibility to orchestrator)

**Recommended:** Add local_path to Div4's status_update payload. This is a one-line change in div4Production.ts and keeps the data flow clean. The alternative (passing local_path as a parameter) works but breaks the packet-based communication pattern.

### Verification Checks

The module performs these acceptance checks against the local workspace:

1. **branch_exists** — `git branch` output contains branch_created
2. **commit_sha_matches_head** — `git rev-parse HEAD` on the test branch matches commit_sha from evidence
3. **smoke_file_exists** — `.bos-smoke-test.md` exists on disk at local_path
4. **files_changed_present** — all files in files_changed exist on disk
5. **not_pushed** — `git remote` returns empty (no remotes configured, confirming local-only)
6. **main_branch_unchanged** — `git rev-parse main` matches the original commit SHA from the gate_decision's commit_shas array
7. **on_test_branch** — `git rev-parse --abbrev-ref HEAD` matches branch_created

### Output

1. **PostProductionVerdict** artifact:
   ```
   {
     schema_version: "1.0",
     mission_id, snapshot_id, branch_created, commit_sha,
     checks: Array<{ check_id, passed, detail }>,
     overall: "PASS" | "FAIL",
     evaluated_at, evaluated_by: "Div5.QualificationsLibraryLearning"
   }
   ```

2. **status_update** packet to Div1.HCO with verdict summary

3. **Verdict packet** to Div7.MissionControl (for executive report aggregation)

### Module Design

New file: `plugin-bos-light/src/div5PostProductionVerification.ts`

Pattern: follows div5Quarantine.ts and div4Production.ts conventions:
- Strict caller identity check (Div5.QualificationsLibraryLearning only)
- Inbox-based packet reading
- Returns `PostProductionVerdict | Div5Unauthorized`
- Uses fs.existsSync and child_process.spawn for filesystem/git checks
- Accepts optional `gitOps` parameter for testability (same as div4Production)

### Contract Types

Add to contracts.ts:
- `PostProductionCheck` — individual check result
- `PostProductionVerdict` — full verdict with checks array and overall

### Test Strategy

Two test files:
1. `div5PostProductionVerification.test.ts` — mock-based tests (vi.mock fs, child_process)
   - Rejects non-Div5 callers
   - Rejects missing status_update in inbox
   - Rejects missing local_path
   - Verifies all 7 checks pass/fail correctly
   - Emits status_update to Div1.HCO
   - Emits verdict to Div7.MissionControl
   - Handles edge cases (branch mismatch, SHA mismatch, missing files)

2. `div5PostProductionVerification.realgit.test.ts` — real-git integration tests
   - Creates temp repo, runs Div4 production work, then runs S08 verification
   - Verifies full pipeline: Div6 clone → Div5 quarantine → Div4 production → Div5 eval gate
   - Checks that verdict PASS occurs on clean run
   - Checks that verdict FAIL occurs when workspace is tampered

### Files to Create/Modify

| File | Action | Purpose |
|------|--------|---------|
| `src/contracts.ts` | Modify | Add PostProductionCheck, PostProductionVerdict types |
| `src/div4Production.ts` | Modify | Add local_path to status_update payload to Div5 |
| `src/div5PostProductionVerification.ts` | Create | Core verification module |
| `src/index.ts` | Modify | Export new module |
| `tests/div5PostProductionVerification.test.ts` | Create | Mock-based tests |
| `tests/div5PostProductionVerification.realgit.test.ts` | Create | Real-git integration tests |

### Natural Seams (Task Decomposition)

**T01: Contracts + Div4 local_path propagation** (low risk, unblocks everything)
- Add PostProductionCheck and PostProductionVerdict to contracts.ts
- Add local_path to Div4's status_update payload in div4Production.ts
- Update div4Production.test.ts to verify local_path in status_update

**T02: Core verification module** (medium risk, core logic)
- Create div5PostProductionVerification.ts with `verifyProductionWork(caller, snapshotId, gitOps?)`
- Implement all 7 checks
- Wire packet emissions to Div1.HCO and Div7.MissionControl

**T03: Mock-based tests** (low risk, high coverage)
- Create div5PostProductionVerification.test.ts
- Cover: auth rejection, missing status_update, missing local_path, all check pass/fail, packet emission

**T04: Real-git integration tests** (medium risk, proves E2E)
- Create div5PostProductionVerification.realgit.test.ts
- Full pipeline test: init repo → seed gate_decision → run Div4 → run Div5 eval gate
- Tamper test: modify workspace after Div4, verify Div5 catches it

**T05: Full regression** (low risk, verification)
- Run full vitest suite, verify zero regressions
- TypeScript compilation check

### First Proof

T01 is the unblocker — contracts and local_path propagation. Without local_path in the status_update, S08 can't locate the workspace.

### Verification Commands

```bash
cd plugin-bos-light
npx tsc --noEmit          # TypeScript compilation
npx vitest run            # Full test suite
npx vitest run tests/div5PostProductionVerification.test.ts        # S08 mock tests
npx vitest run tests/div5PostProductionVerification.realgit.test.ts # S08 real-git tests
```

### Key Constraints

1. **D036 (No BOS Runtime):** S08 must not create its own verification runtime. It's a pure function that reads packets and runs checks.
2. **D037 (Single Hermes Substrate):** Verification runs in the same Hermes context as other divisions.
3. **MEM226 (Div5 pattern):** Follow the same unauthorized-first, synchronous verification pattern as div5Quarantine.
4. **MEM154 (Ownership):** Div5.QualificationsLibraryLearning owns eval evidence. Div4.Production is the producer.
5. **R025 (Eval Gate visibility):** Gate results must be visible in Paperclip artifacts. S08 produces a verdict artifact that downstream (S10 executive report) can surface.
6. **R020 (Git integration):** S08 verifies git operations, extending the git integration chain.

### Risks

- **Low risk:** The verification checks are straightforward filesystem/git operations. The pattern is well-established by div5Quarantine and div4Production.
- **Medium risk:** Real-git integration tests need temp directory management (already solved by div4Production.realgit.test.ts pattern).
- **No risk of capability overclaim:** S08 produces local verification artifacts only, consistent with the fail-closed posture.
