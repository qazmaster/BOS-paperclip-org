# M014-a9jj46: Paperclip Runtime Stability Gate for BOS Light E2E

**Gathered:** 2026-06-06
**Status:** Ready for planning

## Project Description

BOS Light is a doctrine overlay for Paperclip, not a replacement runtime. Paperclip remains the execution plane, lifecycle owner, approvals, budgets, governance, audit log, UI, database, state, and adapter lifecycle owner. BOS Light provides division doctrine, routing, BPI, Product Blueprints, Betting Table, Eval Gates, Circuit Breaker semantics, Div7 decision doctrine, and external IO boundaries.

## Why This Milestone

The project has repeatedly failed to reach one bounded BOS Light E2E workflow because the runtime foundation is unstable or unproven: Paperclip company identity drift, stale auth, possible but unproven Docker or Paperclip data loss, hardcoded live script targets, loose Hermes/Xiaomi proof criteria, unregistered GSD-Pi adapter status, and a recorded live mutation side effect during research.

This milestone exists to stop repeated restoration loops. It creates a source of truth, captures read-only VPS evidence, hardens local live scripts, proves persistence with a canary, and only then permits one bounded BOS-shaped E2E gate.

## User-Visible Outcome

### When this milestone is complete, the user can:

- Point a future agent to one GSD milestone and see exactly which Paperclip runtime target is authoritative, which targets are stale or disposable, and what proof backs that claim.
- Know whether the prior failures were Docker or volume wipe, container recreation, auth drift, ownership drift, proxy drift, or still inconclusive.
- Run hardened Paperclip scripts that fail closed before live mutation when auth, company visibility, or confirmation is missing.
- Attempt one bounded BOS-shaped E2E workflow only after persistence and runtime readiness have been proven.

### Entry point / environment

- Entry point: GSD milestone artifacts and scripts under `scripts/` plus runtime evidence under `runtime-evidence/`.
- Environment: local repository plus explicitly approved read-only VPS inspection of `paperclip.oysana.com` infrastructure.
- Live dependencies involved: Paperclip VPS, Docker Compose, nginx reverse proxy, Paperclip auth/session/API, Hermes/Xiaomi only after readiness gates.

## Completion Class

- Contract complete means: source truth map, runtime lockfile schema, preflight contract, and script-hardening checks are present and validated by local tests or artifact checks.
- Integration complete means: hardened scripts consume the runtime lockfile/preflight contract and reject stale or missing targets before mutation.
- Operational complete means: the persistence canary survives the documented safe restart and one bounded E2E gate either passes with BOS-shaped evidence or writes a fail-closed blocker.

## Final Integrated Acceptance

To call this milestone complete, we must prove:

- Source truth and runtime capability claims cite current artifacts and do not overclaim Hermes, GSD-Pi, plugin, import/export, or Paperclip state.
- VPS forensics evidence has been captured without destructive Docker commands, service restart before evidence, Paperclip mutation, or secret exposure.
- Mutation-capable scripts cannot silently target hardcoded stale company IDs.
- The persistence canary can be read back before and after the safe restart command, or a fail-closed blocker explains exactly why not.
- One bounded BOS-shaped E2E gate requires terminal status, `resultJson.bos`, native Paperclip artifact readback, and zero unconfirmed live side effects.

## Architectural Decisions

### Stability Gate Before E2E

**Decision:** Do not start with `/gsd auto` or a live BOS Light E2E attempt. Start with a stability gate milestone ordered by source truth, VPS forensics, script hardening, persistence canary, then bounded E2E.

**Rationale:** Existing evidence shows unstable runtime identity and insufficient proof discipline. E2E-first would repeat stale auth, wrong company target, unconfirmed mutation, or stdout-only Hermes overclaim.

**Alternatives Considered:**
- Forensics-only milestone — safer but leaves unsafe scripts in place.
- E2E-first milestone — directly targets the desired outcome but has high risk of repeating failure.

## Error Handling Strategy

All live and external interactions must fail closed. Missing auth, missing company ID, stale target ID, unsupported adapter, route mismatch, timeout, malformed response, or missing explicit confirmation must produce structured blocker evidence and zero mutation. No secret values may be printed or written. Recovery recommendations must distinguish local script/config fixes from VPS or Paperclip operator actions.

## Risks and Unknowns

- Docker or Paperclip data wipe is not proven — this matters because remediation differs from auth or ownership drift.
- Company identity is unresolved — historical `/BOS`, disposable `/BOSA`, and later `9feb...` artifacts conflict and require fresh authenticated readback.
- Paperclip auth may be stale or rotated — scripts must detect this before mutation.
- GSD-Pi remains unregistered — do not route Div4 automation through `gsdpi_local` until registry/testEnvironment/BosAdapterResult proof exists.
- Hermes/Xiaomi has incomplete proof — stdout/session is not sufficient; require `resultJson.bos`.
- Live mutation governance already failed once — every live mutation needs explicit confirmation.

