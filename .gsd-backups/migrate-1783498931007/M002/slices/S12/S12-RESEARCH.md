# S12 Research: Runtime proof or approved rescope

## Summary

S12 is a feasibility-and-closeout slice, not a code-change slice. The repo currently has **no S12 task files in the worktree** and `gsd_milestone_status` shows S12 as pending with zero tasks, so the planner will need to decide the path before implementation: either obtain supported-boundary runtime proof for Hermes/GSD-Pi, or capture an approved rescope that keeps the conservative no-promotion posture intact.

The current evidence base is strongly one-directional: the project already has valid fail-closed artifacts for Hermes and GSD-Pi, but none of them qualify as runtime execution proof. That means S12 should treat runtime proof as conditional on supported auth/registry/testEnvironment access; otherwise, the slice should pivot to an explicit rescope and update the milestone-facing posture docs/validation artifacts without promoting runtime execution.

## Active requirement context

S12 mainly supports **R009, R010, and R011** from the preloaded requirement set:

- **R009**: keep the conservative no-promotion Eval Gate posture; fail-closed Hermes/GSD-Pi evidence must not be treated as proof.
- **R010**: do not reinterpret auth-denied or failed execution evidence as successful Circuit Breaker/runtime behavior; Hermes proof still requires bounded supported execution with wake-count and BOS-shaped result evidence.
- **R011**: keep supported-boundary constraints explicit; no Paperclip core patching, private imports, direct DB mutation, plaintext secrets, or unsupported capability promotion.

These requirements are already preserved in S10/S11 docs and validators. S12 should not broaden them; it should either produce real proof inside those boundaries or document why proof is not reachable and rescope accordingly.

## What exists

### Canonical posture sources already in place

- `M002-CONTEXT.md` — planner-facing source of truth for S09/S10/S11 supersession rules.
- `M002-ASSESSMENT.md` — milestone closeout assessment that preserves the proof-gated posture.
- `S10-ASSESSMENT.md` — current Hermes/GSD-Pi execution posture.
- `PAPERCLIP_LIVE_VALIDATION_REPORT.md` — reader-facing capability summary and gap ledger.
- `docs/08_RUNTIME_CAPABILITY_HEALTH.md` — runtime health and capability matrix companion.
- `plugin-bos-light/capabilities.paperclip-runtime.json` — machine-readable capability posture and runtime execution ledger.

### Evidence already available

- `runtime-evidence/M002-S10-hermes-runtime-execution-proof.json`
  - classified as `fail-closed-blocker`
  - health reachable, but registry/testEnvironment were denied by supported auth boundaries
  - no bounded runtime invocation, no wake-count proof, no passing `resultJson.bos`
- `runtime-evidence/M002-S10-gsdpi-runtime-execution-proof.json`
  - local package readiness is diagnostic only
  - supported Paperclip routes were unavailable / connection refused
  - no registry readback, no testEnvironment, no execute proof, no `BosAdapterResult`
- `runtime-evidence/M002-S10-requirement-scope-resolution.json`
  - explicitly records that no requirement broadened and no requirement update was used
  - R009/R010/R011 remain intact
- `runtime-evidence/M002-S11-validation-artifact-repair.json`
  - validates artifact completeness and fail-closed posture, not runtime proof

### Historical blockers that still matter

Project memory and the live docs agree on the same constraints:

- Hermes S02/S08 history shows execution remained blocked by secret materialization / provider readiness issues; S10 still does not promote it.
- GSD-Pi remains unregistered / unavailable through supported Paperclip routes; local package readiness is not enough.
- S05 plugin/UI surfaces are fallback-only and cannot be reused as proof for runtime execution.
- S04 native issue/document/comment proof is real, but it only promotes those bounded artifact surfaces — it must not be reused to claim Hermes or GSD-Pi execution.

## What is missing

### For runtime proof

To claim Hermes or GSD-Pi runtime execution, the current docs/validators require all of the following on the supported-boundary path:

- supported Paperclip auth and registry readback,
- passing `testEnvironment`,
- exactly one bounded Paperclip-owned runtime invocation,
- for Hermes: `wakeCountDelta=1` and passing `resultJson.bos`,
- for GSD-Pi: bounded execute status plus `BosAdapterResult`,
- no Paperclip core patch, private import, direct DB mutation, or plaintext secret logging.

