# S03: BPI and Blueprint Native Artifact Flow

**Goal:** Plan and implement the S03 seeded issue path that computes bounded BPI, generates the required five-section Product Blueprint, mirrors it through a proof-gated Paperclip native document/comment artifact seam or explicit markdown fallback, and returns a stable artifact reference for downstream Betting Table work without treating plugin state as durable truth.
**Demo:** A seeded issue receives bounded BPI scoring and a five-section Product Blueprint mirrored to a native artifact or documented fallback surface.

## Must-Haves

- Threat Surface (Q3): issue titles, problem statements, acceptance criteria, resources, and QA text are untrusted markdown inputs; the flow must never execute them, must not allow user text to promote runtime capabilities to `confirmed`, and must avoid logging secrets. Requirement Impact (Q4): owns R005 and R006, supports R003, R004, R011, R012, R013, and prepares R007 by returning a usable `blueprint_id`; re-verify BPI bounds/hard gates, five blueprint sections, native-first fallback semantics, and capability validator guardrails; D001-D004 remain intact. Verification: `cd plugin-bos-light && npm test`, `cd plugin-bos-light && npm run typecheck`, and `python3 scripts/validate_runtime_capabilities.py` should pass after dependencies are available. Negative Tests (Q7): tests must cover hard-gate zero score, missing acceptance/resources defaults, document-write failure falling back without native overclaim, adapter-total failure returning explicit markdown fallback diagnostics, and stable artifact references suitable for `blueprint_id`.

## Threat Surface

## Abuse scenarios

- **Markdown/prompt injection through issue content:** issue titles, problem statements, acceptance criteria, resources, and QA text are untrusted display content. They can try to instruct the worker/agent to ignore policies, leak tokens, fabricate runtime proof, or add executable-looking payloads inside generated Blueprints.
- **Capability overclaim / privilege escalation:** attacker-controlled issue text could attempt to promote Paperclip document/comment support from fallback or unavailable to `confirmed`; runtime capability state must only come from the validated adapter/capability file, never from issue text or generated markdown.
- **Parameter tampering:** caller-provided issue identifiers, artifact IDs, selected surface, fallback reason, and `blueprint_id` must be validated/derived by the flow so one issue cannot overwrite or impersonate another issue's native document/comment artifact.
- **Replay / duplicate artifact writes:** repeated processing of the same seeded issue can produce duplicate comments/documents or stale `blueprint_id` references unless writes are idempotent or carry stable artifact metadata.
- **Data exposure:** diagnostics, fallback errors, native comments/documents, and logs must not include tokens, secrets, raw SDK error payloads, or live runtime evidence beyond safe fields such as component, issue id, operation, retryability, surface, and sanitized fallback reason.

## Trust boundaries

- Untrusted Paperclip issue fields cross into pure BPI/Blueprint logic and then into adapter/persistence seams that may write to Paperclip documents/comments or markdown fallback diagnostics.
- Runtime capability inputs from `capabilities.paperclip-runtime.json` and `runtimeCapabilities.ts` are trusted only as validator-checked repository artifacts; plugin state is not durable truth.
- Adapter responses are external/runtime-derived and must be classified as confirmed/fallback/error based on proof-gated calls, not inferred success.

## Required controls for execution

- Treat all issue text as inert markdown/display content only; never execute, eval, shell, import, or use it to select runtime capabilities.
- Preserve proof-gated capability validation; do not mark native document/comment support confirmed without runtime evidence.
- Return explicit artifact metadata: `artifact_id`, selected surface, fallback reason/error, `mirrored_at`, and a stable `blueprint_id` suitable for S04.
- Add negative tests for hard-gate zero score, missing acceptance/resources defaults, document-write failure fallback, adapter-total failure with markdown diagnostics, and stable artifact references.
- Keep logs and diagnostics secret-safe and avoid logging raw untrusted content when not needed.

## Requirement Impact

## Requirement impact

- **R005 — Bounded, explainable BPI scoring:** S03 owns this directly through seeded issue scoring; re-test BPI bounds, hard-gate zero-score behavior, rationale/explanation fields, and default handling for missing acceptance criteria/resources.
- **R006 — Paperclip-native Product Blueprint generation:** S03 owns this directly; re-test that every generated Blueprint has the required five sections and that native document/comment mirroring or explicit markdown fallback returns a stable artifact reference.
- **R003 — Paperclip as system of record:** S03 supports this by treating plugin state as cache/overlay only; re-test that native artifact references/fallback diagnostics, not hidden plugin state, are the observable truth.
- **R004 — Validate runtime assumptions before trusting SDK behavior:** S03 supports this via proof-gated native artifact capability checks; re-test runtime capability validator guardrails and ensure unconfirmed Paperclip surfaces remain fallback-only.
- **R011 — Balanced proof for M001:** S03 supports contract plus fixture integration proof; re-test repository-local Vitest coverage and runtime capability validation without pretending a live Paperclip runtime was proven.
- **R012 — Adapter and persistence seams:** S03 supports this by routing document/comment/native artifact behavior through adapter/persistence contracts; re-test adapter success, document-write failure, and total adapter failure paths.
- **R013 — Native-first durable artifact mirroring:** S03 supports this by preferring native issue document/comment artifacts and documenting explicit fallback semantics; re-test native-first selection, fallback reason/error metadata, `mirrored_at`, and secret-safe diagnostics.
- **R007 — Betting Table coordination UI:** S03 prepares this by returning a usable `blueprint_id`; re-test that the artifact reference is stable and sufficient for downstream S04 Betting Table work.

