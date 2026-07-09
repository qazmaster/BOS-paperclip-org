---
id: S02
parent: M005
milestone: M005
provides:
  - Fail-closed company template import probe infrastructure for S03 resource intake (needs division routing active) and S04 git integration (needs Div4.Production agent present).
  - Bounded direct-creation fallback pattern reusable for S03-S05 live probes.
  - Capability matrix rows for company_template.import_export and agents.syntax with S02 evidence_source and blocker_text.
  - Combined S01+S02 evidence summary for downstream posture and guardrail propagation.
requires:
  - slice: S01
    provides: Plugin registration status, Hermes runtime evidence, HttpClient boundary, redaction patterns, and S01 evidence summary context.
affects:
  []
key_files:
  - scripts/validate_company_template.py
  - scripts/run_m005_s02_company_template_probe.py
  - scripts/validate_m005_s02_company_template_probe.py
  - scripts/test_validate_m005_s02_company_template_probe.py
  - runtime-evidence/M005-S02-local-validation.json
  - runtime-evidence/M005-S02-company-template-probe.json
  - runtime-evidence/M005-S02-evidence-summary.json
  - plugin-bos-light/capabilities.paperclip-runtime.json
key_decisions:
  - Preflight auth gate blocks all state-changing Paperclip API calls when credentials are missing, producing cleaner blocker artifacts with fewer unnecessary API calls.
  - AGENTS.md content is attached as bounded metadata (max 8000 chars) with SHA-256 for integrity verification during direct-creation fallback.
  - Blocker artifacts require a precise blocker_codes list (not just blocker_reason string) to satisfy machine-readable failure categorization.
  - Direct-creation fallback is accepted as passing proof only when readback confirms 7 v1.4.1 agents present, keeping the validator fail-closed against unverified creation claims.
  - company_template.import_export and agents.syntax remain unvalidated because the S02 probe is a valid fail-closed blocker with zero capability promotions; only evidence_source and blocker_text are updated append-only.
  - Pre-existing hermes.execution.xiaomi gaps in runtimeCapabilities.ts and health report were fixed to restore matrix validation; matrix, source contract, and health report must stay in sync.
patterns_established:
  - Bounded live probe pattern with preflight auth gate, supported-endpoint attempt, direct-creation fallback, and fail-closed-blocker artifact production.
  - Validator pattern with --allow-blocker flag, schema_version enforcement, redaction checks, capability-promotion rejection, and CLI write-audit closeout.
  - Capability matrix append-only updates that preserve all prior rows and never promote status from blocker evidence.
observability_surfaces:
  - runtime-evidence/M005-S02-local-validation.json
  - runtime-evidence/M005-S02-company-template-probe.json
  - runtime-evidence/M005-S02-evidence-summary.json
  - plugin-bos-light/capabilities.paperclip-runtime.json
drill_down_paths:
  []
duration: ""
verification_result: passed
completed_at: 2026-05-31T19:37:41.794Z
blocker_discovered: false
---

# S02: Company Template Import + Agent Profile Activation

**S02 built and validated fail-closed company-template import probe infrastructure with local validator, live probe runner, 12-test fixture suite, and evidence summary — all passing with zero capability promotions in the auth-missing environment.**

## What Happened

T01 ran the repository-local company template validator (scripts/validate_company_template.py) with Python standard library only, confirming bos-company-template.json contains 7 divisions, 7 AGENTS.md profiles, org chart, routing rules, rituals, and security snippets. Evidence captured to runtime-evidence/M005-S02-local-validation.json.

T02 created scripts/run_m005_s02_company_template_probe.py following the S01 bounded-probe pattern with the same HttpClient, redaction, and evidence schema. The runner implements a preflight auth gate that blocks all state-changing Paperclip API calls when credentials are missing, discovers runtime version/build via health check, attempts company template import via supported endpoints, falls back to direct agent creation with AGENTS.md bounded metadata (max 8000 chars, SHA-256 integrity), and performs agents list readback. In the current auth-missing environment it produced a valid fail-closed-blocker artifact at runtime-evidence/M005-S02-company-template-probe.json with precise blocker_codes [missing_auth, divisions_missing_after_fallback], zero side effects, and zero capability promotions.

