---
id: T04
parent: S04
milestone: M001-bo1jcm
key_files:
  - docs/04_DATA_CONTRACTS.md
  - docs/05_PERSISTENCE_MATRIX.md
  - docs/06_ACCEPTANCE_TESTS.md
  - docs/08_RUNTIME_CAPABILITY_HEALTH.md
  - docs/09_BACKLOG.md
key_decisions:
  - No capability was promoted to confirmed; S04 docs describe fixture-level proof only and keep native approval truth Paperclip-owned.
duration: 
verification_result: passed
completed_at: 2026-05-28T05:12:44.743Z
blocker_discovered: false
---

# T04: Aligned S04 Betting Table docs with fixture-only cycle and approval envelopes, cache-overlay persistence limits, fallback diagnostics, and live-runtime follow-ups.

**Aligned S04 Betting Table docs with fixture-only cycle and approval envelopes, cache-overlay persistence limits, fallback diagnostics, and live-runtime follow-ups.**

## What Happened

Updated the long-lived documentation for S04 without changing runtime code or capability status. `docs/04_DATA_CONTRACTS.md` now names the Betting cycle cache-overlay envelope, Betting cycle result, approval request fallback diagnostics, approval request envelope, and approval request result. It also spells out cache-only durability, approval surface references, and the rule that only validated native approval responses may mutate selected rows.

`docs/05_PERSISTENCE_MATRIX.md` now marks Betting Table persistence as cache-overlay-only for worker hydration and separates Paperclip-owned native approval truth from comment/markdown diagnostic fallbacks. `docs/06_ACCEPTANCE_TESTS.md` now describes the fixture proof for A4/A5, including BPI ranking, opaque S03 `blueprint_id` pass-through, worker hydration diagnostics, adapter-seam approval, and fallback/error negative coverage. `docs/08_RUNTIME_CAPABILITY_HEALTH.md` keeps approvals/data/actions/UI/entities/config/state unvalidated or fallback-only, adds S04 inspection surfaces, and records that dashboard hydration, native approval create/read, and fallback-rate observability remain S06/live-runtime work. `docs/09_BACKLOG.md` now carries those live-runtime follow-ups explicitly.

## Failure Modes (Q5)

- Filesystem/doc dependencies: edits depend on the target docs existing and matching expected structure. I read each target doc before editing, used exact-text edits, then cold-read the changed sections; any missing file or mismatched section would have failed the edit/read path instead of silently rewriting unrelated text.
- Subprocess dependencies: verification depends on `npm`, Vitest, TypeScript, and Python validator subprocesses. The completion gate used a single `set -o pipefail` command so any nonzero exit would block completion.
- Runtime/Paperclip dependency: this docs task intentionally made no live Paperclip calls. The docs now state that dashboard/data/action/UI/native approval/native artifact/state/entity/config capabilities remain unvalidated or fallback-only until live evidence exists.

## Load Profile (Q6)

Omitted for implementation: this was a documentation-only task with no new runtime code path or runtime load-bearing resource. The docs nonetheless added a backlog follow-up for fallback-rate observability before live Betting Table/approval claims.

## Negative Tests (Q7)

Existing acceptance coverage named in the docs protects S04 negative paths: missing persistence, missing cache data, cache save/load failures, empty candidates, empty issue selections, stale issue ids, missing cycles, already-decided rows, malformed native approval responses, native adapter exceptions, comment fallback exceptions, cache save failure after native approval creation, absent worker cycle id, absent worker persistence, and absent adapter seams. The runtime capability validator remains the guardrail against promoted `confirmed` claims without live Paperclip evidence.

## Verification

Ran the required closeout command after all edits: `npm --prefix plugin-bos-light test && npm --prefix plugin-bos-light run typecheck && python3 scripts/validate_runtime_capabilities.py`. Vitest reported 4 passed test files and 33 passed tests; TypeScript `tsc --noEmit` completed; the runtime capability validator reported the matrix, manifest, source boundaries, and health report are OK. Also performed a cold-read guardrail scan of the edited docs for S04 mentions and possible overclaims before final verification.

## Verification Evidence

| # | Command | Exit Code | Verdict | Duration |
|---|---------|-----------|---------|----------|
| 1 | `npm --prefix plugin-bos-light test && npm --prefix plugin-bos-light run typecheck && python3 scripts/validate_runtime_capabilities.py` | 0 | ✅ pass | 3307ms |

## Deviations

None.

## Known Issues

Live Paperclip runtime support remains unproven by design; dashboard hydration, native approval create/read, and fallback-rate observability are backlog/S06 follow-ups.

## Files Created/Modified

- `docs/04_DATA_CONTRACTS.md`
- `docs/05_PERSISTENCE_MATRIX.md`
- `docs/06_ACCEPTANCE_TESTS.md`
- `docs/08_RUNTIME_CAPABILITY_HEALTH.md`
- `docs/09_BACKLOG.md`
