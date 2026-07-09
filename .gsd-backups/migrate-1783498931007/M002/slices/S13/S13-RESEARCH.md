# S13 Research: Requirement coverage reconciliation

## Summary
S13 is a coverage-reconciliation slice, not a runtime-proof slice. S12 already closed the Hermes/GSD-Pi question as `approved_rescope`, so the remaining work is to make M002 requirement coverage coherent with the active org-boundary requirements without promoting any new runtime capability.

## What exists
- `.gsd/milestones/M002/M002-CONTEXT.md` and `M002-ASSESSMENT.md` both say M002 does not alter or reinterpret active M004 org-boundary requirements **R012 through R015**.
- `.gsd/milestones/M002/slices/S11/S11-UAT.md` explicitly says **R012-R015 remain out of scope** for the M002 artifact-repair slice.
- `scripts/validate_s12_runtime_proof_or_rescope.py` only validates **R009/R010/R011** for the approved-rescope disposition; it does not model R012-R015.
- `runtime-evidence/M002-S10-requirement-scope-resolution.json` records no scope broadening and no requirement updates, but only resolves R009-R011.
- Milestone status is stable: **S01-S12 are complete, S13 is pending**.

## Coverage gap
- The worktree does **not** contain an authoritative local text source for R012-R015; greps only surface partial mentions in M002 planning/assessment files.
- `R012`/`R013` appear in S02/S04/S05 planning as adapter/persistence and durable-mirroring constraints; `R014` appears in S04 planning as a future decision-protocol foundation; **R015 does not surface locally**.
- Because of that, S13 must reconcile against the authoritative requirements store / GSD source of truth rather than infer coverage from M002 docs alone.

## Risks and constraints
- Do not reopen or reinterpret S12’s approved-rescope posture; S13 should add coverage clarity, not change runtime disposition.
- Do not claim runtime proof from blocker evidence. The current posture remains proof-gated and no-promotion.
- Keep the same conservative boundary rules already used in M002: no Paperclip core patch, no direct DB mutation, no private imports, no plaintext secret logging, and no shell-string execution.
- Any GSD-Pi-related coverage note must remain blocker-aware: local memory confirms `gsdpi_local` is still unregistered / execution-blocked unless supported registry readback, `testEnvironment`, and `BosAdapterResult` proof exist.

## Natural seams for implementation
1. **Authoritative requirement reconciliation** — fetch the canonical R012-R015 text/coverage from the GSD requirements source and record the exact scope notes.
2. **Coverage ledger** — create a machine-readable mapping for each of R012-R015: `supported by existing evidence`, `explicitly out of scope`, or `needs validation evidence`.
3. **Validation round 1 rerun** — rerun the Contract / Integration / Operational / UAT checks against the reconciled ledger and the current closeout artifacts.
4. **Documentation sync** — only after the ledger is stable, update the M002 context/assessment and any closeout-facing docs that mention active requirements.

## First proof
The unblocker is a canonical coverage record for **R012-R015**. Without that, any docs-only edit risks traceability drift because the current worktree lacks the authoritative requirement text for at least R015.

## Files most likely involved
- `.gsd/milestones/M002/M002-CONTEXT.md`
- `.gsd/milestones/M002/M002-ASSESSMENT.md`
- `runtime-evidence/M002-S10-requirement-scope-resolution.json`
- `runtime-evidence/M002-S12-runtime-proof-or-rescope.json`
- `runtime-evidence/M002-S06-regression-closure.json`
- `scripts/validate_m002_closeout.py`
- `scripts/validate_m002_validation_artifacts.py`
- `scripts/validate_s12_runtime_proof_or_rescope.py`
- `scripts/run_m002_regression_closure.py`

## Verification approach
- Re-run the local closeout validators and regression closure after the coverage ledger is written.
- Confirm the reconciled docs match the authoritative requirement source and do not broaden scope or capability claims.
- Keep the acceptance evidence-based: no runtime promotion, no secret leakage, no core/private coupling, and no shell-enabled execution.
