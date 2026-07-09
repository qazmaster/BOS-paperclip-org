# M001-bo1jcm: BOS Light Baseline

**Gathered:** 2026-05-27
**Status:** Ready for planning

## Project Description

Build BOS Light for Paperclip: a template-first organizational intelligence layer that helps Paperclip companies prioritize work, batch approvals, route tasks through seven semantic divisions, run lightweight quality gates, and avoid runaway loops without replacing Paperclip's runtime.

BOS Light is not BOS Kernel. It must not build a separate event ledger, policy engine, workorder projector, spend ledger, or 26-state machine. Paperclip remains the system of record for agents, issues, status, budget, heartbeat, governance, audit/activity, and UI.

## Why This Milestone

This milestone turns the handoff package into a working demonstration baseline. It proves that the seven-division BOS Light company template can be used in Paperclip and that the minimal plugin vertical slice can coordinate prioritization, blueprints, betting, approvals, gates, and circuit-breaker behavior without becoming a second runtime.

## User-Visible Outcome

### When this milestone is complete, the user can:

- Import or validate a fresh Paperclip company with seven BOS Light division agents, AGENTS profiles, org chart, task routing, and rituals.
- Take a Paperclip issue through BPI scoring, Product Blueprint generation, Betting Table candidate display, and native Paperclip approval/request creation where runtime support allows.
- See Eval Gate and Circuit Breaker evidence through Paperclip-visible artifacts or documented fallback paths.

### Entry point / environment

- Entry point: Paperclip company template import path, plugin worker/tool registration, dashboard widget, and acceptance test/demo scripts.
- Environment: local Paperclip development/runtime environment plus repository tests.
- Live dependencies involved: Paperclip issue APIs, approval/request APIs, plugin runtime, plugin state, event/activity surfaces, UI/dashboard slots, and import/export tooling.

## Completion Class

- Contract complete means: pure BOS Light logic and adapter contracts are tested for BPI, Blueprint, Betting Table, Eval Gates, Circuit Breaker, and native artifact mirroring behavior.
- Integration complete means: runtime assumptions for import, AGENTS syntax, plugin capabilities, approvals, issues, state/events, and UI slots have explicit evidence before real SDK calls are trusted.
- Operational complete means: Circuit Breaker has polling/activity fallback and the milestone captures runtime limitations as blockers or follow-up evidence instead of hidden assumptions.

## Final Integrated Acceptance

To call this milestone complete, we must prove:

- A fresh Paperclip company can import or validate the BOS Light seven-division template with AGENTS profiles, org chart, routing, and rituals.
- A Paperclip issue can move through the demonstrable BOS Light baseline: BPI score, Product Blueprint, Betting Table candidate, and native approval/request creation where runtime permits.
- Eval Gates and Circuit Breaker produce visible evidence and safe failure behavior without relying on unvalidated terminal run events or company-scoped plugin state.
- Runtime-dependent behavior cannot be simulated silently; if Paperclip runtime does not support a needed surface, the gap is captured as explicit spike evidence and blocker/follow-up.

## Architectural Decisions

### BOS Light overlay, not BOS Kernel

**Decision:** BOS Light is a thin organizational intelligence overlay for Paperclip, not a standalone BOS Kernel or duplicate runtime.

**Rationale:** Paperclip already provides companies, agents, issues, governance, budgets, heartbeat, events/activity, plugins, UI, and database surfaces. Rebuilding those would create duplicate state and duplicate governance.

**Alternatives Considered:**
- Port full BOS Chimera kernel — rejected because it would duplicate Paperclip's execution plane.
- Build a second policy or workorder system — rejected because it violates Paperclip as source of truth.

### Native-first durable truth

**Decision:** Durable BOS Light outputs are written to Paperclip-native artifacts first; plugin state is cache or overlay.

**Rationale:** Scores, blueprints, approvals, gate results, circuit/escalation state, and decision metadata must be visible and recoverable through Paperclip-native artifacts such as issue documents, comments, approvals/requests, activity log, or managed resources.

**Alternatives Considered:**
- Plugin-state-first implementation — rejected because state-loss recovery and governance visibility would be weak.
- Mixed hidden storage by feature — rejected unless forced by runtime evidence because it increases complexity and ambiguity.

### Spike-gated adapter integration

