---
estimated_steps: 1
estimated_files: 2
skills_used: []
---

# T05: Create S04 Python validator and test fixtures

Why: Machine-readable closeout requires a validator and comprehensive fixture coverage for all S04 artifact types. Do: Create `scripts/validate_m005_s04_git_hybrid_probe.py` with schema_version enforcement (`m005-s04-git-hybrid/v1`), redaction checks, no_core_modification validation, blocker acceptance (`--allow-blocker`), and zero capability-promotion rejection. Create `scripts/test_validate_m005_s04_git_hybrid_probe.py` with 12 fixtures: (1) passing git+hybrid proof, (2) passing reconstruction proof, (3) fail-closed blocker missing auth, (4) fail-closed blocker missing git binary, (5) fail-closed blocker missing git URL, (6) fail-closed blocker unsupported endpoint, (7) partial hybrid mirror failure, (8) unredacted secrets in diagnostics, (9) malformed timestamp, (10) unsupported paths used, (11) capability promotion in blocker artifact, (12) CLI write-audit closeout. Done when: all 12 fixtures pass.

## Inputs

- `scripts/validate_m005_s03_resource_intake_probe.py`
- `scripts/test_validate_m005_s03_resource_intake_probe.py`
- `scripts/run_m005_s04_git_hybrid_probe.py`

## Expected Output

- `scripts/validate_m005_s04_git_hybrid_probe.py`
- `scripts/test_validate_m005_s04_git_hybrid_probe.py`

## Verification

python3 -m unittest scripts/test_validate_m005_s04_git_hybrid_probe.py -v
