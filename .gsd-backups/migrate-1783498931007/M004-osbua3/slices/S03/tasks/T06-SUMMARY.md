---
id: T06
parent: S03
milestone: M004-osbua3
key_files:
  - plugin-bos-light/src/integratedDemo.ts
  - plugin-bos-light/tests/acceptance.test.ts
  - plugin-bos-light/tests/blueprintArtifact.test.ts
  - plugin-bos-light/tests/integratedDemo.test.ts
key_decisions:
  - D020: Use Div1.HCO for fixture approval/request ownership aliases that previously used Fixture.MasterPlanner or Master.Human.
duration: 
verification_result: passed
completed_at: 2026-05-31T09:53:01.542Z
blocker_discovered: false
---

# T06: Updated plugin demo and acceptance fixtures to exercise v1.4.1 ownership values for approval, blueprint, BPI, and eval ownership.

**Updated plugin demo and acceptance fixtures to exercise v1.4.1 ownership values for approval, blueprint, BPI, and eval ownership.**

## What Happened

Remapped the integrated A1-A10 demo approval requester default from the fixture-era MasterPlanner alias to Div1.HCO so native approval rows now reflect the v1.4.1 dispatch/control owner. Updated acceptance fixtures that previously used Master.Human to use Div1.HCO and added assertions that BPI scoring is owned by Div2.MasterPlanner, Product Blueprint producer ownership is Div4.Production, Eval Gate evidence is owned by Div5.QualificationsLibraryLearning, and native approval rows persist Div1.HCO. Strengthened blueprint artifact tests to assert the seeded BPI scorer, producer division, and rendered Blueprint producer line. Added integrated demo assertions for default approval ownership and eval ownership so the demo flow itself exercises the same owner contract model defined in T05.

## Verification

Ran a final exact stale-owner scan over the touched demo/test files and confirmed no fixture-era aliases remained. Ran the required plugin test suite with npm --prefix plugin-bos-light test; all 9 test files and 79 tests passed.

## Verification Evidence

| # | Command | Exit Code | Verdict | Duration |
|---|---------|-----------|---------|----------|
| 1 | `python3 exact stale owner literal scan over T06 touched files` | 0 | ✅ pass | 38ms |
| 2 | `npm --prefix plugin-bos-light test` | 0 | ✅ pass | 2096ms |

## Deviations

Extended the expected test updates to plugin-bos-light/tests/integratedDemo.test.ts because it directly covers the plugin demo flow and needed assertions for the remapped default approval/eval ownership.

## Known Issues

None.

## Files Created/Modified

- `plugin-bos-light/src/integratedDemo.ts`
- `plugin-bos-light/tests/acceptance.test.ts`
- `plugin-bos-light/tests/blueprintArtifact.test.ts`
- `plugin-bos-light/tests/integratedDemo.test.ts`
