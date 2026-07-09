---
estimated_steps: 21
estimated_files: 4
skills_used: []
---

# T01: Added a tested live Paperclip adapter and BOS artifact-flow composer that produce BPI, Blueprint, Betting Table, Eval Gate, and Circuit Breaker envelopes while preserving Hermes/GSD-Pi no-go and native-approval fail-closed guards.

---
estimated_steps: 7
estimated_files: 4
skills_used:
  - api-design
  - tdd
  - error-handling-patterns
---

Why: S04 must exercise existing BOS Light artifact contracts rather than inventing a new artifact shape or treating fixture-only seams as live proof. This task creates the code seam that can map Paperclip issue/document/comment APIs into the existing PaperclipAdapter interface and compose the BPI, Product Blueprint, Betting Table, Eval Gate, and Circuit Breaker envelopes while preserving the Hermes no-go guard.

Do:
1. Add `plugin-bos-light/src/livePaperclipAdapter.ts` with a small `LivePaperclipIssueAdapter` or equivalent boundary that accepts an injected fetch/client, base URL, company/issue context, and safe headers from the caller; implement only supported issue/document/comment/escalation methods needed by the visible artifact flow.
2. Keep `createApprovalRequest` fail-closed unless a separately validated native approval API/readback is passed in; fallback comments may ask for review but must never return a native approval id/status.
3. Add `plugin-bos-light/src/liveArtifactFlow.ts` that composes `runSeededIssueBlueprintFlow`, `buildAndSaveBettingCycle` or `requestBettingCycleApproval`, `evalGateEvidence`, and `circuitBreakerFlow` into one bounded artifact bundle with explicit S02 Hermes no-go and S03 GSD-Pi no-go inputs.
4. Ensure fallback diagnostics are bounded/redacted, preserve opaque `blueprint_id` refs, include side-effect counters, and label cache-overlay state as diagnostic only.
5. Export the new seam only if needed from `plugin-bos-light/src/index.ts`; do not import Paperclip private modules, patch Paperclip core, or add direct DB access.
6. Add Vitest coverage for native document/comment success, document failure to comment fallback, approval no-go fallback, Hermes/GSD-Pi blocker propagation, secret redaction, and opaque blueprint id preservation.

Threat Surface (Q3): HTTP headers and issue/comment/document bodies are untrusted at the boundary; never persist token values, never treat caller-supplied status as proof, and keep artifact refs opaque.
Failure Modes (Q5): Paperclip API errors become bounded adapter diagnostics and fallback artifacts; timeouts must not retry unboundedly or create duplicate approvals; malformed JSON/readback fails closed without capability promotion.
Load Profile (Q6): The composed demo is intentionally one issue and a small fixed artifact set; at 10x the first likely breakpoint is Paperclip API rate/latency, so keep per-run calls bounded and non-recursive.
Negative Tests (Q7): Cover 401/403, 5xx, timeout, malformed JSON, missing document id, failed comment fallback, oversized/secret-looking error text, and an attempted approval fallback that must not claim `approvals.native`.

Done when the plugin has a tested adapter/composition seam that can generate the required BOS artifact bundle without depending on Hermes execution, GSD-Pi execution, native approvals, plugin UI surfaces, or Paperclip internals.

## Inputs

- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/plugin-bos-light/src/issueBlueprintFlow.ts`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/plugin-bos-light/src/bettingTable.ts`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/plugin-bos-light/src/evalGateEvidence.ts`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/plugin-bos-light/src/circuitBreakerFlow.ts`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/plugin-bos-light/src/paperclipAdapter.ts`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/plugin-bos-light/src/persistence.ts`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/plugin-bos-light/src/runtimeCapabilities.ts`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/plugin-bos-light/tests/blueprintArtifact.test.ts`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/plugin-bos-light/tests/evalGateEvidence.test.ts`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/plugin-bos-light/tests/circuitBreakerFlow.test.ts`

## Expected Output

- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/plugin-bos-light/src/livePaperclipAdapter.ts`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/plugin-bos-light/src/liveArtifactFlow.ts`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/plugin-bos-light/tests/liveArtifactFlow.test.ts`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/plugin-bos-light/src/index.ts`

## Verification

npm --prefix plugin-bos-light test -- liveArtifactFlow

## Observability Impact

Adds structured adapter/composition diagnostics that future agents can inspect in unit tests and in the S04 evidence file: selected surfaces, fallback reasons, sanitized errors, side-effect counters, and no-go guard status.
