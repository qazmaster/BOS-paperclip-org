---
estimated_steps: 7
estimated_files: 3
skills_used: []
---

# T03: Capability report and gap ledger alignment

Expected executor skills_used: write-docs, verify-before-complete.

Why: S06's reader-facing deliverable is the live Paperclip capability report and health posture. It must be conservative, aligned with validators, and explicit about the remaining gaps rather than implying that fixture, manifest, or S04 native artifact evidence proves plugin/UI or agent execution support.

Do: Update `PAPERCLIP_LIVE_VALIDATION_REPORT.md` and `docs/08_RUNTIME_CAPABILITY_HEALTH.md`; update `plugin-bos-light/capabilities.paperclip-runtime.json` only if validation exposes real drift. Preserve validator-required headings and phrases. Add or refresh sections that summarize S04 confirmed surfaces, S05 fallback-only plugin/UI probe posture, R011 supported-boundary audit, no Paperclip core/private/direct DB/native approval side effects, regression closure command, and remaining gap ledger. The gap ledger must include the S02 Hermes execution-time secret-materialization blocker, unproven GSD-Pi execution, unvalidated company template live import/export, unvalidated plugin registration/piko/data/action/widget/issue-tab support, and approval native support remaining unconfirmed. Do not promote any capability from local manifest intent, TypeScript optional chaining, docs-only claims, or fixture evidence.

Threat Surface Q3: These docs may be copied into operational handoffs; overclaims are the primary abuse path. Keep secret values out of prose and cite evidence paths instead of credentials or live URLs.

Requirement Impact Q4: Re-verifies R011 and preserves D008, D009, and D010. If any doc edit would require Paperclip core changes or broader capability claims, stop and keep the status fallback-only or unvalidated.

Negative Tests Q7: The closeout validator should fail if the report lacks no-core audit or gap ledger text, if plugin/UI rows are confirmed without S05 proof, or if the S02 blocker disappears.

Done when: the closeout validator passes in final mode and the existing runtime capability validator still passes.

## Inputs

- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/scripts/validate_m002_closeout.py`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/plugin-bos-light/capabilities.paperclip-runtime.json`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/docs/08_RUNTIME_CAPABILITY_HEALTH.md`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/PAPERCLIP_LIVE_VALIDATION_REPORT.md`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/runtime-evidence/M002-S04-live-artifact-flow.json`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/runtime-evidence/M002-S05-plugin-ui-surface-probe.json`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/docs/14_PLUGIN_UI_SURFACE_PROBES.md`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/plugin-bos-light/src/runtimeCapabilities.ts`

## Expected Output

- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/PAPERCLIP_LIVE_VALIDATION_REPORT.md`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/docs/08_RUNTIME_CAPABILITY_HEALTH.md`

## Verification

python3 scripts/validate_m002_closeout.py --phase final && python3 scripts/validate_runtime_capabilities.py

## Observability Impact

Improves operator diagnostics by centralizing current capability posture, blocker causes, recovery steps, and exact evidence files in reader-facing reports.
