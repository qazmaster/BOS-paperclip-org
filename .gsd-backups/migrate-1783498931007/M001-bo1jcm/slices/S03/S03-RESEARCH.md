# S03 Research: BPI and Blueprint Native Artifact Flow

## Summary

S03 is not primarily an algorithm slice; the pure BPI and Blueprint logic already exists, and the remaining work is to connect it to a durable Paperclip-visible artifact path. The highest-risk gap is native artifact mirroring: documents/comments/state are still unvalidated or fallback-only, and no code path currently writes a BPI or blueprint artifact through the adapter. The safest first proof is a single seeded issue flow that computes BPI, generates the 5-section blueprint, and writes it to an explicit fallback/native artifact with a returned artifact id.

## Active requirements and constraints

- **R003** — Paperclip remains the system of record; plugin state is cache/overlay only.
- **R004** — runtime claims stay proof-gated; no confirmed support without live version/build evidence.
- **R005** — bounded, explainable BPI scoring.
- **R006** — Paperclip-native Product Blueprint generation.
- **R011** — repository-local executable proof is acceptable, but live runtime absence must be recorded honestly.
- **R012** — persistence seams must keep plugin state as cache/overlay, not durable truth.
- **R013** — native-first durable artifact mirroring.

S02 constrains S03 heavily: `documents.native`, `comments.native`, `state.issue_scoped`, and related surfaces remain `unvalidated`/`fallback-only`, so any S03 implementation must stay behind adapter/persistence seams and must not claim confirmed host behavior.

## Implementation landscape

| File | Current role | S03 relevance |
|---|---|---|
| `plugin-bos-light/src/bpi.ts` | Deterministic clamp + hard-gate scoring. | Already produces bounded `BPIScore`; likely no algorithm change needed. |
| `plugin-bos-light/src/blueprint.ts` | Generates the required 5-section markdown. | Returns only a string, so it still needs an artifact envelope or mirroring helper. |
| `plugin-bos-light/src/paperclipAdapter.ts` | Declares assumed `createIssueDocument` / `addIssueComment` APIs. | Adapter seam for native artifact writes, but currently in-memory only. |
| `plugin-bos-light/src/persistence.ts` | Mirrors gate results and decisions to comments. | No BPI/Blueprint mirroring helper exists yet. |
| `plugin-bos-light/src/worker.ts` | Registers tools and approve-batch action. | Does not persist BPI/blueprint artifacts today. |
| `plugin-bos-light/src/contracts.ts` | Carries `blueprint_id` / BPI fields in overlays and table items. | Downstream can store artifact references if S03 returns them. |
| `plugin-bos-light/src/runtimeCapabilities.ts` | Mirrors the capability vocabulary and fallback rules. | Confirms state/docs/approval surfaces stay proof-gated. |
| `docs/05_PERSISTENCE_MATRIX.md` | Defines native-first persistence and fallbacks. | Blueprint is expected to land in a native issue document when proven, else markdown/comment fallback. |
| `docs/08_RUNTIME_CAPABILITY_HEALTH.md` | Current runtime posture report. | Explicitly says S03 must build against pure functions + native-artifact fallbacks first. |
| `docs/03_IMPLEMENTATION_PLAN_V1_2.md` / `docs/06_ACCEPTANCE_TESTS.md` / `docs/09_BACKLOG.md` | Define the A2/A3 flow and backlog epics. | S03 is the “issue annotation/storage + blueprint mirroring” piece of Epic 3. |

## What exists already

- BPI scoring is bounded, deterministic, and zeroes out when any hard gate fails.
- Blueprint generation already emits the required five sections: Identity, BPI, Acceptance Contract, Resources, QA Policy.
- Betting Table already carries a `blueprint_id` field, so downstream consumers have a place to store a returned artifact reference.
- Eval gate and decision mirroring patterns already show the shape of a helper that writes durable, Paperclip-visible evidence.

## Gaps / constraints discovered

- There is no `mirrorBpi...` or `mirrorBlueprint...` helper.
- `worker.ts` never calls `createIssueDocument` or `addIssueComment` for the BPI/Blueprint flow.
- No code path returns a blueprint artifact id/reference suitable for `blueprint_id` and downstream linking.
- Native document/comment/approval/state surfaces are all unvalidated in S02, so any “native” path must remain proof-gated and must have a fallback artifact.
- The current adapter is intentionally in-memory; durable truth still has to be mirrored into Paperclip-visible artifacts or explicit fallback markdown/comments.

## Natural seams

1. Add a small artifact service that composes BPI + blueprint and returns `{ markdown, artifact_id, surface, mirrored_at }`.
2. Add persistence helpers for blueprint/BPI mirroring that prefer native issue documents when proven and fall back to issue comments or markdown artifacts.
3. Wire the worker/tool path to call the helper without changing the pure BPI or blueprint functions.
4. Add tests that prove the fallback path, returned artifact reference, and no regression in the pure functions.

## First proof

One seeded issue should produce:

- a bounded BPI score;
- a 5-section blueprint;
- a Paperclip-visible artifact or explicit fallback artifact;
- a stable artifact reference that can populate `blueprint_id` / overlay fields.

This proof should succeed with the in-memory adapter and still record the missing runtime support explicitly; it should not depend on live host support being available yet.

## Verification

- Existing coverage: `plugin-bos-light/tests/bpi.test.ts`, `plugin-bos-light/tests/acceptance.test.ts`, `plugin-bos-light/tests/circuitBreaker.test.ts`.
- Add or expect focused Vitest coverage for artifact mirroring and fallback selection.
- Run `python3 scripts/validate_runtime_capabilities.py` to ensure the native-first / fallback-only boundary wording remains intact.
- Keep any later host probe behind the S02 proof/version/build rules; do not let S03 pretend runtime support exists.

## Relevant skills already available

- `write-docs` — reader-facing artifact/doc updates.
- `api-design` — if the artifact envelope/helper contract changes.
- `observability` — if the mirroring path needs better traceability for fallback vs proven native writes.

## Sources

- `plugin-bos-light/src/bpi.ts`
- `plugin-bos-light/src/blueprint.ts`
- `plugin-bos-light/src/bettingTable.ts`
- `plugin-bos-light/src/persistence.ts`
- `plugin-bos-light/src/paperclipAdapter.ts`
- `plugin-bos-light/src/worker.ts`
- `plugin-bos-light/src/contracts.ts`
- `plugin-bos-light/src/runtimeCapabilities.ts`
- `plugin-bos-light/capabilities.paperclip-runtime.json`
- `docs/03_IMPLEMENTATION_PLAN_V1_2.md`
- `docs/04_DATA_CONTRACTS.md`
- `docs/05_PERSISTENCE_MATRIX.md`
- `docs/06_ACCEPTANCE_TESTS.md`
- `docs/08_RUNTIME_CAPABILITY_HEALTH.md`
- `docs/09_BACKLOG.md`