# S02: Artifact envelope and fallback persistence

**Goal:** Generate a fixture-proven decision artifact envelope that consumes the S01 DecisionResult contract, prefers Paperclip-native document mirroring, falls back to native comments, and finally returns deterministic markdown-only artifacts with sanitized diagnostics. The slice owns/advances R003, R008, R012, and R013 by keeping Paperclip document/comment artifacts as the visible system-of-record surface, never mutating native approval state from fallback paths, preserving Div7.MissionControl/v1.4.1 division ownership, and routing all external interaction through the existing PaperclipAdapter seam. It supports R009/R010 for later S03 integration and preserves R016 by remaining fixture/adapter proof only with no plugin UI, actions, native approval, Hermes, GSD-Pi, host registration, or live Paperclip promotion claims.
**Demo:** Generate a decision artifact envelope that prefers native document or comment mirroring and falls back to deterministic markdown with explicit sanitized diagnostics.

## Must-Haves

- Slice S02 is complete only when `plugin-bos-light/src/decisionArtifact.ts` exists, `plugin-bos-light/tests/decisionArtifact.test.ts` asserts native document success, native comment fallback, markdown-only fallback, invalid-input fail-closed behavior, sanitized diagnostics, cache-overlay diagnostics, and no approval-state mutation, and the following commands pass freshly: `npm --prefix plugin-bos-light test -- tests/decisionArtifact.test.ts`, `npm --prefix plugin-bos-light run typecheck`, `npm --prefix plugin-bos-light test`, and `python3 scripts/validate_runtime_capabilities.py`. Threat surface: adapter and persistence failures may include untrusted/secret-bearing text and must be redacted; decision signals are untrusted display data already normalized by S01; external IO is limited to the PaperclipAdapter document/comment methods; no native approval, plugin action, host registration, Hermes, or GSD-Pi path may be invoked or claimed.

## Threat Surface

## Abuse scenarios to guard before implementation

- **Parameter tampering / artifact spoofing:** caller-controlled issue IDs, document IDs, comment targets, `artifact_ref`, or selected-surface values could cause a decision record to be written to the wrong Paperclip location or make markdown fallback appear natively persisted.
- **Replay / duplicate persistence:** retrying native document/comment writes after partial failure could create duplicate decision artifacts or stale records unless the envelope is deterministic, idempotent, and clearly marks selected surface and diagnostics.
- **Approval substitution / privilege confusion:** comment or markdown fallback could be misread as native approval state; S02 must prove no native approval mutation and must not invoke plugin actions, host registration, Hermes, GSD-Pi, or approval APIs.
- **Markdown/content injection:** decision signals and normalized S01 display fields are still untrusted user-controlled text; generated markdown/comments must avoid unsafe links, misleading headings, embedded secrets, or UI text that impersonates Paperclip/system authority.
- **Secret exposure through diagnostics:** adapter and persistence failures may include tokens, headers, auth errors, stack traces, PII, or tenant/company IDs; fallback diagnostics, test snapshots, logs, and docs must redact raw auth material and sensitive payloads.
- **Trust-boundary crossing:** S02 moves data from DecisionResult plus adapter responses into native Paperclip documents/comments and deterministic markdown fallback through `PaperclipAdapter` and `BOSPersistence`; all adapter responses and errors remain untrusted.

## Required mitigations / retests

- Add tests for sanitized diagnostics, invalid-input fail-closed behavior, selected-surface correctness, deterministic markdown fallback, and no approval-state mutation as planned.
- Reject or fail closed on malformed adapter responses, denied access, unavailable APIs, invalid artifact targets, and readback mismatches.
- Keep external IO limited to existing PaperclipAdapter document/comment methods and keep fallback paths non-authoritative.

## Requirement Impact

## Requirement impact

- **R003** — directly touched. S02 must preserve Paperclip as the system of record by ensuring markdown fallback is explicit, deterministic, and non-authoritative rather than hidden BOS-owned governance state.
- **R008** — directly touched. S02 must prove document/comment fallback never substitutes for or mutates Paperclip-native approval/request ownership.
- **R012** — directly touched. All runtime-dependent document/comment persistence must stay behind the existing `PaperclipAdapter` and `BOSPersistence` seams with fail-closed diagnostics.
- **R013** — directly touched. This is the primary native-first durable artifact mirroring requirement for decision records, including document-first/comment-second/markdown fallback behavior.
- **R009** — indirectly touched/supporting. S03 will connect gate-driven decisions, but S02's envelope must be suitable for Eval Gate decision artifacts.
- **R010** — indirectly touched/supporting. S03 will connect circuit breaker triggers, but S02's envelope must support visible self-healing/escalation decision records.
- **R016** — preservation requirement. S02 must keep conservative runtime claims and avoid plugin UI, actions, native approval, Hermes, GSD-Pi, host registration, or live Paperclip promotion claims.
- **R014** — milestone-level support only. S02 consumes the S01 DecisionResult and provides artifact persistence for Div7 decision records; it should not re-open the classifier/foundation scope unless artifact schema incompatibilities are found.

