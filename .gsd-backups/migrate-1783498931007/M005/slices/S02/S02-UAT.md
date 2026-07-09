# S02: Company Template Import + Agent Profile Activation — UAT

**Milestone:** M005
**Written:** 2026-05-31T19:37:41.794Z

## UAT — S02: Company Template Import + Agent Profile Activation

- **UAT required:** no

This slice delivers probe infrastructure and validators that run headlessly; there is no user-facing GUI behavior to acceptance-test. The operational proof is provided by automated validators and test fixtures.

### Preconditions
- Repository cloned at `/home/qazanik/Documents/BOS_Chimera_Paperclip_Handoff/BOS_Chimera_Paperclip_Handoff`
- Python 3 available
- No Paperclip API credentials required for infrastructure validation (live probe is designed to produce valid fail-closed-blocker when auth is missing)

### Steps
1. Run local validator: `python3 scripts/validate_company_template.py`
   - **Expected:** exit 0, output confirms 7 divisions, 7 agent profiles, org chart, routing rules, rituals, security snippets.
2. Run S02 validator against live evidence: `python3 scripts/validate_m005_s02_company_template_probe.py --evidence runtime-evidence/M005-S02-company-template-probe.json --allow-blocker`
   - **Expected:** exit 0, message confirms valid fail-closed-blocker artifact with precise blocker codes and zero capability promotions.
3. Run test fixture suite: `python3 scripts/test_validate_m005_s02_company_template_probe.py -v`
   - **Expected:** 12 tests pass (OK).
4. Run capability matrix validator: `python3 scripts/validate_runtime_capabilities.py`
   - **Expected:** exit 0, confirms manifest surfaces and guardrail fields mapped.
5. Inspect evidence summary: `cat runtime-evidence/M005-S02-evidence-summary.json | python3 -m json.tool`
   - **Expected:** Valid JSON with schema_version m005-s02-evidence-summary/v1, posture.mem058_compliant=true, guardrails.all zero.

### Edge Cases
- Missing auth environment: probe automatically produces valid fail-closed-blocker without panic or capability promotion.
- Malformed evidence: validator rejects with non-zero exit and descriptive error.
- Unredacted secrets in evidence: validator fails with redaction error.

### UAT Type
Infrastructure validation (automated probes, validators, test fixtures)
