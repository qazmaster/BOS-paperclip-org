# S06: Integrated A1 to A10 Demo — UAT

**Milestone:** M001-bo1jcm
**Written:** 2026-05-28T06:52:33.411Z

# UAT: S06 Integrated A1 to A10 Demo

## UAT Type
Automated deterministic repository-local UAT; no live Paperclip instance required.

## Preconditions
- Work from the repository root for milestone `M001-bo1jcm`.
- Python 3 and npm dependencies for `plugin-bos-light` are installed.
- No Paperclip secrets or live runtime credentials are required.
- Live runtime evidence is absent unless separately supplied with version/build/proof artifacts.

## Steps
1. Run `python3 scripts/run_a1_a10_demo.py`.
2. Confirm the generated report returns `status: passed`, enumerates A1 through A10, includes command/evidence references, and keeps runtime posture unvalidated when no live Paperclip proof is supplied.
3. Run `python3 scripts/test_validate_company_template.py` to verify A1 company-template coverage remains valid.
4. Run `npm --prefix plugin-bos-light test` and confirm the plugin fixture suites, including integrated demo behavior, pass.
5. Run `npm --prefix plugin-bos-light run typecheck` and confirm TypeScript typechecking passes.
6. Run `python3 scripts/test_validate_runtime_capabilities.py` and `python3 scripts/validate_runtime_capabilities.py` to confirm runtime capability guardrails reject unproven native support.
7. Run `python3 scripts/validate_a1_a10_demo_docs.py` to confirm the runbook, A-step map, fixture proof boundary, and gap ledger remain documented.

## Expected Outcomes
- The A1-A10 demo command exits 0 without a live Paperclip instance.
- A1 validates the seven-division BOS Light company template; A2 validates runtime capability posture; A3-A10 exercise seeded blueprint flow, BPI scoring, Betting Table candidate ranking, approval-request path, Eval Gate evidence, Circuit Breaker evidence, adapter injection, and cache-overlay persistence diagnostics.
- Runtime surfaces that lack live proof are listed as gaps rather than successes.
- Plugin tests, TypeScript typecheck, company-template validation, runtime-capability validation, and docs validation all pass.

## Edge Cases
- Malformed or missing local JSON inputs must fail closed with explicit diagnostics.
- Missing optional live runtime evidence must produce gap-ledger entries, not a failed deterministic baseline.
- Any live runtime claim without version/build/proof artifacts must be rejected by runtime capability validation.
- Documentation drift that removes the runner command, A1-A10 map, fixture boundary, or gap ledger must fail `scripts/validate_a1_a10_demo_docs.py`.

## Evidence From Closeout
- Fresh verification evidence: `.gsd/exec/0009a0be-276d-46a2-98a0-a096ef3b217e.stdout` and `.gsd/exec/0009a0be-276d-46a2-98a0-a096ef3b217e.stderr`.
- Closeout command exited 0 and ended with `S06_CLOSEOUT_VERIFICATION=passed`.
