---
id: T01
parent: S02
milestone: M001-bo1jcm
key_files:
  - plugin-bos-light/capabilities.paperclip-runtime.json
  - scripts/validate_runtime_capabilities.py
  - scripts/test_validate_runtime_capabilities.py
key_decisions:
  - Unproven Paperclip runtime surfaces stay `unvalidated` or `fallback-only`; `confirmed` requires explicit proof_command or runtime_evidence_field evidence.
duration: 
verification_result: passed
completed_at: 2026-05-28T03:21:47.372Z
blocker_discovered: false
---

# T01: Added a Paperclip runtime capability matrix plus standard-library validation tests that keep unproven BOS Light runtime surfaces unvalidated or fallback-only.

**Added a Paperclip runtime capability matrix plus standard-library validation tests that keep unproven BOS Light runtime surfaces unvalidated or fallback-only.**

## What Happened

Created `plugin-bos-light/capabilities.paperclip-runtime.json` as the source-of-truth runtime health contract for BOS Light. The matrix covers C4/C5/C6/C7 and the requested/assumed Paperclip surfaces: company import/export, AGENTS.md syntax, runtime version/build, plugin registration, tools/data/actions registration, config, issue/company state, entities, activity logging, issue and terminal-run events, native issues/documents/comments/approvals, dashboard widgets, and issue detail tabs. No capability is marked `confirmed`; unproven runtime behavior is explicitly `unvalidated` or `fallback-only` with fallback and blocker posture.

Added `scripts/validate_runtime_capabilities.py`, using only the Python standard library, to validate matrix shape, status enum use, proof/fallback guardrails, manifest capability/UI/tool coverage, and worker/adapter/persistence assumption coverage. Added `scripts/test_validate_runtime_capabilities.py` with inline fixtures and negative cases for malformed JSON, missing capability keys, manifest drift, unsupported entries without fallback/blocker, confirmed entries without proof evidence, and missing manifest UI/tool coverage.

Closeout follow-up after T01 was reopened: strengthened the `confirmed` capability guardrail so placeholder/future/local-only proof strings are rejected. A confirmed runtime surface now requires both `proof_command` and `runtime_evidence_field`, live Paperclip runtime evidence text rather than fixture/future placeholders, and explicit runtime version plus build evidence.

## Failure Modes
- Local filesystem dependency: missing or unreadable matrix, manifest, worker, adapter, or persistence files produce path-scoped validation errors and a non-zero CLI exit.
- JSON dependency: malformed matrix or manifest JSON fails with file path, line, column, and parser message.
- Manifest drift dependency: added or changed `capabilities_requested`, `tools`, `ui.dashboard_widgets`, or `ui.issue_detail_tabs` fail unless represented in the matrix.
- Source assumption drift dependency: worker/adapter/persistence tokens such as `ctx.tools?.register`, `ctx.approvals?.create`, `createIssueDocument`, and `InMemoryBOSPersistence` are checked against expected capability keys.
- Evidence overclaim dependency: `confirmed` without live proof evidence, runtime version/build evidence, or non-placeholder `proof_command`/`runtime_evidence_field` values fails validation instead of silently implying support.
- Network/API/subprocess dependencies: none in the validator itself; it performs bounded local file reads only.

## Load Profile
The validator has a trivial local load profile: it reads one matrix JSON file, one manifest JSON file, and three small source files, then performs linear set/list checks. At 10x expected matrix or manifest size, local filesystem reads and JSON/text parsing would saturate first; no service pools, rate limits, pagination, or caching are needed.

## Negative Tests
Negative coverage lives in `scripts/test_validate_runtime_capabilities.py`: `test_malformed_json_reports_matrix_path`, `test_missing_capability_key_reports_entry_context`, `test_missing_manifest_coverage_reports_requested_capability`, `test_unsupported_status_without_fallback_or_blocker_fails`, `test_confirmed_status_without_proof_evidence_fails`, `test_confirmed_status_with_placeholder_runtime_evidence_fails`, `test_confirmed_status_requires_version_and_build_evidence`, and `test_manifest_ui_and_tools_are_required`.

## Verification

Ran the required validator test suite with `python3 scripts/test_validate_runtime_capabilities.py`; all 10 tests passed after adding closeout guardrails for placeholder confirmed evidence and missing runtime version/build evidence. Also ran `python3 scripts/validate_runtime_capabilities.py` against the actual repository matrix and manifest; it passed and reported that manifest surfaces, adapter assumptions, and guardrail fields are mapped. Closeout adversarial verification also confirmed a capability changed to `confirmed` with future/fixture proof text is rejected.

## Verification Evidence

| # | Command | Exit Code | Verdict | Duration |
|---|---------|-----------|---------|----------|
| 1 | `python3 scripts/test_validate_runtime_capabilities.py` | 0 | ✅ pass | 302ms |
| 2 | `python3 scripts/validate_runtime_capabilities.py` | 0 | ✅ pass | 302ms |
| 3 | `python3 - <<'PY' ... confirmed placeholder runtime evidence rejected ... PY` | 0 | ✅ pass | 302ms |

## Deviations

None.

## Known Issues

Live Paperclip runtime evidence remains uncollected by design; later S02 probes must populate runtime evidence before any capability can move to `confirmed`.

## Files Created/Modified

- `plugin-bos-light/capabilities.paperclip-runtime.json`
- `scripts/validate_runtime_capabilities.py`
- `scripts/test_validate_runtime_capabilities.py`