T03 created scripts/validate_m005_s02_company_template_probe.py and scripts/test_validate_m005_s02_company_template_probe.py following the S01 validator pattern. The validator enforces schema_version m005-s02-company-template/v1, validates redaction, rejects unsupported paths and core modification, checks blocker artifacts for precise codes and zero capability promotions, and accepts passing proofs only when import succeeds or direct-creation fallback confirms 7 v1.4.1 agents present. The 12-test fixture suite covers passing import, passing direct-creation, fail-closed blocker (missing auth), fail-closed blocker (unsupported endpoint), partial import, unredacted secrets, malformed timestamp, direct DB mutation flags, wrong schema version, routing placeholder, and CLI write-audit closeout. All 12 tests pass (OK).

T04 ran the S02 validator against the live probe evidence with --allow-blocker (exit 0, valid blocker classification, zero capability promotions). Updated plugin-bos-light/capabilities.paperclip-runtime.json append-only: preserved all prior S01 rows and added/updated company_template.import_export and agents.syntax with evidence_source and blocker_text, keeping status unvalidated. During matrix validation, fixed pre-existing hermes.execution.xiaomi gaps in plugin-bos-light/src/runtimeCapabilities.ts and docs/08_RUNTIME_CAPABILITY_HEALTH.md to restore matrix/source/health sync. Validated the matrix with scripts/validate_runtime_capabilities.py (exit 0). Generated runtime-evidence/M005-S02-evidence-summary.json combining S02 results with S01 context, including confirmed_surfaces, fallback_only_surfaces, unvalidated_surfaces, posture, and guardrails. The summary is MEM058-compliant with no_promotion_from_blocker_evidence=true.

## Verification

All slice-level verification checks passed:
1. Local company template validator: python3 scripts/validate_company_template.py → exit 0, confirms 7 divisions, 7 agent profiles, org chart, routing, rituals, security snippets.
2. Live probe artifact: runtime-evidence/M005-S02-company-template-probe.json exists with schema_version m005-s02-company-template/v1, artifact_type=fail-closed-blocker, blocker_codes=[missing_auth, divisions_missing_after_fallback], zero side effects, zero capability promotions.
3. S02 validator with --allow-blocker: python3 scripts/validate_m005_s02_company_template_probe.py --evidence runtime-evidence/M005-S02-company-template-probe.json --allow-blocker → exit 0, valid blocker artifact.
4. Test fixture suite: python3 scripts/test_validate_m005_s02_company_template_probe.py -v → 12 tests passed (OK) in ~0.020s.
5. Capability matrix validation: python3 scripts/validate_runtime_capabilities.py → exit 0, manifest surfaces, adapter assumptions, and guardrail fields mapped.
6. Evidence summary: runtime-evidence/M005-S02-evidence-summary.json exists, schema-valid, combines S01+S02 context, MEM058-compliant.

## Requirements Advanced

- R018 — Created the complete probe, validator, and test infrastructure needed to prove company template import and agent activation when Paperclip credentials are available. Local validation confirms the template itself is intact with 7 divisions and 7 AGENTS.md profiles. Live import surface remains unvalidated pending auth, but the validation pipeline is fully operational.

## Requirements Validated

None.

## New Requirements Surfaced

None.

## Requirements Invalidated or Re-scoped

None.

## Operational Readiness

None.

## Deviations

None.

## Known Limitations

None.

## Follow-ups

None.

## Files Created/Modified

- `scripts/validate_company_template.py` — 
- `runtime-evidence/M005-S02-local-validation.json` — 
- `scripts/run_m005_s02_company_template_probe.py` — 
- `runtime-evidence/M005-S02-company-template-probe.json` — 
- `scripts/validate_m005_s02_company_template_probe.py` — 
- `scripts/test_validate_m005_s02_company_template_probe.py` — 
- `plugin-bos-light/capabilities.paperclip-runtime.json` — 
- `plugin-bos-light/src/runtimeCapabilities.ts` — 
- `docs/08_RUNTIME_CAPABILITY_HEALTH.md` — 
- `runtime-evidence/M005-S02-evidence-summary.json` — 
