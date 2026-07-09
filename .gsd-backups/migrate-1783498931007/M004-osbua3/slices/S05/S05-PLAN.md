# S05: Regressions And Closure

**Goal:** Prove that the doctrine package, company template, plugin contracts, and acceptance docs all agree after the migration and that the repo remains internally consistent.
**Demo:** The full local validation suite passes and the milestone can close without promoting any live runtime capability beyond the evidence actually collected in this repository.

## Must-Haves

- validate_handoff.py passes.
- validate_company_template.py and its tests pass.
- The plugin test suite and typecheck pass.
- validate_runtime_capabilities.py passes with conservative posture intact.
- No stale active-contract division names remain after the migration.

## Proof Level

- This slice proves: final-assembly

## Integration Closure

All repo-local surfaces agree on the same ownership map, so the migration is complete without needing live Paperclip runtime promotion in this milestone.

## Verification

- Validation output and the milestone summary together capture the exact proof set and any residual gaps for the next milestone.

## Tasks

- [x] **T09: Run regression and close the milestone** `est:45m`
  Run the full repository-local regression suite after the migration is complete, then record the resulting proof set in the milestone summary. This is the assembly check that proves the docs, company template, plugin contracts, and runtime-health narratives all describe the same v1.4.1 ownership model and that nothing still depends on the old canonical names in active contracts.
  - Verify: python3 scripts/validate_handoff.py && python3 scripts/test_validate_company_template.py && python3 scripts/test_probe_paperclip_runtime.py && npm --prefix plugin-bos-light test && npm --prefix plugin-bos-light run typecheck && python3 scripts/validate_runtime_capabilities.py && python3 scripts/validate_a1_a10_demo_docs.py
