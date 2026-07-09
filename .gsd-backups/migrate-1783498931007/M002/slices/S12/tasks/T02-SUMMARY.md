---
id: T02
parent: S12
milestone: M002
key_files:
  - runtime-evidence/M002-S12-hermes-runtime-execution-proof.json
  - runtime-evidence/M002-S12-gsdpi-runtime-execution-proof.json
  - runtime-evidence/M002-S12-runtime-proof-or-rescope.json
key_decisions:
  - Did not promote fail-closed blocker evidence to runtime proof.
  - Did not synthesize approved_rescope without an explicit approval source; recorded blocked_requires_approval instead.
duration: 
verification_result: passed
completed_at: 2026-05-30T06:43:06.598Z
blocker_discovered: false
---

# T02: Attempted bounded supported Paperclip runtime smoke for Hermes and GSD-Pi and recorded an S12 blocked_requires_approval disposition without promoting blocker evidence.

**Attempted bounded supported Paperclip runtime smoke for Hermes and GSD-Pi and recorded an S12 blocked_requires_approval disposition without promoting blocker evidence.**

## What Happened

Ran exactly one planned supported-boundary smoke attempt per surface. The Hermes runner used the supported Paperclip HTTP/admin routes and wrote `runtime-evidence/M002-S12-hermes-runtime-execution-proof.json` as valid fail-closed blocker evidence: adapter registry access was denied, operator auth was absent, and testEnvironment returned unauthorized before any runtime invoke. The GSD-Pi runner used supported Paperclip HTTP/admin routes plus the local adapter package test and wrote `runtime-evidence/M002-S12-gsdpi-runtime-execution-proof.json` as valid fail-closed blocker evidence: local package tests passed, but the configured Paperclip runtime was unavailable/refused connection, auth was absent, and testEnvironment was not passing before any runtime invoke.

Because both surfaces classified as blockers, `runtime_proof` was not selected. I searched the available runtime evidence, milestone files, and docs for an explicit S12 approved-rescope source and found none. Therefore I ran the S12 resolver without `--rescope-approval`; it wrote `runtime-evidence/M002-S12-runtime-proof-or-rescope.json` with `outcome: blocked_requires_approval`, `no_promotion.blocker_evidence_promoted: false`, no Paperclip core patches, no direct DB mutation, no private imports, no shell-string execution, no unsupported paths, and redacted diagnostics. The resolver/validator returned non-zero because the artifact is intentionally not an accepted closeout (`runtime_proof` or `approved_rescope`) without proof or approval.

## Failure Modes
External dependencies were Paperclip HTTP/admin routes, operator auth/header environment, local filesystem evidence writes, local adapter package subprocess tests, and JSON validators. Auth denial, connection refusal, registry unavailability, health unavailability, failed testEnvironment, missing resultJson.bos, missing BosAdapterResult, malformed/unsupported disposition, and missing approval all fail closed: the smoke runners write blocker artifacts with redacted diagnostics, the S12 resolver refuses promotion, and the S12 validator rejects non-proof/non-approved outcomes.

## Load Profile
The runtime-load dimension is deliberately bounded rather than scaled: each surface permits at most one runtime invocation (`safety.max_runtime_invocations: 1`) and skips invocation entirely when preflight auth/registry/testEnvironment checks fail. The first saturating/external resource at 10x would be Paperclip HTTP/admin route availability/auth and adapter registry/testEnvironment access, so protection is one bounded request path per surface, short request timeouts, bounded readbacks, no retry storm, and fail-closed artifact writing.

## Negative Tests
Existing validator coverage from `scripts/test_validate_s12_runtime_proof_or_rescope.py` and S10 validator tests covers missing or malformed proof artifacts, blocked S10 evidence, missing explicit rescope approval, invalid outcomes, unsupported promotions, widened requirements/success criteria, secret-like strings, direct DB/core/private-import flags, missing resultJson.bos, missing BosAdapterResult, and malformed timestamps. Fresh negative behavior was also exercised here: the S12 validator rejected `outcome: blocked_requires_approval` with `ERROR: outcome: must be 'runtime_proof' or 'approved_rescope'`, proving the disposition cannot be accidentally treated as a passing closeout.

## Verification

