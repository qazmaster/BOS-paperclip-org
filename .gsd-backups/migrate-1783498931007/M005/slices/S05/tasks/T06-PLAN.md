---
estimated_steps: 1
estimated_files: 1
skills_used: []
---

# T06: Create S05 Python probe runner

Why: Need a bounded live probe that validates mission intake, HITL gates, branch policy, QA review, Div6 PR/merge, and Circuit Breaker human resolution, producing a machine-readable evidence artifact. Do: Create scripts/run_m005_s05_e2e_governance_probe.py following S01-S04 patterns: HttpClient, redaction, preflight auth gate, evidence schema_version m005-s05-e2e-governance/v1. Discover GITHUB_TOKEN, GIT_SSH_KEY, PAPERCLIP_API_KEY from env. Smoke-test mission intake framing via simulated adapter. Smoke-test branch policy enforcement (simulate direct-main-push block). Smoke-test HITL gate artifact creation via simulated adapter. Smoke-test QA review diff hash + eval gate. Smoke-test Circuit Breaker OPEN incident creation. Smoke-test Div6 PR creation (mock GitHub API if token missing). Write evidence to runtime-evidence/M005-S05-e2e-governance-probe.json. In current auth-missing environment, produce valid fail-closed-blocker artifact with precise blocker codes and zero side effects. Done when: script executes and writes evidence artifact.

## Inputs

- `scripts/run_m005_s04_git_hybrid_probe.py`
- `plugin-bos-light/src/missionIntake.ts`
- `plugin-bos-light/src/hitlGovernance.ts`
- `plugin-bos-light/src/qaReview.ts`
- `plugin-bos-light/src/externalIO.ts`
- `plugin-bos-light/src/circuitBreakerHumanResolution.ts`

## Expected Output

- `scripts/run_m005_s05_e2e_governance_probe.py`
- `runtime-evidence/M005-S05-e2e-governance-probe.json`

## Verification

python3 scripts/run_m005_s05_e2e_governance_probe.py
