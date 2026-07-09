# S02 Research: Runtime Capability Adapter Health

## Summary

S02 is not a code-implementation slice yet; it is a runtime truth-probe for the Paperclip surfaces BOS Light wants to use. The repository already contains a clean BOS Light contract layer and draft adapter seams, but there is still no proof that the current Paperclip runtime accepts the manifest, import/export schema, state surfaces, event delivery, or approval/request APIs that the plugin draft assumes.

`memory_query("runtime capability adapter health Paperclip import export schema AGENTS compatibility fallback")` returned no matching durable project memories, so there is no prior stored research to reuse here.

## Requirements and constraints

- **R004** is the governing constraint: live Paperclip import/export schema compatibility remains untrusted until S02 validates the runtime capability path.
- **R011** requires contract-level proof plus A1 evidence for the milestone baseline; S01 already delivered repository-local A1 proof, but that is not runtime proof.
- Paperclip must remain the system of record. S02 should not simulate support for events, plugin state, or approval/request creation if the runtime does not actually provide them.
- The slice should preserve the explicit fallback posture already established in the docs: native artifacts first, plugin state as cache/overlay, polling/activity fallback when events are missing.

## What exists already

### Contracts and pure logic

`plugin-bos-light/src/contracts.ts` defines the core BOS Light data shapes:
- BPI score
- BOS status overlay
- Betting Table item
- Eval Gate result
- Circuit Breaker record
- Decision metadata
- BOS config

The pure logic modules are already split cleanly and are runtime-agnostic:
- `plugin-bos-light/src/bpi.ts`
- `plugin-bos-light/src/blueprint.ts`
- `plugin-bos-light/src/bettingTable.ts`
- `plugin-bos-light/src/evalGates.ts`
- `plugin-bos-light/src/circuitBreaker.ts`
- `plugin-bos-light/src/decision.ts`

### Draft runtime seam

`plugin-bos-light/src/paperclipAdapter.ts` and `plugin-bos-light/src/persistence.ts` are explicit draft seams:
- `InMemoryPaperclipAdapter` stores comments/documents/approvals/issues in local arrays.
- `InMemoryBOSPersistence` stores BPI, status, betting table, gate results, circuits, and decisions in Maps.
- The helpers `mirrorGateResultToNativeArtifact()` and `mirrorDecisionToNativeArtifact()` already encode the native-first policy by writing issue comments.

### Worker / manifest assumptions

`plugin-bos-light/src/worker.ts` is the strongest signal of the current runtime assumption set:
- it registers only `tools`, `data`, and `actions`;
- it uses optional chaining around `ctx.tools.register`, `ctx.data.register`, and `ctx.actions.register`;
- it calls `ctx.approvals.create` inside the Approve Batch action;
- it contains a comment explicitly saying to confirm the `definePlugin` import path, the `ctx.tools/data/actions` registration API, and the issues/documents/comments/approvals/state APIs after runtime validation.

`plugin-bos-light/manifest.paperclip-plugin.json` is also clearly marked as draft:
- it requests 12 capabilities, including `config.*`, `events.subscribe`, `state.*`, `entities.*`, `issues.*`, `activity.write`, `data.register`, `actions.register`, and `tools.register`;
- it declares dashboard widgets and issue tabs;
- it warns that the manifest must still be validated against the current Paperclip PLUGIN_SPEC/runtime.

### Spike and policy docs

The repository already has the right research scaffolding:
- `docs/02_ARCHITECTURE.md` says BOS Light maps onto Paperclip surfaces and that Paperclip is ground truth.
- `docs/03_IMPLEMENTATION_PLAN_V1_2.md` places the state spike and runtime validation in Phase 2.
- `docs/05_PERSISTENCE_MATRIX.md` and `docs/07_RISKS_AND_SPIKES.md` both require fallback paths when events or company-scoped state are unreliable.
- `scripts/event-spike-checklist.md` and `scripts/state-spike-checklist.md` define the exact C2/C3-style checks.
- `scripts/import-company-template.sh` is still a TODO placeholder for the current Paperclip import/export CLI and schema mapping.
- `company-template/import-notes.md` and `company-template/a1-validation-evidence.md` still state that live Paperclip schema compatibility is unproven.

