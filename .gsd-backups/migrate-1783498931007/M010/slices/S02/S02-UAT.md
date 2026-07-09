# S02: Division Routing Configuration — UAT

**Milestone:** M010
**Written:** 2026-06-02T19:18:30.637Z

# UAT: Division Routing Configuration (S02)

## Preconditions
- Plugin-bos-light is loaded with the updated dist/worker.js
- bos-route-packet tool is callable

## Steps

### Step 1: Verify single-division routing
Call bos-route-packet with each single-division packet type:
- packet_type: "intake" → expect routed_to: ["Div1.HCO"]
- packet_type: "planning" → expect routed_to: ["Div2.MasterPlanner"]
- packet_type: "budget" → expect routed_to: ["Div3.Treasury"]
- packet_type: "execution" → expect routed_to: ["Div4.Production"]
- packet_type: "qa_review" → expect routed_to: ["Div5.QualificationsLibraryLearning"]
- packet_type: "review" → expect routed_to: ["Div5.QualificationsLibraryLearning"]
- packet_type: "external" → expect routed_to: ["Div6.External"]

**Expected:** Each returns a single-element array with the correct division and a routing_rule string.

### Step 2: Verify multi-division routing
Call bos-route-packet with each multi-division packet type:
- packet_type: "external_io" → expect routed_to: ["Div6.External", "Div5.QualificationsLibraryLearning"]
- packet_type: "paid_external_io" → expect routed_to: ["Div6.External", "Div3.Treasury", "Div5.QualificationsLibraryLearning"]
- packet_type: "multi_division" → expect routed_to: ["Div1.HCO", "Div7.MissionControl"]
- packet_type: "complex" → expect routed_to: ["Div7.MissionControl", "Div1.HCO"]
- packet_type: "chaotic" → expect routed_to: ["Div7.MissionControl"]
- packet_type: "complicated" → expect routed_to: ["Div2.MasterPlanner", "Div5.QualificationsLibraryLearning"]
- packet_type: "standard" → expect routed_to: ["Div1.HCO"]

**Expected:** Each returns a multi-element array with correct divisions and routing_rule.

### Step 3: Verify unknown packet type fallback
Call bos-route-packet with packet_type: "unknown_type_xyz"

**Expected:** routed_to: ["Div7.MissionControl"], routing_rule: "unknown_fallback"

### Step 4: Verify observability fields
For any valid call, check:
- routed_at is a valid ISO timestamp
- routing_rule is a non-empty string matching a named rule from missionRouter.ts

**Expected:** Both fields present and valid.

### Step 5: Verify cross-validation
Run: `node scripts/verify-t03-slice-evidence.js`

**Expected:** Exit code 0, all 12 named routing rules tested, all verdicts pass, dist_vs_src_match=true.

## Edge Cases
- Unknown packet_type falls back to Div7.MissionControl
- Empty/null/undefined payload handled gracefully (no crash)
- Backward-compatible packet types (review, external) still work alongside new types (qa_review, external_io)

## UAT Type
Contract verification — proves the bos-route-packet routing table covers all 14 packet types and 12 named routing rules with cross-validation against missionRouter.ts.
