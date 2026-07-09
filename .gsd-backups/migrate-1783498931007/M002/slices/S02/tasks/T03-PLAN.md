---
estimated_steps: 13
estimated_files: 2
skills_used: []
---

# T03: Run bounded BOS Hermes agent smoke

---
estimated_steps: 9
estimated_files: 2
skills_used:
  - agent-browser
  - api-design
  - observability
---
Why: S02 is only proven by a real Paperclip agent run using adapterType hermes_local that returns BOS-shaped resultJson evidence, not by adapter registration or local fixtures.

Do: Create one short-lived BOS smoke agent through Paperclip agent configuration using adapterType hermes_local, a BOS-2 or equivalent summarizer role profile, no terminal toolset, no approval capability, short timeout/grace settings, and a harmless prompt against the S01 sandbox issue/readback surface. Run exactly one bounded smoke task requesting resultJson.bos with schemaVersion, runId, issueId, division, role, status, optional artifacts, and nextRecommendedAgentId. Capture agent create/readback, run/readback, resultJson.bos, wake/heartbeat observations, terminal status, costs/log references if exposed, and approval diagnostics in runtime-evidence/M002-S02-hermes-smoke.json. Do not create durable business artifacts except explicitly marked sandbox evidence; do not patch Paperclip core or use direct DB writes.

Failure Modes (Q5): Adapter execution failures should record adapter_error with runId when available and leave status non-passing. Missing resultJson.bos or malformed JSON should be captured as malformed_resultJson_bos. Duplicate wake/heartbeat observations or created approvals invalidate the smoke even if Hermes returns text.

Load Profile (Q6): Exactly one agent and one smoke run; if cleanup is supported, disable/archive the test agent after readback without deleting evidence IDs.

Done-when: The smoke evidence validates as passing, agent readback shows adapterType hermes_local, resultJson.bos contains the required BOS fields, duplicate_wake_detected=false, and approvals.created_count=0.

## Inputs

- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/scripts/run_s02_hermes_smoke.py`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/scripts/validate_s02_hermes_smoke.py`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/runtime-evidence/M002-S02-hermes-environment.json`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/PAPERCLIP_LIVE_VALIDATION_REPORT.md`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/docs/11_HERMES_BOS_AGENTS_SMOKE.md`

## Expected Output

- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/runtime-evidence/M002-S02-hermes-smoke.json`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/docs/11_HERMES_BOS_AGENTS_SMOKE.md`

## Verification

python3 scripts/validate_s02_hermes_smoke.py --phase smoke --evidence runtime-evidence/M002-S02-hermes-smoke.json

## Observability Impact

Adds the durable live run evidence S04 needs: agent ID, run ID, resultJson.bos shape, wake diagnostics, approval count, and redacted adapter/runtime references.
