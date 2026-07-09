---
estimated_steps: 5
estimated_files: 5
skills_used: []
---

# T02: Wire seeded issue BPI and Blueprint flow

Expected executor skills (record in task plan frontmatter if supported): api-design, tdd, observability.

Why: S03 is only useful downstream if a seeded issue can move through BPI scoring, Blueprint generation, adapter mirroring, and cache-overlay updates in one callable path that returns a `blueprint_id` for the Betting Table.

Do: Add a seeded issue orchestration helper that accepts issue fields, BPI inputs, adapter, optional `BOSPersistence`, and capability posture; calculates bounded BPI; generates/mirrors the Product Blueprint through the T01 artifact helper; saves BPI and `BLUEPRINT_READY` status only as cache/overlay when persistence is provided; and returns `{ bpi, blueprint_markdown, artifact, status_overlay }` with `status_overlay.blueprint_id` populated from the artifact reference when available. Wire this helper into `BOS_LIGHT_TOOLS` and register an optional draft worker tool such as `piko:bpi-blueprint-artifact` without implying host tool/document support. Update the acceptance vertical-slice test so a fixture issue uses the in-memory adapter/persistence path and its artifact reference is passed into the Betting Table item.

Failure Modes (Q5): Adapter failure must not prevent returning BPI/blueprint markdown; persistence failure should be surfaced as cache-overlay failure and must not be described as durable Paperclip loss; optional worker ctx surfaces may be absent and should not crash registration. Load Profile (Q6): one issue per call; 10x candidate batches should call this helper per issue and rely on S04 batching rather than global mutable state. Negative Tests (Q7): missing persistence, absent worker ctx tools, hard-gated BPI zero, and fallback artifact references still flowing into Betting Table.

Done when: A local fixture issue proves A2/A3 at repository level, the Betting Table can consume the returned artifact reference, persistence remains explicitly cache/overlay, and worker wiring stays optional behind S02 runtime boundaries.

## Inputs

- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/plugin-bos-light/src/blueprintArtifact.ts`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/plugin-bos-light/src/bpi.ts`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/plugin-bos-light/src/blueprint.ts`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/plugin-bos-light/src/contracts.ts`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/plugin-bos-light/src/paperclipAdapter.ts`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/plugin-bos-light/src/persistence.ts`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/plugin-bos-light/src/worker.ts`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/plugin-bos-light/tests/acceptance.test.ts`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/plugin-bos-light/package.json`

## Expected Output

- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/plugin-bos-light/src/issueBlueprintFlow.ts`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/plugin-bos-light/src/worker.ts`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/plugin-bos-light/tests/acceptance.test.ts`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/plugin-bos-light/src/index.ts`

## Verification

cd plugin-bos-light && npm test -- tests/acceptance.test.ts

## Observability Impact

Returns per-issue flow metadata with selected artifact surface, fallback reason, and timestamp; exposes cache-overlay status so failures can be localized to scoring, mirroring, or persistence rather than hidden behind a single string result.
