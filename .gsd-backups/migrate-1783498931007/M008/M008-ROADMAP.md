# M008: Div7 Delegation and Div1 Deterministic Routing Refactor

**Vision:** Fix the architecture gap where Div7.MissionControl becomes a terminal handler for technical work. Implement Div1-owned deterministic routing governance as a BOS Light plugin overlay. No live Paperclip task mutation - pure code refactor with dry-run action mapping.

## Success Criteria

- Div7 cannot complete operational missions directly - all technical work passes through Div1 routing
- Routine CLEAR/COMPLICATED missions route without Div7 involvement
- COMPLEX missions pass through Div7 decision then back to Div1 for operational dispatch
- CHAOTIC missions trigger Div1-controlled incident flow, not Div7 self-execution
- DecisionDelegated packet emitted from Div7 to Div1 after every non-policy decision
- Routing policy uses MissionSignals (not cynefinDomain) for pre-decision routing
- PaperclipAction mapper produces correct dry-run action objects for each routing rule
- BosTaskMetadata type and storage interface ready for M007B live integration
- Regression tests prove Div7 presence does not create terminal route
- All existing tests still pass after refactor

## Slices

- [x] **S01: Div7 Delegation and DecisionDelegated Packet** `risk:high` `depends:[]`
  > After this: After this: COMPLEX and CHAOTIC missions pass through Div7 then emit DecisionDelegated back to Div1. Regression tests prove Div7 cannot self-execute technical work.

- [x] **S02: MissionSignals and Deterministic Routing Policy** `risk:medium` `depends:[S01]`
  > After this: After this: routing policy uses MissionSignals for pre-decision routing. Routine missions bypass Div7. Two-pass flow works for executive decisions.

- [x] **S03: PaperclipAction Mapper and BosTaskMetadata** `risk:low` `depends:[S01,S02]`
  > After this: After this: dry-run PaperclipAction mapper produces structured action objects. BosTaskMetadata type and storage interface ready for M007B.

## Boundary Map

### S01 → S02

Produces:
- DecisionDelegated packet type and emission function
- requiresExecutiveDecision() gate
- Regression tests proving Div7 non-terminal behavior

Consumes:
- Existing DivisionPacketRouter, missionRouter.ts, decision.ts

### S01 → S03

Produces:
- DecisionDelegated packet type

Consumes:
- nothing from S01 beyond type definition

### S02 → S03

Produces:
- MissionSignals type
- RoutingPhase enum
- deriveOperationalRoute() with post-decision support

Consumes:
- DecisionDelegated type from S01
- requiresExecutiveDecision() from S01
