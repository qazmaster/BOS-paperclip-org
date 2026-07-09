---
estimated_steps: 7
estimated_files: 3
skills_used: []
---

# T02: Add repository demo runner

Task plan metadata: estimated_steps: 7; estimated_files: 2; skills_used: [tdd, verify-before-complete, error-handling-patterns].

Why: The repo currently has seed data and tests but no single command that demonstrates the A1-A10 baseline. This task provides the executable closure surface for S06.

Do: Add scripts/run_a1_a10_demo.py as a standard-library runner that executes the A1 company-template validator, runtime capability validator, optional no-runtime-safe probe, and the integrated Vitest demo from T01. The runner should emit a JSON summary to stdout with phases A1-A10, command statuses, evidence paths, runtime capability posture, and gap ledger entries. Support fixture-only default mode and an optional local runtime evidence path argument, but do not require secrets or a live Paperclip runtime. Add scripts/test_run_a1_a10_demo.py with unittest coverage for command assembly, failure reporting, malformed seed/runtime path handling, and report shape.

Failure Modes Q5: On command non-zero exit, record phase, command label, exit code, and bounded output digest. On timeout, record timeout diagnostics and fail the demo. On malformed optional runtime evidence, keep capability status unvalidated and add a gap ledger item.

Load Profile Q6: The runner starts short-lived local subprocesses only. 10x seed size primarily affects Vitest fixture runtime; no background servers, network calls, or persistent processes should be started.

Negative Tests Q7: Cover missing seed file, malformed seed JSON, validator command failure via injected fake runner, and optional runtime path missing/malformed without promoting support.

Done when: python3 scripts/run_a1_a10_demo.py provides one truthful machine-readable baseline and the unittest suite proves failure paths are observable.

## Inputs

- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/scripts/validate_company_template.py`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/scripts/validate_runtime_capabilities.py`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/scripts/probe_paperclip_runtime.py`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/scripts/demo-seed-issues.json`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/plugin-bos-light/src/integratedDemo.ts`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/plugin-bos-light/tests/integratedDemo.test.ts`

## Expected Output

- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/scripts/run_a1_a10_demo.py`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/scripts/test_run_a1_a10_demo.py`

## Verification

python3 scripts/test_run_a1_a10_demo.py

## Observability Impact

Adds a single command-level evidence envelope with phase labels, command statuses, exit codes, bounded output digests, runtime posture, and explicit gap ledger entries.