## Retest after shipping S02

- `npm --prefix plugin-bos-light test -- tests/decisionArtifact.test.ts` for native document success, native comment fallback, markdown-only fallback, invalid input fail-closed behavior, sanitized diagnostics, cache-overlay diagnostics, and approval immutability.
- `npm --prefix plugin-bos-light run typecheck` to verify contract additions remain compatible with `DecisionResult`, `DecisionMetadata`, `PaperclipAdapter`, and persistence types.
- `npm --prefix plugin-bos-light test` to catch regressions in blueprint/eval/circuit artifact fallback patterns and S01 decision contract tests.
- `python3 scripts/validate_runtime_capabilities.py` to ensure docs/tests continue to avoid unsupported runtime capability claims.

## Decisions to revisit

No existing architectural decision needs reversal. Continue the M002/M003 artifact-first, fail-closed posture: native documents/comments are preferred when supported, fallback markdown is deterministic and diagnostic, and unsupported plugin/native approval/runtime surfaces remain out of scope.

## Proof Level

- This slice proves: Contract plus adapter-fixture integration proof. Real runtime required: no. Human/UAT required: no. This proves the artifact envelope and fallback persistence behavior over in-memory/test adapters only; live Paperclip readback and product-flow integration remain S04 and S03 respectively.

## Integration Closure

Upstream consumed: S01 `DecisionResult`, `DecisionMetadata.record_markdown`, sanitized validation failure branch, existing `PaperclipAdapter`, `BOSPersistence.saveDecision`, blueprint/eval/circuit artifact fallback patterns, and live adapter redaction rules. New wiring: a reusable decision artifact helper/envelope for S03 to call. Remaining before milestone end-to-end usability: S03 must wire batch approval/eval gate/circuit breaker/policy/budget/strategic choices into the helper, and S04 must attempt live readback or record fail-closed blocker evidence.

## Verification

- Adds a structured decision artifact envelope with selected_surface, artifact_ref, cache_overlay, fallback diagnostics, sanitized error fields, and explicit no-approval-mutation invariants so future agents can determine exactly where persistence failed and recover from markdown-only artifacts.

## Tasks

- [x] **T01: Add the decision artifact envelope contract and native-first helper** `est:2h`
  Expected executor skills/frontmatter: skills_used: api-design, tdd, verify-before-complete.
  - Files: `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M003/plugin-bos-light/src/decisionArtifact.ts`, `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M003/plugin-bos-light/tests/decisionArtifact.test.ts`, `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M003/plugin-bos-light/src/contracts.ts`, `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M003/plugin-bos-light/src/paperclipAdapter.ts`
  - Verify: npm --prefix plugin-bos-light test -- tests/decisionArtifact.test.ts

- [x] **T02: Harden fallback diagnostics and approval immutability proof** `est:2h`
  Expected executor skills/frontmatter: skills_used: error-handling-patterns, security-review, tdd, verify-before-complete.
  - Files: `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M003/plugin-bos-light/src/decisionArtifact.ts`, `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M003/plugin-bos-light/tests/decisionArtifact.test.ts`, `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M003/plugin-bos-light/src/livePaperclipAdapter.ts`
  - Verify: npm --prefix plugin-bos-light test -- tests/decisionArtifact.test.ts

- [x] **T03: Document the S02 contract boundary and run regression closure** `est:1h`
  Expected executor skills/frontmatter: skills_used: write-docs, verify-before-complete.
  - Files: `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M003/docs/04_DATA_CONTRACTS.md`, `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M003/docs/08_RUNTIME_CAPABILITY_HEALTH.md`, `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M003/plugin-bos-light/src/decisionArtifact.ts`, `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M003/plugin-bos-light/tests/decisionArtifact.test.ts`
  - Verify: npm --prefix plugin-bos-light test

## Files Likely Touched

- /home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M003/plugin-bos-light/src/decisionArtifact.ts
- /home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M003/plugin-bos-light/tests/decisionArtifact.test.ts
- /home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M003/plugin-bos-light/src/contracts.ts
- /home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M003/plugin-bos-light/src/paperclipAdapter.ts
- /home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M003/plugin-bos-light/src/livePaperclipAdapter.ts
- /home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M003/docs/04_DATA_CONTRACTS.md
- /home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M003/docs/08_RUNTIME_CAPABILITY_HEALTH.md
