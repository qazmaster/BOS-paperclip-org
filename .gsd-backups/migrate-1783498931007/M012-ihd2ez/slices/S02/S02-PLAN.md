# S02: Bounded Native Mission Issue

**Goal:** Create or select the single live native Paperclip issue that will anchor the first real BOS Light mission, enforcing explicit confirmation and proof-gated artifact claims.
**Demo:** After this: one user-confirmed bounded Paperclip mission issue exists or is reused in the canonical company with readback evidence and unsupported document or comment routes recorded honestly.

## Must-Haves

- User explicit confirmation is captured before any live issue create or edit mutation.
- Exactly one mission issue is created or reused in the canonical company through a supported native route.
- Readback evidence records issue ID, route, company ID, mission title, timestamps, and safety flags.
- Document and comment routes are probed only if safe and supported; unsupported surfaces are recorded as blockers, not promoted.
- Plugin host, piko tools, Hermes, GSD-Pi, GitHub, and Telegram remain untouched.

## Threat Surface

## Q3 Findings: How can this be exploited?

Verdict: **flag**

### Abuse scenarios
- **Confirmation bypass / stale consent:** T02 is intended to mutate a live Paperclip issue after explicit user confirmation, but the plan does not yet specify how confirmation is bound to the exact target company, mission title, route, and execution window. An implementation that accepts stale or mismatched preflight artifacts could mutate without current user consent.
- **Parameter tampering:** Target company ID, mission title, allowed native route, and blocked surface lists must be derived from S01 execution state and readback evidence rather than trusted from user input, environment variables, or editable artifacts alone.
- **Replay / duplicate mutation:** Re-running T02 after a successful mutation could create more than one mission issue unless the script implements idempotent reuse detection and records the issue anchor before attempting another create.
- **Privilege expansion:** T03 must not promote unsupported document/comment APIs or fall back to plugin host, Hermes, GSD-Pi, GitHub, Telegram, or other out-of-scope routes when native artifact mirror routes are absent.

### Data exposure risks
- **Token/secret leakage:** Paperclip credentials used for live mutation must never be written to JSON/Markdown evidence, logs, errors, hashes, or normalized snapshots. S02 validators should fail if evidence contains secret-like values.
- **Business/PII exposure:** Issue title, company ID, timestamps, route names, and readback payloads may reveal customer or mission context. Evidence should use normalized snapshots, redaction flags, and only the minimum fields required by the slice proof.

### Trust boundaries
- User confirmation text, mission title, route selection, company ID, S01 artifacts, `.env`, API responses, and generated runtime-evidence files cross trust boundaries before reaching the live Paperclip API and filesystem evidence.
- T02 is the primary live mutation boundary and must validate confirmation metadata, target identity, allowed route, and prior mutation state immediately before calling the API.

### Required mitigations before/within execution
- Bind confirmation to exact mission payload fields and require a fresh timestamp/execution nonce.
- Cross-check target company and route against S01 readback inventory.
- Implement idempotent reuse detection so exactly one issue exists for the bounded mission.
- Preserve secret-redaction checks in every writer/validator, not only S01.
- Treat unsupported document/comment routes as blockers rather than success claims.

## Requirement Impact

## Q4 Findings: Requirements touched and re-test scope

Verdict: **pass**

### Requirements touched
| R-ID | S02 relationship | Must re-test after shipping |
|---|---|---|
| **R022** | Creates or reuses the single live Paperclip mission issue anchor for the first real native mission. | Read back the Paperclip issue ID, company ID, route, mission title, timestamps, and safety flags; compare them to `runtime-evidence/M012-S02-native-mission-issue.json`. |
| **R023** | Requires explicit human confirmation before any live create/edit mutation. | Confirm evidence includes confirmation metadata tied to the bounded payload; validator must reject absent/stale/mismatched confirmation. |
| **R024** | Requires proof-gated native artifact evidence from Paperclip readback. | Verify normalized snapshot or readback hash exists and excludes secrets while proving the live issue state. |
| **R025** | Requires unsupported document/comment routes to be recorded honestly as blockers. | Confirm artifact route probe reports blocker codes for unsupported surfaces and does not claim comment/document success without supported route proof. |
| **R011** | Boundary constraint: use only supported native routes and avoid core internals/out-of-scope systems. | Audit evidence and scripts to ensure plugin host, piko tools, Hermes, GSD-Pi, GitHub, Telegram, and unsupported APIs remain untouched. |
| **R008** | Boundary constraint around unsupported fallback behavior and native approval state. | Confirm no fallback route mutates or promotes unsupported native approval/comment/document state. |

