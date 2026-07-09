---
id: T01
parent: S01
milestone: M012-ihd2ez
key_files:
  - scripts/m012_s01_canonical_paperclip_readback.js
  - scripts/validate_m012_s01_readback.js
  - runtime-evidence/M012-S01-canonical-paperclip-readback.json
  - runtime-evidence/M012-S01-canonical-paperclip-readback.md
key_decisions:
  - Auth key pcp_board_ is present but returns 401 on all company routes — honest blocker recording rather than masking the failure
  - Fixed dotenv loader to handle 'export KEY=value' format common in shell-style .env files
  - Probe output includes normalized_entities for downstream S02 consumption
duration: 
verification_result: passed
completed_at: 2026-06-03T03:52:14.195Z
blocker_discovered: false
---

# T01: Built canonical Paperclip readback probe and validator; probe confirms auth_present but API returns 401 on all company routes, truthfully recording auth blocker codes for the canonical BOS Light company.

**Built canonical Paperclip readback probe and validator; probe confirms auth_present but API returns 401 on all company routes, truthfully recording auth blocker codes for the canonical BOS Light company.**

## What Happened

Implemented the Paperclip readback probe (scripts/m012_s01_canonical_paperclip_readback.js) based on the M011 S02 probe pattern, adapted for the canonical company ID 9feb4c22-05b9-401e-ba67-0e866e3056da. The probe loads auth from .env without printing secrets (fixed export prefix handling in dotenv loader), probes 17 GET routes, rejects the stale sandbox company ID, normalizes entities (company, agents, issues, projects, goals), and writes JSON + markdown evidence. A key finding: the PAPERCLIP_API_KEY (pcp_board_ prefix) is present but returns 401 on all company routes — auth may have expired since M012 planning when it was verified working. The probe correctly records paperclip_auth_unauthorized blocker code. The validator (scripts/validate_m012_s01_readback.js) checks for plaintext secrets, direct DB mutation, stale sandbox ID, unsupported surface promotions, and schema structure — all 20 checks pass. Both output artifacts (JSON + MD) are written to runtime-evidence/.

## Verification

Verified with `node scripts/validate_m012_s01_readback.js` — all 20 checks pass: no plaintext secrets, no DB mutation, canonical company ID confirmed, no capability promotions, all required schema fields present, observations are booleans, route_inventory and blocker_codes are arrays. Exit code 0.

## Verification Evidence

| # | Command | Exit Code | Verdict | Duration |
|---|---------|-----------|---------|----------|
| 1 | `node scripts/validate_m012_s01_readback.js` | 0 | ✅ pass | 32ms |
| 2 | `node scripts/m012_s01_canonical_paperclip_readback.js` | 0 | ✅ pass | 5000ms |

## Deviations

None

## Known Issues

PAPERCLIP_API_KEY returns 401 on all authenticated routes — key may have expired since M012 planning phase when auth was verified working. S02 live mutation tasks will need refreshed auth before proceeding.

## Files Created/Modified

- `scripts/m012_s01_canonical_paperclip_readback.js`
- `scripts/validate_m012_s01_readback.js`
- `runtime-evidence/M012-S01-canonical-paperclip-readback.json`
- `runtime-evidence/M012-S01-canonical-paperclip-readback.md`
