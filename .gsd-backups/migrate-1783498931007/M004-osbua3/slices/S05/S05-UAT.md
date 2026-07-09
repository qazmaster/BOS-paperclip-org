# S05: Regressions And Closure — UAT

**Milestone:** M004-osbua3
**Written:** 2026-05-31T10:23:28.883Z

## UAT Type

Final assembly / regression closeout.

## Preconditions

- S01-S04 are complete.
- Repository dependencies are installed for Python validation scripts and `plugin-bos-light` npm tests/typecheck.
- No live Paperclip runtime proof is assumed; repository-local checks must preserve fallback-only or unvalidated posture for unproven surfaces.

## Steps

1. Run `python3 scripts/validate_handoff.py`.
2. Run `python3 scripts/test_validate_company_template.py`.
3. Run `python3 scripts/test_probe_paperclip_runtime.py`.
4. Run `npm --prefix plugin-bos-light test`.
5. Run `npm --prefix plugin-bos-light run typecheck`.
6. Run `python3 scripts/validate_runtime_capabilities.py`.
7. Run `python3 scripts/validate_a1_a10_demo_docs.py`.
8. Review the proof output for stale active-contract division names or promoted live runtime claims.

## Expected Outcomes

- Handoff validation passes and reports the required v1.4.1 package inventory.
- Company-template validator tests pass and reject legacy/inactive division IDs in active contracts.
- Paperclip runtime probe tests pass, including no-runtime/unvalidated modes and metadata redaction.
- Plugin tests pass and plugin TypeScript typecheck succeeds.
- Runtime capability validation passes while keeping unproven live Paperclip surfaces unvalidated or fallback-only.
- A1-A10 demo documentation validation passes.
- No validation output promotes live Paperclip capability without live version/build and surface-specific proof.

## Edge Cases

- If MANIFEST.md is stale after legitimate migration edits, refresh only with `python3 scripts/validate_handoff.py --write-manifest`, then rerun the full suite.
- If a legacy division ID appears in active company-template/plugin contracts, closeout fails until the active contract is remapped or the reference is moved to clearly historical/deprecated context.
- If runtime probes find live-surface claims without live proof, closeout fails and the claim must be downgraded to unvalidated or fallback-only.
- If plugin tests pass but typecheck fails, closure fails because runtime contract drift may still exist.

## Evidence

- Fresh closeout proof log: `.gsd/exec/f3fb5605-43ce-4a3f-badf-77029cc18522.stdout`.
- Prior task proof log: `.gsd/exec/46be68a7-db57-4a37-8c25-d1d2d86113fa.stdout`.
