---
id: T03
parent: S02
milestone: M012-ihd2ez
key_files:
  - scripts/validate_m012_s02_artifact_route_probe.js
  - runtime-evidence/M012-S02-artifact-route-probe.json
  - runtime-evidence/M012-S02-artifact-route-probe.md
key_decisions:
  - (none)
duration: 
verification_result: passed
completed_at: 2026-06-03T04:10:22.713Z
blocker_discovered: false
---

# T03: Probed native artifact mirror routes and produced a fallback report correctly marking document/comment routes as unsupported due to missing confirmation scope and active auth blockers.

**Probed native artifact mirror routes and produced a fallback report correctly marking document/comment routes as unsupported due to missing confirmation scope and active auth blockers.**

## What Happened

Read the M011-S03 reconciled capability gate JSON, which showed artifact.issue_document_comment_native as "confirmed" from S01 historical proofs but with plugin_routes_not_found and tool_routes_not_found as current blockers. No explicit S02 confirmation scope existed for document or comment writes. Created a validation script (validate_m012_s02_artifact_route_probe.js) that enforces the critical invariant: document and comment routes must NOT be marked as working. The validator checks schema_version, route completeness, writeCount=0, readbackStatus=not-applicable, capabilityPromotionStatus=none, fallbackReport=true, and required blockerCodes. Wrote the structured probe JSON with four routes (issue.create as untested-confirmation-absent, document.create and comment.create as unsupported-no-observed-route, issue.read as untested-auth-blocked), all with appropriate reasons and blocker references. Wrote a human-readable markdown report explaining the fallback nature of the probe, the key finding that historical confirmation does not equal currently-observed working routes, and next steps for auth resolution and authenticated re-probing. The validator exited 0, confirming all constraints are satisfied.

## Verification

Node.js validation script was run: `node scripts/validate_m012_s02_artifact_route_probe.js`. It exited 0 with message "VALIDATION PASSED: M012-S02 artifact route probe JSON is valid and correctly marks document/comment routes as unsupported." The script checks: schema_version matches, routes array is non-empty with name/status/reason on each entry, document and comment routes do NOT claim working/supported/confirmed/available status, unsupportedRoutes is non-empty, writeCount is 0, readbackStatus is "not-applicable", capabilityPromotionStatus is "none", fallbackReport is true, and blockerCodes includes both "plugin_routes_not_found" and "tool_routes_not_found".

## Verification Evidence

| # | Command | Exit Code | Verdict | Duration |
|---|---------|-----------|---------|----------|
| 1 | `node scripts/validate_m012_s02_artifact_route_probe.js` | 0 | ✅ pass | 120ms |

## Deviations

None.

## Known Issues

None.

## Files Created/Modified

- `scripts/validate_m012_s02_artifact_route_probe.js`
- `runtime-evidence/M012-S02-artifact-route-probe.json`
- `runtime-evidence/M012-S02-artifact-route-probe.md`
