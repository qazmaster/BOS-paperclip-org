---
estimated_steps: 1
estimated_files: 1
skills_used: []
---

# T01: Fix agent runtime bugs and verify all 7 division agents operational

Fixed 7 bugs in the agent runtime chain: OPENAI_APi_KEY typo, missing --yolo flag, missing provider:"xiaomi", missing PYTHONPATH, garbage session_id from stderr parsing, recovery action spam (429 cascade), and wrong agent assignments. All 7 division agents confirmed operational on live Paperclip with hermes_local + Xiaomi adapter.

## Inputs

- `docs/BOS_Light_v1_4_1_CANONICAL_ORG.md`

## Expected Output

- `runtime-evidence/M007-agent-chain-debug.json`

## Verification

All 7 agents visible in Paperclip /BOS company, smoke test issues BOS-11 through BOS-16 completed
