---
estimated_steps: 8
estimated_files: 2
skills_used: []
---

# T02: Evidence Artifact Generation and Verification

Create scripts/verify-s04-e2e-workflow.js that runs the E2E test suite, captures results, and writes runtime-evidence/M010-S04-e2e-workflow.json. Create verification assertions for the evidence artifact schema.

**Why:** S04 must produce a structured evidence artifact following the established pattern (M010-S01/S02/S03) that can be validated by a verification script.

**Steps:**
1. Create scripts/verify-s04-e2e-workflow.js following the pattern from verify-s03-agent-visibility.js
2. The script should: run the E2E test suite via vitest, capture results, and write runtime-evidence/M010-S04-e2e-workflow.json with milestone, slice, per-scenario verdicts, overall_verdict, timestamp
3. Add verification assertions for the evidence artifact schema (required fields, verdict values, timestamp format)
4. Generate the evidence artifact by running the verification script

**Done when:** node scripts/verify-s04-e2e-workflow.js exits 0 and runtime-evidence/M010-S04-e2e-workflow.json has overall_verdict=pass

## Inputs

- `plugin-bos-light/tests/e2eWorkflow.test.ts`
- `scripts/verify-s03-agent-visibility.js`
- `runtime-evidence/M010-S03-agent-integration.json`

## Expected Output

- `scripts/verify-s04-e2e-workflow.js`
- `runtime-evidence/M010-S04-e2e-workflow.json`

## Verification

node scripts/verify-s04-e2e-workflow.js

## Observability Impact

Signals added: evidence artifact schema validation, overall_verdict field. How a future agent inspects this: run node scripts/verify-s04-e2e-workflow.js to validate evidence artifact. Failure state exposed: missing required fields, invalid verdict values, timestamp format errors.
