---
estimated_steps: 11
estimated_files: 4
skills_used: []
---

# T01: Add decision artifact readback contract tests

Executor skills_used frontmatter: tdd, api-design, verify-before-complete.

Why: S02 and S03 can create decision artifact envelopes, but S04 needs a precise readback contract before live evidence can be trusted. This task defines the code-level seam for reading back an existing DecisionArtifactEnvelope through supported native document or comment refs while treating markdown-only refs as fail-closed handoff evidence rather than live proof.

Do:
1. Add `plugin-bos-light/src/liveDecisionArtifactReadback.ts` or an equivalent narrowly scoped module that accepts a DecisionArtifactEnvelope, a fetch seam compatible with `LivePaperclipFetch`, base URL, company/issue context, headers, and timeout.
2. Parse only the S02 artifact refs already emitted by the envelope: native document refs, native comment refs, and deterministic markdown-only refs. Do not add plugin UI, action, tool, native approval, Hermes, activity-log, event, or GSD-Pi runtime calls.
3. For native document/comment refs, perform bounded GET readback through configured path builders or conservative default paths, compute a sha256 over extracted markdown/body/content text, retain a bounded redacted snippet, and return structured diagnostics on denial, timeout, malformed JSON, missing content, or mismatch.
4. For markdown-only refs or unsupported ref shapes, return a fail-closed result with deterministic markdown ref and no network mutation.
5. Preserve S02/S03 invariants: `decided_by=Div7.MissionControl`, `diagnostics_sanitized=true`, `native_approval_mutated=false`, no cache overlay promotion, and no native approval calls.
6. Export the helper through `plugin-bos-light/src/index.ts` only if needed by tests or downstream scripts.
7. Add `plugin-bos-light/tests/liveDecisionArtifactReadback.test.ts` with real assertions for document success, comment success, markdown-only fail-closed result, denied access, malformed response, secret-bearing diagnostics redaction, content hash mismatch, unsafe ref rejection, and zero approval mutation.

Done when: the new readback tests prove the helper can inspect S02/S03 artifact refs without creating new native state or promoting unsupported surfaces.

## Inputs

- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M003/plugin-bos-light/src/decisionArtifact.ts`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M003/plugin-bos-light/src/majorFlowDecision.ts`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M003/plugin-bos-light/src/livePaperclipAdapter.ts`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M003/plugin-bos-light/src/paperclipAdapter.ts`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M003/plugin-bos-light/tests/decisionArtifact.test.ts`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M003/plugin-bos-light/tests/majorFlowDecision.test.ts`

## Expected Output

- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M003/plugin-bos-light/src/liveDecisionArtifactReadback.ts`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M003/plugin-bos-light/src/index.ts`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M003/plugin-bos-light/src/contracts.ts`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M003/plugin-bos-light/tests/liveDecisionArtifactReadback.test.ts`

## Verification

npm --prefix plugin-bos-light test -- tests/liveDecisionArtifactReadback.test.ts tests/decisionArtifact.test.ts tests/majorFlowDecision.test.ts

## Observability Impact

Adds structured readback result fields that future agents can inspect: selected surface, artifact ref, status code, sha256, bounded snippet, diagnostics phase, timeout, malformed JSON reason, fallback/blocker reason, and approval mutation invariant.
