# M009: BOS Light Level 2 Plugin Activation

**Vision:** Activate BOS Light plugin on live Paperclip instance for runtime enforcement of division boundaries, two-pass routing, grant policy, and metadata mirror. Move from instruction-based (Level 1) to plugin-based (Level 2) governance.

## Success Criteria

- BOS Light plugin installed and running on paperclip.oysana.com
- MissionRouter enforces two-pass routing at runtime (deterministic pre-decision, Div7 post-decision)
- DivisionPacketRouter delivers packets between divisions
- GrantPolicy validates budget/access requests deterministically
- Div4 cannot execute external access (runtime-enforced)
- Div7 cannot self-execute technical work (runtime-enforced)
- BosTaskMetadata stored in plugin state, mirrored to Paperclip comments
- 618 tests pass + new integration tests against live Paperclip
- BOS-T1, T2, T3 can be processed through live plugin

## Slices

- [x] **S01: Plugin Registration and Issue Lifecycle Hooks** `risk:high` `depends:[]`
  > After this: Plugin registers on live Paperclip, hooks fire on issue create/update/assign

- [x] **S02: MissionRouter and DivisionPacketRouter Live Integration** `risk:high` `depends:[S01]`
  > After this: BOS-T1 routes through live MissionRouter, Div4 receives task, Div5 receives QA request

- [x] **S03: GrantPolicy and BosTaskMetadata Live Enforcement** `risk:medium` `depends:[S02]`
  > After this: Div4 blocked from external access, BudgetGrant issued for BOS-T2, metadata mirrored to comments

- [x] **S04: End-to-End Live Validation with BOS-T1, T2, T3** `risk:medium` `depends:[S03]`
  > After this: All three test tasks processed through live plugin with correct routing, grants, and metadata

## Boundary Map

Not provided.
