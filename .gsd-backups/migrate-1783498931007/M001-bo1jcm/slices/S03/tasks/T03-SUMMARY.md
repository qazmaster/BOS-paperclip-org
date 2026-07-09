---
id: T03
parent: S03
milestone: M001-bo1jcm
key_files:
  - docs/04_DATA_CONTRACTS.md
  - docs/05_PERSISTENCE_MATRIX.md
  - docs/06_ACCEPTANCE_TESTS.md
  - docs/08_RUNTIME_CAPABILITY_HEALTH.md
  - docs/09_BACKLOG.md
key_decisions:
  - S04 must consume `blueprint_id` as an opaque `artifact_ref` and must not infer approval/request scope or plugin-state durability from it.
  - S03 documentation keeps native document/comment/state capabilities unvalidated unless live Paperclip runtime evidence exists.
duration: 
verification_result: passed
completed_at: 2026-05-28T04:21:05.714Z
blocker_discovered: false
---

# T03: Documented the S03 Product Blueprint artifact fallback contract and S04 `blueprint_id` handoff without promoting unvalidated Paperclip capabilities.

**Documented the S03 Product Blueprint artifact fallback contract and S04 `blueprint_id` handoff without promoting unvalidated Paperclip capabilities.**

## What Happened

Updated the data contract, persistence matrix, acceptance criteria, runtime capability health report, and backlog to describe the S03 artifact envelope. The docs now define `ProductBlueprintArtifact` fields (`artifact_id`, `artifact_ref`, `selected_surface`, `mirrored_at`, `fallback` diagnostics), cache-overlay diagnostics, and the rule that `BosStatusOverlay.blueprint_id` / `BettingTableItem.blueprint_id` carry the opaque `artifact_ref` rather than plugin-state identity.

The persistence and runtime-health docs now spell out native document preference, comment fallback, and markdown-only fallback while keeping `documents.native`, `comments.native`, and `state.issue_scoped` unvalidated/fallback-only unless live Paperclip create/read/restart evidence exists. The acceptance and backlog docs now tell S04 to consume `blueprint_id` as an opaque Product Blueprint reference and not as an approval id, cycle id, or evidence of durable plugin state.

## Failure Modes (Q5)
- External dependency: live Paperclip runtime evidence. Failure/absence path is documented as no promotion to `confirmed`; `python3 scripts/validate_runtime_capabilities.py` continues to enforce conservative claims.
- External dependency: native document/comment adapter writes in the S03 runtime path. Timeout/connection/malformed host responses are represented as adapter failures that must be surfaced through `fallback.reason`, `document_error`, `comment_error`, and markdown/comment fallback rather than claimed as native support.
- External dependency: optional cache-overlay persistence. Failure is documented as `cache_overlay` with `durability: "cache-overlay-only"`, per-field `failed` status, and diagnostic `error`; it is never durable truth.
- External dependency: filesystem/subprocess verification for this docs task. Validator/test subprocess failure bubbles through non-zero exit codes; the completed verification command passed.

## Load Profile (Q6)
This task is documentation-only and introduces no new runtime load dimension. The documented S03 runtime contract is per seeded issue and avoids unbounded scans; the first practical 10x pressure point would be repeated native document/comment/cache writes, protected by fallback diagnostics and by not making cache state the recovery source.

## Negative Tests (Q7)
Existing targeted tests cover document write failure, comment write failure, all-adapter-write failure, hard-gated BPI without adapter writes, incomplete Blueprint inputs, missing persistence, cache write failure, and absent optional worker registration surfaces. Runtime capability validation protects against negative documentation/config drift by rejecting unproven native/confirmed claims and by requiring matrix/report/source alignment.

## Verification

Ran the required runtime capability validator successfully and reran targeted plugin tests for the Product Blueprint artifact and seeded issue flow. The first targeted test invocation used an unsupported Vitest `--runInBand` option and failed before executing tests; it was corrected to a valid Vitest file-filter command, which passed 13/13 tests. Final verification passed.

## Verification Evidence

| # | Command | Exit Code | Verdict | Duration |
|---|---------|-----------|---------|----------|
| 1 | `python3 scripts/validate_runtime_capabilities.py` | 0 | ✅ pass | 213ms |
| 2 | `npm --prefix plugin-bos-light test -- tests/blueprintArtifact.test.ts tests/acceptance.test.ts` | 0 | ✅ pass | 1013ms |

## Deviations

None. The invalid preliminary Vitest command was a local CLI-option mistake and was rerun with a supported command; no task scope changed.

## Known Issues

No live Paperclip runtime proof exists, so `documents.native`, `comments.native`, `state.issue_scoped`, and related surfaces remain unvalidated/fallback-only by design.

## Files Created/Modified

- `docs/04_DATA_CONTRACTS.md`
- `docs/05_PERSISTENCE_MATRIX.md`
- `docs/06_ACCEPTANCE_TESTS.md`
- `docs/08_RUNTIME_CAPABILITY_HEALTH.md`
- `docs/09_BACKLOG.md`
