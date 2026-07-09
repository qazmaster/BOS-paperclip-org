---
id: T02
parent: S06
milestone: M001-bo1jcm
key_files:
  - scripts/run_a1_a10_demo.py
  - scripts/test_run_a1_a10_demo.py
key_decisions:
  - The repository demo runner treats optional local Paperclip runtime evidence as an unvalidated posture/gap-ledger input and keeps native runtime support unconfirmed unless separate live evidence is proven.
duration: 
verification_result: passed
completed_at: 2026-05-28T06:50:43.728Z
blocker_discovered: false
---

# T02: Added a standard-library A1-A10 demo runner that composes local validators, the no-runtime-safe Paperclip probe, the integrated fixture report, and the T01 Vitest demo into one truthful JSON evidence envelope.

**Added a standard-library A1-A10 demo runner that composes local validators, the no-runtime-safe Paperclip probe, the integrated fixture report, and the T01 Vitest demo into one truthful JSON evidence envelope.**

## What Happened

Implemented `scripts/run_a1_a10_demo.py` as a repository-level executable demo command. The runner validates the seed JSON before orchestration, runs the A1 company-template validator, runs the runtime capability validator, runs the Paperclip runtime probe with no-runtime-safe default behavior and optional `--runtime-evidence` path support, invokes the T01 integrated fixture helper through local `vite-node` to obtain the A3-A10 report, and runs the integrated Vitest test file as the executable regression surface. The emitted JSON includes A1-A10 phase statuses, command labels, command exit codes, bounded stdout/stderr digests, evidence paths, selected surfaces/artifact refs/cache-overlay/fallback fields from the integrated report, runtime capability posture, and a top-level gap ledger. Optional missing or malformed runtime evidence paths remain unvalidated gap-ledger entries and never promote native support.

Added `scripts/test_run_a1_a10_demo.py` with unittest coverage around command assembly, output shape, non-zero subprocess failure reporting, timeout diagnostics, missing seed file handling, malformed seed JSON handling, and optional runtime path missing/not-a-directory behavior. The tests use an injected fake runner for failure-path determinism and inline/temp fixtures rather than ignored local artifacts.

Debugging note: the first unittest run exposed that dataclass-decorated modules imported via `importlib.util.module_from_spec` must be registered in `sys.modules` before `exec_module`; the test harness was patched accordingly.

## Verification

Ran the required unittest suite with `python3 scripts/test_run_a1_a10_demo.py`; all 6 tests passed. Ran the real `python3 scripts/run_a1_a10_demo.py` command and parsed its JSON output; it reported overall `passed`, all command statuses passed, all A1-A10 phase statuses passed, `gap_count` 3, and `native_support_confirmed` false.

## Verification Evidence

| # | Command | Exit Code | Verdict | Duration |
|---|---------|-----------|---------|----------|
| 1 | `python3 scripts/test_run_a1_a10_demo.py` | 0 | ✅ pass | 223ms |
| 2 | `python3 scripts/run_a1_a10_demo.py > /tmp/a1_a10_demo_report.json; python3 - <<'PY'
import json
from pathlib import Path
p=Path('/tmp/a1_a10_demo_report.json')
report=json.loads(p.read_text())
print('status', report['status'])
print('commands', [(c['label'], c['status'], c['exit_code']) for c in report['commands']])
print('phases', {k:v['status'] for k,v in report['phases'].items()})
print('gap_count', len(report['gap_ledger']))
print('native_support_confirmed', report['runtime_capability_posture']['native_support_confirmed'])
PY` | 0 | ✅ pass | 2175ms |

## Deviations

None.

## Known Issues

None.

## Files Created/Modified

- `scripts/run_a1_a10_demo.py`
- `scripts/test_run_a1_a10_demo.py`
