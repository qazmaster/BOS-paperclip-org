---
estimated_steps: 1
estimated_files: 4
skills_used: []
---

# T02: Execute Confirmed Native Issue Mutation

After the user explicitly confirms the target and bounded mission, execute exactly one supported native issue create or reuse mutation. Immediately read back the issue and write evidence. If confirmation is absent, do not mutate; write a blocker artifact instead. If document or comment routes are not discoverable, record them as unsupported blockers and do not promote artifact.issue_document_comment_native beyond the issue surface.

## Inputs

- `runtime-evidence/M011-S03-reconciled-capability-gate.json`

## Expected Output

- `runtime-evidence/M012-S02-native-mission-issue.json`
- `runtime-evidence/M012-S02-native-mission-issue.md`

## Verification

node scripts/validate_m012_s02_native_mission_issue.js

## Observability Impact

Records explicit confirmation metadata, mutation count, route, live issue ID, readback snapshot, blocker codes, and redaction flags.
