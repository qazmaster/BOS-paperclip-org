---
id: T03
parent: S03
milestone: M005
key_files:
  - scripts/validate_m005_s03_resource_intake_probe.py
  - scripts/test_validate_m005_s03_resource_intake_probe.py
key_decisions:
  - Reused exact S01/S02 validator patterns for consistency across M005 probes
  - Extended unsupported_paths_used check to nested safety object because S03 probe stores it there
  - Added zero-side-effects validation for blocker artifacts to enforce comments_created/documents_created/escalation_issues_created == 0
duration: 
verification_result: passed
completed_at: 2026-05-31T19:50:59.614Z
blocker_discovered: false
---

# T03: Created M005 S03 validator and 12-test fixture suite with fail-closed blocker, passing-proof, and side-effect validation

**Created M005 S03 validator and 12-test fixture suite with fail-closed blocker, passing-proof, and side-effect validation**

## What Happened

Created `scripts/validate_m005_s03_resource_intake_probe.py` following the exact S01/S02 validator patterns. The validator enforces schema_version `m005-s03-resource-intake/v1`, redaction checks, boundary flag validation, and has two modes: fail-closed blocker acceptance and passing-proof validation. Passing proof requires all 6 resource items present (mapping to 4 categories), healthy Paperclip endpoint, authenticated inputs, and at least one confirmed request artifact (comment/document/issue). Blocker validation requires precise blocker_codes, zero capability_promotions, and zero mutation side effects (comments_created/documents_created/escalation_issues_created must be 0). Created `scripts/test_validate_m005_s03_resource_intake_probe.py` with 12 fixture tests covering: passing checklist, missing auth blocker, missing Xiaomi blocker, missing git blocker, partial checklist, unredacted secrets, malformed timestamp, unsupported paths used, wrong schema version, capability promotion in blocker, CLI write-audit closeout, and zero side effects in blocker. Discovered and fixed that `unsupported_paths_used` is nested inside `safety` in S03 evidence, so the validator now checks both top-level and nested locations.

## Verification

All 12 unit tests pass. Live evidence from T02 validates correctly as a blocker. CLI write-audit produces valid closeout JSON.

## Verification Evidence

| # | Command | Exit Code | Verdict | Duration |
|---|---------|-----------|---------|----------|
| 1 | `python3 -m unittest scripts/test_validate_m005_s03_resource_intake_probe.py -v` | 0 | ✅ pass | 23ms |
| 2 | `python3 scripts/validate_m005_s03_resource_intake_probe.py runtime-evidence/M005-S03-resource-intake-probe.json --allow-blocker` | 0 | ✅ pass | 15ms |
| 3 | `python3 scripts/validate_m005_s03_resource_intake_probe.py runtime-evidence/M005-S03-resource-intake-probe.json --allow-blocker --write-audit /tmp/m005-s03-audit-test.json` | 0 | ✅ pass | 15ms |

## Deviations

None.

## Known Issues

None.

## Files Created/Modified

- `scripts/validate_m005_s03_resource_intake_probe.py`
- `scripts/test_validate_m005_s03_resource_intake_probe.py`
