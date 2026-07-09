# S01: Agent Runtime Chain Debug

**Goal:** Debug and fix the Paperclip agent runtime chain for all 7 BOS Light division agents
**Demo:** All 7 division agents operational on live Paperclip

## Must-Haves

- Complete the planned slice outcomes.

## Verification

- Run the task and slice verification checks for this slice.

## Tasks

- [x] **T01: Fix agent runtime bugs and verify all 7 division agents operational** `est:1d`
  Fixed 7 bugs in the agent runtime chain: OPENAI_APi_KEY typo, missing --yolo flag, missing provider:"xiaomi", missing PYTHONPATH, garbage session_id from stderr parsing, recovery action spam (429 cascade), and wrong agent assignments. All 7 division agents confirmed operational on live Paperclip with hermes_local + Xiaomi adapter.
  - Files: `docker-compose.sandbox-override.yml`
  - Verify: All 7 agents visible in Paperclip /BOS company, smoke test issues BOS-11 through BOS-16 completed

## Files Likely Touched

- docker-compose.sandbox-override.yml
