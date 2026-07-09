---
estimated_steps: 8
estimated_files: 9
skills_used: []
---

# T04: Close documentation and capability posture from final S04 evidence

Why: S04 must leave downstream slices with a truthful capability matrix and reader-facing proof ledger. Native artifact surfaces may only be promoted if T03 produced live version/build/readback evidence; all other surfaces and agent/adapter execution paths must remain conservative. Do:
1. Add docs/13_LIVE_BOS_ARTIFACT_FLOW.md summarizing the final S04 run, exact evidence path, supported-boundary proof, visible artifact refs, no-go guard posture, fallback paths, and remaining gaps.
2. Update PAPERCLIP_LIVE_VALIDATION_REPORT.md, docs/08_RUNTIME_CAPABILITY_HEALTH.md, docs/05_PERSISTENCE_MATRIX.md, and docs/06_ACCEPTANCE_TESTS.md so they distinguish live issue/comment/document artifact proof from unvalidated plugin registration, UI/data/action registration, approvals, state, activity, events, Hermes execution, and GSD-Pi execution.
3. Update plugin-bos-light/capabilities.paperclip-runtime.json only for surfaces backed by T03 live readback evidence; likely candidates are issues.native, documents.native, and comments.native. Keep approvals.native, plugin registration, data/action/tools/UI, state, activity, events, Hermes, and GSD-Pi unvalidated or fallback-only.
4. If capability promotion requires validator changes, update scripts/validate_runtime_capabilities.py and scripts/test_validate_runtime_capabilities.py so confirmed native artifact surfaces require version/build plus S04 evidence, while generic placeholder or overbroad confirmed claims still fail.
5. Ensure plugin-bos-light/src/runtimeCapabilities.ts wording remains aligned with the matrix and does not imply cache overlay or fallback diagnostics are durable truth.
6. Run the full closeout command set and fix any docs/matrix/test drift.
Done when docs, matrix, source-level boundary wording, and validators all agree on exactly what S04 proved and what remains fallback-only/no-go.

## Inputs

- `runtime-evidence/M002-S04-live-artifact-flow.json`
- `scripts/validate_s04_live_artifact_flow.py`
- `plugin-bos-light/capabilities.paperclip-runtime.json`
- `plugin-bos-light/src/runtimeCapabilities.ts`
- `PAPERCLIP_LIVE_VALIDATION_REPORT.md`
- `docs/08_RUNTIME_CAPABILITY_HEALTH.md`
- `docs/05_PERSISTENCE_MATRIX.md`
- `docs/06_ACCEPTANCE_TESTS.md`
- `runtime-evidence/M002-S02-hermes-smoke.json`
- `runtime-evidence/M002-S03-gsdpi-smoke.json`

## Expected Output

- `docs/13_LIVE_BOS_ARTIFACT_FLOW.md`
- `PAPERCLIP_LIVE_VALIDATION_REPORT.md`
- `docs/08_RUNTIME_CAPABILITY_HEALTH.md`
- `docs/05_PERSISTENCE_MATRIX.md`
- `docs/06_ACCEPTANCE_TESTS.md`
- `plugin-bos-light/capabilities.paperclip-runtime.json`
- `plugin-bos-light/src/runtimeCapabilities.ts`
- `scripts/validate_runtime_capabilities.py`
- `scripts/test_validate_runtime_capabilities.py`

## Verification

python3 scripts/validate_s04_live_artifact_flow.py --evidence runtime-evidence/M002-S04-live-artifact-flow.json --phase final && python3 scripts/validate_runtime_capabilities.py && npm --prefix plugin-bos-light run typecheck

## Observability Impact

Promotes the S04 evidence path into human-readable health docs and matrix proof commands so future agents can audit runtime posture without rerunning the sandbox probe.
