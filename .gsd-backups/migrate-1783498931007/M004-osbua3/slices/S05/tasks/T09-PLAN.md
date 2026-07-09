---
estimated_steps: 1
estimated_files: 1
skills_used: []
---

# T09: Run regression and close the milestone

Run the full repository-local regression suite after the migration is complete, then record the resulting proof set in the milestone summary. This is the assembly check that proves the docs, company template, plugin contracts, and runtime-health narratives all describe the same v1.4.1 ownership model and that nothing still depends on the old canonical names in active contracts.

## Inputs

- `README.md`
- `scripts/validate_handoff.py`
- `scripts/validate_company_template.py`
- `scripts/test_validate_company_template.py`
- `scripts/test_probe_paperclip_runtime.py`
- `plugin-bos-light/src/contracts.ts`
- `plugin-bos-light/tests/acceptance.test.ts`
- `docs/05_PERSISTENCE_MATRIX.md`
- `docs/06_ACCEPTANCE_TESTS.md`
- `docs/07_RISKS_AND_SPIKES.md`
- `docs/08_RUNTIME_CAPABILITY_HEALTH.md`
- `docs/09_BACKLOG.md`

## Expected Output

- `.gsd/milestones/M004-osbua3/M004-osbua3-SUMMARY.md`

## Verification

python3 scripts/validate_handoff.py && python3 scripts/test_validate_company_template.py && python3 scripts/test_probe_paperclip_runtime.py && npm --prefix plugin-bos-light test && npm --prefix plugin-bos-light run typecheck && python3 scripts/validate_runtime_capabilities.py && python3 scripts/validate_a1_a10_demo_docs.py
