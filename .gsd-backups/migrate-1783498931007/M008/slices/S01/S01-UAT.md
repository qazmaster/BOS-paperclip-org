# S01: Div7 Delegation and DecisionDelegated Packet — UAT

**Milestone:** M008
**Written:** 2026-06-02T07:57:12.390Z

# UAT: S01 Div7 Delegation

## What changed
Div7.MissionControl can no longer become a terminal handler for technical work. Every strategic decision must be delegated to Div1.HCO via DecisionDelegated packet.

## How to verify
1. Run `npx vitest run plugin-bos-light/tests/div7-delegation.test.ts` - all 21 tests should pass
2. Run `npx vitest run plugin-bos-light/tests/` - all 579 tests should pass
3. Review missionRouter.ts - no `complex_decision` terminal route exists
4. Review decision.ts - delegateDecisionToDiv1() emits packets for non-policy decisions

## Architecture invariant
Div7 decides the regime. Div1 runs the operating system.
