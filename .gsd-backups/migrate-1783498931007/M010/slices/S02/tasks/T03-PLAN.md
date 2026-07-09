---
estimated_steps: 34
estimated_files: 3
skills_used: []
---

# T03: Create routing evidence artifact and verification script

## Why

S01 produced runtime-evidence/M010-S01-plugin-tool-test.json as auditable proof. S02 needs a corresponding evidence artifact (runtime-evidence/M010-S02-routing-config.json) that proves all routing paths work and can be validated by automated scripts.

## Do

1. Create a verification script scripts/verify-t02-routing-evidence.js that:
   - Runs the routing integration test suite and captures results
   - Generates runtime-evidence/M010-S02-routing-config.json with schema:
     ```json
     {
       "milestone": "M010",
       "slice": "S02",
       "routing_rules_tested": 12,
       "packet_types_tested": 14,
       "rule_results": [
         { "rule": "requires_executive_decision", "verdict": "pass", "target_divisions": ["Div7.MissionControl"] },
         ...
       ],
       "cross_validation": { "dist_vs_src_match": true, "mismatches": [] },
       "overall_verdict": "pass",
       "timestamp": "ISO"
     }
     ```
   - Validates the evidence artifact schema
2. Create scripts/verify-t03-slice-evidence.js that:
   - Reads runtime-evidence/M010-S02-routing-config.json
   - Asserts routing_rules_tested === 12
   - Asserts all rule_results have verdict === "pass"
   - Asserts cross_validation.dist_vs_src_match === true
   - Asserts overall_verdict === "pass"
3. Both verification scripts must pass.

## Done-when

- runtime-evidence/M010-S02-routing-config.json exists with correct schema
- scripts/verify-t02-routing-evidence.js generates the evidence and exits 0
- scripts/verify-t03-slice-evidence.js validates the evidence and exits 0
- All 12 routing rules have verdict pass in the evidence

## Inputs

- `plugin-bos-light/dist/worker.js`
- `plugin-bos-light/tests/routingIntegration.test.ts`
- `runtime-evidence/M010-S01-plugin-tool-test.json`
- `scripts/verify-t03-evidence.js`

## Expected Output

- `runtime-evidence/M010-S02-routing-config.json`
- `scripts/verify-t02-routing-evidence.js`
- `scripts/verify-t03-slice-evidence.js`

## Verification

node scripts/verify-t03-slice-evidence.js
