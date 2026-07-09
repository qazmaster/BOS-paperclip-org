---
estimated_steps: 11
estimated_files: 1
skills_used: []
---

# T02: Reproduce local BOS Light baseline

Reproduce the M001 local contract and fixture baseline before any live adapter work so failures can be attributed correctly.

Run:
- python3 scripts/run_a1_a10_demo.py
- python3 scripts/test_validate_company_template.py
- npm --prefix plugin-bos-light test
- npm --prefix plugin-bos-light run typecheck
- python3 scripts/test_validate_runtime_capabilities.py
- python3 scripts/validate_runtime_capabilities.py
- python3 scripts/validate_a1_a10_demo_docs.py
- python3 scripts/validate_handoff.py if handoff/report docs changed

Record exact pass/fail output digests in the S01 evidence note or report draft.

## Inputs

- `docs/10_A1_A10_DEMO.md`
- `docs/08_RUNTIME_CAPABILITY_HEALTH.md`
- `plugin-bos-light/capabilities.paperclip-runtime.json`

## Expected Output

- `Local verification evidence attached to S01 report draft`

## Verification

All local baseline commands pass, or failures are recorded with bounded stdout/stderr and no live capability promotions.

## Observability Impact

Establishes clean local baseline and separates fixture failures from live Paperclip adapter failures.
