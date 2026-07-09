---
estimated_steps: 20
estimated_files: 1
skills_used: []
---

# T03: T03 was rerun with a securely supplied Paperclip API key and now produces final live S04 issue/document/comment readback evidence instead of blocker evidence.

---
estimated_steps: 5
estimated_files: 1
skills_used:
  - verify-before-complete
  - observability
---

Why: The slice proof depends on actual Paperclip visible artifact round-trips, not just local adapter tests. This task performs one bounded live sandbox run and records the canonical S04 evidence file.

Do:
1. Run `scripts/run_s04_live_artifact_flow.py` against the approved Paperclip sandbox using the same supported authenticated HTTP/browser API boundary pattern as S02/S03; use only environment variable names for credentials and never inline or log secret values.
2. Create or reuse a clearly labeled sandbox issue for S04 and write/read the BOS artifact document/comment set.
3. Confirm the evidence records BPI, Blueprint, Betting Table, Eval Gate, and Circuit Breaker sections; issue/document/comment refs; live runtime version/build; zero approvals; zero source writes; no direct DB mutation; no Paperclip core/private imports; S02 Hermes execution no-go; and S03 GSD-Pi adapter no-go.
4. If an API phase fails, preserve the bounded diagnostic artifact and stop; do not patch Paperclip core, inject plaintext provider secrets, mutate a DB directly, or mark capability support as confirmed.
5. Run final validation and fix only repository-side evidence/validator bugs if validation reveals truthful-data shape issues; do not edit evidence by hand to turn a failed live run into a pass.

Threat Surface (Q3): Live API mutation is limited to approved sandbox issue/comment/document artifacts; never include secrets in artifact bodies or evidence.
Requirement Impact (Q4): R011 evidence is advanced through supported HTTP/API boundaries and no-core/no-DB/no-private-import claims.
Failure Modes (Q5): Auth failure, missing company/issue access, 404/422 schema mismatch, timeout, and malformed readback all fail closed and leave a diagnostic trail. Duplicate live runs must be distinguishable by run id/label and must not create native approvals.
Load Profile (Q6): Bounded single-run load; at 10x duplicate comments/documents and API rate limits become the risk, so the runner must use a run label and fixed artifact keys.
Negative Tests (Q7): The validator from T02 must reject hand-edited evidence lacking readback ids, any native approval count greater than zero, and any Hermes/GSD-Pi success claim lacking their required proof shapes.

Done when `runtime-evidence/M002-S04-live-artifact-flow.json` is produced by the runner and passes final validation as live visible-artifact proof.

## Inputs

- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/scripts/run_s04_live_artifact_flow.py`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/scripts/validate_s04_live_artifact_flow.py`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/runtime-evidence/M002-S02-hermes-smoke.json`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/runtime-evidence/M002-S03-gsdpi-smoke.json`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/PAPERCLIP_LIVE_VALIDATION_REPORT.md`

## Expected Output

- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/runtime-evidence/M002-S04-live-artifact-flow.json`

## Verification

python3 scripts/validate_s04_live_artifact_flow.py --evidence runtime-evidence/M002-S04-live-artifact-flow.json --phase final

## Observability Impact

Writes the canonical runtime evidence artifact future agents will use to inspect live artifact refs, operation statuses, no-go guard posture, side-effect counts, redacted diagnostics, and failure phase if the probe cannot pass.
