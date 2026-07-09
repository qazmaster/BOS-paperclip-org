---
estimated_steps: 1
estimated_files: 1
skills_used: []
---

# T04: Create S04 Python probe runner

Why: Need a bounded live probe that discovers git credentials, checks git binary availability, and validates hybrid persistence behavior, producing a machine-readable evidence artifact. Do: Create `scripts/run_m005_s04_git_hybrid_probe.py` following the exact S01-S03 patterns: HttpClient, redaction, preflight auth gate, evidence schema_version `m005-s04-git-hybrid/v1`. Discover `AIPAY_GIT_URL`, `GIT_SSH_KEY`, `GITHUB_TOKEN`, `GITLAB_TOKEN` from env. Perform git binary check (`git --version`) and bounded `git ls-remote` if URL is present. Smoke-test hybrid persistence via in-memory + simulated adapter. Write evidence to `runtime-evidence/M005-S04-git-hybrid-probe.json`. In the current auth-missing environment, produce a valid fail-closed-blocker artifact with precise blocker codes and zero side effects. Done when: script executes and writes evidence artifact.

## Inputs

- `scripts/run_m005_s03_resource_intake_probe.py`
- `plugin-bos-light/capabilities.paperclip-runtime.json`

## Expected Output

- `scripts/run_m005_s04_git_hybrid_probe.py`
- `runtime-evidence/M005-S04-git-hybrid-probe.json`

## Verification

python3 scripts/run_m005_s04_git_hybrid_probe.py
