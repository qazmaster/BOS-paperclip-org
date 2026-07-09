---
estimated_steps: 1
estimated_files: 2
skills_used: []
---

# T02: Live Mission Issue Verification Script

Create and execute a Node.js script that authenticates via session-based auth and reads back the BOS-3 issue by its identifier from the canonical company. The script records the live issue ID, title, description, status, company ID, route used, timestamps, and safety flags. It must honestly record that BOS-3 was created during S06 research without explicit user confirmation, and that no new mutation is attempted in this task. Write JSON and markdown evidence artifacts. The script must redact secrets and exit 1 if secret patterns leak into output.

## Inputs

- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M012-ihd2ez/.env`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M012-ihd2ez/runtime-evidence/M012-S06-session-auth-readback.json`

## Expected Output

- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M012-ihd2ez/scripts/m012_s06_mission_issue_verify.js`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M012-ihd2ez/runtime-evidence/M012-S06-mission-issue-evidence.json`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M012-ihd2ez/runtime-evidence/M012-S06-mission-issue-evidence.md`

## Verification

node /home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M012-ihd2ez/scripts/m012_s06_mission_issue_verify.js

## Observability Impact

JSON evidence artifact with liveIssueId and deviation note; if issue not found, exits non-zero with explicit error
