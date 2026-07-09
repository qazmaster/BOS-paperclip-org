---
estimated_steps: 10
estimated_files: 3
skills_used: []
---

# T02: Harden fallback diagnostics and approval immutability proof

Expected executor skills/frontmatter: skills_used: error-handling-patterns, security-review, tdd, verify-before-complete.

Why: The sketch specifically requires fallback diagnostics plus no approval-state mutation. T01 establishes the envelope; this task makes failure paths robust enough that denied/unavailable/malformed adapter behavior is visible without leaking secrets or silently turning fallback comments into approval state.

Do:
1. Extend `plugin-bos-light/tests/decisionArtifact.test.ts` with negative fixtures for document write rejection, malformed document response, missing comment support, comment write rejection, malformed comment response, and cache save failure.
2. Ensure all adapter and persistence errors are sanitized to one line, bounded length, and redacted for token/secret/authorization/cookie/password-like material. Prefer reusing `redactSensitiveText` from `plugin-bos-light/src/livePaperclipAdapter.ts` if importing it does not create an unwanted runtime coupling; otherwise implement the same bounded sanitizer locally and keep it tested.
3. When document mirroring fails, record `fallback.reason` such as `document_write_failed` or `document_response_malformed`, include sanitized `document_error`, and fall back to comments when available. When comment mirroring fails or is malformed/unavailable, return markdown-only with sanitized `comment_error` and deterministic artifact ids/refs.
4. When `persistence.saveDecision` fails, keep `cache_overlay.durability: "cache-overlay-only"`, set `save: "failed"`, include sanitized cache error, and still attempt visible document/comment/markdown artifact creation for accepted decisions.
5. Assert that no fallback path writes `native_approval_request_id`, `native_approval_status`, Betting Table row approval state, or adapter approvals. If a test double includes `createApprovalRequest`, the helper must not call it.
6. Assert JSON-stringified envelopes and markdown do not contain raw secret values, stack traces, newlines inside diagnostic fields, or unsupported runtime claims.

Done when: all fallback paths produce deterministic, sanitized, self-explaining envelopes; approval state remains untouched in every fallback; and the targeted tests prove both success and failure behavior.

## Inputs

- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M003/plugin-bos-light/src/decisionArtifact.ts`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M003/plugin-bos-light/tests/decisionArtifact.test.ts`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M003/plugin-bos-light/src/livePaperclipAdapter.ts`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M003/plugin-bos-light/src/bettingTable.ts`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M003/plugin-bos-light/tests/acceptance.test.ts`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M003/plugin-bos-light/tests/evalGateEvidence.test.ts`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M003/plugin-bos-light/tests/circuitBreakerFlow.test.ts`

## Expected Output

- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M003/plugin-bos-light/src/decisionArtifact.ts`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M003/plugin-bos-light/tests/decisionArtifact.test.ts`

## Verification

npm --prefix plugin-bos-light test -- tests/decisionArtifact.test.ts

## Observability Impact

Hardens failure visibility by ensuring fallback.reason, document_error, comment_error, cache_overlay.error, and validation_error are sanitized, bounded, and sufficient to localize the failed surface.
