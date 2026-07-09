# S04: Update Acceptance And Runtime

**Goal:** Refresh the repo-local acceptance and runtime-facing documentation so it reflects the v1.4.1 security model, A12-A20, and the conservative runtime boundary.
**Demo:** The persistence, acceptance, risks, runtime-health, and backlog docs describe the v1.4.1 security and routing invariants and keep Paperclip runtime posture conservative without promoting unproven surfaces.

## Must-Haves

- docs/05_PERSISTENCE_MATRIX.md names the new routing, quarantine, and external-world ownership surfaces.
- docs/06_ACCEPTANCE_TESTS.md includes the A12-A20 cases from the handoff package.
- docs/07_RISKS_AND_SPIKES.md, docs/08_RUNTIME_CAPABILITY_HEALTH.md, and docs/09_BACKLOG.md reflect the new v1.4.1 security posture.
- The runtime capability validator still reports unvalidated or fallback-only surfaces where no live Paperclip proof exists.

## Proof Level

- This slice proves: contract

## Integration Closure

The repo-local docs now explain how the new doctrine maps onto the existing fixture-first baseline without overpromising live runtime support.

## Verification

- The runtime capability validator and docs validators become the first line of defense against overclaiming confirmed Paperclip support.

## Tasks

- [x] **T07: Update persistence and acceptance docs** `est:1h 30m`
  Update the persistence matrix and acceptance test documentation to reflect the v1.4.1 doctrine. The new content should make the Div6-only external-world rule, Div5 quarantine rule, Div1 routing control, and the A12-A20 acceptance set visible to future agents while keeping the repository-local, fixture-first proof boundary explicit.
  - Files: `docs/05_PERSISTENCE_MATRIX.md`, `docs/06_ACCEPTANCE_TESTS.md`
  - Verify: python3 scripts/validate_runtime_capabilities.py

- [x] **T08: Update runtime health and backlog docs** `est:1h 15m`
  Update the risks, runtime health, and backlog docs so they describe the new ownership model, the external-IO gate, and the still-unvalidated runtime surfaces. Keep the existing fixture-first caveats intact and do not promote any live Paperclip support that has not been proven in a real runtime.
  - Files: `docs/07_RISKS_AND_SPIKES.md`, `docs/08_RUNTIME_CAPABILITY_HEALTH.md`, `docs/09_BACKLOG.md`
  - Verify: python3 scripts/validate_runtime_capabilities.py

## Files Likely Touched

- docs/05_PERSISTENCE_MATRIX.md
- docs/06_ACCEPTANCE_TESTS.md
- docs/07_RISKS_AND_SPIKES.md
- docs/08_RUNTIME_CAPABILITY_HEALTH.md
- docs/09_BACKLOG.md