## Existing Codebase / Prior Art

- `docs/handoffs/HANDOFF_PAPERCLIP_RUNTIME_FORENSICS.md` — current forensic handoff and VPS checklist.
- `.gsd/workflows/spikes/260607-1-start-a-gsd-milestone-for-paperclip-runt/RECOMMENDATION.md` — spike recommendation for this milestone shape.
- `../BOS_Light_v1_4_1_Handoff/BOS_Light_v1_4_1_Handoff/README.md` — doctrine package stating Paperclip rails and BOS Light doctrine.
- `../BOS_Light_v1_4_2_R026_Agent_Boundary_Update/BOS_Light_v1_4_2_R026_Agent_Boundary_Update/README.md` — R026 boundary patch requiring Div7 decisions to delegate operational routing back to Div1.HCO.
- `scripts/create_bos_v141_agents.py` — mutation script with old hardcoded company target.
- `scripts/m012_s01_canonical_paperclip_readback.js` — readback script with later hardcoded target and stale override.
- `scripts/m013_s02_create_tech_debt_issue.js` — mutation script with later hardcoded target.
- `runtime-evidence/M012-S06-mission-issue-evidence.json` — later session-auth readback success.
- `runtime-evidence/M013-S02-T04-paperclip-issue.json` — later stale credential blocker.
- `runtime-evidence/M005-S01-hermes-xiaomi-runtime-probe-live-proof.json` — Hermes/Xiaomi proof with empty `resultJson`.

## Relevant Requirements

- New milestone requirements should be recorded as this plan executes. This context currently derives from user direction, project memory, and spike research rather than an existing R### contract.

## Scope

### In Scope

- Source truth map across current repo and two sibling handoff packages.
- Read-only VPS/Docker/Paperclip forensics plan and evidence capture after approval.
- Runtime lockfile or equivalent source-of-truth artifact.
- Script hardening for live Paperclip scripts.
- Persistence canary gated by explicit confirmation.
- One bounded BOS-shaped E2E gate after stability proof.

### Out of Scope / Non-Goals

- Blind live E2E before stability gates.
- Docker restart, recovery, prune, or destructive commands before evidence capture.
- Secret disclosure or external credential delivery without explicit confirmation.
- Plugin, piko, GSD-Pi, import/export, or Hermes execution promotion without independent proof.
- Treating `/api/health` as proof of persisted company, agent, auth, or plugin state.

## Technical Constraints

- Use GSD tools for milestone/slice/task planning artifacts.
- No outward-facing live Paperclip, VPS, Telegram, or GitHub state changes without explicit user confirmation.
- Do not print or store secret values.
- S04 and S05 are gated and must not run until prior slices satisfy proof gates.
- Any live mutation must be bounded, explicitly confirmed, and produce structured evidence.

## Integration Points

- Paperclip VPS — read-only forensics first, later persistence canary only after explicit confirmation.
- Docker Compose — inspect and later safe restart command only after evidence capture and confirmation.
- Paperclip HTTP API — health/readback/preflight, later native marker/E2E artifacts.
- Hermes/Xiaomi — only final gate and only with BOS-shaped result proof.
- GSD-Pi — remain blocked unless registry/testEnvironment/BosAdapterResult proof appears.

## Testing Requirements

Use local artifact and unit validation for S01/S03. Use read-only evidence validation for S02. Use structured runtime evidence for S04/S05. For script changes, add executable tests rather than inline assertions. For live steps, verify both happy path and fail-closed diagnostic surfaces.

## Acceptance Criteria

- S01 source truth map exists and cites evidence.
- S02 VPS forensic evidence package exists and contains a verdict or clear inconclusive state.
- S03 lockfile/preflight/script-hardening changes prevent unconfirmed or stale-target mutation.
- S04 canary proves persistence or writes a precise fail-closed blocker.
- S05 bounded E2E gate requires and verifies terminal BOS-shaped output plus native Paperclip readback.

## Open Questions

- Which company ID is authoritative now? Current thinking: no ID is authoritative until fresh authenticated readback proves it.
- Did Docker or Paperclip data actually wipe? Current thinking: unproven until VPS forensics.
- Should S03 implement a full shared client or minimal preflight wrapper first? Current thinking: minimal wrapper can be acceptable if it blocks unsafe mutation; full shared client may follow.
