---
estimated_steps: 1
estimated_files: 1
skills_used: []
---

# T03: Create executive report generator

Why: No ExecutiveReport type or generator exists in the codebase. Div7.MissionControl must produce a final executive report for the Human Owner at mission closure. Do: Create executiveReport.ts with ExecutiveReport type and generateExecutiveReport(mission, packets, gates) function. Report must contain mission_summary, division_activity, verdict, and recommendations. Provide a toMarkdown fallback renderer. Done when: report generator produces structured output with all required sections.

## Inputs

- `plugin-bos-light/src/contracts.ts`
- `plugin-bos-light/src/missionIntake.ts`

## Expected Output

- `plugin-bos-light/src/executiveReport.ts`

## Verification

cd plugin-bos-light && npx tsc --noEmit
