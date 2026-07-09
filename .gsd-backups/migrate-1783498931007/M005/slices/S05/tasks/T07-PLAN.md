---
estimated_steps: 1
estimated_files: 2
skills_used: []
---

# T07: Create S05 Python validator and test fixtures

Why: Machine-readable closeout requires a validator and comprehensive fixture coverage for all S05 artifact types. Do: Create scripts/validate_m005_s05_e2e_governance_probe.py with schema_version enforcement (m005-s05-e2e-governance/v1), redaction checks, no_core_modification validation, blocker acceptance (--allow-blocker), and zero capability-promotion rejection. Create scripts/test_validate_m005_s05_e2e_governance_probe.py with 12 fixtures: (1) passing mission intake proof, (2) passing HITL gates proof, (3) fail-closed blocker missing GitHub token, (4) fail-closed blocker missing Paperclip auth, (5) fail-closed blocker branch policy violation, (6) fail-closed blocker QA review fail, (7) fail-closed blocker Circuit Breaker OPEN unresolved, (8) unredacted secrets in diagnostics, (9) malformed timestamp, (10) unsupported paths used, (11) capability promotion in blocker artifact, (12) CLI write-audit closeout. Done when: all 12 fixtures pass.

## Inputs

- `scripts/validate_m005_s04_git_hybrid_probe.py`
- `scripts/test_validate_m005_s04_git_hybrid_probe.py`

## Expected Output

- `scripts/validate_m005_s05_e2e_governance_probe.py`
- `scripts/test_validate_m005_s05_e2e_governance_probe.py`

## Verification

python3 -m unittest scripts/test_validate_m005_s05_e2e_governance_probe.py -v
