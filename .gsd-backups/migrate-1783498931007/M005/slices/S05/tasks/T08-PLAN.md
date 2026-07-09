---
estimated_steps: 1
estimated_files: 5
skills_used: []
---

# T08: Run probe, validate evidence, update capability matrix, and generate summary

Why: Slice closeout requires validated evidence, append-only capability matrix update, and cumulative evidence summary per MEM058. Do: Run the S05 probe to produce runtime-evidence/M005-S05-e2e-governance-probe.json. Validate it with python3 scripts/validate_m005_s05_e2e_governance_probe.py --evidence runtime-evidence/M005-S05-e2e-governance-probe.json --allow-blocker (expect exit 0). Update plugin-bos-light/capabilities.paperclip-runtime.json append-only: add workflow.mission_intake, workflow.hitl_gates, workflow.branch_policy, workflow.qa_review, workflow.pr_merge, runtime.circuit_breaker_human_resolution rows with status fallback-only, evidence_source referencing M005-S05 probe, and blocker_text describing the auth-missing environment. Preserve all existing S01-S04 rows unchanged. Update plugin-bos-light/src/runtimeCapabilities.ts to include new keys. Update docs/08_RUNTIME_CAPABILITY_HEALTH.md to add new rows. Generate runtime-evidence/M005-S05-evidence-summary.json combining S01+S02+S03+S04+S05 results with posture, guardrails, confirmed surfaces, fallback-only surfaces, and MEM058 compliance flag. Done when: capability matrix validation passes.

## Inputs

- `runtime-evidence/M005-S05-e2e-governance-probe.json`
- `plugin-bos-light/capabilities.paperclip-runtime.json`
- `plugin-bos-light/src/runtimeCapabilities.ts`
- `docs/08_RUNTIME_CAPABILITY_HEALTH.md`

## Expected Output

- `runtime-evidence/M005-S05-evidence-summary.json`
- `runtime-evidence/M005-S05-validator-closeout.json`

## Verification

python3 scripts/validate_runtime_capabilities.py
