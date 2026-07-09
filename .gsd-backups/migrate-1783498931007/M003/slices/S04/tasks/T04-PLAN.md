---
estimated_steps: 10
estimated_files: 6
skills_used: []
---

# T04: Polish capability docs and close regressions

Executor skills_used frontmatter: write-docs, verify-before-complete.

Why: Live proof only helps if the capability matrix and reader-facing docs state exactly what was proven and what remains unproven. This task consumes the T03 evidence and updates docs and guard validators so M003 does not accidentally promote unsupported Paperclip plugin/runtime surfaces.

Do:
1. Update `docs/08_RUNTIME_CAPABILITY_HEALTH.md` with a concise M003 S04 section naming `runtime-evidence/M003-S04-live-decision-artifact-readback.json`, its outcome, and the exact boundary: native decision artifact issue/document/comment readback when proven, or fail-closed blocker evidence when unavailable.
2. Update `docs/04_DATA_CONTRACTS.md` to describe the decision artifact readback evidence shape, deterministic markdown fallback behavior, cache-overlay diagnostic posture, and approval immutability invariant.
3. If the T03 evidence is live proof, update only the native artifact surface evidence text that the proof actually supports. If the T03 evidence is a blocker, do not promote any status; record the blocker as evidence for conservative posture.
4. Keep plugin UI, issue tabs, dashboard widgets, actions, tool registration, data providers, config/state/entities APIs, native approvals, Hermes, activity logs, events, and GSD-Pi runtime support fallback-only or unvalidated unless their own existing proof already supports the current status. Do not infer plugin runtime support from native artifact readback.
5. Extend `scripts/validate_runtime_capabilities.py` and `scripts/test_validate_runtime_capabilities.py` as needed so the docs/capability matrix mention M003 S04 truthfully and reject overclaims such as native approvals created by plugin, guaranteed events, confirmed actions/tools/UI, or Hermes/GSD-Pi runtime execution from this evidence.
6. Run targeted and full closeout checks and fix any regressions without broadening scope.

Done when: docs, capability matrix, and validators reflect the actual T03 outcome and all regression commands pass without unsupported capability promotion.

## Inputs

- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M003/runtime-evidence/M003-S04-live-decision-artifact-readback.json`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M003/docs/08_RUNTIME_CAPABILITY_HEALTH.md`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M003/docs/04_DATA_CONTRACTS.md`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M003/plugin-bos-light/capabilities.paperclip-runtime.json`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M003/plugin-bos-light/src/runtimeCapabilities.ts`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M003/scripts/validate_runtime_capabilities.py`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M003/scripts/test_validate_runtime_capabilities.py`

## Expected Output

- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M003/docs/08_RUNTIME_CAPABILITY_HEALTH.md`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M003/docs/04_DATA_CONTRACTS.md`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M003/plugin-bos-light/capabilities.paperclip-runtime.json`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M003/plugin-bos-light/src/runtimeCapabilities.ts`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M003/scripts/validate_runtime_capabilities.py`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M003/scripts/test_validate_runtime_capabilities.py`

## Verification

python3 scripts/validate_runtime_capabilities.py
python3 -m unittest scripts/test_validate_runtime_capabilities.py scripts/test_validate_m003_s04_live_decision_artifact_readback.py scripts/test_run_m003_s04_live_decision_artifact_readback.py
npm --prefix plugin-bos-light test -- tests/liveDecisionArtifactReadback.test.ts tests/decisionArtifact.test.ts tests/majorFlowDecision.test.ts
npm --prefix plugin-bos-light run typecheck
npm --prefix plugin-bos-light test

## Observability Impact

Strengthens static observability by making the runtime health report, capability matrix, and validator explain exactly where live proof or blocker evidence lives and which unsupported surfaces remain unavailable.