The current S10 artifacts do not satisfy those conditions.

### For approved rescope

If proof cannot be obtained with supported auth/registry access, S12 needs an explicit rescope artifact trail that says:

- why runtime execution remains unproved,
- which success criteria are being narrowed or deferred,
- which docs/matrix rows remain fallback-only or unvalidated,
- and how the closeout validators should continue to fail closed without reinterpreting blocker evidence.

This likely touches the milestone-facing documentation layer and, if the project formally updates requirements, the GSD requirement workflow rather than ad hoc file edits.

## Constraints and blockers

1. **No S12 task scaffolding exists yet in the worktree.** The planner must create the first executable decomposition.
2. **Runtime proof is auth-gated.** S10 shows supported auth/preflight denial for Hermes and unavailable routes for GSD-Pi; those are blockers, not proof.
3. **No overpromotion allowed.** S04 native artifact proof and S05 fallback-only probe results cannot be reused for Hermes/GSD-Pi promotion.
4. **No core or DB shortcuts.** R011 and the existing docs explicitly forbid Paperclip core patching, private imports, direct DB mutation, or plaintext secrets.
5. **Validator/doc coherence matters.** `PAPERCLIP_LIVE_VALIDATION_REPORT.md`, `docs/08_RUNTIME_CAPABILITY_HEALTH.md`, and `plugin-bos-light/capabilities.paperclip-runtime.json` must remain aligned with whatever S12 decides.

## Recommended implementation landscape

### Path A: supported-boundary runtime proof

Best when the operator can provide working Paperclip auth and supported adapter routes.

Natural seams:
- Hermes proof track: existing S10 Hermes smoke runner + validator + evidence file.
- GSD-Pi proof track: existing S10 GSD-Pi smoke runner + validator + evidence file.
- Closeout sync: runtime capability matrix + reader-facing docs if proof succeeds.

First proof for this path:
- prove registry readback and `testEnvironment` for one surface before attempting any bounded run.
- if either surface cannot clear that gate, stop and do not claim execution success.

### Path B: approved rescope

Best when supported auth/registry access is unavailable or the runtime simply cannot provide the required evidence in this environment.

Natural seams:
- milestone/slice documentation update describing the blocked proof path,
- explicit posture update in the capability report and matrix if needed,
- GSD requirement update only if the rescope is formally approved.

First proof for this path:
- produce a concise, approved statement that runtime execution goals are deferred or narrowed, while keeping S10 blocker artifacts and no-promotion posture intact.

## Verification guidance

If the team pursues proof, verify with the existing S10 closeout commands first:

- `python3 scripts/validate_s10_runtime_execution.py --phase final --write-audit runtime-evidence/M002-S10-runtime-execution-closeout.json`
- `python3 scripts/run_m002_regression_closure.py --output runtime-evidence/M002-S06-regression-closure.json`
- `python3 scripts/validate_runtime_capabilities.py`

If the team pursues rescope, verify that:

- blocker evidence is still classified as fail-closed,
- no capability promotion is introduced accidentally,
- all reader-facing and machine-readable docs agree on the narrowed posture,
- any requirement update is recorded through the GSD requirement workflow rather than manual mutation.

## Sources

- `gsd_milestone_status(M002)`
- `M002-CONTEXT.md`
- `M002-ASSESSMENT.md`
- `S10-ASSESSMENT.md`
- `PAPERCLIP_LIVE_VALIDATION_REPORT.md`
- `docs/08_RUNTIME_CAPABILITY_HEALTH.md`
- `docs/13_LIVE_BOS_ARTIFACT_FLOW.md`
- `docs/14_PLUGIN_UI_SURFACE_PROBES.md`
- `runtime-evidence/M002-S10-hermes-runtime-execution-proof.json`
- `runtime-evidence/M002-S10-gsdpi-runtime-execution-proof.json`
- `runtime-evidence/M002-S10-requirement-scope-resolution.json`
- `runtime-evidence/M002-S11-validation-artifact-repair.json`
- project memory notes about Hermes secret materialization, GSD-Pi registration, and proof-gated promotion
