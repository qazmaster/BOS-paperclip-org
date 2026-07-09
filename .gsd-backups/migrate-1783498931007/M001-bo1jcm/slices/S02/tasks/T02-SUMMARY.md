---
id: T02
parent: S02
milestone: M001-bo1jcm
key_files:
  - scripts/probe_paperclip_runtime.py
  - scripts/test_probe_paperclip_runtime.py
  - scripts/import-company-template.sh
key_decisions:
  - Local Paperclip metadata/spec inspection remains informational and never promotes capabilities to `confirmed`; live runtime behavior evidence is still required.
  - Missing or malformed Paperclip runtime paths are represented as unvalidated health posture instead of failing the probe or simulating support.
duration: 
verification_result: passed
completed_at: 2026-05-28T03:28:24.008Z
blocker_discovered: false
---

# T02: Added a no-runtime-safe Paperclip runtime probe that emits conservative capability health JSON and updated the import helper to validate/probe instead of implying an import.

**Added a no-runtime-safe Paperclip runtime probe that emits conservative capability health JSON and updated the import helper to validate/probe instead of implying an import.**

## What Happened

Implemented `scripts/probe_paperclip_runtime.py` as a standard-library command that validates the local BOS Light company template contract, loads the runtime capability matrix, and emits a structured Paperclip health report. In no-runtime mode it exits 0 while explicitly reporting `paperclip.availability=not-provided`, `paperclip.status=unvalidated`, no external processes spawned, and only unvalidated/fallback/unsupported capability statuses. With `--paperclip-dir`, it performs bounded inspection of known metadata/spec locations only; it does not recursively scan, start Paperclip, shell out, or convert local metadata/spec evidence into confirmed runtime capability support. Metadata output is filtered and redacted before serialization.

Updated `scripts/import-company-template.sh` so it is now a draft safety helper: it warns that no Paperclip import is performed, preserves the C4/C5 draft warning, runs the local company template validator, then runs the runtime probe with or without an optional Paperclip directory.

Added `scripts/test_probe_paperclip_runtime.py` with temporary-directory fixtures for no-runtime posture, missing Paperclip path posture, empty path handling, directory-with-no-spec-files posture, malformed JSON metadata, and redaction of secret-like metadata values.

## Failure Modes (Q5)
External dependencies are limited to local filesystem reads and in-process Python module loading. Missing `--paperclip-dir`, missing path, not-a-directory path, no known spec files, oversized/unreadable/undecodable files, and malformed JSON are represented as structured unvalidated or malformed evidence rather than runtime success. No network, subprocess, or runtime process is invoked by the probe, so timeout/connection-loss paths are not applicable.

## Load Profile (Q6)
The load dimension is local filesystem metadata/spec inspection. The first saturating resource at 10x expected Paperclip checkout size would be file I/O if recursive scans were allowed; the probe protects against this by inspecting only fixed known relative paths and capping each inspected file at 64 KiB. No pooling/rate limiting is needed because there are no external calls or long-running processes.

## Negative Tests (Q7)
`scripts/test_probe_paperclip_runtime.py` covers no runtime supplied, missing Paperclip path, empty Paperclip path, path with no spec files, malformed JSON metadata, and secret-like metadata redaction. These tests assert exit-0 honest posture, unvalidated status rather than simulated success, malformed evidence reporting, and absence of raw secret-like values in serialized output.

## Verification

Verified the required probe test suite passes. Verified direct no-runtime execution reports `availability=not-provided`, `status=unvalidated`, zero spawned external processes, a valid local company template contract, and no confirmed capability statuses. Verified the import helper prints draft/no-import warnings, runs validation/probe, and no longer includes the old TODO/import-wrapper wording. Ran the existing runtime capability matrix validator as adjacent slice-level guardrail evidence.

## Verification Evidence

| # | Command | Exit Code | Verdict | Duration |
|---|---------|-----------|---------|----------|
| 1 | `python3 scripts/test_probe_paperclip_runtime.py
python3 scripts/probe_paperclip_runtime.py > /tmp/paperclip-probe-no-runtime-final.json
python3 - <<'PY'
import json
from pathlib import Path
report = json.loads(Path('/tmp/paperclip-probe-no-runtime-final.json').read_text())
assert report['posture']['exit_code'] == 0
assert report['posture']['external_processes_spawned'] == 0
assert report['paperclip']['availability'] == 'not-provided'
assert report['paperclip']['status'] == 'unvalidated'
assert report['local_contract']['company_template']['status'] == 'local-contract-valid'
statuses = {entry['status'] for entry in report['capabilities']}
assert statuses <= {'unvalidated', 'fallback-only', 'unsupported'}
print('post-cleanup verification OK')
PY` | 0 | ✅ pass | 196ms |
| 2 | `bash scripts/import-company-template.sh > /tmp/import-company-template-final.txt
python3 - <<'PY'
from pathlib import Path
text = Path('/tmp/import-company-template-final.txt').read_text()
assert 'DRAFT WARNING' in text
assert 'No Paperclip import was attempted' in text
assert 'TODO: map company-template' not in text
assert 'Company template OK' in text
assert '"availability": "not-provided"' in text
print('post-cleanup import helper dry-run OK')
PY` | 0 | ✅ pass | 126ms |
| 3 | `python3 scripts/validate_runtime_capabilities.py` | 0 | ✅ pass | 56ms |

## Deviations

None.

## Known Issues

None.

## Files Created/Modified

- `scripts/probe_paperclip_runtime.py`
- `scripts/test_probe_paperclip_runtime.py`
- `scripts/import-company-template.sh`
