# S04: Betting Table Native Approval Request

**Goal:** Implement a contract-level and fixture-integrated Betting Table flow where S03 `blueprint_id` artifact references rank top candidates by BPI, persisted betting cycles hydrate the worker data provider, and Approve Batch creates a Paperclip-native approval request through the adapter seam when supplied or returns/comment-records explicit fallback diagnostics without becoming a plugin-side approval engine.
**Demo:** The Betting Table ranks top candidates by BPI and Approve Batch creates or updates a Paperclip-native approval/request artifact where runtime support allows.

## Must-Haves

- Primary requirements: R007 and R008. Supporting constraints: R003, R004, R011, R012, R013. Done means Betting Table ranking preserves opaque `blueprint_id`, persists and loads cycle rows with cache-overlay diagnostics, worker data provider hydrates a requested cycle or returns explicit diagnostics, approve-batch validates selected rows and calls `PaperclipAdapter.createApprovalRequest` only through the adapter seam, native rows are marked approval-requested only after native request creation, fallback paths return comment or markdown-only artifact refs without claiming native status, docs keep unproven runtime surfaces unvalidated/fallback-only, and closeout passes `npm --prefix plugin-bos-light test && npm --prefix plugin-bos-light run typecheck && python3 scripts/validate_runtime_capabilities.py`.
- Threat Surface (Q3): `cycle_id`, `issue_ids`, `approved_by`, adapter output, and candidate rows are untrusted runtime/action inputs; reject empty selections, stale issue ids, malformed native approval responses, and avoid secrets in diagnostics.
- Requirement Impact (Q4): Re-verify R003/R004/R007/R008/R011/R012/R013. S03 `blueprint_id` remains opaque and is never interpreted as an approval id or plugin-state key. D003, D004, and D005 remain binding.
- Failure Modes (Q5): missing persistence, missing cycle, adapter unavailable, native approval failure, comment fallback failure, and cache save failure must be explicit diagnostics.
- Load Profile (Q6): cycle build is O(candidate count log candidate count), data-provider is one cache read, approval is one cycle read plus one native request or fallback path plus one cache write; top_n and selected issue count must stay bounded.
- Negative Tests (Q7): cover empty candidates, zero/negative BPI exclusion, null/opaque `blueprint_id`, missing persistence, missing cycle, stale issue id, adapter unavailable, native approval throws, malformed approval response, comment fallback throws, and cache save failure.

## Threat Surface

## Exploit analysis

### Abuse scenarios
- **Parameter tampering:** `cycle_id`, `issue_ids`, `approved_by`, `top_n`, and selected candidate rows are action/runtime inputs and must be treated as untrusted. Attackers or buggy callers could submit stale issue ids, issue ids not present in the persisted cycle, empty selections, duplicate selections, or oversized selections to request approval for unintended work.
- **Privilege/authority confusion:** `approved_by` is not proof of authorization. The slice must not infer approval or mark work approved from a caller-supplied identity; it should only request a Paperclip-native approval through `PaperclipAdapter.createApprovalRequest` when the adapter surface is supplied and validated.
- **Replay / stale-cycle use:** Reusing an old `cycle_id` or a cached cycle after candidate status changes could create a request for obsolete work. The approval path needs explicit missing-cycle/stale-issue diagnostics and should only mark rows `approval-requested` after native request creation.
- **Malformed adapter output:** A compromised or incomplete adapter can return missing, non-string, or unsupported approval request ids/statuses. Native status must not be claimed unless the adapter response matches the expected contract.
- **Fallback misrepresentation:** If approval support is unavailable or fails, markdown/comment fallback diagnostics must not be presented as native approval success.

### Data exposure / diagnostics
- Candidate rows may contain issue metadata and blueprint artifact refs; diagnostics should include only safe identifiers, operation names, and retryability.
- Adapter/cache errors must be sanitized so tokens, API keys, SDK request payloads, or host-specific secrets are not written to comments, markdown artifacts, or test snapshots.

### Trust boundaries
- Worker/action inputs cross from Paperclip runtime/UI into plugin logic.
- Cache-overlay reads cross from persistence into approval orchestration and must be validated before use.
- `PaperclipAdapter.createApprovalRequest` output crosses from host/runtime integration into plugin state and must be schema-checked before any native status is recorded.

### Required mitigations to verify during execution
- Reject empty selections and selected issue ids absent from the persisted cycle.
- Bound `top_n` and selected issue count.
- Preserve S03 `blueprint_id` as an opaque artifact reference; never reinterpret it as approval id or plugin-state key.
- Record explicit diagnostics for missing persistence, missing cycle, adapter unavailable, native approval failure, malformed native response, comment fallback failure, and cache save failure.
- Mark native rows `approval-requested` only after valid native request creation.

## Requirement Impact

## Requirement impact

### Primary requirements touched
- **R007 — Betting Table ranks top candidate work as a coordination UI.** Re-test top-N BPI ranking, exclusion of invalid/zero/negative BPI candidates, preservation of opaque `blueprint_id`, cycle persistence, and worker data-provider hydration.
- **R008 — Approve Batch creates or updates Paperclip-native approval/request artifacts and never becomes a plugin-side approval engine.** Re-test selected-row validation, adapter-only native request creation, native request id/status handling, fallback behavior, and that approval state is not owned or decided by plugin logic.

