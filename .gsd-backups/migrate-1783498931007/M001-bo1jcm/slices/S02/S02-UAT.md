# S02: Runtime Capability Adapter Health — UAT

**Milestone:** M001-bo1jcm
**Written:** 2026-05-28T03:55:53.960Z

# S02 UAT: Runtime Capability Adapter Health

## UAT Type
Repository-local contract and operational-readiness verification. No live Paperclip runtime or human UI is required for this slice.

## Preconditions
- Work from the repository root for milestone `M001-bo1jcm`.
- No Paperclip runtime path is required; absence of runtime evidence must be treated as an explicit unvalidated posture, not as failure or simulated support.
- Python 3 is available.

## Steps
1. Run `python3 scripts/test_validate_runtime_capabilities.py`.
2. Run `python3 scripts/test_probe_paperclip_runtime.py`.
3. Run `python3 scripts/validate_runtime_capabilities.py`.
4. Run `python3 scripts/probe_paperclip_runtime.py` with no `--paperclip-dir` and inspect the JSON posture.
5. Run `python3 scripts/validate_company_template.py` and `python3 scripts/test_validate_company_template.py` to ensure S01 A1 local proof remains intact.
6. Review `docs/08_RUNTIME_CAPABILITY_HEALTH.md`, `docs/05_PERSISTENCE_MATRIX.md`, and `docs/07_RISKS_AND_SPIKES.md` for downstream guidance.

## Expected Outcomes
- Validator tests pass and prove negative cases for malformed JSON, missing coverage, unsupported statuses without fallback/blocker, confirmed statuses without proof, confirmed statuses with placeholder/future proof text, and confirmed statuses missing runtime version/build evidence.
- Runtime probe tests pass and prove no-runtime, missing-path, malformed metadata, and secret-redaction behavior.
- `scripts/validate_runtime_capabilities.py` exits 0 and reports that manifest surfaces, adapter assumptions, and guardrail fields are mapped.
- No-runtime probe exits 0 with `paperclip.availability=not-provided`, `paperclip.status=unvalidated`, `posture.external_processes_spawned=0`, and no `confirmed` capability statuses.
- S01 company-template validation still passes for seven divisions, seven AGENTS profiles, org chart, routing, rituals, and agents README compatibility.
- Docs preserve Paperclip as system of record, plugin state as cache/overlay, native approvals/requests as Paperclip-owned, and polling/activity fallback for missing event support.

## Edge Cases
- If a matrix entry is promoted to `confirmed` without runtime version/build and proof evidence, validation must fail.
- If a matrix entry is promoted to `confirmed` using placeholder, fixture, future, or local-only proof wording, validation must fail.
- If manifest tools, UI slots, or requested capabilities drift without matrix coverage, validation must fail.
- If a supplied Paperclip directory is missing, empty, malformed, or has no known spec files, the probe must report unvalidated/malformed evidence rather than claim support.
- If metadata includes token/secret-like values, probe output must redact them.

## Operational Readiness
Health signal: the full S02 verification command exits 0 and the no-runtime probe reports an honest unvalidated posture with zero external processes. Failure signal: validator/probe non-zero exit, unredacted secrets, manifest/source/report drift, or any unsupported/confirmed support claim without required fallback/blocker/proof/version/build evidence. Recovery: correct the matrix/report/source boundary, keep unproven surfaces unvalidated/fallback-only, rerun the full verification command, and only move a surface to confirmed with live Paperclip runtime evidence.
