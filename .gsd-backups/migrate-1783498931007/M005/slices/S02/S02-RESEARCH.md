# S02: Company Template Import + Agent Profile Activation — Research

## Summary

S02 must validate that the BOS Light v1.4.1 company template can be imported into Paperclip and that each division's AGENTS.md profile is parsed and active. The local package is import-ready: `company-template/bos-company-template.json` passes `scripts/validate_company_template.py` with 7 divisions, correct reporting lines, routing rules, rituals, and BOS config. All 7 AGENTS.md profiles exist and contain the required identity, VFP, routing, guardrails, and escalation sections.

However, live Paperclip import/export compatibility remains **unvalidated**. The capability matrix records `company_template.import_export` and `agents.syntax` as `unvalidated`. M002 S07 proved agent visibility via direct Paperclip API (`POST /api/companies/{companyId}/agents`), not through company template import. MEM174 confirms the 7 v1.4.1 division agents were created directly via API. There is no evidence that Paperclip's import/export schema accepts `bos-company-template.json` or that its AGENTS.md parser accepts the markdown profiles.

S01 established the environment lacks live Paperclip credentials (`PAPERCLIP_BASE_URL`, `PAPERCLIP_API_KEY`). Without these, any live import probe will fail closed at preflight, producing a valid `fail-closed-blocker` artifact with precise blocker codes, zero side effects, and no capability promotion — exactly the pattern M005-S01 used for plugin and Hermes probes.

The planner should therefore scope S02 around:
1. A **company template import probe** (with fallback to direct agent creation probe if import API is unavailable)
2. An **agent profile activation probe** that verifies AGENTS.md content is either parsed by Paperclip or correctly attached as agent metadata
3. A **routing rules validation probe** that checks division routing is active
4. Evidence artifact generation and capability matrix update (append-only, no promotions without live version/build readback)

## Recommendation

**Approach:** Build a bounded M005-S02 probe runner (`scripts/run_m005_s02_company_template_probe.py`) that attempts two paths in order:

1. **Primary path:** Attempt Paperclip company template import/export. If a supported import endpoint exists (e.g., `POST /api/companies/{companyId}/import` or `PUT /api/companies/{companyId}`), attempt to upload `bos-company-template.json`. Record schema_version, divisions_created, routing_rules_active, and any blocker codes.

2. **Fallback path:** If template import is unsupported or blocked, use the proven direct agent creation API (`POST /api/companies/{companyId}/agents`) from `scripts/create_bos_v141_agents.py` to ensure the 7 divisions exist. Attach AGENTS.md content as agent metadata or instructions. This provides operational continuity even when import/export is blocked.

**Why:** This mirrors the S01 pattern where bounded probes produce either live evidence or precise fail-closed blocker artifacts. The direct API creation path is already proven (M002 S07, MEM174) and requires only the same credentials S01 already attempted. The company template JSON remains the semantic source of truth regardless of import path.

**Evidence contract:** Use schema version `m005-s02-company-template/v1`. The artifact must include:
- `import_attempt`: { `surface`, `status`, `blocker_codes[]`, `side_effect_counters` }
- `agent_activation`: { `divisions_present`, `divisions_missing`, `agents_created`, `agents_skipped`, `profile_attached` }
- `routing_validation`: { `rules_active`, `test_route_result` }
- `runtime`: { `version`, `build` } (from health check, if available)
- `capability_delta`: append-only rows for `company_template.import_export` and `agents.syntax`

## Implementation Landscape

### Key Files

- `company-template/bos-company-template.json` — v1.4.1 company template with 7 divisions, routing rules, rituals, BOS config. Semantic source of truth.
- `company-template/import-notes.md` — Documents that live Paperclip import/export compatibility is unproven.
- `agents/Div*_*/AGENTS.md` — 7 division agent profiles. Each contains identity, VFP, routing, guardrails, escalation.
- `agents/README.md` — Canonical profile paths and org chart.
- `scripts/validate_company_template.py` — Standard-library-only local validator. S02 should call this to prove local contract still passes before live probe.
- `scripts/create_bos_v141_agents.py` — Proven direct agent creation script via Paperclip API. Reusable as fallback path.
- `plugin-bos-light/capabilities.paperclip-runtime.json` — Evidence source of truth. S02 must append new rows without overwriting prior disposition.
- `plugin-bos-light/src/runtimeCapabilities.ts` — TypeScript key/status vocabulary mirror.
- `runtime-evidence/M002-S07-agent-visibility.json` — Prior evidence of 7 agents visible via direct API readback.

### Build Order

