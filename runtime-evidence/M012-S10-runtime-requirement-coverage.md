# M012-S10 Runtime Requirement Coverage

**Phase:** M012-S10  
**Generated:** 2026-06-03T12:00:00.000Z  
**Milestone:** M012-ihd2ez  

## Purpose

This artifact documents the honest descoping of two core-capability requirements (R017 and R019) that cannot be advanced within M012 or any prior milestone due to persistent blockers evidenced by M005 probe artifacts. Both requirements remain deferred pending resolution of authentication, adapter registry access, and secret materialization blockers.

---

## R017 — Plugin Registration (deferred)

### Requirement Text

BOS Light plugin (bos-light) must register and load in Paperclip runtime with all declared tools (piko:\*), actions (approve-batch), data provider (betting-table), dashboard widget (betting-table), and issue detail tabs (bos-status, circuit-state, gate-results) visible and callable through the Paperclip GUI.

**Class:** core-capability  
**Previous Status:** active  
**New Status:** deferred  

### Honest Rationale

R017 requires live Paperclip plugin registration and load. M005 S01 produced a fail-closed-unsupported probe artifact proving that all plugin surfaces (registration, actions, data providers, tools, dashboard widgets, issue detail tabs) remain fallback-only. No live Paperclip base URL or API key was available for probing. M012 did not attempt plugin registration either. Across M005 and M012, zero independent proof of plugin host load exists. Deferring R017 is the honest disposition: the requirement cannot be advanced without Paperclip credentials and a live plugin runtime.

### Blocker Citations

1. **M005-S01-plugin-ui-surface-probe.json** — All 6 plugin surfaces recorded as fallback-only. Zero observed registered keys. Zero readback proofs. Live probe disabled due to missing `PAPERCLIP_BASE_URL` and `PAPERCLIP_API_KEY` env vars. Blocker codes: `missing_live_probe_env`, `no_confirmed_s05_surfaces`.

2. **MEM058** — Only bounded live Paperclip issue/document/comment create/readback evidence may promote native artifact surfaces. S04 evidence must not be reused to confirm plugin registration, UI/data/action surfaces, or tool registration.

3. **MEM068** — Only S04-backed native issue/document/comment surfaces are confirmed for Paperclip runtime; plugin/piko/data/action/widget/issue-tab surfaces remain blocked, fallback-only, or unvalidated unless new independent live proof exists.

### Safety Flags

- **no_capability_promotion:** true — No plugin surface was promoted from fallback-only.
- **no_live_mutation:** true — No Paperclip mutation was attempted.
- **fallback_only_preserved:** true — All plugin surfaces remain fallback-only.

---

## R019 — Hermes Execution (deferred)

### Requirement Text

Hermes agent execution must work in Paperclip with xiaomi mimo 2.5 pro model, producing bounded runs with correct resultJson.bos output for BOS Light division agents. Secret refs must materialize correctly at runtime without inline plaintext keys.

**Class:** core-capability  
**Previous Status:** active  
**New Status:** deferred  

### Honest Rationale

R019 requires live Hermes agent execution with the xiaomi mimo 2.5 pro model producing bounded runs. M005 S01 produced a fail-closed-blocker probe artifact proving that Hermes execution is blocked by 5 distinct blocker codes: adapter_registry_auth_denied (adapter registry returns 403 Board access required), missing_auth (no PAPERCLIP_API_KEY/TOKEN/COOKIE present), missing_xiaomi_api_key (xiaomi secret ref not present), missing_xiaomi_base_url (xiaomi base URL secret ref not present), and test_environment_auth_denied (test environment returns 401 Unauthorized). Zero bounded runtime invocations occurred. No resultJson.bos was produced. Hermes v0.15.2 does not materialize Xiaomi secret_refs. M012 did not attempt Hermes execution. Deferring R019 is the honest disposition: the requirement cannot be advanced without resolving auth, adapter registry access, and Xiaomi secret ref materialization.

### Blocker Citations

1. **M005-S01-hermes-xiaomi-runtime-probe.json** — Hermes execution blocked by 5 blocker codes. Adapter registry returns 403 (Board access required). Test environment returns 401 (Unauthorized). Zero bounded runtime invocations. No resultJson.bos produced. Adapter type: hermes_local with xiaomi provider and mimo-v2.5-pro model configured but unreachable. Blocker codes: `adapter_registry_auth_denied`, `missing_auth`, `missing_xiaomi_api_key`, `missing_xiaomi_base_url`, `test_environment_auth_denied`.

2. **M012-S04-final-reconciliation.json** — M012 final reconciliation confirms runtime.hermes_xiaomi_execution remains in promotion_guard (blocked). No M012 live proof exists. Hermes execution was not attempted. No adapter registry readback, no passing testEnvironment, no bounded run.

3. **MEM092** — Hermes/GSD-Pi execution rows must cite passing supported-boundary runtime evidence; fail-closed blocker artifacts and local adapter package readiness must remain unpromoted/fallback-only with no capability_promotions.

4. **MEM038** — Incomplete Hermes environment or agent-smoke probes are valid blocker artifacts only, while passing smoke proof must include hermes_local adapter/testEnvironment/readback, resultJson.bos, exactly one wake, zero created approvals, redaction, and no-core-modification proof.

### Safety Flags

- **no_capability_promotion:** true — No Hermes execution surface was promoted.
- **no_live_mutation:** true — No Paperclip mutation was attempted.
- **no_plaintext_secrets:** true — No plaintext secrets were requested or logged.
- **fallback_only_preserved:** true — Hermes execution remains fallback-only/blocked.

---

## Coverage Summary

| Metric | Value |
|--------|-------|
| Total active requirements at M012 start | 10 |
| Descoped in S10 | 2 |
| Remaining deferred | 2 |
| Descoped IDs | R017, R019 |
| Unchanged active | R003, R008, R018, R020, R022, R023, R024, R025 |

## Safety Attestation

- **no_capability_promotion:** true
- **no_live_mutation:** true
- **no_unsupported_api_use:** true
- **descoping_is_honest_disposition:** true
- **all_blockers_cited_from_probe_artifacts:** true