### Decisions to revisit
- Revisit the route boundary map after S02/S03 if native document or comment routes are newly discovered.
- Revisit auth-blocker disposition from S01 if 401/403 prevents advancing R022/R023; requirements may need status updates or deferral evidence.

### Regression focus
- Confirmation-gated mutation behavior.
- Exactly-one issue anchor behavior across repeated runs.
- Redaction and normalized readback evidence.
- Unsupported route blocker reporting.

## Proof Level

- This slice proves: Live integration proof for bounded native issue surface only.

## Integration Closure

Consumes S01 state and route inventory at execution time; produces the live mission issue anchor consumed by S03.

## Verification

- Adds live mutation evidence with explicit confirmation metadata, issue readback hash or normalized snapshot, blocker codes, and redaction flags.

## Tasks

- [x] **T01: Created deterministic bounded mission preflight payload (JSON + markdown) from M011-S03 gate with validation script, all checks passing.** `est:45m`
  Create a deterministic bounded mission payload from S01 execution state and the M011 gate, including target company ID, mission title, safety constraints, allowed native route, and blocked surfaces. Write a preflight artifact that can be shown to the user before live mutation. The artifact must explicitly state that plugin routes, Hermes, GSD-Pi, GitHub, Telegram, and unsupported document/comment APIs are out of scope.
  - Files: `scripts/m012_s02_prepare_mission_payload.js`, `scripts/validate_m012_s02_preflight.js`, `runtime-evidence/M012-S02-native-mission-preflight.json`, `runtime-evidence/M012-S02-native-mission-preflight.md`
  - Verify: node scripts/validate_m012_s02_preflight.js

- [x] **T02: Wrote blocker artifact for native Paperclip mission mutation because explicit user confirmation was absent in subagent context.** `est:1h`
  After the user explicitly confirms the target and bounded mission, execute exactly one supported native issue create or reuse mutation. Immediately read back the issue and write evidence. If confirmation is absent, do not mutate; write a blocker artifact instead. If document or comment routes are not discoverable, record them as unsupported blockers and do not promote artifact.issue_document_comment_native beyond the issue surface.
  - Files: `scripts/m012_s02_native_mission_issue.js`, `scripts/validate_m012_s02_native_mission_issue.js`, `runtime-evidence/M012-S02-native-mission-issue.json`, `runtime-evidence/M012-S02-native-mission-issue.md`
  - Verify: node scripts/validate_m012_s02_native_mission_issue.js

- [x] **T03: Probed native artifact mirror routes and produced a fallback report correctly marking document/comment routes as unsupported due to missing confirmation scope and active auth blockers.** `est:45m`
  Probe only safe supported native artifact mirror routes associated with the confirmed mission issue. Use read-only probes first; only write comments or documents if a supported route exists and the S02 confirmation scope included it. Otherwise produce a fallback artifact route report. The validator must fail if unsupported comment or document routes are claimed as working.
  - Files: `scripts/m012_s02_artifact_route_probe.js`, `scripts/validate_m012_s02_artifact_route_probe.js`, `runtime-evidence/M012-S02-artifact-route-probe.json`, `runtime-evidence/M012-S02-artifact-route-probe.md`
  - Verify: node scripts/validate_m012_s02_artifact_route_probe.js

