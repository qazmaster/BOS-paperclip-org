# S03: Resource Intake + Pre-Mission Credential Checklist — Research

**Date:** 2026-05-31
**Slice:** M005-S03
**Lane:** research lane

---

## Summary

S03 must build a bounded, fail-closed resource-intake probe that detects missing pre-mission credentials and creates visible resource-request artifacts in Paperclip before any mission starts. The four required resources are: (1) Paperclip API key + base URL, (2) company token budget (from `bos_config.company_token_budget_ref` or env override), (3) git access for aipay.kz (SSH key or HTTPS token), and (4) Xiaomi API key + base URL for Hermes execution.

The probe will follow the exact S01/S02 bounded-probe pattern: a single Python stdlib runner, a matching validator with `--allow-blocker`, a 10–12 test fixture suite, and an evidence summary. In the current environment, `PAPERCLIP_API_KEY` and `OPENAI_API_KEY` are present in `.env`, but `XIAOMI_API_KEY`, `XIAOMI_BASE_URL`, and git credentials are absent. The Paperclip base URL is also not set in `.env` (S01/S02 probes relied on prior artifact fallback or explicit `--base-url`). Therefore the live probe will most likely produce a valid `fail-closed-blocker` artifact with precise blocker codes (`missing_xiaomi_api_key`, `missing_git_credentials`, `missing_paperclip_base_url`, etc.) and zero side effects — which is the acceptable S03 closeout posture per MEM058.

The key architectural decision is how to create "visible requests in Paperclip." Since M002 S04 confirmed `issues.native`, `documents.native`, and `comments.native` as `confirmed` surfaces, the probe may attempt to create a resource-request issue or comment when Paperclip auth is available. If auth is missing, it falls back to a markdown-only diagnostic with no capability promotion. This keeps S03 aligned with the conservative evidence rule: only bounded live Paperclip issue/document/comment create-readback evidence may promote native artifact surfaces.

## Recommendation

**Approach:** Create a single bounded probe runner (`scripts/run_m005_s03_resource_intake_probe.py`) that:
1. Discovers required credentials from environment variables and `company-template/bos-company-template.json` (`bos_config.company_token_budget_ref`).
2. Performs a preflight auth gate: if Paperclip base URL or API key is missing, skips all state-changing Paperclip API calls.
3. If auth is present, attempts to list existing issues to detect prior resource-request artifacts, then optionally creates a resource-request comment on an existing issue or a new escalation issue.
4. Produces a unified evidence artifact with `schema_version: m005-s03-resource-intake/v1`, precise `blocker_codes`, `missing_resources`, `request_artifacts`, and `side_effect_counters`.
5. Updates the capability matrix append-only: add `config.api` evidence_source and blocker_text if changed; do not promote any status from blocker evidence.

**Why this approach:** It reuses the proven S01/S02 HttpClient, redaction, preflight gate, and evidence schema patterns, minimizing new code and ensuring the validator/test infrastructure is consistent. Using confirmed native artifact surfaces (issue/document/comment) for resource requests is the only Paperclip-visible mechanism currently proven. The fail-closed design guarantees zero capability promotions when credentials are missing.

## Implementation Landscape

### Key Files

- `scripts/run_m005_s03_resource_intake_probe.py` — **new** bounded probe runner for resource intake. Detects missing credentials, attempts native artifact creation via Paperclip API, writes redacted evidence artifact.
- `scripts/validate_m005_s03_resource_intake_probe.py` — **new** validator enforcing schema_version `m005-s03-resource-intake/v1`, redaction, no core modification, precise blocker codes, zero capability promotions for blocker artifacts, and passing proof only when all 4 resource categories are present with visible request artifacts.
- `scripts/test_validate_m005_s03_resource_intake_probe.py` — **new** 10–12 test fixture suite covering: passing checklist, fail-closed blocker (missing auth), fail-closed blocker (missing Xiaomi), fail-closed blocker (missing git), partial checklist, unredacted secrets, malformed timestamp, unsupported paths, wrong schema version, and CLI write-audit closeout.
- `runtime-evidence/M005-S03-resource-intake-probe.json` — **new** live probe evidence artifact (expected fail-closed-blocker in current env).
- `runtime-evidence/M005-S03-evidence-summary.json` — **new** combined S01+S02+S03 evidence summary with posture, guardrails, and no-promotion flags.
- `plugin-bos-light/capabilities.paperclip-runtime.json` — **modify** append-only: update `config.api` evidence_source and blocker_text to reference M005-S03 evidence.
- `company-template/bos-company-template.json` — **read-only** source for `company_token_budget_ref` (100000).
- `plugin-bos-light/src/livePaperclipAdapter.ts` — **reference** for confirmed native artifact surface APIs (createIssueDocument, addIssueComment, createEscalationIssue) that the probe may optionally call.