### Supporting requirements to re-test
- **R003 — Paperclip remains the system of record.** Verify fallback/comment/markdown diagnostics do not claim native approval status and plugin cache remains an overlay only.
- **R004 — Runtime assumptions are validated before SDK behavior is trusted.** Verify docs/capabilities keep approvals, data providers, dashboard widgets, and state support unvalidated or fallback-only unless runtime evidence exists.
- **R011 — Balanced proof for M001.** Re-run contract/integration checks for the S04 portion and keep live runtime claims out of proof unless supported.
- **R012 — Adapter and persistence seams isolate Paperclip-specific SDK calls.** Verify `PaperclipAdapter.createApprovalRequest` is called only through the adapter seam and pure Betting Table logic remains independently testable.
- **R013 — Durable BOS outputs are mirrored to Paperclip-native artifacts before plugin state is treated as truth.** Verify approval-request artifacts/comments/fallback refs are exposed and cache persistence status is diagnostic, not authoritative truth.

### Decisions to keep binding
- **D003** remains binding: unsupported Paperclip runtime surfaces must stay explicit in the capability matrix and validator output.
- **D004** remains binding: S03 `blueprint_id` is an opaque artifact reference, not an approval id or plugin-state key.
- **D005** remains binding: S04 approval flow is adapter-orchestrated with explicit fallback diagnostics, not direct SDK calls or a plugin-side approval engine.

### Re-test commands expected at closeout
- `npm --prefix plugin-bos-light test`
- `npm --prefix plugin-bos-light run typecheck`
- `python3 scripts/validate_runtime_capabilities.py`

## Proof Level

- This slice proves: Contract plus fixture integration. Real Paperclip runtime required: no. Human/UAT required: no. No live dashboard, data-provider, approval, or state support may be claimed.

## Integration Closure

Consumes S03 `status_overlay.blueprint_id` as an opaque Product Blueprint artifact reference, existing Betting Table ranking helpers, existing cache-overlay persistence, and the Paperclip adapter seam. Adds worker data-provider hydration and approve-batch action orchestration. S05/S06 remain responsible for gate/circuit evidence and integrated live-runtime demo proof.

## Verification

- Betting cycle and approval request results expose cycle_id, selected issue_ids, selected surface, native approval request id/status when present, fallback artifact ref, cache-overlay persistence status, timestamp, and sanitized adapter/cache errors.

## Tasks

- [x] **T01: Add betting cycle persistence orchestration** `est:1h`
  Expected executor skills: tdd, api-design, verify-before-complete.
  - Files: `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/plugin-bos-light/src/bettingTable.ts`, `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/plugin-bos-light/src/persistence.ts`, `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/plugin-bos-light/src/paperclipAdapter.ts`, `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/plugin-bos-light/tests/acceptance.test.ts`
  - Verify: npm --prefix plugin-bos-light test

- [x] **T02: Implement approval request native and fallback flow** `est:1.5h`
  Expected executor skills: api-design, error-handling-patterns, tdd, verify-before-complete.
  - Files: `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/plugin-bos-light/src/bettingTable.ts`, `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/plugin-bos-light/src/contracts.ts`, `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/plugin-bos-light/src/paperclipAdapter.ts`, `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/plugin-bos-light/tests/acceptance.test.ts`
  - Verify: npm --prefix plugin-bos-light test

- [x] **T03: Wire worker Betting Table data and approve-batch actions** `est:1h`
  Expected executor skills: api-design, error-handling-patterns, tdd, verify-before-complete.
  - Files: `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/plugin-bos-light/src/worker.ts`, `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/plugin-bos-light/src/bettingTable.ts`, `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/plugin-bos-light/tests/acceptance.test.ts`, `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/plugin-bos-light/src/index.ts`
  - Verify: npm --prefix plugin-bos-light test && npm --prefix plugin-bos-light run typecheck

- [x] **T04: Align docs and runtime capability guardrails** `est:45m`
  Expected executor skills: write-docs, verify-before-complete.
  - Files: `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/docs/04_DATA_CONTRACTS.md`, `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/docs/05_PERSISTENCE_MATRIX.md`, `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/docs/06_ACCEPTANCE_TESTS.md`, `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/docs/08_RUNTIME_CAPABILITY_HEALTH.md`, `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/docs/09_BACKLOG.md`, `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/plugin-bos-light/capabilities.paperclip-runtime.json`, `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/scripts/validate_runtime_capabilities.py`, `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/plugin-bos-light/src/runtimeCapabilities.ts`
  - Verify: npm --prefix plugin-bos-light test && npm --prefix plugin-bos-light run typecheck && python3 scripts/validate_runtime_capabilities.py

## Files Likely Touched

- /home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/plugin-bos-light/src/bettingTable.ts
- /home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/plugin-bos-light/src/persistence.ts
- /home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/plugin-bos-light/src/paperclipAdapter.ts
- /home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/plugin-bos-light/tests/acceptance.test.ts
- /home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/plugin-bos-light/src/contracts.ts
- /home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/plugin-bos-light/src/worker.ts
- /home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/plugin-bos-light/src/index.ts
- /home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/docs/04_DATA_CONTRACTS.md
- /home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/docs/05_PERSISTENCE_MATRIX.md
- /home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/docs/06_ACCEPTANCE_TESTS.md
- /home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/docs/08_RUNTIME_CAPABILITY_HEALTH.md
- /home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/docs/09_BACKLOG.md
- /home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/plugin-bos-light/capabilities.paperclip-runtime.json
- /home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/scripts/validate_runtime_capabilities.py
- /home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/plugin-bos-light/src/runtimeCapabilities.ts
