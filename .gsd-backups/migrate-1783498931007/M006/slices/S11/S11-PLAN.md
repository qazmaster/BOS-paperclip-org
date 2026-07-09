# S11: Hermes Division Profiles

**Goal:** Enhance all 7 division AGENTS.md with complete hat profiles: Allowed Tools, Forbidden Tools, Runtime Boundary, Security Invariants, and Acceptance Checks.
**Demo:** After this: All 7 division AGENTS.md contain complete hat profiles with Allowed Tools, Forbidden Tools, Runtime Boundary, Security Invariants, and Acceptance Checks. A single Hermes adapter config backs all seven logical divisions. Execution evidence proves one substrate path.

## Must-Haves

- All 7 AGENTS.md have Allowed Tools, Forbidden Tools, Runtime Boundary, Security Invariants, and Acceptance Checks sections\n- Content is consistent with existing skills and guardrails\n- Each division has clear tool boundaries and security rules

## Proof Level

- This slice proves: documentation

## Integration Closure

S11 completes the hat profile documentation for all 7 divisions. This is a documentation-only slice that doesn't change runtime behavior.

## Verification

- None - documentation only

## Tasks

- [x] **T01: Enhance all 7 division AGENTS.md with complete hat profiles** `est:1h`
  Add the following sections to each of the 7 division AGENTS.md files:
  - Files: `agents/Div1_HCO/AGENTS.md`, `agents/Div2_MasterPlanner/AGENTS.md`, `agents/Div3_Treasury/AGENTS.md`, `agents/Div4_Production/AGENTS.md`, `agents/Div5_QualificationsLibraryLearning/AGENTS.md`, `agents/Div6_External/AGENTS.md`, `agents/Div7_MissionControl/AGENTS.md`
  - Verify: ls agents/*/AGENTS.md && grep -l 'Allowed Tools' agents/*/AGENTS.md | wc -l

## Files Likely Touched

- agents/Div1_HCO/AGENTS.md
- agents/Div2_MasterPlanner/AGENTS.md
- agents/Div3_Treasury/AGENTS.md
- agents/Div4_Production/AGENTS.md
- agents/Div5_QualificationsLibraryLearning/AGENTS.md
- agents/Div6_External/AGENTS.md
- agents/Div7_MissionControl/AGENTS.md
