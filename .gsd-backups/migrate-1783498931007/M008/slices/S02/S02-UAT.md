# S02: MissionSignals and Deterministic Routing Policy — UAT

**Milestone:** M008
**Written:** 2026-06-02T08:01:31.160Z

# UAT: S02 MissionSignals and Routing Policy

## What changed
Routing policy now uses deterministic MissionSignals for pre-decision routing. Routine missions bypass Div7 entirely. Two-pass flow: pre-decision on signals, post-decision on Cynefin domain.

## How to verify
1. Run `npx vitest run plugin-bos-light/tests/` - all 579 tests should pass
2. Review missionSignals.ts - deterministic keyword scan, no LLM
3. Review missionRouter.ts - uses missionSignals.ts for routing decisions

## Architecture invariant
Routine missions route directly without Div7. Only ambiguous/incident/critical missions require executive decision.
