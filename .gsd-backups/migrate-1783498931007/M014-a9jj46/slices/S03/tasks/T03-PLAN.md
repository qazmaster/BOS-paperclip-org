---
estimated_steps: 1
estimated_files: 4
skills_used: []
---

# T03: Guard mutation capable scripts

Update known mutation-capable scripts so they call the preflight contract before live POST, PUT, PATCH, or DELETE. Remove silent hardcoded company defaults from mutation paths or move known IDs into explicit stale/disposable rejection lists. Preserve dry-run behavior and existing evidence output shape where possible.

## Inputs

- `scripts/lib/paperclip-preflight.js`
- `paperclip-runtime.lock.json`
- `scripts/create_bos_v141_agents.py`
- `scripts/m013_s02_create_tech_debt_issue.js`
- `scripts/run_m005_s01_hermes_xiaomi_probe.py`
- `scripts/run_s04_live_artifact_flow.py`

## Expected Output

- `scripts/create_bos_v141_agents.py`
- `scripts/m013_s02_create_tech_debt_issue.js`
- `scripts/run_m005_s01_hermes_xiaomi_probe.py`
- `scripts/run_s04_live_artifact_flow.py`

## Verification

node --test scripts/test_paperclip_preflight.js

## Observability Impact

Mutation scripts now expose blocker reasons before external side effects occur.
