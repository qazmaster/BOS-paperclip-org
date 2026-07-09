---
estimated_steps: 1
estimated_files: 2
skills_used: []
---

# T06: Run probe, validate evidence, update capability matrix, and generate summary

Why: Slice closeout requires validated evidence, append-only capability matrix update, and cumulative evidence summary per MEM058. Do: Run the S04 probe to produce `runtime-evidence/M005-S04-git-hybrid-probe.json`. Validate it with `python3 scripts/validate_m005_s04_git_hybrid_probe.py --evidence runtime-evidence/M005-S04-git-hybrid-probe.json --allow-blocker` (expect exit 0). Update `plugin-bos-light/capabilities.paperclip-runtime.json` append-only: add `git.local_cli` and `state.hybrid_persistence` rows with status `fallback-only`, evidence_source referencing M005-S04 probe, and blocker_text describing the auth-missing environment. Preserve all existing S01-S03 rows unchanged. Generate `runtime-evidence/M005-S04-evidence-summary.json` combining S01+S02+S03+S04 results with posture, guardrails, confirmed surfaces, fallback-only surfaces, and MEM058 compliance flag. Done when: capability matrix validation passes.

## Inputs

- `plugin-bos-light/capabilities.paperclip-runtime.json`
- `runtime-evidence/M005-S04-git-hybrid-probe.json`
- `scripts/validate_m005_s04_git_hybrid_probe.py`

## Expected Output

- `runtime-evidence/M005-S04-evidence-summary.json`
- `plugin-bos-light/capabilities.paperclip-runtime.json`

## Verification

python3 scripts/validate_runtime_capabilities.py
