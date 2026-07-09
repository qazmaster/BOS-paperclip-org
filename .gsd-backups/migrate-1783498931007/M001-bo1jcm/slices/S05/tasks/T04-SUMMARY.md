---
id: T04
parent: S05
milestone: M001-bo1jcm
key_files:
  - plugin-bos-light/manifest.paperclip-plugin.json
  - plugin-bos-light/capabilities.paperclip-runtime.json
  - scripts/test_validate_runtime_capabilities.py
  - docs/04_DATA_CONTRACTS.md
  - docs/05_PERSISTENCE_MATRIX.md
  - docs/06_ACCEPTANCE_TESTS.md
  - docs/08_RUNTIME_CAPABILITY_HEALTH.md
  - docs/09_BACKLOG.md
key_decisions:
  - Kept all new explicit S05 tools under `registration.tools` as requested/unvalidated surfaces rather than host-confirmed capabilities.
  - Documented Eval Gate and Circuit Breaker evidence envelopes as bounded inspection surfaces with cache-overlay, native/comment, activity, polling, and markdown-only diagnostics instead of hidden plugin state.
  - Marked load profile as omitted for this doc/validator task while preserving bounded future polling posture in S05 docs.
duration: 
verification_result: passed
completed_at: 2026-05-28T05:50:37.182Z
blocker_discovered: false
---

# T04: Aligned S05 manifest, runtime capability matrix, validator fixtures, and docs around Eval Gate evidence and Circuit Breaker observation envelopes without promoting unproven Paperclip surfaces.

**Aligned S05 manifest, runtime capability matrix, validator fixtures, and docs around Eval Gate evidence and Circuit Breaker observation envelopes without promoting unproven Paperclip surfaces.**

## What Happened

Updated the draft Paperclip manifest to include the explicit worker tools `piko:bpi-blueprint-artifact`, `piko:eval-gate-evidence`, and `piko:circuit-breaker-observe` alongside the existing piko tools. Updated `registration.tools` in the runtime capability matrix so the new S05 tools are represented as requested surfaces while preserving `status: unvalidated` and explicitly stating that optional worker registration, native comments/issues, activity logging, and runtime events remain unproven.

Updated validator fixtures so manifest tool coverage includes the expanded tool list, and strengthened the manifest drift negative test to assert that missing `piko:eval-gate-evidence` and `piko:circuit-breaker-observe` are rejected.

Updated `docs/04_DATA_CONTRACTS.md` with `EvalGateEvidenceEnvelope` and `CircuitBreakerEvidenceEnvelope` shapes, including selected surface, artifact/escalation refs, cache-overlay diagnostics, polling config, transition state, attempts, failure reason, activity status, fallback diagnostics, and timestamps. Updated `docs/05_PERSISTENCE_MATRIX.md` with cache-overlay-only, native comment/issue, activity, polling, and markdown-only semantics for A6-A10. Updated `docs/06_ACCEPTANCE_TESTS.md` with S05 acceptance and negative coverage. Updated `docs/08_RUNTIME_CAPABILITY_HEALTH.md` with S05 posture, tool list, envelope inspection guidance, and known blockers. Updated `docs/09_BACKLOG.md` with follow-up proof and observability tasks for live tool registration, native comments/issues, activity visibility, and event delivery.

## Failure Modes (Q5)
Dependency: runtime capability validator and validator fixtures. On malformed JSON, unsupported status fields, missing manifest coverage, placeholder proof text, confirmed claims without live version/build proof, missing fallback/blocker text, missing health sections, or forbidden overclaim wording, `scripts/test_validate_runtime_capabilities.py` and `scripts/validate_runtime_capabilities.py` fail with file/context-specific diagnostics. Verified by the negative fixture suite and final validator run.
Dependency: project filesystem/source docs. On missing files or unreadable/malformed JSON, the validator reports missing required JSON/source files or malformed JSON and exits non-zero. Verified by existing negative fixture coverage for malformed matrix JSON and source/matrix drift.
Dependency: live Paperclip runtime. This task deliberately does not call a live runtime; all docs preserve fallback-only/unvalidated wording and require future version/build, registration, invocation, native artifact, activity, and event proof before any support is marked confirmed.

## Load Profile (Q6)
Omitted: this documentation/validator drift task has no runtime load dimension. The only executable path is small local validator/test file inspection, not a production request path. S05 runtime envelopes still document bounded polling posture (`ACTIVE_RUNS_ONLY`, 30000ms interval, 5000ms jitter, backoff after 10 attempts, max 3 retries) to avoid unbounded future polling claims.

## Negative Tests (Q7)
Validator negative coverage now protects manifest tool drift for S05 tools, manifest UI drift, malformed JSON, missing capability keys, missing manifest capability coverage, unsupported statuses without fallback/blocker text, confirmed capabilities without proof fields, placeholder/future proof text, confirmed claims without version/build evidence, runtimeCapabilities source drift, forbidden plugin-owned approval wording, and missing health-report sections/capability summaries. Acceptance documentation also lists S05 runtime negative surfaces: invalid Eval Gate input, missing/malformed/failing comment adapter, cache save failure, invalid Circuit Breaker input, missing failure reason, missing/failed/malformed cache reads, cache save failure, escalation issue failure/malformed response, missing/failing comment fallback, activity log failure, absent worker registration surfaces, and overclaim wording.

## Verification

Ran the required validator suite: `python3 scripts/test_validate_runtime_capabilities.py && python3 scripts/validate_runtime_capabilities.py` passed with 12 unittest cases and the runtime capability validator reporting OK. Also ran a deterministic documentation alignment check confirming all updated manifest/matrix/docs/backlog files contain the required S05 tool and envelope posture strings.

## Verification Evidence

| # | Command | Exit Code | Verdict | Duration |
|---|---------|-----------|---------|----------|
| 1 | `python3 scripts/test_validate_runtime_capabilities.py && python3 scripts/validate_runtime_capabilities.py` | 0 | ✅ pass — 12 unittest cases OK and runtime capability validator OK | 227ms |
| 2 | `python3 - <<'PY'
from pathlib import Path
checks={...}
...
PY` | 0 | ✅ pass — required S05 manifest/matrix/docs/backlog strings present | 38ms |

## Deviations

None.

## Known Issues

No live Paperclip runtime evidence was collected or claimed; registration.tools, comments.native, issues.native, activity.logging, events.issue_lifecycle, and events.terminal_runs retain their existing unvalidated/fallback-only posture pending future runtime proof.

## Files Created/Modified

- `plugin-bos-light/manifest.paperclip-plugin.json`
- `plugin-bos-light/capabilities.paperclip-runtime.json`
- `scripts/test_validate_runtime_capabilities.py`
- `docs/04_DATA_CONTRACTS.md`
- `docs/05_PERSISTENCE_MATRIX.md`
- `docs/06_ACCEPTANCE_TESTS.md`
- `docs/08_RUNTIME_CAPABILITY_HEALTH.md`
- `docs/09_BACKLOG.md`