Created the three expected S12 evidence files. Hermes and GSD-Pi S10 validators both exited 0, confirming the individual artifacts are valid fail-closed blocker evidence and not passing runtime proof. The corrected combined S12 validation command exited 1 with `ERROR: outcome: must be 'runtime_proof' or 'approved_rescope'`, which is the expected fail-closed result when runtime proof is blocked and no explicit approved rescope source exists. The exact task-plan command using `--artifact` was also tried and failed with CLI usage error because the local validator exposes the path flag as `--evidence`; verification was rerun with the local CLI flag.

## Verification Evidence

| # | Command | Exit Code | Verdict | Duration |
|---|---------|-----------|---------|----------|
| 1 | `python3 scripts/run_s10_hermes_runtime_smoke.py --output runtime-evidence/M002-S12-hermes-runtime-execution-proof.json` | 0 | ✅ pass - wrote valid fail-closed Hermes blocker evidence | 3686ms |
| 2 | `python3 scripts/run_s10_gsdpi_runtime_smoke.py --output runtime-evidence/M002-S12-gsdpi-runtime-execution-proof.json` | 0 | ✅ pass - wrote valid fail-closed GSD-Pi blocker evidence | 1244ms |
| 3 | `python3 scripts/build_s12_runtime_proof_or_rescope.py --hermes runtime-evidence/M002-S12-hermes-runtime-execution-proof.json --gsdpi runtime-evidence/M002-S12-gsdpi-runtime-execution-proof.json --output runtime-evidence/M002-S12-runtime-proof-or-rescope.json` | 1 | ⚠️ expected non-pass - wrote blocked_requires_approval disposition, validator rejected it as non-closeout | 98ms |
| 4 | `python3 scripts/validate_s10_runtime_execution.py --evidence runtime-evidence/M002-S12-hermes-runtime-execution-proof.json --phase hermes` | 0 | ✅ pass - valid fail-closed blocker, not runtime proof | 79ms |
| 5 | `python3 scripts/validate_s10_runtime_execution.py --evidence runtime-evidence/M002-S12-gsdpi-runtime-execution-proof.json --phase gsdpi` | 0 | ✅ pass - valid fail-closed blocker, not runtime proof | 60ms |
| 6 | `python3 scripts/validate_s12_runtime_proof_or_rescope.py --evidence runtime-evidence/M002-S12-runtime-proof-or-rescope.json` | 1 | ⚠️ expected non-pass - missing runtime_proof or explicit approved_rescope | 219ms |
| 7 | `python3 scripts/validate_s10_runtime_execution.py --evidence runtime-evidence/M002-S12-hermes-runtime-execution-proof.json --phase hermes && python3 scripts/validate_s10_runtime_execution.py --evidence runtime-evidence/M002-S12-gsdpi-runtime-execution-proof.json --phase gsdpi && python3 scripts/validate_s12_runtime_proof_or_rescope.py --evidence runtime-evidence/M002-S12-runtime-proof-or-rescope.json` | 1 | ⚠️ expected non-pass - individual artifacts valid, combined disposition rejected as blocked_requires_approval | 190ms |
| 8 | `python3 - <<'PY'
import json
from pathlib import Path
for path in ['runtime-evidence/M002-S12-hermes-runtime-execution-proof.json','runtime-evidence/M002-S12-gsdpi-runtime-execution-proof.json','runtime-evidence/M002-S12-runtime-proof-or-rescope.json']:
    p=Path(path); data=json.loads(p.read_text()); print(path, p.exists(), data.get('artifact_type'), data.get('outcome'), data.get('passing'))
PY` | 0 | ✅ pass - all three S12 evidence files exist and summarize as expected | 49ms |

## Deviations

The task plan's S12 validator flag `--artifact` does not match the local script, which accepts `--evidence`; I adapted the verification command after observing the usage error. Runtime proof was not achieved and approved rescope was not selected because no explicit approval source was present; this followed the plan's non-passing diagnostic contingency.

## Known Issues

Supported-boundary runtime proof remains blocked. Hermes needs valid Paperclip operator auth/board access for adapter registry and testEnvironment. GSD-Pi needs a reachable supported Paperclip runtime with auth and gsdpi_local registry/testEnvironment availability. No explicit approved-rescope source was available, so the combined S12 disposition is diagnostic and intentionally fails S12 closeout validation.

## Files Created/Modified

- `runtime-evidence/M002-S12-hermes-runtime-execution-proof.json`
- `runtime-evidence/M002-S12-gsdpi-runtime-execution-proof.json`
- `runtime-evidence/M002-S12-runtime-proof-or-rescope.json`
