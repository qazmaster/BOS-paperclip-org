---
estimated_steps: 20
estimated_files: 2
skills_used: []
---

# T05: Verify agent visibility and produce evidence artifact

## Why
The research identified 7 v1.4.1 agents created in Paperclip (from runtime-evidence/bos-v141-agent-creation.json). S03 must independently verify all 7 agents are still visible with correct metadata. This task creates a verification script and evidence artifact.

## Do
1. Create scripts/verify-s03-agent-visibility.js that:
   a. Reads runtime-evidence/bos-v141-agent-creation.json for expected agent IDs
   b. Validates all 7 agents are present in the readback section
   c. Validates v141_agents_missing is empty and all_v141_present is true
   d. Validates agent metadata includes bosLightDivisionId, bosLightTitle, v1.4.1=true
   e. Outputs a structured JSON result with per-agent status
2. Create runtime-evidence/M010-S03-agent-integration.json with:
   - milestone: M010, slice: S03
   - agent_visibility: per-agent status (division, agent_id, present, metadata_correct)
   - tool_enforcement: summary of grant policy enforcement (from T02 tests)
   - hook_integration: summary of hook manager wiring (from T04 tests)
   - overall_verdict: pass/fail
3. Run the verification script and confirm exit 0.

## Done-when
- Verification script confirms all 7 agents visible
- Evidence artifact created with correct schema
- Script exits 0

## Inputs

- `runtime-evidence/bos-v141-agent-creation.json`
- `plugin-bos-light/tests/agentIntegration.test.ts`

## Expected Output

- `scripts/verify-s03-agent-visibility.js`
- `runtime-evidence/M010-S03-agent-integration.json`

## Verification

node scripts/verify-s03-agent-visibility.js

## Observability Impact

Evidence artifact records per-agent visibility status and integration test results for downstream validation.
