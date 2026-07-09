---
id: T01
parent: S06
milestone: M002
key_files:
  - scripts/validate_m002_closeout.py
  - scripts/test_validate_m002_closeout.py
key_decisions:
  - Keep the closeout validator standard-library-only and repository-local, with explicit source roots to avoid scanning ignored artifacts or test fixtures.
  - Derive and enforce the current conservative M002 status counts rather than trusting prose-only closeout claims.
duration: 
verification_result: passed
completed_at: 2026-05-29T12:25:50.823Z
blocker_discovered: false
---

# T01: Added a standard-library M002 closeout validator and fixture tests that fail closed on capability overclaims, missing gap/no-core sections, secret-looking text, malformed evidence, stale S05 proof, and forbidden Paperclip boundary patterns.

**Added a standard-library M002 closeout validator and fixture tests that fail closed on capability overclaims, missing gap/no-core sections, secret-looking text, malformed evidence, stale S05 proof, and forbidden Paperclip boundary patterns.**

## What Happened

Implemented `scripts/validate_m002_closeout.py` as a deterministic repository-local gate over the runtime capability matrix, canonical S04/S05 evidence JSON, `docs/08_RUNTIME_CAPABILITY_HEALTH.md`, `PAPERCLIP_LIVE_VALIDATION_REPORT.md`, `plugin-bos-light/src/runtimeCapabilities.ts`, and supported BOS Light source roots (`plugin-bos-light/src`, `adapters/gsdpi-local/src`). The validator derives conservative status counts, checks that only S04 issue/document/comment surfaces are confirmed under current evidence, prevents S05 plugin/UI confirmations without live S05 readback proof, verifies report headings for no-core-modification and remaining gap ledgers, requires the S02 Hermes execution-time secret-materialization/resultJson.bos blocker, scans for secret-looking material without dumping values, and reports forbidden Paperclip core/private imports, direct DB mutation, monkey patches, and fallback native-approval side-effect claims by file/pattern.

Added `scripts/test_validate_m002_closeout.py` with tempdir fixture tests covering the happy path and requested failure cases. During verification, two self-review fixes were made: the S02/Hermes blocker check was tightened so unrelated Hermes text cannot satisfy it, and the private-import regex was narrowed so local adapter `./server/...` modules are not falsely reported as Paperclip private/server imports.

## Failure Modes
- Filesystem dependencies: missing JSON/text files and unreadable files fail closed with the relative path and context (`file`, field, or section). Fixture tests cover missing/malformed JSON behavior through malformed S04 evidence.
- JSON dependencies: malformed matrix/evidence JSON fails closed with exact path plus line/column from `json.JSONDecodeError`; `test_malformed_evidence_json_reports_path_and_json_context` verifies this.
- Evidence shape dependencies: missing S04 runtime/version/build/readback/side-effect fields and stale S05 plugin/UI readback fields produce field-local errors such as `runtime.version`, `readbacks.document`, or `surfaces.dashboard_widgets.readback_proof`.
- Report dependencies: missing headings/ledger text fail with the missing heading or ledger context; tests cover missing remaining gap ledger, no-core audit, and S02 Hermes blocker wording.
- Source-scan dependencies: forbidden boundary patterns report only file path and pattern label, not source snippets or secrets; secret-looking values report `value redacted`.
- Network/API/subprocess dependencies: omitted for runtime behavior because this validator is intentionally offline and standard-library only; it reads local files and does not call Paperclip, spawn subprocesses, or use network APIs.

## Load Profile
- Expected load is small repository-local closeout validation over two evidence JSON files, two docs, one matrix, and TypeScript source trees. At 10x source-file count, local filesystem reads and regex scans saturate first; memory remains bounded to file contents and parsed JSON artifacts.
- Protection: scan roots are explicit (`plugin-bos-light/src`, `adapters/gsdpi-local/src`) and suffix-limited to code files, avoiding broad repository scans and ignored `.gsd` artifacts. No parallelism, polling, subprocesses, or network calls are used, so no pool/rate-limit controls are needed.

## Negative Tests
- `test_malformed_evidence_json_reports_path_and_json_context`: malformed S04 evidence JSON fails closed with path and JSON context.
- `test_overclaim_confirmed_non_s04_or_s05_surface_fails`: unrelated surface cannot be promoted to confirmed or reuse S04 proof.
- `test_missing_gap_ledger_fails`: missing remaining gap ledger is rejected.
- `test_missing_no_core_audit_fails`: missing no-core audit heading/phrases are rejected.
- `test_stale_s05_proof_cannot_confirm_plugin_ui_surface`: confirmed plugin/UI status fails when S05 evidence remains fail-closed/fallback-only with no readback.
- `test_missing_hermes_blocker_text_fails`: missing S02 Hermes execution-time blocker text is rejected.
- `test_secret_looking_text_is_reported_without_value`: secret-shaped text is detected while the value stays out of error output.
- `test_private_paperclip_import_is_forbidden`: Paperclip core/private imports are rejected.
- `test_direct_db_mutation_is_forbidden`: direct DB mutation patterns are rejected.

## Verification

Verified with the required command through `gsd_exec`: `python3 -m unittest scripts/test_validate_m002_closeout.py && python3 scripts/validate_m002_closeout.py --phase preflight` exited 0, running 10 closeout validator tests and then validating the current repository preflight. Also ran `python3 scripts/validate_runtime_capabilities.py` to confirm the existing runtime capability validator still passes with the new closeout gate.

## Verification Evidence

| # | Command | Exit Code | Verdict | Duration |
|---|---------|-----------|---------|----------|
| 1 | `python3 -m unittest scripts/test_validate_m002_closeout.py && python3 scripts/validate_m002_closeout.py --phase preflight` | 0 | ✅ pass | 215ms |
| 2 | `python3 scripts/validate_runtime_capabilities.py` | 0 | ✅ pass | 60ms |

## Deviations

None.

## Known Issues

None.

## Files Created/Modified

- `scripts/validate_m002_closeout.py`
- `scripts/test_validate_m002_closeout.py`
