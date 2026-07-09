---
id: T04
parent: S06
milestone: M001-bo1jcm
key_files:
  - scripts/run_a1_a10_demo.py
  - scripts/test_run_a1_a10_demo.py
  - scripts/validate_a1_a10_demo_docs.py
  - scripts/validate_company_template.py
  - scripts/test_validate_company_template.py
  - scripts/validate_runtime_capabilities.py
  - scripts/test_validate_runtime_capabilities.py
  - docs/10_A1_A10_DEMO.md
  - plugin-bos-light/src/integratedDemo.ts
  - plugin-bos-light/tests/integratedDemo.test.ts
  - plugin-bos-light/package.json
key_decisions:
  - No files were modified because the closure verification set passed as-is.
  - Live Paperclip runtime support remains unconfirmed unless separate runtime/version/build proof is supplied.
duration: 
verification_result: passed
completed_at: 2026-05-28T06:41:20.622Z
blocker_discovered: false
---

# T04: Ran the full S06 A1-A10 closure verification set and confirmed the baseline demo remains fixture-first with live Paperclip support unpromoted.

**Ran the full S06 A1-A10 closure verification set and confirmed the baseline demo remains fixture-first with live Paperclip support unpromoted.**

## What Happened

Executed the authoritative closure command set from the worktree with no source edits required. The A1-A10 demo runner reported all phases passed, preserved gap-ledger entries for missing live runtime evidence, and kept `native_support_confirmed: false` / runtime posture `unvalidated`. Plugin Vitest coverage, TypeScript typecheck, company-template validation, runtime-capability validation, and demo documentation validation all passed.

## Failure Modes (Q5)
- External dependencies exercised by this closure are local filesystem reads, local Python subprocesses, local npm/Vitest/tsc subprocesses, and optional Paperclip runtime evidence inputs. There were no network calls or long-running services.
- Filesystem/subprocess failure path is fail-closed through non-zero validator/test/typecheck exits; the demo envelope includes command labels, A-step phase labels, exit codes, bounded stdout/stderr digests, and a `failures` list for phase-level diagnosis.
- Optional live Paperclip runtime absence is handled as an explicit posture, not success promotion: `paperclip_path.availability` was `not-provided`, `paperclip_probe.status` was `honest-unvalidated`, and gap-ledger entries recorded missing runtime evidence and fixture-only native support.
- Malformed live-runtime proof remains guarded by runtime capability validator negative tests that require concrete version/build proof before confirmed support.

## Load Profile (Q6)
- Closure has no production runtime load dimension; it runs bounded local validators and tests against fixture data.
- At 10x local invocation volume, the first saturated resource would be CPU/process startup from repeated Python, Vitest, and TypeScript subprocesses. Protection is operational rather than runtime-facing: commands are deterministic, finite, non-networked, and fail fast on the first closure error in the chained verification command.

## Negative Tests (Q7)
- `scripts/test_validate_company_template.py` covers malformed routes, missing agent profiles, missing required division fields, org-chart compatibility gaps, exact seven-division boundaries, and valid fixtures.
- `scripts/test_validate_runtime_capabilities.py` covers missing manifest coverage, missing matrix keys, malformed JSON, unsupported statuses without fallback/blocker, forbidden plugin-owned approval wording, and attempts to mark runtime support confirmed without version/build/proof evidence.
- `npm --prefix plugin-bos-light test` covered plugin acceptance paths, blueprint artifact failures, Eval Gate evidence, Circuit Breaker flow/recovery, and integrated demo fixture behavior, including warning/failure visibility surfaces.
- `scripts/validate_a1_a10_demo_docs.py` passed, confirming the runbook retains command, A-step map, fixture-boundary, references, proof-boundary, and gap-ledger documentation required for future agents.

## Verification

Ran the full closure command exactly as specified via gsd_exec: `python3 scripts/run_a1_a10_demo.py && python3 scripts/test_validate_company_template.py && npm --prefix plugin-bos-light test && npm --prefix plugin-bos-light run typecheck && python3 scripts/test_validate_runtime_capabilities.py && python3 scripts/validate_runtime_capabilities.py && python3 scripts/validate_a1_a10_demo_docs.py`. It exited 0 in 4258 ms. Evidence persisted at `.gsd/exec/08aaebaa-2da2-452d-9794-3d7bf6c54571.stdout` and `.gsd/exec/08aaebaa-2da2-452d-9794-3d7bf6c54571.stderr`. Key observed results: A1-A10 demo status `passed`, no failures, runtime capability posture `unvalidated`, `native_support_confirmed: false`, plugin tests 7 files / 63 tests passed, TypeScript `tsc --noEmit` passed, runtime capability validator passed, and A1-A10 docs validator passed.

## Verification Evidence

| # | Command | Exit Code | Verdict | Duration |
|---|---------|-----------|---------|----------|
| 1 | `python3 scripts/run_a1_a10_demo.py && python3 scripts/test_validate_company_template.py && npm --prefix plugin-bos-light test && npm --prefix plugin-bos-light run typecheck && python3 scripts/test_validate_runtime_capabilities.py && python3 scripts/validate_runtime_capabilities.py && python3 scripts/validate_a1_a10_demo_docs.py` | 0 | ✅ pass | 4258ms |

## Deviations

None.

## Known Issues

No new issues discovered. Live Paperclip runtime evidence remains intentionally unprovided/unvalidated and is recorded as a runtime gap rather than promoted support.

## Files Created/Modified

- `scripts/run_a1_a10_demo.py`
- `scripts/test_run_a1_a10_demo.py`
- `scripts/validate_a1_a10_demo_docs.py`
- `scripts/validate_company_template.py`
- `scripts/test_validate_company_template.py`
- `scripts/validate_runtime_capabilities.py`
- `scripts/test_validate_runtime_capabilities.py`
- `docs/10_A1_A10_DEMO.md`
- `plugin-bos-light/src/integratedDemo.ts`
- `plugin-bos-light/tests/integratedDemo.test.ts`
- `plugin-bos-light/package.json`
