# S06 Research: Integrated A1-A10 Demo

## Summary
S06 is a composition and closeout slice, not a new core-feature slice. The repository already contains deterministic fixture-level proof for A2-A10 and local A1 proof, but it does **not** yet contain a single runnable end-to-end demo harness that stitches all A1-A10 evidence together. The practical gap is an integrated demo artifact/runbook plus, if a live Paperclip runtime is available, runtime smoke evidence for the remaining unconfirmed surfaces.

## Active Requirements / Scope
S06 primarily consolidates the requirements already advanced by prior slices:

- **R001-R002**: seven-division company template import-readiness and semantic role/routing/ritual compatibility.
- **R003-R004**: native-first truth, cache-overlay-only plugin state, and proof-gated runtime assumptions.
- **R005-R010**: bounded BPI, Product Blueprint mirroring, Betting Table, approval request path, Eval Gates, and Circuit Breaker evidence.
- **R011-R013**: contract-level proof, explicit fallback diagnostics, and native-first artifact mirroring boundaries.

The slice’s success criterion is to show A1-A10 working together or to record runtime gaps explicitly without overclaiming live Paperclip support.

## Existing Assets and What They Prove

| File | What it already gives S06 |
|---|---|
| `company-template/a1-validation-evidence.md` | Reusable A1 proof boundary and the repository-local template validation command. |
| `scripts/validate_company_template.py` / `scripts/test_validate_company_template.py` | Deterministic local validation of the seven-division template contract. |
| `plugin-bos-light/tests/acceptance.test.ts` | Fixture integration proof for A2-A10 through in-memory adapter/persistence seams, including worker tool registration and fallback behavior. |
| `plugin-bos-light/src/worker.ts` | The current orchestration seam: `piko:bpi-score`, `piko:blueprint-gen`, `piko:bpi-blueprint-artifact`, `piko:eval-gate`, `piko:eval-gate-evidence`, `piko:circuit-breaker-observe`, `piko:decide`, `betting-table`, and `approve-batch`. |
| `scripts/demo-seed-issues.json` | Five seeded issue inputs for a demo, but **not** a runnable demo runner. |
| `docs/06_ACCEPTANCE_TESTS.md` | A1-A10 acceptance matrix; explicitly notes an E2E demo script is still pending a real Paperclip instance. |
| `docs/08_RUNTIME_CAPABILITY_HEALTH.md` | The S06 closure gate: capture version/build, plugin load, each requested registration surface, dashboard hydration, action invocation, native artifacts, approval/request create/read, fallback-rate observability, and import/export/AGENTS.md compatibility before anything is marked confirmed. |
| `docs/09_BACKLOG.md` | The remaining live-runtime follow-ups: dashboard hydration, approval create/read, fallback-rate observability, and state/event proof gaps. |

## What Is Missing

1. **No single integrated demo harness exists yet.** There is seed data, acceptance coverage, and documentation, but no unified runner or artifact that sequences A1→A10 in one place.
2. **No live Paperclip runtime evidence is captured in-repo.** Dashboard hydration, native approval create/read, plugin load/version/build, and registration invocation remain unvalidated or fallback-only.
3. **No demo artifact currently bundles the evidence sources.** S06 still needs a documented baseline that points from the A1 local proof through the S02 health report and the S03-S05 fixture evidence.
4. **Fallback-rate observability is still a follow-up, not a demonstrated operational signal.** The repo documents the need, but there is no live dashboard/metric pipeline.

## Constraints and Surprises

- The codebase already has the orchestration seams; the biggest missing piece is **composition**, not core logic.
- `plugin-bos-light/tests/acceptance.test.ts` is effectively a living fixture demo for A2-A10, but it stops short of A1 and does not prove live runtime support.
- The demo seed JSON exists, which suggests the intended S06 path is to drive a small set of representative issues through the existing flows.
- The architecture boundary is strict: Paperclip stays the system of record, plugin state stays cache/overlay, and any unsupported surface must be documented as unvalidated/fallback-only.

## Natural Seams / Likely Build Order

1. **Assemble evidence references first.** Start from the existing A1, S02, S03, S04, and S05 artifacts.
2. **Define the demo narrative.** Sequence: import-ready company template → BPI → Blueprint → Betting Table → approval request → Eval Gates → Circuit Breaker.
3. **Add an explicit gap ledger.** Every unsupported runtime surface should be listed as a blocker/fallback, not silently assumed.
4. **If live runtime is available, treat runtime smoke as the first proof.** Capture version/build, plugin load, registration surfaces, data-provider hydration, action invocation, and native create/read evidence before any capability is promoted.

## Verification Baseline

Use the existing repository checks as the fixture baseline:

- `python3 scripts/validate_company_template.py`
- `python3 scripts/test_validate_company_template.py`
- `npm --prefix plugin-bos-light test`
- `npm --prefix plugin-bos-light run typecheck`
- `python3 scripts/validate_runtime_capabilities.py`

If a live Paperclip runtime is available, add the runtime smoke path on top of those checks and require explicit evidence for any surface before marking it confirmed.

## Recommendation
S06 should be planned as an evidence-composition slice: create one integrated A1-A10 demo artifact/runbook that reuses the existing slice outputs, then optionally add a live-runtime smoke path if a real Paperclip instance is available. The slice should optimize for **truthfulness and traceability**, not for new core business logic.