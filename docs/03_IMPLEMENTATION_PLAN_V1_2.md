# 03 - Implementation Plan v1.2

## Status

This is the implementation baseline.

- 3 weeks = demonstrable vertical slice.
- 5-6 weeks = runnable MVP with tests, fallback persistence and usable UX.
- Not production-ready until Paperclip runtime behavior is validated.

## MVP Definition of Done

BOS Light MVP is ready when:

1. A company template with 7 division agents can be imported.
2. Every agent has AGENTS.md / hat-profile / VFP / guardrails.
3. An issue receives `bpi_score` and `producer_division`.
4. `piko:blueprint-gen` creates a 5-section issue document.
5. Betting Table shows a batch of candidate issues.
6. Approve action does not approve inside the plugin; it creates a Paperclip-native approval/request.
7. At least 3 Eval Gates write results to issue/comment/document.
8. Circuit Breaker works through polling fallback if events do not arrive.
9. All BOS data has selected storage, fallback and migration path.

## Phase 0 - Positioning, 2 days

Goal: get conceptual alignment with Paperclip maintainers or internal stakeholders.

Pitch:

> BOS Light is a company template + thin plugin for Paperclip: 7-agent org template, BPI prioritization, batch approval dashboard, lightweight gates.

Avoid words:

- kernel;
- runtime;
- event sourcing;
- policy engine;
- state machine.

Output:

- short maintainer/community pitch;
- validated conceptual direction;
- list of current Paperclip SDK/runtime constraints.

## Phase 1 - Company Template, 1 week

Independent of plugin runtime.

Build:

- 7 AGENTS.md files with hat profiles, VFP and guardrails;
- org chart;
- reporting lines;
- task routing rules;
- rituals: daily pulse, weekly review, batch approval ritual.

Acceptance:

- A1 passes.

## Phase 2 - State Spike + Minimal Plugin, 1-2 weeks

Day 1 spike:

- validate company-scoped state;
- validate issue-scoped state;
- validate config JSON fallback;
- validate native issue document/comment creation;
- validate native approval/request creation.

Build:

- `piko:bpi-score`;
- `piko:blueprint-gen`;
- Betting Table widget;
- native approval/request action.

Acceptance:

- A2, A3, A4, A5 pass.

## Phase 3 - Safety Loop, 1 week

Build:

- Circuit Breaker: Closed / Half-Open / Open;
- polling fallback for run status/activity log;
- Eval Gates: Deterministic, SecurityPolicy, ArtifactIntegrity, Budget;
- gate results into issue document/comment.

Acceptance:

- A6, A7, A8, A9, A10 pass.

## Phase 4 - Div7 Decision Protocol, 1-2 weeks after usage traces

Build only after real traces exist.

Build:

- `piko:decide`;
- Cynefin classification;
- OODA recommendation;
- decision records in issue comments/documents.

Acceptance:

- decision visible in issue history;
- decision protocol is not bureaucracy; it is used for incidents, budget escalations, strategic choices and self-healing triggers.
