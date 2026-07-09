# M006: Autonomous Company Loop

**Vision:** From one Human Owner mission submitted through Div7, BOS Light can execute a bounded git/read-write smoke mission across the seven-division company loop without manual script patching, without Div4 direct external IO, without secret leakage, with plugin tool readback, Div5 qualification, Circuit Breaker behavior, and final Div7 executive report.

## Success Criteria

- From one Human Owner mission through Div7, full 7-division loop executes autonomously for bounded git mission
- Plugin piko:* tools are live and invoked through Paperclip
- Div6 performs external git; Div5 quarantines; Div4 works on sanitized snapshot
- Circuit Breaker proven with negative test
- Final Div7 Executive Report exists

## Slices

- [x] **S00: Runtime Capability Inventory** `risk:medium` `depends:[]`
  > After this: Live Paperclip runtime assumptions validated: plugin install path, tool registry, agent-to-tool invocation, secret reference, artifact readback. Evidence saved.

- [x] **S01: Plugin Live Registration** `risk:high` `depends:[S00]`
  > After this: Paperclip sees plugin tools; tool list visible; piko:* readback proven live. No claim without readback.

- [x] **S02: Owner Interface Boundary** `risk:medium` `depends:[S01]`
  > After this: Human creates mission only through Div7-facing intake; other divisions emit packets to Div7, not direct human questions; final report comes from Div7.

- [x] **S03: Div1 Internal Routing Control** `risk:medium` `depends:[S02]`
  > After this: Div1 routes mission to Div2/Div3/Div6/Div5/Div4; Div1 does not perform all work itself; Div1 does not directly ask human.

- [x] **S04: Div3 Scoped Budget Access** `risk:medium` `depends:[S03]`
  > After this: Git token is a scoped secret ref; repo URL and allowed operations are explicit; no plaintext secret appears anywhere; access grant artifact exists.

- [x] **S05: Div6 External Git Gateway** `risk:high` `depends:[S04]`
  > After this: Git ls-remote or clone/fetch executed by approved external gateway path; Div4 does not perform direct external IO; raw output marked untrusted.

- [x] **S06: Div5 Quarantine and Verification** `risk:medium` `depends:[S05]`
  > After this: Branch/ref/file inventory verified; commit SHA recorded; secret leak scan performed; sanitized repo snapshot approved for Div4.

- [x] **S07: Div4 Production on Approved Workspace** `risk:medium` `depends:[S06]`
  > After this: Harmless file change in test branch only; no main branch push; no production deployment; no raw external IO.

- [x] **S08: Div5 Eval Gate** `risk:medium` `depends:[S07]`
  > After this: Expected files exist; SHA/branch/commit verified; acceptance criteria pass/fail recorded; visible verdict artifact produced.

- [x] **S09: Circuit Breaker Negative Test** `risk:high` `depends:[S08]`
  > After this: Repeated failures stop the mission; retries bounded; CircuitBreakerIncident produced; Div1 receives escalation; Div7 receives executive summary.

- [x] **S10: E2E Autonomous Git Mission** `risk:high` `depends:[S09]`
  > After this: Human only creates initial Div7 mission and handles explicit approval gate if needed; no manual script patching; all 7 divisions participate through visible artifacts; final branch/artifact exists; Div5 verdict exists; Div7 final executive report exists.

- [x] **S11: Hermes Division Profiles** `risk:medium` `depends:[S09]`
  > After this: After this: All 7 division AGENTS.md contain complete hat profiles with Allowed Tools, Forbidden Tools, Runtime Boundary, Security Invariants, and Acceptance Checks. A single Hermes adapter config backs all seven logical divisions. Execution evidence proves one substrate path.

## Boundary Map

```
Human Owner
    ↕ (only)
Div7.MissionControl
    ↕ MissionDirective
Div1.HCO
    ↕ RoutingDecisionPacket
Div2 / Div3 / Div4 / Div5 / Div6
    ↕ artifacts
Div1.HCO (closure)
    ↕ ExecutiveStatusPacket
Div7.MissionControl
    ↕ FinalExecutiveReport
Human Owner
```