**Decision:** Pure BOS Light logic can be implemented and tested now, but real Paperclip SDK calls stay behind adapter/persistence seams until runtime capability checks prove them.

**Rationale:** Paperclip plugin docs and runtime surfaces may differ from current implementation. Adapter isolation localizes breaking SDK changes and avoids trusting unverified events/state/UI slots.

**Alternatives Considered:**
- Wire SDK calls immediately — rejected because failures would be harder to localize and could bake in phantom capabilities.
- Defer all plugin work — rejected because M001 needs a minimal vertical slice, not just template work.

### Betting Table is a coordination view

**Decision:** Betting Table ranks candidate work and triggers Paperclip-native approval/request creation; it does not own approval state.

**Rationale:** Approval and governance must remain Paperclip-native. BOS Light can coordinate and present candidate batches, but it must not become a plugin-side approval engine.

**Alternatives Considered:**
- Control panel that mutates workflow state directly — rejected because it blurs governance ownership.
- Read-only table only — rejected because M001 needs to prove the native approval/request path.

### Div7 decision protocol deferred, foundation preserved

**Decision:** Full Div7 `piko:decide` is deferred until usage traces exist, but M001 keeps compatible decision-record foundations and native artifact patterns.

**Rationale:** A decision protocol built before real scenarios risks becoming bureaucracy. M001 should avoid incompatible contracts while not pretending the full protocol is ready.

**Alternatives Considered:**
- Ship full decision protocol in M001 — rejected as premature.
- Ignore decision records entirely — rejected because future durability patterns should not be blocked.

## Error Handling Strategy

BOS Light must not hide failures or infer success when Paperclip has not confirmed the action. Durable or governance-related operations are successful only when there is a Paperclip-native trace such as an issue document, comment, approval/request, activity/audit entry, or managed resource.

If Paperclip API or SDK calls fail, BOS Light does not mark the related score, blueprint, batch, gate, or approval as successful. Errors should include safe context such as component, issue id, operation, and retryability without secrets.

Until runtime surfaces are proven, event-driven behavior is optional and fallback paths are mandatory. Circuit Breaker must work through polling/activity fallback if terminal run events are unavailable. Company-scoped plugin state must not be the only source of truth. Betting Table must not mark a batch approved unless a native approval/request exists. Eval Gate failures block or guide release through visible issue evidence. Plugin-state-loss recovery is designed for in M001 by native-first mirroring, but full A11 recovery proof is deferred.

## Risks and Unknowns

- Paperclip plugin runtime caveat — public plugin specification may describe target/post-V1 behavior rather than currently implemented surfaces.
- Terminal run events may not be emitted — Circuit Breaker cannot rely solely on event-driven transitions.
- Company-scoped plugin state may not read back reliably — config and betting/circuit state need native artifact or managed resource fallback.
- Import/export and AGENTS.md compatibility may differ from draft templates — company template proof must validate current Paperclip behavior.
- UI slot and approval/request APIs need current-runtime evidence — Betting Table and approval action must be spike-gated.

## Existing Codebase / Prior Art

- `00_START_HERE_FOR_NEW_AI_AGENT.md` — strategic handoff and architecture boundary.
- `docs/03_IMPLEMENTATION_PLAN_V1_2.md` — phase plan and A1-A10 target baseline.
- `docs/04_DATA_CONTRACTS.md` — stable BOS Light contracts for BPI, status, Betting Table, gates, circuit state, and decision metadata.
- `docs/05_PERSISTENCE_MATRIX.md` — native-first persistence and recovery guidance.
- `docs/06_ACCEPTANCE_TESTS.md` — A1-A11 acceptance target definitions.
- `docs/07_RISKS_AND_SPIKES.md` — C1-C7 spike checklist and polling fallback risk.
- `agents/` — seven draft division AGENTS profiles.
- `company-template/` — draft company template, org chart, routing, rituals.
- `plugin-bos-light/src/paperclipAdapter.ts` — adapter seam for Paperclip-specific calls.
- `plugin-bos-light/src/persistence.ts` — persistence seam and native artifact mirroring helpers.

## Relevant Requirements