### Tests currently present

The test suite is still pure-logic only:
- `plugin-bos-light/tests/bpi.test.ts`
- `plugin-bos-light/tests/circuitBreaker.test.ts`
- `plugin-bos-light/tests/acceptance.test.ts`

There are no runtime integration tests yet for the actual Paperclip adapter, manifest, or widget bridge.

## What is missing or risky

- No live Paperclip import/export validation artifact exists in the repo.
- No proof yet of the current plugin runtime version or a capability matrix for supported surfaces.
- No runtime evidence yet for `definePlugin`, `tools.register`, `data.register`, `actions.register`, `approvals.create`, issue/document/comment APIs, config/state APIs, or event subscription behavior.
- No evidence yet that company-scoped state survives restart or that polling/activity fallback works in the current runtime.
- No integration harness exists around `paperclipAdapter.ts` / `worker.ts`; all current coverage is unit-level.
- One semantic drift to watch: `DecisionMetadata.decided_by` uses `Div7.Executive`, while the division union/org chart use `Div7.Strategy`. That does not block the current draft, but it should be kept visible if S02 touches decision surfaces.
- The current worktree root did not contain a `package.json` when inspected, so planner assumptions about a top-level npm script should be checked before depending on them.

## Implementation landscape

### Seam 1: runtime capability contract

Files:
- `plugin-bos-light/manifest.paperclip-plugin.json`
- `plugin-bos-light/src/worker.ts`

Purpose:
- confirm what the current Paperclip runtime actually exposes;
- record supported versus unsupported capability surfaces;
- tighten or prune manifest claims based on evidence.

### Seam 2: native persistence / mirroring

Files:
- `plugin-bos-light/src/paperclipAdapter.ts`
- `plugin-bos-light/src/persistence.ts`

Purpose:
- verify whether native issue documents/comments/approvals are available;
- verify whether issue-scoped or company-scoped state is usable;
- keep native-first mirroring as the durable fallback contract.

### Seam 3: spike procedure and evidence

Files:
- `scripts/import-company-template.sh`
- `scripts/state-spike-checklist.md`
- `scripts/event-spike-checklist.md`
- `company-template/import-notes.md`
- `company-template/a1-validation-evidence.md`

Purpose:
- turn the runtime investigation into a documented capability report;
- make the unsupported surfaces explicit instead of guessing.

## First proof

The highest-risk unblocker is a real Paperclip capability matrix, because every later slice depends on it. The minimum proof set should confirm:

1. the current company import/export path and AGENTS syntax compatibility;
2. the actual plugin runtime version or build identifier;
3. whether `tools`, `data`, `actions`, `approvals`, `issues`, `state`, `entities`, `activity`, and `events` are supported as claimed;
4. whether events arrive or the slice must rely on polling/activity fallback;
5. whether company-scoped state is stable enough for anything beyond cache usage.

If any surface is unsupported, S02 should capture that as an explicit fallback or blocker rather than widening implementation assumptions.

## Recommendation

Split S02 into two independent spikes:

- **C4/C5**: live company import/export and AGENTS syntax compatibility.
- **C6/C7**: plugin runtime version and capability set confirmation, including state/events/approval-request surfaces.

Keep the current pure logic untouched unless runtime evidence proves a contract mismatch. The desired output is a capability-health report, not feature expansion.

## Verification plan

- Keep the existing unit tests for pure logic as the regression floor:
  - `plugin-bos-light/tests/bpi.test.ts`
  - `plugin-bos-light/tests/circuitBreaker.test.ts`
  - `plugin-bos-light/tests/acceptance.test.ts`
- Add runtime smoke checks only after a live Paperclip instance is available.
- Write the resulting capability report so it names:
  - confirmed surfaces,
  - unsupported surfaces,
  - fallback paths,
  - the runtime version/build identifier,
  - and any import/export schema differences.

## Tooling note

No dedicated Paperclip skill is installed in the current environment. If S02 turns into implementation work, the adjacent installed skills that fit best are `observability` for runtime health reporting, `api-design` for surface-contract clarity, and `write-docs` for the durable evidence artifact.
