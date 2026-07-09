# M002 Research: Runtime Hardening Surfaces

## Scope

M002 owns the deferred requirements for full plugin-state-loss recovery and hardened Paperclip runtime integration.

## Findings

- `plugin-bos-light/src/paperclipAdapter.ts` currently defines the adapter seam and an in-memory test adapter. It explicitly says to replace draft adapter behavior with current Paperclip SDK calls after runtime validation.
- `plugin-bos-light/src/persistence.ts` currently stores BPI/status/betting/gates/circuit/decisions in memory and has only two native-artifact mirroring helpers for gate results and decisions. This is the main M002 hardening target.
- `plugin-bos-light/src/worker.ts` is a draft worker skeleton with TODO-style runtime assumptions around issues, documents/comments, approvals, data providers, actions, events, and state.
- Existing pure logic modules already cover BPI, Blueprint, Betting Table, Eval Gates, and Circuit Breaker contracts; M002 should preserve those and harden adapter/persistence/recovery behavior around them.
- Acceptance tests define A11a-e: config, BPI scores, betting cycle, gate results, and decision records must survive plugin state clearing and plugin restart.
- Risk docs identify unreliable terminal run events and uncertain company-scoped plugin state. M002 should keep polling/activity fallback and native artifact reconstruction as first-class proof surfaces.

## Planning Implication

M002 should be decomposed by recoverable object family and end with a real state-clear/restart-style integration verification. The first slice should lock runtime capabilities and expose an adapter health/capability contract so later recovery work never relies on phantom Paperclip SDK surfaces.
