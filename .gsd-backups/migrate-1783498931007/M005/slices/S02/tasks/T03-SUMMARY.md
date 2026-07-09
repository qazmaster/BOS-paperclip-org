---
id: T03
parent: S02
milestone: M005
key_files:
  - scripts/validate_m005_s02_company_template_probe.py
  - scripts/test_validate_m005_s02_company_template_probe.py
  - runtime-evidence/M005-S02-company-template-closeout.json
key_decisions:
  - Blocker artifacts require a precise blocker_codes list (not just blocker_reason string) to satisfy S02's need for machine-readable failure categorization.
  - Direct-creation fallback is accepted as passing proof only when readback confirms 7 v1.4.1 agents present, keeping the validator fail-closed against unverified creation claims.
duration: 
verification_result: passed
completed_at: 2026-05-31T19:32:05.744Z
blocker_discovered: false
---

# T03: Created fail-closed M005 S02 company template probe validator with schema enforcement, redaction checks, and 12-test fixture suite covering passing import, direct-creation fallback, blockers, partial imports, and negative cases

**Created fail-closed M005 S02 company template probe validator with schema enforcement, redaction checks, and 12-test fixture suite covering passing import, direct-creation fallback, blockers, partial imports, and negative cases**

## What Happened

Following the S01 validator pattern, I created two files: (1) scripts/validate_m005_s02_company_template_probe.py — a fail-closed validator enforcing schema_version m005-s02-company-template/v1, redaction of secrets, no direct DB mutation / core patch / private import flags, and passing proof criteria specific to company template import: either import_attempt.status=success with a recognized surface, or direct-creation fallback confirmed by readback showing 7 v1.4.1 agents. Passing proof also requires agent_activation with all 7 divisions present, agents_created >= 7, profile_attached >= 7; routing_validation with rules_active >= 7 and a non-placeholder test_route_result; and readback confirming all divisions. Blocker artifacts require blocker_reason, precise blocker_codes list, diagnostics, no capability promotions, and passing != True. The validator includes --evidence, --allow-blocker, and --write-audit CLI flags. (2) scripts/test_validate_m005_s02_company_template_probe.py — a 12-test fixture suite covering: passing import proof, passing direct-creation proof, fail-closed blocker with missing auth, fail-closed blocker with unsupported endpoint, partial import (missing divisions), unredacted secrets, direct DB/core/private-import flags, malformed timestamp, CLI zero-exit for valid blocker, CLI audit write, wrong schema version, and routing placeholder rejection. All tests pass. The actual T02 evidence artifact validates correctly as a fail-closed blocker with zero errors.

## Verification

Ran the full 12-test fixture suite with python3 scripts/test_validate_m005_s02_company_template_probe.py -v — all 12 tests passed (OK). Validated the actual T02 evidence artifact runtime-evidence/M005-S02-company-template-probe.json with the CLI — correctly classified as blocker with exit code 0 and no validation errors. Verified --write-audit produces a valid closeout JSON with schema_version m005-s02-company-template-closeout/v1.

## Verification Evidence

| # | Command | Exit Code | Verdict | Duration |
|---|---------|-----------|---------|----------|
| 1 | `python3 scripts/test_validate_m005_s02_company_template_probe.py -v` | 0 | ✅ pass | 100ms |
| 2 | `python3 scripts/validate_m005_s02_company_template_probe.py --evidence runtime-evidence/M005-S02-company-template-probe.json --allow-blocker` | 0 | ✅ pass | 63ms |
| 3 | `python3 scripts/validate_m005_s02_company_template_probe.py --evidence runtime-evidence/M005-S02-company-template-probe.json --allow-blocker --write-audit runtime-evidence/M005-S02-company-template-closeout.json` | 0 | ✅ pass | 109ms |

## Deviations

None

## Known Issues

None

## Files Created/Modified

- `scripts/validate_m005_s02_company_template_probe.py`
- `scripts/test_validate_m005_s02_company_template_probe.py`
- `runtime-evidence/M005-S02-company-template-closeout.json`
