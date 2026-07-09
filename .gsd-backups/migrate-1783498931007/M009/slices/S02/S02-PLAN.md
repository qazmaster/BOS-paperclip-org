# S02: MissionRouter and DivisionPacketRouter Live Integration

**Goal:** Wire MissionRouter and DivisionPacketRouter to live Paperclip issue lifecycle
**Demo:** BOS-T1 routes through live MissionRouter, Div4 receives task, Div5 receives QA request

## Must-Haves

- Issue creation triggers MissionSignals derivation, routing decision, packet delivery to target division

## Proof Level

- This slice proves: Live routing with BOS-T1 test task

## Integration Closure

MissionRouter hooks into issue creation, DivisionPacketRouter delivers to agent inbox

## Verification

- Routing decisions logged, packets visible in issue comments

## Tasks

- [x] **T01: Wire MissionRouter to issue creation hook** `est:3h`
  Connect MissionRouter to issue lifecycle hook. On issue create, derive MissionSignals, make routing decision.
  - Files: `plugin-bos-light/src/missionRouter.ts`, `plugin-bos-light/src/issueLifecycleHooks.ts`
  - Verify: Issue creation triggers MissionSignals derivation

- [x] **T02: Wire DivisionPacketRouter to routing decisions** `est:3h`
  Connect DivisionPacketRouter to MissionRouter output. Deliver packets to target division agent inbox.
  - Files: `plugin-bos-light/src/divisionPacketRouter.ts`
  - Verify: Routing decision delivers packet to target division

- [x] **T03: Implement DecisionDelegated flow for Div7** `est:3h`
  Wire DecisionDelegated packet from Div7 to Div1. Implement two-pass routing.
  - Files: `plugin-bos-light/src/decision.ts`, `plugin-bos-light/src/missionRouter.ts`
  - Verify: DecisionDelegated flows from Div7 to Div1

- [x] **T04: Test live routing with BOS-T1** `est:2h`
  Assign BOS-T1 to Div4 agent. Verify routing metadata triggers correct route. Verify Div4 receives task.
  - Files: `plugin-bos-light/tests/liveRouting.test.ts`
  - Verify: BOS-T1 routes to Div4 through live MissionRouter

## Files Likely Touched

- plugin-bos-light/src/missionRouter.ts
- plugin-bos-light/src/issueLifecycleHooks.ts
- plugin-bos-light/src/divisionPacketRouter.ts
- plugin-bos-light/src/decision.ts
- plugin-bos-light/tests/liveRouting.test.ts