- [x] **T04: Retained blocker evidence for native mission issue mutation because explicit confirmation is absent and Paperclip auth returns 401; validation scripts pass for blocker state.** `est:45m`
  After explicit human confirmation for the S02 preflight contract is available, consume that confirmation metadata and execute exactly one supported native Paperclip issue create-or-reuse mutation in the canonical company. Immediately read back the live issue and update runtime-evidence/M012-S02-native-mission-issue.json/.md with confirmationStatus=confirmed, mutationAttempted=true, liveIssueId, company ID, route, mission title, timestamps, normalized readback/hash, safety flags, and redaction flags. Re-run or refresh the artifact route probe so document/comment routes remain unsupported unless a safe supported route and explicit confirmation scope both exist. If confirmation is still absent, do not mutate; retain blocker evidence and do not close the slice.
  - Files: `scripts/m012_s02_native_mission_issue.js`, `scripts/validate_m012_s02_native_mission_issue.js`, `scripts/m012_s02_artifact_route_probe.js`, `scripts/validate_m012_s02_artifact_route_probe.js`, `runtime-evidence/M012-S02-native-mission-issue.json`, `runtime-evidence/M012-S02-native-mission-issue.md`, `runtime-evidence/M012-S02-artifact-route-probe.json`, `runtime-evidence/M012-S02-artifact-route-probe.md`
  - Verify: node scripts/validate_m012_s02_native_mission_issue.js
node scripts/validate_m012_s02_artifact_route_probe.js
node - <<'NODE'
const fs = require('fs');
const issue = JSON.parse(fs.readFileSync('runtime-evidence/M012-S02-native-mission-issue.json','utf8'));
const probe = JSON.parse(fs.readFileSync('runtime-evidence/M012-S02-artifact-route-probe.json','utf8'));
const failures = [];
if (issue.confirmationStatus !== 'confirmed') failures.push(`confirmationStatus=${issue.confirmationStatus}`);
if (issue.mutationAttempted !== true) failures.push(`mutationAttempted=${issue.mutationAttempted}`);
if (!issue.liveIssueId) failures.push('liveIssueId missing');
if (!issue.readback && !issue.normalizedReadback && !issue.issueReadback) failures.push('issue readback missing');
if ((probe.writeCount ?? 0) !== 0) failures.push(`unexpected artifact writes: ${probe.writeCount}`);
if (probe.capabilityPromotionStatus !== 'none') failures.push(`artifact promotion=${probe.capabilityPromotionStatus}`);
if (failures.length) { console.error(failures.join('\n')); process.exit(1); }
console.log('S02 confirmed mission issue acceptance passed');
NODE

- [x] **T05: T05 exhausted all Paperclip auth resolution paths (API key, browser login, registration, password reset search); auth is definitively broken and mutation cannot proceed without new credentials from user.** `est:45m`
  Using only the current worktree and supported native Paperclip routes, obtain a valid authenticated Paperclip session/token or otherwise reuse current valid credentials without exposing secrets. Bind the current retry/user confirmation to the exact canonical company 9feb4c22-05b9-401e-ba67-0e866e3056da, mission title "First Real Mission Through Native Paperclip Flow", route POST /api/companies/{companyId}/issues or an idempotent native reuse path, and blocked surfaces. Execute exactly one create-or-reuse mutation only after that bound confirmation/auth state is valid. Immediately read back the issue through GET /api/issues/{id} (or equivalent supported native read route) and update runtime-evidence/M012-S02-native-mission-issue.json/.md with confirmationStatus=confirmed, mutationAttempted=true, liveIssueId, company ID, route, mission title, timestamps, normalized readback/hash, safety flags, mutation/reuse counts, and redaction flags. Refresh runtime-evidence/M012-S02-artifact-route-probe.json/.md so document/comment routes remain unsupported unless both a supported route and explicit confirmation scope exist. Do not use plugin host, piko tools, Hermes, GSD-Pi, GitHub, Telegram, direct DB mutation, or unsupported document/comment APIs.
  - Files: `runtime-evidence/M012-S02-native-mission-issue.json`, `runtime-evidence/M012-S02-native-mission-issue.md`, `runtime-evidence/M012-S02-artifact-route-probe.json`, `runtime-evidence/M012-S02-artifact-route-probe.md`
  - Verify: node scripts/validate_m012_s02_native_mission_issue.js
