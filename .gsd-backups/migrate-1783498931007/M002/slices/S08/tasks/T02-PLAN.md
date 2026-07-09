---
estimated_steps: 1
estimated_files: 1
skills_used: []
---

# T02: Execution path decision packet

Prepare a decision packet comparing three paths: fix `hermes_local` secret materialization through supported secret refs, register `gsdpi_local` through a supported external-adapter mechanism, or implement/register `codex_local` using Codex CLI as a supported adapter boundary. Include tradeoffs, proof required, security risks, and exact human approval required before any mutation or provider execution. Stop after presenting the packet if no path is approved.

## Inputs

- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/runtime-evidence/M002-S08-provider-adapter-feasibility.json`

## Expected Output

- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/runtime-evidence/M002-S08-execution-path-decision-packet.json`

## Verification

python3 -m json.tool runtime-evidence/M002-S08-execution-path-decision-packet.json >/dev/null && python3 - <<'PY'
import json
p='runtime-evidence/M002-S08-execution-path-decision-packet.json'
d=json.load(open(p))
assert d.get('approval_required') is True
assert d.get('mutation_attempted') is False
assert d.get('provider_execution_attempted') is False
PY

## Observability Impact

Persists approval_required=true, selected_path=null until human decision, mutation_attempted=false, and provider_execution_attempted=false.
