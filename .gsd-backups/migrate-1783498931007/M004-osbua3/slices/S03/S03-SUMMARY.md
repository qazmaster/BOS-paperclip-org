---
id: S03
parent: M004-osbua3
milestone: M004-osbua3
provides:
  - A plugin contract and fixture baseline using the v1.4.1 ownership model for downstream acceptance/runtime documentation.
  - Passing plugin typecheck and test evidence for S05 aggregate regression closure.
  - A stale-owner scan pattern for future checks against legacy v1.3 ownership strings.
requires:
  - slice: S01
    provides: Canonical v1.4.1 doctrine and ownership package.
  - slice: S02
    provides: Validated company template and AGENTS profile remap to the new division model.
affects:
  - S04 acceptance and runtime documentation should reference the remapped plugin owners.
  - S05 regression closure should include plugin typecheck/test evidence from this slice.
key_files:
  - plugin-bos-light/src/contracts.ts
  - plugin-bos-light/src/decision.ts
  - plugin-bos-light/src/evalGates.ts
  - plugin-bos-light/src/evalGateEvidence.ts
  - plugin-bos-light/src/integratedDemo.ts
  - plugin-bos-light/tests/acceptance.test.ts
  - plugin-bos-light/tests/blueprintArtifact.test.ts
  - plugin-bos-light/tests/integratedDemo.test.ts
  - plugin-bos-light/tests/liveArtifactFlow.test.ts
  - docs/04_DATA_CONTRACTS.md
key_decisions:
  - Use Div4.Production as the active replacement for stale Div3.Production producer ownership because v1.4.1 moved Production ownership to Div4.
  - Use Div1.HCO for fixture approval/request ownership aliases that previously used Fixture.MasterPlanner or Master.Human.
  - Keep the proof conservative: local plugin typecheck/tests validate contract and fixture remap but do not claim live Paperclip runtime support.
patterns_established:
  - Contract layer first, then fixture/test remap against the stable Division type surface.
  - Closeout scans should reject stale active plugin owner literals: Div1.Executive, Div7.Executive, and Div3.Production.
  - Demo and acceptance fixtures should assert concrete owner fields so future drift is caught by tests rather than hidden in seed defaults.
observability_surfaces:
  - Closeout verification evidence from gsd_exec for typecheck, tests, and stale-owner scan.
  - No new runtime observability surface was planned or required for this contract-remap slice.
drill_down_paths:
  - .gsd/milestones/M004-osbua3/slices/S03/tasks/T05-SUMMARY.md
  - .gsd/milestones/M004-osbua3/slices/S03/tasks/T06-SUMMARY.md
duration: ""
verification_result: passed
completed_at: 2026-05-31T09:54:53.717Z
blocker_discovered: false
---

# S03: Remap Plugin Contracts

**Plugin contracts, demo seeds, and acceptance tests now use the BOS Light v1.4.1 ownership semantics instead of stale Executive and Production-era owners.**

## What Happened

S03 completed the plugin-side ownership remap started by the v1.4.1 doctrine import and company-template migration. T05 rewrote the pure contract layer so the active Division union and ownership constants align with the v1.4.1 model, then updated decision, eval gate, eval gate evidence, one typed live artifact fixture, and docs/04_DATA_CONTRACTS.md references that depended on the old owner strings. T06 updated the integrated demo, acceptance fixtures, blueprint artifact expectations, and integrated demo tests so seeded approval, blueprint, BPI, and eval evidence flows exercise the same owner semantics as the contracts. The slice specifically removed active plugin reliance on Div1.Executive, Div7.Executive, and Div3.Production as canonical owner values, while preserving conservative runtime posture: this is repository-local contract and fixture proof, not a promotion of live Paperclip capability.

## Verification

Fresh closeout verification passed through the closeout-safe gsd_exec surface. `npm --prefix plugin-bos-light run typecheck` exited 0, proving the remapped Division union and contract references compile. `npm --prefix plugin-bos-light test` exited 0 with 9 test files and 79 tests passing, proving the demo and acceptance fixtures agree with the new contracts. A stale-owner literal scan over 29 plugin source/test files exited 0 with no `Div1.Executive`, `Div7.Executive`, or `Div3.Production` hits, and confirmed active v1.4.1 owner literals are present: Div7.MissionControl, Div1.HCO, Div3.Treasury, Div5.QualificationsLibraryLearning, and Div6.External.

## Requirements Advanced

- R012 — Advanced by proving active plugin contracts, demo seeds, and tests use v1.4.1 division ids and no longer contain stale canonical Div1.Executive, Div7.Executive, or Div3.Production literals in plugin source/tests.
- R014 — Advanced by assigning eval evidence ownership in plugin contracts and fixtures to Div5.QualificationsLibraryLearning.
- R015 — Advanced by assigning approval/request routing ownership in plugin fixtures and demo flows to Div1.HCO.

## Requirements Validated

None.

## New Requirements Surfaced

None.

## Requirements Invalidated or Re-scoped

None.

## Operational Readiness

None.

## Deviations

T05 also updated docs/04_DATA_CONTRACTS.md and a live artifact flow fixture needed by typecheck. T06 also updated plugin-bos-light/tests/integratedDemo.test.ts because it directly covers the integrated demo ownership defaults.

## Known Limitations

S03 proves plugin contract and fixture consistency only. It does not validate live Paperclip runtime behavior or promote any runtime capability beyond existing evidence.

## Follow-ups

S04 should align acceptance, persistence, runtime-health, risks, and backlog docs with the v1.4.1 security/routing invariants while preserving the conservative live-runtime posture. S05 should include this slice in aggregate regression closure.

## Files Created/Modified

- `plugin-bos-light/src/contracts.ts` — Remapped Division union and ownership constants to the v1.4.1 model.
- `plugin-bos-light/src/decision.ts` — Updated decision ownership references to the new owner constants.
- `plugin-bos-light/src/evalGates.ts` — Updated eval gate owner semantics for the v1.4.1 division map.
- `plugin-bos-light/src/evalGateEvidence.ts` — Updated eval evidence ownership to Div5.QualificationsLibraryLearning.
- `plugin-bos-light/src/integratedDemo.ts` — Updated integrated demo seeded owner defaults for approval/eval flows.
- `plugin-bos-light/tests/acceptance.test.ts` — Updated acceptance fixtures and assertions for v1.4.1 owners.
- `plugin-bos-light/tests/blueprintArtifact.test.ts` — Updated blueprint artifact expectations for BPI scorer and producer ownership.
- `plugin-bos-light/tests/integratedDemo.test.ts` — Added/updated integrated demo assertions for default approval and eval ownership.
- `plugin-bos-light/tests/liveArtifactFlow.test.ts` — Adjusted typed live artifact fixture to satisfy the new Division contract.
- `docs/04_DATA_CONTRACTS.md` — Aligned data contract documentation references with the plugin contract remap.