### Build Order

1. **Create probe runner first** (`scripts/run_m005_s03_resource_intake_probe.py`). This unblocks the live probe execution and determines whether any native artifact creation is possible.
2. **Execute live probe** (`python3 scripts/run_m005_s03_resource_intake_probe.py`). In the current env this will be a fail-closed-blocker, establishing the S03 evidence artifact.
3. **Create validator + test fixtures** (`scripts/validate_m005_s03_resource_intake_probe.py`, `scripts/test_validate_m005_s03_resource_intake_probe.py`). Reuse S01/S02 redaction patterns, ErrorCollector, and CLI structure.
4. **Run validator against live evidence** and generate evidence summary.
5. **Update capability matrix** append-only and validate with `python3 scripts/validate_runtime_capabilities.py`.

### Verification

- Probe runner: `python3 scripts/run_m005_s03_resource_intake_probe.py` → writes valid JSON artifact.
- Validator with `--allow-blocker`: `python3 scripts/validate_m005_s03_resource_intake_probe.py --evidence runtime-evidence/M005-S03-resource-intake-probe.json --allow-blocker` → exit 0.
- Test fixtures: `python3 scripts/test_validate_m005_s03_resource_intake_probe.py -v` → all pass.
- Capability matrix: `python3 scripts/validate_runtime_capabilities.py` → exit 0.

### Risks and Constraints

- **Missing env vars block live artifact creation:** `PAPERCLIP_BASE_URL`, `XIAOMI_API_KEY`, `XIAOMI_BASE_URL`, and git credentials are all absent from `.env`. The probe must gracefully degrade to a blocker artifact without attempting unsupported API calls.
- **MEM058 compliance:** No capability promotions from blocker evidence. `config.api` must stay `fallback-only` even if the probe successfully reads `company_token_budget_ref` from the local template.
- **MEM053 (Telegram):** The local `.env` contains `TELEGRAM_CHAT_ID` and `TELEGRAM_BOT_TOKEN`. The probe must NOT send credentials via Telegram or any external channel. Any credential request must surface only through Paperclip native artifacts or local diagnostic output.
- **Zero side effects when blocked:** The preflight auth gate must prevent all state-changing Paperclip API calls when credentials are missing, matching S02's clean blocker pattern.

### Forward Intelligence from S01 → S02

- S01 proved `hermes_local` adapter registry preflight blocks on missing Xiaomi credentials. S03 must treat Xiaomi as a required resource and document the exact blocker.
- S02 proved the preflight auth gate pattern works cleanly: one health check, then blocked. S03 should reuse the same gate.
- Both S01 and S02 updated the capability matrix append-only without promotions. S03 must follow the same discipline.

## Sources

- S01 probe pattern: `scripts/run_m005_s01_hermes_xiaomi_probe.py`, `scripts/validate_m005_s01_hermes_xiaomi_probe.py`
- S02 probe pattern: `scripts/run_m005_s02_company_template_probe.py`, `scripts/validate_m005_s02_company_template_probe.py`
- Capability matrix: `plugin-bos-light/capabilities.paperclip-runtime.json`
- Confirmed native surfaces: M002-S04 live artifact flow (issues, documents, comments)
- Company template config: `company-template/bos-company-template.json` (`bos_config`)
