---
estimated_steps: 16
estimated_files: 8
skills_used: []
---

# T04: Document Capability Posture and Validate Drift

---
estimated_steps: 7
estimated_files: 8
skills_used:
  - write-docs
  - observability
  - verify-before-complete
---
Why: S05 changes the public plugin surface and the A6 to A10 evidence story. The manifest, capability matrix, health report, persistence matrix, data contracts, acceptance docs, and backlog must stay aligned with the proof-gated runtime posture from S02 and D006.

Do: Update the manifest tool list and runtime capability matrix so the new explicit tools are represented under `registration.tools` without promoting tool registration, events, activity logging, native issues, or native comments to confirmed. Update validator fixtures if they enumerate manifest tools. Document gate evidence and circuit breaker envelopes in data contracts, cache-overlay and native/comment/markdown-only persistence semantics in the persistence matrix, acceptance coverage in acceptance tests, and S05 runtime health guidance in the health report and backlog. Preserve the existing fallback-only wording for terminal run events and active-runs-only polling with jitter/backoff/activity fallback.

Failure Modes Q5:
| Dependency | On error | On timeout | On malformed response |
|------------|----------|------------|------------------------|
| Runtime capability validator | Fix matrix, manifest, docs, or validator fixture drift before completing | Not applicable | Fix malformed JSON or unsupported status fields |

Negative Tests Q7: validator tests must still reject manifest tool drift, confirmed support without live runtime version/build proof, placeholder proof text, missing fallback/blocker text, and forbidden wording that overclaims support.

Done when: docs and validators describe the exact S05 evidence behavior, manifest and capability matrix agree on new tools, and no unvalidated runtime surface is described as confirmed or durable.

## Inputs

- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/plugin-bos-light/src/worker.ts`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/plugin-bos-light/src/evalGateEvidence.ts`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/plugin-bos-light/src/circuitBreakerFlow.ts`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/plugin-bos-light/manifest.paperclip-plugin.json`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/plugin-bos-light/capabilities.paperclip-runtime.json`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/scripts/validate_runtime_capabilities.py`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/scripts/test_validate_runtime_capabilities.py`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/docs/04_DATA_CONTRACTS.md`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/docs/05_PERSISTENCE_MATRIX.md`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/docs/06_ACCEPTANCE_TESTS.md`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/docs/08_RUNTIME_CAPABILITY_HEALTH.md`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/docs/09_BACKLOG.md`

## Expected Output

- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/plugin-bos-light/manifest.paperclip-plugin.json`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/plugin-bos-light/capabilities.paperclip-runtime.json`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/scripts/test_validate_runtime_capabilities.py`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/docs/04_DATA_CONTRACTS.md`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/docs/05_PERSISTENCE_MATRIX.md`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/docs/06_ACCEPTANCE_TESTS.md`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/docs/08_RUNTIME_CAPABILITY_HEALTH.md`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/docs/09_BACKLOG.md`

## Verification

python3 scripts/test_validate_runtime_capabilities.py && python3 scripts/validate_runtime_capabilities.py

## Observability Impact

Keeps downstream-readable runtime health and acceptance documentation aligned with actual proof, including explicit fallback diagnostics and monitoring gaps for unvalidated event, activity, issue, and comment surfaces.
