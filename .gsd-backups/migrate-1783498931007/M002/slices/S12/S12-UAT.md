# S12: Runtime proof or approved rescope — UAT

**Milestone:** M002
**Written:** 2026-05-30T07:04:28.735Z

## UAT Type

Operational artifact and regression-closure UAT for a fail-closed runtime proof or approved-rescope disposition.

## Preconditions

- Work from the M002 worktree repository root.
- The S12 Hermes and GSD-Pi runtime evidence files exist under `runtime-evidence/`.
- `plugin-bos-light/capabilities.paperclip-runtime.json`, `PAPERCLIP_LIVE_VALIDATION_REPORT.md`, `docs/08_RUNTIME_CAPABILITY_HEALTH.md`, and M002/S12 assessment files are present.
- No Paperclip secrets are required for this UAT; current closeout is the approved-rescope path.

## Steps and Expected Outcomes

1. Run `python3 -m unittest scripts/test_validate_s12_runtime_proof_or_rescope.py`.
   - Expected: tests pass, including negative coverage for malformed evidence, secret-like diagnostics, one-sided proof, blocker promotion, missing approval, unsupported boundary flags, and docs/matrix overclaim.
2. Run `python3 scripts/validate_s10_runtime_execution.py --evidence runtime-evidence/M002-S12-hermes-runtime-execution-proof.json --phase hermes`.
   - Expected: command exits 0 and reports the Hermes artifact is valid fail-closed blocker evidence, not passing runtime proof.
3. Run `python3 scripts/validate_s10_runtime_execution.py --evidence runtime-evidence/M002-S12-gsdpi-runtime-execution-proof.json --phase gsdpi`.
   - Expected: command exits 0 and reports the GSD-Pi artifact is valid fail-closed blocker evidence, not passing runtime proof.
4. Run `python3 scripts/validate_s12_runtime_proof_or_rescope.py --artifact runtime-evidence/M002-S12-runtime-proof-or-rescope.json`.
   - Expected: command exits 0 with `S12 disposition validation passed: approved_rescope`.
5. Run `python3 scripts/validate_s12_runtime_proof_or_rescope.py --phase final --write-audit runtime-evidence/M002-S12-validation-closeout.json`.
   - Expected: command exits 0 and writes an audit JSON with `passed: true`, `classification: approved_rescope`, and zero diagnostics errors.
6. Run `python3 scripts/run_m002_regression_closure.py --output runtime-evidence/M002-S06-regression-closure.json`.
   - Expected: aggregate closure exits 0, records `overall_verdict: pass`, includes the S12 validator after S11 validation artifact repair and before M002 closeout, and records no failing commands.
7. Inspect the capability matrix and runtime health/report docs.
   - Expected: they cite S12 as approved rescope/no-promotion, do not claim Hermes `resultJson.bos` or GSD-Pi `BosAdapterResult` runtime proof, and keep future promotion proof-gated.

## Edge Cases

- If the disposition is edited to `blocked_requires_approval`, validation must fail.
- If only one runtime surface passes or a blocker is promoted, validation must fail.
- If approval source, R009/R010/R011 coverage, blocker citations, or no-promotion posture is removed, validation must fail.
- If docs or matrix claim runtime proof without both supported-boundary proof artifacts, validation must fail.
- If the aggregate closure command list omits or reorders S12, validation must fail.
