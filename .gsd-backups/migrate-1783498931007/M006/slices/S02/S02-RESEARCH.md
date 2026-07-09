# S02 Research: Owner Interface Boundary

## Slice Objective
Establish that:
1. Human creates mission **only** through Div7-facing intake
2. Other divisions emit packets to Div7, not direct human questions
3. Final executive report comes from Div7

## Active Requirements
- **R022** (primary-user-loop): E2E mission cycle through Paperclip GUI with all 7 divisions producing visible artifacts
- **R023** (differentiator): Human-in-the-loop gates at (1) mission creation, (2) system failure, (3) strategy decision failure; all other steps autonomous
- **R018** (core-capability): Company template import creating 7 divisions with correct org chart and routing rules

## Existing Codebase State

### Foundational Types and Contracts
- `contracts.ts` defines the canonical `Division` union type with all 7 divisions including `Div7.MissionControl`
- `MissionEnvelope` schema exists in `missionIntake.ts` with `schema_version: "1.0"`, status lifecycle (`DRAFT` → `PENDING_APPROVAL` → `APPROVED`/`REJECTED`)
- `HumanApprovalArtifact`, `ApprovalResponse`, and `MissionEvent` types provide structured HITL primitives
- `HITLGovernance` already implements `BranchPolicyViolation`, `GateArtifact`, and `GateDecision` for operational gates

### Mission Intake Implementation
- `MissionIntake` class (`missionIntake.ts`) already provides:
  - `frameMission(vagueGoal)` — infers risk level, business goal, requested divisions
  - `requestHumanApproval(mission)` — creates document/comment artifact via adapter
  - `awaitHumanApproval(missionId, timeoutMs)` — promise-based timeout gate
  - `simulateHumanResponse()` — test seam for orchestration
  - Event emitters for `mission_approved` / `mission_rejected`
- **Gap**: No ownership check enforcing that `frameMission` and `requestHumanApproval` are **only** callable by `Div7.MissionControl` role

### HITL Governance Implementation
- `HITLGovernance` class (`hitlGovernance.ts`) already provides:
  - `enforceBranchPolicy(gitEvidence)` — blocks direct main push, force push, non-conforming branch names
  - `requestResourceGrant()`, `requestBatchApproval()`, `requestProductionDeploy()` — all create document/comment artifacts
  - `awaitGateDecision()`, `simulateGateDecision()` — timeout-based human gates
- **Gap**: No routing enforcement that gate requests from non-Div7 divisions must be **packetized to Div7** rather than direct human contact

### Adapter and Persistence
- `PaperclipAdapter` interface in `paperclipAdapter.ts` exposes `createIssueDocument`, `addIssueComment`, `createApprovalRequest`, `createEscalationIssue`, `logActivity`
- `InMemoryPaperclipAdapter` provides test-double with full introspection (documents, comments, approvals, issues arrays)
- `BOSPersistence` interface and `InMemoryBOSPersistence` provide cache-overlay seam

### Company Template
- `company-template/bos-company-template.json` defines:
  - `Div7.MissionControl` with `reports_to: null` (top of hierarchy)
  - `Div1.HCO` reports to Div7
  - All other divisions report to Div1.HCO
  - Routing rules: `high_level_mission: "Div7.MissionControl -> Div1.HCO"`, `complex_decision: "Div1.HCO -> Div7.MissionControl"`
  - This is **doctrine-level** evidence, not runtime-enforced code

### Runtime Capability Context
- S01 proved all 21 plugin routes return HTTP 404; plugin registration remains **fallback-only**
- MEM058 governs: only bounded live Paperclip issue/document/comment create/readback evidence may promote native artifact surfaces
- No live Hermes execution, no live piko:* tool invocation, no live plugin UI
- All downstream slices must plan **fallback-only** execution paths

## Key Risks and Constraints

1. **Capability Overclaim Risk**: Cannot promote any live Paperclip runtime capability. S02 evidence must be fail-closed if live runtime is unavailable. Use `InMemoryPaperclipAdapter` for fixture/typecheck proof only.

2. **Boundary Leak Risk**: The existing `MissionIntake` and `HITLGovernance` classes have no role-based access control. A non-Div7 division could theoretically call `requestHumanApproval` directly. Need explicit boundary enforcement.

3. **Packet Structure Missing**: There is no typed `DivisionPacket` or `ExecutiveStatusPacket` abstraction for division-to-Div7 communication. Need to define this.

4. **Final Report Generation Missing**: No `ExecutiveReport` type or generator exists in the codebase.

