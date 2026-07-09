---
estimated_steps: 27
estimated_files: 1
skills_used: []
---

# T01: Expand bos-route-packet tool routing table in dist/worker.js

## Why

The bos-route-packet tool in dist/worker.js currently has a 5-entry lookup table (intake→Div7, planning→Div2, execution→Div4, review→Div1, external→Div6). This doesn't cover the 12 named routing rules that the real missionRouter.ts engine supports. The tool needs to handle all packet types that map to the full routing rule set so Paperclip agents can route to any division.

## Do

1. Read the current dist/worker.js bos-route-packet handler (lines ~140-165).
2. Expand the routing table to include entries for all packet types that map to the 12 named routing rules:
   - `intake` → Div7.MissionControl (requires_executive_decision)
   - `planning` → Div2.MasterPlanner (backlog_shaping)
   - `budget` → Div3.Treasury (budget_capacity)
   - `execution` → Div4.Production (implementation)
   - `qa_review` → Div5.QualificationsLibraryLearning (qa_security_review)
   - `external_io` → Div5 + Div6 (external_io_request)
   - `paid_external_io` → Div3 + Div5 + Div6 (paid_credentialed_external_io_request)
   - `multi_division` → Div2 + Div4 + Div5 (multi_division_workflow)
   - `complex` → Div2 + Div3 + Div4 + Div5 (complex_safe_to_fail)
   - `chaotic` → Div1 + Div3 + Div5 (chaotic_incident_flow)
   - `complicated` → Div2 + Div4 + Div5 (complicated_expert_review)
   - `standard` → Div2 + Div4 + Div5 (standard_operational)
   - `review` → Div1.HCO (kept for backward compat)
   - `external` → Div6.External (kept for backward compat)
3. Update the return shape to include `routed_to` as an array (to support multi-division routing) while keeping backward compatibility for single-division cases.
4. Add `routing_rule` field to the return object so callers know which named rule was applied.
5. Keep the existing error handling for missing mission_id/packet_type.

## Done-when

- bos-route-packet handler supports all 14 packet_type values
- Return shape includes `routed_to` (array) and `routing_rule` fields
- Existing 10 distWorkerTools.test.ts tests still pass (backward compat)
- New tests in T02 verify all routing paths

## Inputs

- `plugin-bos-light/dist/worker.js`
- `plugin-bos-light/tests/distWorkerTools.test.ts`
- `plugin-bos-light/src/missionRouter.ts`

## Expected Output

- `plugin-bos-light/dist/worker.js`

## Verification

cd plugin-bos-light && npx vitest run tests/distWorkerTools.test.ts

## Observability Impact

The routing_rule field in the bos-route-packet response enables callers to inspect which named rule was applied for any given packet type.