1. **Local validation first** — Run `python3 scripts/validate_company_template.py` to confirm the repository-local contract is intact. This is fast, deterministic, and required before any live probe.
2. **Probe runner** — Create `scripts/run_m005_s02_company_template_probe.py` with:
   - Health check (`GET /api/health`) to capture runtime version/build
   - Company template import attempt (detect supported endpoint or document unsupported)
   - Direct agent creation fallback if import is blocked
   - Agent list readback (`GET /api/companies/{companyId}/agents`) to verify 7 divisions present
   - Routing rule test (create a minimal test issue/task and verify routing behavior, or document inability to test)
3. **Validator** — Create `scripts/validate_m005_s02_company_template_probe.py` with `--allow-blocker` support (same pattern as S01 Hermes validator).
4. **Test fixtures** — Create `scripts/test_validate_m005_s02_company_template_probe.py` with 10+ fixtures covering pass, fail-closed-blocker, partial-import, and direct-creation fallback.
5. **Evidence artifact** — Write `runtime-evidence/M005-S02-company-template-probe.json`.
6. **Capability matrix update** — Append `company_template.import_export` and `agents.syntax` rows with status from probe outcome. Preserve all prior rows (append-only discipline per MEM058).
7. **Evidence summary** — Write `runtime-evidence/M005-S02-evidence-summary.json` combining S02 results with S01 context.

### Natural Seams

- **T01: Company template local validation** — Runs `validate_company_template.py`, confirms 7 divisions, routing rules, rituals. No external dependencies.
- **T02: Live import probe runner** — Attempts Paperclip import/export. Requires `PAPERCLIP_BASE_URL` and `PAPERCLIP_API_KEY`. Expected to fail closed in this environment.
- **T03: Agent activation probe** — Uses direct API to create/list agents. Reuses `create_bos_v141_agents.py` patterns. Attaches AGENTS.md content as metadata.
- **T04: Evidence validation + matrix update** — Validates probe artifact, updates capability matrix, generates evidence summary.

### First Proof

The highest-risk, biggest-unblocker is the **live import probe** (T02). If Paperclip supports company template import, this proves C4 and unblocks downstream slices that depend on org model presence. If it fails closed, the precise blocker codes inform remediation. The direct agent creation fallback (T03) is lower risk because M002 S07 already proved the API surface.

### Verification

- Local: `python3 scripts/validate_company_template.py` exits 0
- Probe: `python3 scripts/run_m005_s02_company_template_probe.py` produces `runtime-evidence/M005-S02-company-template-probe.json`
- Validation: `python3 scripts/validate_m005_s02_company_template_probe.py --evidence runtime-evidence/M005-S02-company-template-probe.json --allow-blocker` exits 0
- Matrix: `python3 scripts/validate_runtime_capabilities.py` confirms JSON is valid and no prior rows were overwritten
- Regression: `python3 scripts/test_validate_m005_s02_company_template_probe.py` passes all fixtures

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| No live Paperclip credentials (same as S01) | High | Probe fails at preflight | Accept fail-closed-blocker artifact as valid S02 outcome; use direct agent creation fallback |
| Paperclip import schema mismatch | Medium | Template rejected even with credentials | Document exact error codes; preserve semantic template for manual operator conversion |
| AGENTS.md parser rejects profiles | Medium | Agent metadata incomplete | Attach AGENTS.md as raw metadata/instructions string; profiles remain human-readable markdown |
| Direct agent creation API changed | Low | Fallback path breaks | Use same `urllib.request` pattern as `create_bos_v141_agents.py`; record exact status codes |
| Capability matrix syntax error (S01 regression) | Low | Invalid JSON | Validate matrix with `json.loads` after every edit; run `validate_runtime_capabilities.py` |

## Sources

- `company-template/bos-company-template.json` — v1.4.1 company template
- `scripts/validate_company_template.py` — Local validator (MEM001, MEM002, MEM004, MEM105)
- `scripts/create_bos_v141_agents.py` — Direct agent creation API proof (MEM174)
- `runtime-evidence/M002-S07-agent-visibility.json` — Prior agent visibility evidence
- `plugin-bos-light/capabilities.paperclip-runtime.json` — Capability matrix (C4/C5 status)
- `docs/08_RUNTIME_CAPABILITY_HEALTH.md` — C4/C5 boundary documentation
- `docs/10_PAPERCLIP_ASSUMPTIONS.md` — Assumption A (Paperclip org runtime)
- `company-template/import-notes.md` — Explicit import compatibility deferral
- S01 evidence pattern: `runtime-evidence/M005-S01-plugin-ui-surface-probe.json` and `runtime-evidence/M005-S01-hermes-xiaomi-runtime-probe.json`
