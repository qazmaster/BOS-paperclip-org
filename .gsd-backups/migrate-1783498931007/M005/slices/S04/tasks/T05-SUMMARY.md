---
id: T05
parent: S04
milestone: M005
key_files:
  - scripts/validate_m005_s04_git_hybrid_probe.py
  - scripts/test_validate_m005_s04_git_hybrid_probe.py
key_decisions:
  - Accept structured S04 diagnostic sub-fields as valid blocker diagnostic evidence since the probe runner embeds diagnostics in git_binary_check, git_env_discovery, git_ls_remote, hybrid_persistence_smoke, and state_reconstruction_smoke rather than a single top-level diagnostics object
duration: 
verification_result: passed
completed_at: 2026-05-31T20:27:47.933Z
blocker_discovered: false
---

# T05: Created M005 S04 Python validator with schema enforcement, redaction checks, no-core-modification validation, blocker acceptance, and zero capability-promotion rejection, plus 12-passing unittest fixtures

**Created M005 S04 Python validator with schema enforcement, redaction checks, no-core-modification validation, blocker acceptance, and zero capability-promotion rejection, plus 12-passing unittest fixtures**

## What Happened

Created scripts/validate_m005_s04_git_hybrid_probe.py as a standard-library-only fail-closed validator enforcing schema_version m005-s04-git-hybrid/v1, artifact_type validation, ISO-8601 timestamps, secret redaction via regex scan, no_core_modification proof, unsupported_paths rejection, and zero capability-promotion for blocker artifacts. The validator accepts both runtime-execution-proof and fail-closed-blocker artifacts. For passing proof it validates git binary availability, git ls-remote success, hybrid persistence smoke success, and state reconstruction smoke success. For blocker artifacts it requires blocker_reason, blocker_codes, zero passing flag, zero capability promotions, and zero mutation side effects. Structured S04 diagnostic sub-fields (git_binary_check, git_env_discovery, git_ls_remote, hybrid_persistence_smoke, state_reconstruction_smoke) are accepted as valid diagnostic evidence since the probe runner embeds diagnostics in those sections rather than a single top-level diagnostics object. Also created scripts/test_validate_m005_s04_git_hybrid_probe.py with 12 fixtures: (1) passing git+hybrid proof, (2) passing reconstruction proof, (3) fail-closed blocker missing auth, (4) fail-closed blocker missing git binary, (5) fail-closed blocker missing git URL, (6) fail-closed blocker unsupported endpoint, (7) partial hybrid mirror failure, (8) unredacted secrets in diagnostics, (9) malformed timestamp, (10) unsupported paths used, (11) capability promotion in blocker artifact, (12) CLI write-audit closeout. All 12 tests pass. The validator was also verified against the real runtime-evidence/M005-S04-git-hybrid-probe.json artifact, correctly classifying it as a valid blocker artifact, and the --write-audit CLI flag produces valid closeout JSON.

## Verification

Ran python3 -m unittest scripts/test_validate_m005_s04_git_hybrid_probe.py -v — all 12 fixtures pass. Ran validator CLI against real runtime-evidence/M005-S04-git-hybrid-probe.json — correctly classified as valid blocker. Ran validator CLI with --write-audit for both passing and blocker artifacts — produces valid closeout JSON.

## Verification Evidence

| # | Command | Exit Code | Verdict | Duration |
|---|---------|-----------|---------|----------|
| 1 | `python3 -m unittest scripts/test_validate_m005_s04_git_hybrid_probe.py -v` | 0 | ✅ pass | 29ms |
| 2 | `python3 scripts/validate_m005_s04_git_hybrid_probe.py runtime-evidence/M005-S04-git-hybrid-probe.json --allow-blocker` | 0 | ✅ pass | 120ms |
| 3 | `python3 scripts/validate_m005_s04_git_hybrid_probe.py runtime-evidence/M005-S04-git-hybrid-probe.json --write-audit /tmp/m005-s04-audit-test.json --allow-blocker` | 0 | ✅ pass | 115ms |

## Deviations

None.

## Known Issues

None.

## Files Created/Modified

- `scripts/validate_m005_s04_git_hybrid_probe.py`
- `scripts/test_validate_m005_s04_git_hybrid_probe.py`
