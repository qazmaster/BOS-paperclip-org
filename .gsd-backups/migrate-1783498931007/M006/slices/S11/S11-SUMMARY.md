---
id: S11
parent: M006
milestone: M006
provides:
  - (none)
requires:
  []
affects:
  []
key_files:
  - agents/Div1_HCO/AGENTS.md
  - agents/Div2_MasterPlanner/AGENTS.md
  - agents/Div3_Treasury/AGENTS.md
  - agents/Div4_Production/AGENTS.md
  - agents/Div5_QualificationsLibraryLearning/AGENTS.md
  - agents/Div6_External/AGENTS.md
  - agents/Div7_MissionControl/AGENTS.md
key_decisions:
  - Used existing skills as source of truth for security invariants
  - Kept content concise and actionable
patterns_established:
  - Division hat profile pattern: Allowed Tools, Forbidden Tools, Runtime Boundary, Security Invariants, Acceptance Checks
observability_surfaces:
  - None - documentation only
drill_down_paths:
  []
duration: ""
verification_result: passed
completed_at: 2026-06-01T12:10:41.506Z
blocker_discovered: false
---

# S11: Hermes Division Profiles

**Enhanced all 7 division AGENTS.md with complete hat profiles: Allowed Tools, Forbidden Tools, Runtime Boundary, Security Invariants, and Acceptance Checks**

## What Happened

S11 completed the hat profile documentation for all 7 BOS Light divisions.

**T01** added 5 new sections to each of the 7 AGENTS.md files:
- Allowed Tools: specific tools/functions each division can use
- Forbidden Tools: tools/functions each division must NOT use
- Runtime Boundary: inbox access, packet emission, network/code boundaries
- Security Invariants: security rules that must always hold
- Acceptance Checks: how to verify the division is working correctly

Content derived from existing skills (SKILL_TREASURY_BUDGET_ACCESS, SKILL_EXTERNAL_IO_GATEWAY, SKILL_KNOWLEDGE_QUARANTINE, SKILL_HCO_ROUTING_CONTROL, SKILL_CIRCUIT_BREAKER_HCO) and existing Guardrails sections.

All 7 divisions now have complete, consistent hat profiles that define their tool boundaries, security rules, and acceptance criteria.

## Verification

All 7 AGENTS.md files have 5/5 required sections.

## Requirements Advanced

None.

## Requirements Validated

None.

## New Requirements Surfaced

None.

## Requirements Invalidated or Re-scoped

None.

## Operational Readiness

None.

## Deviations

None

## Known Limitations

None

## Follow-ups

Milestone M006 can now be validated and completed.

## Files Created/Modified

None.
