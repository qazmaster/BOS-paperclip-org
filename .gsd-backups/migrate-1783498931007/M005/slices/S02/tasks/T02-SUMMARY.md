---
id: T02
parent: S02
milestone: M005
key_files:
  - scripts/run_m005_s02_company_template_probe.py
  - runtime-evidence/M005-S02-company-template-probe.json
key_decisions:
  - Preflight gate blocks all state-changing operations when auth is missing, producing cleaner blocker artifacts with fewer unnecessary API calls
  - Agents list auth-denied (401/403) skips redundant fallback creation attempts to avoid predictable failures
  - AGENTS.md content is attached as bounded metadata (max 8000 chars) with SHA-256 for integrity verification
duration: 
verification_result: passed
completed_at: 2026-05-31T19:27:30.899Z
blocker_discovered: false
---

# T02: Created fail-closed M005 S02 company template import probe runner with S01-pattern HttpClient, redaction, and evidence schema

**Created fail-closed M005 S02 company template import probe runner with S01-pattern HttpClient, redaction, and evidence schema**

## What Happened

Following the S01 bounded-probe pattern, created `scripts/run_m005_s02_company_template_probe.py` that discovers Paperclip base_url/company_id/auth from env or prior M002-S07 artifacts, performs a health check, attempts company template import via POST /api/companies/{id}/import with PUT fallback, falls back to direct agent creation via POST /api/companies/{id}/agents with AGENTS.md content attached as bounded metadata, lists agents for readback, and documents routing rules. The runner is fail-closed: missing credentials trigger a preflight gate that produces a valid blocker artifact with precise blocker codes (`missing_auth`, `divisions_missing_after_fallback`), zero mutation side effects (agents_created=0, approvals_created=0, issues_created=0), and no capability promotions. All HTTP requests use the same redaction and HttpClient patterns as S01. In environments with auth but unsupported import endpoints, the probe correctly attempts fallback agent creation, skips redundant operations when agents_list returns auth_denied, and records dry-run vs live creation results. The evidence artifact `runtime-evidence/M005-S02-company-template-probe.json` uses schema_version `m005-s02-company-template/v1` and contains all required sections: import_attempt, agent_activation, routing_validation, side_effect_counters, readback, diagnostics, and runtime.

## Verification

Verified script compiles with python3 -m py_compile. Ran probe in current environment (missing auth) and confirmed it produces valid fail-closed-blocker evidence at runtime-evidence/M005-S02-company-template-probe.json. Asserted all required schema fields: schema_version, artifact_type, passing=False, capability_promotions=[], zero side effects, and presence of import_attempt/agent_activation/routing_validation. Tested dry-run path with fake auth to verify fallback logic and profile_bytes recording.

## Verification Evidence

| # | Command | Exit Code | Verdict | Duration |
|---|---------|-----------|---------|----------|
| 1 | `python3 -m py_compile scripts/run_m005_s02_company_template_probe.py` | 0 | ✅ pass | 150ms |
| 2 | `python3 scripts/run_m005_s02_company_template_probe.py && test -f runtime-evidence/M005-S02-company-template-probe.json` | 0 | ✅ pass | 1800ms |
| 3 | `python3 -c "import json; d=json.load(open('runtime-evidence/M005-S02-company-template-probe.json')); assert d['schema_version'] == 'm005-s02-company-template/v1'; assert d['artifact_type'] == 'fail-closed-blocker'; assert d['passing'] == False; assert d['capability_promotions'] == []; assert d['side_effect_counters']['agents_created'] == 0; assert d['side_effect_counters']['approvals_created'] == 0; print('All assertions passed')"` | 0 | ✅ pass | 50ms |

## Deviations

None

## Known Issues

None

## Files Created/Modified

- `scripts/run_m005_s02_company_template_probe.py`
- `runtime-evidence/M005-S02-company-template-probe.json`
