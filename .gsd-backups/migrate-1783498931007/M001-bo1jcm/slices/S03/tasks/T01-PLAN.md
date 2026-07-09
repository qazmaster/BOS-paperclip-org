---
estimated_steps: 5
estimated_files: 5
skills_used: []
---

# T01: Add proof-gated Blueprint artifact contract

Expected executor skills (record in task plan frontmatter if supported): api-design, tdd, observability.

Why: S03 needs a small, explicit artifact contract before worker wiring so pure BPI/Blueprint logic stays reusable and Paperclip remains the durable system of record. The contract must make native-vs-fallback truth inspectable instead of hiding it in plugin state.

Do: Create an artifact-flow module that composes an existing `BPIScore` plus `generateBlueprintMarkdown` output into a Product Blueprint artifact envelope. The helper should prefer `createIssueDocument` only when the caller supplies a capability posture that proves or intentionally enables that surface, fall back to `addIssueComment` when documents are unvalidated/failed, and return an explicit markdown-only fallback with diagnostics if adapter writes fail. It should include `artifact_id`/reference, selected surface, `mirrored_at`, generated markdown, title, and fallback reason/error without claiming live Paperclip support. Keep plugin persistence out of this durable-artifact contract. Add focused Vitest coverage for confirmed document path, unvalidated document fallback, document failure fallback, all-adapter failure, five blueprint section preservation, and hard-gate score compatibility.

Failure Modes (Q5): If the document API errors, fall back to comment and record the document error; if comment also errors, return markdown-only fallback and mark the surface accordingly; malformed issue text must remain inert markdown display content. Load Profile (Q6): one score, one markdown render, and at most two adapter writes per issue; 10x load first stresses Paperclip document/comment rate limits, so callers must batch outside this helper. Negative Tests (Q7): hard gates false, missing acceptance/resources, document throw, document unvalidated, all adapter writes throw.

Done when: The new helper is exported, tests prove native-first/fallback selection and returned references, and no test relies on `.gsd`, `.planning`, `.audits`, or live Paperclip runtime.

## Inputs

- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/plugin-bos-light/src/bpi.ts`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/plugin-bos-light/src/blueprint.ts`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/plugin-bos-light/src/contracts.ts`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/plugin-bos-light/src/paperclipAdapter.ts`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/plugin-bos-light/src/runtimeCapabilities.ts`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/plugin-bos-light/package.json`

## Expected Output

- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/plugin-bos-light/src/blueprintArtifact.ts`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/plugin-bos-light/tests/blueprintArtifact.test.ts`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/plugin-bos-light/src/index.ts`

## Verification

cd plugin-bos-light && npm test -- tests/blueprintArtifact.test.ts

## Observability Impact

Adds machine-readable artifact metadata and fallback diagnostics that future agents can inspect in tests or worker returns instead of inferring whether a native write happened.
