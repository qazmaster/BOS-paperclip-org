# S03: BPI and Blueprint Native Artifact Flow — UAT

**Milestone:** M001-bo1jcm
**Written:** 2026-05-28T04:37:10.871Z

# S03 UAT: BPI and Blueprint Native Artifact Flow

## UAT Type

Contract and fixture UAT. This does not require or simulate a live Paperclip runtime; native support remains proof-gated and fallback-only unless live evidence is later added.

## Preconditions

- Worktree dependencies are installed for `plugin-bos-light`.
- `plugin-bos-light/capabilities.paperclip-runtime.json` and `plugin-bos-light/src/runtimeCapabilities.ts` retain conservative capability postures for unproven Paperclip surfaces.
- A seeded issue fixture includes title/problem context plus BPI input fields; acceptance criteria/resources may be present or absent depending on the case.

## Steps

1. Run `npm --prefix plugin-bos-light test`.
2. Run `npm --prefix plugin-bos-light run typecheck`.
3. Run `python3 scripts/validate_runtime_capabilities.py`.
4. Inspect the seeded issue flow contract in `plugin-bos-light/src/issueBlueprintFlow.ts` and test coverage in `plugin-bos-light/tests/acceptance.test.ts`.
5. Inspect the artifact contract in `plugin-bos-light/src/blueprintArtifact.ts` and test coverage in `plugin-bos-light/tests/blueprintArtifact.test.ts`.
6. Confirm docs in `docs/04_DATA_CONTRACTS.md`, `docs/05_PERSISTENCE_MATRIX.md`, `docs/06_ACCEPTANCE_TESTS.md`, and `docs/08_RUNTIME_CAPABILITY_HEALTH.md` describe native-first mirroring, explicit fallback, and no live runtime proof.

## Expected Outcomes

- BPI scores remain bounded and explainable, with hard-gated issues returning zero-score behavior and no adapter writes.
- Product Blueprint markdown contains the five required sections: identity, BPI, acceptance, resources, and QA.
- Artifact envelopes include `artifact_id`, `artifact_ref`, `selected_surface`, `mirrored_at`, markdown/title/score metadata, and sanitized fallback diagnostics where applicable.
- `status_overlay.blueprint_id` equals the opaque `artifact.artifact_ref`, giving S04 a stable handoff reference.
- Native document write is attempted only for proof-gated confirmed/explicitly enabled capability posture; comment and markdown-only fallback paths are explicit and test-covered.
- Cache-overlay persistence failures are reported as non-durable diagnostics and never treated as the Paperclip system of record.
- Runtime capability validation passes without promoting unproven Paperclip surfaces to `confirmed`.

## Edge Cases

- Hard-gated BPI: returns markdown-only diagnostic artifact and does not invoke adapter writes.
- Missing acceptance/resources: Blueprint generation defaults safely and surfaces incomplete-input diagnostics.
- Document write failure: falls back to comment with `document_write_failed` diagnostics.
- Document and comment write failure: returns a stable `markdown-only://issues/{issue_id}/product-blueprint` reference with sanitized error diagnostics.
- Missing persistence: returns useful BPI/Blueprint/artifact data with `persistence: missing` cache-overlay diagnostics.
- Cache save failure: reports per-write failure while preserving the artifact handoff.
- Missing worker adapter seam: returns `adapter_unavailable` instead of claiming Paperclip native support.
- Untrusted issue markdown: remains inert display content and cannot promote runtime capability status or execute code.

## Acceptance Evidence

- Fresh closeout command output: `gsd_exec` `60fcfe61-248b-4771-bb58-0a85c67f3d59` passed all three closure commands.
- Full plugin suite: 4 test files, 17 tests passed.
- TypeScript no-emit typecheck passed.
- Runtime capability validator passed with manifest surfaces, adapter assumptions, and guardrail fields mapped.