## Decisions to revisit

- No decision appears to require reversal for S03. D001-D004 remain aligned with the plan: BOS Light stays an overlay, durable truth is native-first, SDK calls stay behind spike-gated adapter seams, and Betting Table approval ownership remains Paperclip-native.

## Regression checks after shipping

- `cd plugin-bos-light && npm test` for full contract/fixture coverage.
- `cd plugin-bos-light && npm run typecheck` for exported contract compatibility.
- `python3 scripts/validate_runtime_capabilities.py` for capability evidence guardrails.
- Focused tests for `calculateBPIScore`, `generateBlueprintMarkdown`, artifact fallback semantics, and worker/tool wiring that produces the downstream `blueprint_id`.

## Proof Level

- This slice proves: Contract plus fixture integration proof. Real Paperclip runtime is not required and must not be simulated; repository-local Vitest coverage and runtime capability validation are sufficient until a live Paperclip version/build and document/comment proof is available.

## Integration Closure

Consumes S02 capability health boundaries from `plugin-bos-light/capabilities.paperclip-runtime.json` and `plugin-bos-light/src/runtimeCapabilities.ts`; consumes existing pure `calculateBPIScore` and `generateBlueprintMarkdown` logic; produces an exported artifact-flow/seeded-issue composition path, worker/tool wiring, tests, and docs that S04 can consume via `blueprint_id`. Roadmap assumptions remain valid: S04 still owns native approval/request creation and S05 still owns Eval Gate/Circuit Breaker evidence.

## Verification

- S03 should add inspectable artifact metadata (`artifact_id`, selected surface, fallback reason/error, `mirrored_at`) so future agents can distinguish confirmed native documents, comment fallback, and markdown-only fallback. No secrets or live runtime evidence should be logged; issue text is untrusted display content only.

## Tasks

- [x] **T01: Add proof-gated Blueprint artifact contract** `est:2h`
  Expected executor skills (record in task plan frontmatter if supported): api-design, tdd, observability.
  - Files: `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/plugin-bos-light/src/index.ts`, `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/plugin-bos-light/src/bpi.ts`, `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/plugin-bos-light/src/blueprint.ts`, `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/plugin-bos-light/src/paperclipAdapter.ts`, `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/plugin-bos-light/src/runtimeCapabilities.ts`
  - Verify: cd plugin-bos-light && npm test -- tests/blueprintArtifact.test.ts

- [x] **T02: Wire seeded issue BPI and Blueprint flow** `est:2h`
  Expected executor skills (record in task plan frontmatter if supported): api-design, tdd, observability.
  - Files: `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/plugin-bos-light/src/worker.ts`, `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/plugin-bos-light/tests/acceptance.test.ts`, `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/plugin-bos-light/src/index.ts`, `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/plugin-bos-light/src/persistence.ts`, `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/plugin-bos-light/src/contracts.ts`
  - Verify: cd plugin-bos-light && npm test -- tests/acceptance.test.ts

- [x] **T03: Document artifact fallback contract** `est:1h`
  Expected executor skills (record in task plan frontmatter if supported): write-docs, api-design, verify-before-complete.
  - Files: `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/docs/04_DATA_CONTRACTS.md`, `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/docs/05_PERSISTENCE_MATRIX.md`, `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/docs/06_ACCEPTANCE_TESTS.md`, `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/docs/08_RUNTIME_CAPABILITY_HEALTH.md`, `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/docs/09_BACKLOG.md`
  - Verify: python3 scripts/validate_runtime_capabilities.py

- [x] **T04: Run full S03 verification closure** `est:45m`
  Expected executor skills (record in task plan frontmatter if supported): test, verify-before-complete.
  - Files: `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/plugin-bos-light/tests/acceptance.test.ts`, `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/plugin-bos-light/src/worker.ts`, `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/docs/08_RUNTIME_CAPABILITY_HEALTH.md`
  - Verify: cd plugin-bos-light && npm test && npm run typecheck && cd .. && python3 scripts/validate_runtime_capabilities.py

## Files Likely Touched

- /home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/plugin-bos-light/src/index.ts
- /home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/plugin-bos-light/src/bpi.ts
- /home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/plugin-bos-light/src/blueprint.ts
- /home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/plugin-bos-light/src/paperclipAdapter.ts
- /home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/plugin-bos-light/src/runtimeCapabilities.ts
- /home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/plugin-bos-light/src/worker.ts
- /home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/plugin-bos-light/tests/acceptance.test.ts
- /home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/plugin-bos-light/src/persistence.ts
- /home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/plugin-bos-light/src/contracts.ts
- /home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/docs/04_DATA_CONTRACTS.md
- /home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/docs/05_PERSISTENCE_MATRIX.md
- /home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/docs/06_ACCEPTANCE_TESTS.md
- /home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/docs/08_RUNTIME_CAPABILITY_HEALTH.md
- /home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/docs/09_BACKLOG.md