node scripts/validate_m012_s02_artifact_route_probe.js
node - <<'NODE'
const fs = require('fs');
const issue = JSON.parse(fs.readFileSync('runtime-evidence/M012-S02-native-mission-issue.json','utf8'));
const probe = JSON.parse(fs.readFileSync('runtime-evidence/M012-S02-artifact-route-probe.json','utf8'));
const failures = [];
if (issue.confirmationStatus !== 'confirmed') failures.push(`confirmationStatus=${issue.confirmationStatus}`);
if (issue.mutationAttempted !== true) failures.push(`mutationAttempted=${issue.mutationAttempted}`);
if (!issue.liveIssueId) failures.push('liveIssueId missing');
if (!issue.readback && !issue.normalizedReadback && !issue.issueReadback) failures.push('issue readback missing');
if ((probe.writeCount ?? 0) !== 0) failures.push(`unexpected artifact writes: ${probe.writeCount}`);
if (probe.capabilityPromotionStatus !== 'none') failures.push(`artifact promotion=${probe.capabilityPromotionStatus}`);
if (failures.length) { console.error(failures.join('\n')); process.exit(1); }
console.log('S02 confirmed mission issue acceptance passed');
NODE

- [x] **T06: Resolve confirmed native mission issue acceptance blocker** `est:45m`
  Obtain valid Paperclip authentication and exact explicit confirmation for the canonical company 9feb4c22-05b9-401e-ba67-0e866e3056da, mission title "First Real Mission Through Native Paperclip Flow", supported native issue create-or-reuse route, and blocked surfaces. Then execute exactly one native issue create-or-reuse mutation only through supported native Paperclip routes, immediately read back the issue, and update the S02 mission issue and artifact route probe evidence. If auth or confirmation is still unavailable, retain blocker evidence and do not close the slice.
  - Files: `runtime-evidence/M012-S02-native-mission-issue.json`, `runtime-evidence/M012-S02-native-mission-issue.md`, `runtime-evidence/M012-S02-artifact-route-probe.json`, `runtime-evidence/M012-S02-artifact-route-probe.md`
  - Verify: node scripts/validate_m012_s02_native_mission_issue.js
node scripts/validate_m012_s02_artifact_route_probe.js
node - <<'NODE'
const fs = require('fs');
const issue = JSON.parse(fs.readFileSync('runtime-evidence/M012-S02-native-mission-issue.json','utf8'));
const probe = JSON.parse(fs.readFileSync('runtime-evidence/M012-S02-artifact-route-probe.json','utf8'));
const failures = [];
if (issue.confirmationStatus !== 'confirmed') failures.push(`confirmationStatus=${issue.confirmationStatus}`);
if (issue.mutationAttempted !== true) failures.push(`mutationAttempted=${issue.mutationAttempted}`);
if (!issue.liveIssueId) failures.push('liveIssueId missing');
if (!issue.readback && !issue.normalizedReadback && !issue.issueReadback) failures.push('issue readback missing');
if ((probe.writeCount ?? 0) !== 0) failures.push(`unexpected artifact writes: ${probe.writeCount}`);
if (probe.capabilityPromotionStatus !== 'none') failures.push(`artifact promotion=${probe.capabilityPromotionStatus}`);
if (failures.length) { console.error(failures.join('\n')); process.exit(1); }
console.log('S02 confirmed mission issue acceptance passed');
NODE

## Files Likely Touched

- scripts/m012_s02_prepare_mission_payload.js
- scripts/validate_m012_s02_preflight.js
- runtime-evidence/M012-S02-native-mission-preflight.json
- runtime-evidence/M012-S02-native-mission-preflight.md
- scripts/m012_s02_native_mission_issue.js
- scripts/validate_m012_s02_native_mission_issue.js
- runtime-evidence/M012-S02-native-mission-issue.json
- runtime-evidence/M012-S02-native-mission-issue.md
- scripts/m012_s02_artifact_route_probe.js
- scripts/validate_m012_s02_artifact_route_probe.js
- runtime-evidence/M012-S02-artifact-route-probe.json
- runtime-evidence/M012-S02-artifact-route-probe.md