- R001 — advances importable seven-division company template.
- R002 — advances division role semantics, VFP, guardrails, routing, and rituals.
- R003 — preserves Paperclip as the system of record.
- R004 — validates runtime assumptions before trusting SDK behavior.
- R005 — advances bounded, explainable BPI scoring.
- R006 — advances Paperclip-native Product Blueprint generation.
- R007 — advances Betting Table coordination UI.
- R008 — advances native approval/request creation without plugin-side approval engine.
- R009 — advances Eval Gate evidence and release guidance.
- R010 — advances Circuit Breaker fallback behavior.
- R011 — defines balanced proof for M001.
- R012 — preserves adapter and persistence seams.
- R013 — requires native-first durable artifact mirroring.
- R014 — preserves future Div7 decision foundation without shipping full protocol.

## Scope

### In Scope

- Seven-division company template import or validation proof.
- AGENTS profiles, org chart, task routing, and rituals.
- C1-C7 runtime checks grouped into working slices with explicit evidence.
- BPI score flow with bounded, explainable outputs and hard-gate behavior.
- Product Blueprint generation as Paperclip-native issue artifact.
- Betting Table top-N candidate coordination view.
- Approve Batch native approval/request creation path.
- Eval Gates and Circuit Breaker with visible Paperclip evidence and polling/activity fallback.
- Decision metadata foundation compatible with future Div7 protocol.
- A1-A10 balanced proof baseline.

### Out of Scope / Non-Goals

- BOS Kernel.
- Separate event ledger, policy engine, workorder projector, spend ledger, or 26-state machine.
- Plugin-side approval engine.
- Full A11 plugin-state-loss recovery proof in M001.
- Full Div7 `piko:decide` decision protocol in M001.
- Treating unvalidated terminal run events or company-scoped plugin state as mandatory paths.

## Technical Constraints

- Paperclip remains source of truth and execution plane.
- SDK calls must stay isolated in adapter and persistence seams.
- Pure logic modules should remain independently testable.
- Durable truth should be mirrored into native Paperclip artifacts.
- Event paths must have polling/activity fallback.
- No secrets in logs, comments, or diagnostic artifacts.
- Runtime limitations must be explicit, not hidden behind simulated success.

## Integration Points

- Paperclip company import/export — validates template and org structure.
- Paperclip AGENTS configuration — validates division profile compatibility.
- Paperclip issues — source issues receive scores, blueprints, gate/circuit evidence, and comments/documents.
- Paperclip approvals/requests — Approve Batch creates or updates native approval/request artifacts.
- Paperclip plugin state — cache/overlay only until reliability is proven.
- Paperclip event/activity surfaces — events optional, polling/activity fallback mandatory.
- Paperclip UI/dashboard slots — Betting Table display depends on validated UI capability.

## Testing Requirements

Use contract-first tests and balanced proof. Unit-test pure logic for BPI, Blueprint, Betting Table selection, Eval Gates, and Circuit Breaker transitions. Test adapter and persistence contracts with in-memory adapters before real SDK wiring. Run runtime spike checks for import/export, AGENTS syntax, plugin state, events/activity, approvals, issues, data/actions, and UI slots. Use a demo path to prove template to score to blueprint to table to approval request where the runtime supports it.

## Acceptance Criteria

- A1: Fresh Paperclip company imports or validates seven agents with AGENTS profiles and org chart.
- A2: A backlog issue receives BPI score data through the BOS Light scoring path.
- A3: Product Blueprint generates a five-section issue document or runtime-supported native artifact.
- A4: Betting Table displays top-N candidates by BPI with Approve Batch visible.
- A5: Approve Batch creates or updates a Paperclip-native approval/request and does not decide approval inside the plugin.
- A6: Passing Eval Gates can produce accepted/release guidance with evidence.
- A7: Blocking Eval Gate failures produce correction guidance and prevent silent acceptance.
- A8: Circuit Breaker can close/reset after a successful retry path.
- A9: Circuit Breaker opens after repeated failures and creates visible escalation evidence.
- A10: Circuit Breaker fallback detects failures through polling/activity when events are unavailable.

## Open Questions

- Exact Paperclip SDK method names — resolve during runtime capability evidence slice.
- Exact import/export command and schema — resolve during company template proof slice.
- Exact UI slot for Betting Table — resolve during runtime capability evidence and Betting Table slices.
- Exact native artifact shape for issue documents/comments/approvals — resolve through adapter and runtime checks.