5. **Testability**: Must use existing in-memory adapters; cannot depend on live Paperclip for unit tests.

## Implementation Landscape

### Natural Seams (independent work units)

**A. Owner Boundary Enforcer** (`src/ownerBoundary.ts`)
- Enforce that `frameMission()` is only callable with `callerDivision === "Div7.MissionControl"`
- Enforce that non-Div7 divisions must use `emitDivisionPacket()` rather than direct human-facing adapter calls
- Provide `DivisionPacket` type with `from`, `to`, `packet_type`, `payload`
- Provide `ExecutiveStatusPacket` type for Div7→Human final report

**B. Mission Intake Boundary Hardening** (`src/missionIntake.ts` modifications)
- Add `callerDivision` parameter to `frameMission()` and `requestHumanApproval()`
- Return `unauthorized` diagnostic when caller is not Div7.MissionControl
- Route all approval artifacts through Div7.MissionControl identity

**C. Division Packet Router** (`src/divisionPacketRouter.ts`)
- Typed packet envelope: `{ schema_version, packet_id, from_division, to_division: "Div7.MissionControl", packet_type, payload, created_at }`
- Packet types: `status_update`, `escalation`, `resource_request`, `gate_decision`, `completion_report`
- Ensure other divisions emit packets to Div7 instead of direct human questions

**D. Executive Report Generator** (`src/executiveReport.ts`)
- Consume mission envelope + packet history + gate artifacts
- Produce `ExecutiveReport` with `mission_summary`, `division_activity`, `verdict`, `recommendations`
- Render to markdown for document/comment fallback

**E. Boundary Validation Tests**
- `tests/ownerBoundary.test.ts`: Verify non-Div7 callers are blocked from direct human contact
- `tests/divisionPacketRouter.test.ts`: Verify packet routing, type safety, Div7 aggregation
- `tests/executiveReport.test.ts`: Verify report generation from mission + packets

### Files to Change
- `plugin-bos-light/src/missionIntake.ts` — Add caller division enforcement
- `plugin-bos-light/src/hitlGovernance.ts` — Optionally wrap gates with packet routing
- `plugin-bos-light/src/contracts.ts` — Add `DivisionPacket`, `ExecutiveStatusPacket`, `ExecutiveReport` types
- **New** `plugin-bos-light/src/ownerBoundary.ts` — Boundary enforcement logic
- **New** `plugin-bos-light/src/divisionPacketRouter.ts` — Packet routing abstraction
- **New** `plugin-bos-light/src/executiveReport.ts` — Final report generation
- **New** `plugin-bos-light/tests/ownerBoundary.test.ts`
- **New** `plugin-bos-light/tests/divisionPacketRouter.test.ts`
- **New** `plugin-bos-light/tests/executiveReport.test.ts`

### Verification Commands
```bash
cd plugin-bos-light && npx vitest run tests/ownerBoundary.test.ts tests/divisionPacketRouter.test.ts tests/executiveReport.test.ts
npx tsc --noEmit
```

## Recommendations

1. **Do not attempt live Paperclip runtime proof** in S02. S01 established all plugin routes are 404. Keep all evidence fixture/typecheck-only.

2. **Use the existing `InMemoryPaperclipAdapter` and `InMemoryBOSPersistence`** for all tests. These are already well-instrumented.

3. **Keep boundary enforcement pure** — no async Paperclip calls in the boundary checker. The boundary is a code-level gate, not a runtime permission system.

4. **Align division ownership with MEM154** — canonical v1.4.1 map: Div1.HCO for routing, Div4.Production for producer, Div5.QualificationsLibraryLearning for eval, Div7.MissionControl for mission control.

5. **Reuse existing event emitter pattern** from `MissionIntake` for packet subscription if needed.

## Sources
- `plugin-bos-light/src/missionIntake.ts` — Existing intake implementation
- `plugin-bos-light/src/hitlGovernance.ts` — Existing HITL gates
- `plugin-bos-light/src/contracts.ts` — Type contracts
- `plugin-bos-light/src/paperclipAdapter.ts` — Adapter seam
- `company-template/bos-company-template.json` — Org chart doctrine
- `plugin-bos-light/tests/missionIntake.test.ts` — Existing test patterns
- `plugin-bos-light/tests/hitlGovernance.test.ts` — Existing gate test patterns
- MEM058 — Live artifact promotion rules
- MEM154 — Canonical v1.4.1 ownership map
- S01 Summary — Plugin route 404 evidence, fallback-only posture
