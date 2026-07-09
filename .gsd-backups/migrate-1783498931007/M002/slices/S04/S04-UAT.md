# S04: Live BOS artifact flow with Hermes no-go guard — UAT

**Milestone:** M002
**Written:** 2026-05-29T10:51:37.554Z

# UAT: S04 Live BOS artifact flow with Hermes no-go guard

**UAT Type:** Live integration evidence review and operational validator check.

## Preconditions

- The M002 worktree contains `runtime-evidence/M002-S04-live-artifact-flow.json` produced by the approved Paperclip sandbox run.
- The proof ledger `docs/13_LIVE_BOS_ARTIFACT_FLOW.md`, runtime capability health doc, live validation report, and `plugin-bos-light/capabilities.paperclip-runtime.json` are present.
- Local Node/Python dependencies needed by the validators and plugin tests are installed.
- If rerunning the live probe rather than reviewing the existing artifact, Paperclip credentials must be supplied through secure env collection; never paste or commit token values.

## Steps

1. Open `runtime-evidence/M002-S04-live-artifact-flow.json` and confirm it is `artifact_type: live-evidence`, `phase: live`, runtime version `0.3.1`, and runtime build `health.version:0.3.1`.
2. Confirm the evidence has one issue readback, one document readback, and one comment readback with refs and SHA-256 hashes, and that BPI, Blueprint, Betting Table, Eval Gate, and Circuit Breaker are present on visible document/comment surfaces.
3. Confirm side effects are bounded: `issues_created=1`, `documents_created=1`, `comments_created=1`, `approval_requests_created=0`, `activity_logs_written=0`, `hermes_runs_started=0`, and `gsd_pi_runs_started=0`.
4. Confirm no-go guards are propagated: S02 Hermes has `no_go=true` because `resultJson.bos` remains absent, and S03 GSD-Pi has `no_go=true` because adapter registration/execution remains blocked.
5. Run the closeout verification chain:
   ```bash
   npm --prefix plugin-bos-light test -- liveArtifactFlow
   python3 -m unittest scripts/test_run_s04_live_artifact_flow.py scripts/test_validate_s04_live_artifact_flow.py
   python3 scripts/validate_s04_live_artifact_flow.py --evidence runtime-evidence/M002-S04-live-artifact-flow.json --phase final
   python3 scripts/validate_runtime_capabilities.py
   npm --prefix plugin-bos-light run typecheck
   ```
6. Inspect `plugin-bos-light/capabilities.paperclip-runtime.json` and confirm only `issues.native`, `documents.native`, and `comments.native` are `confirmed`; approvals, plugin registration, tools/data/actions, UI, state/entities/config, activity/events, Hermes execution, and GSD-Pi execution remain `fallback-only` or `unvalidated`.
7. Review `docs/13_LIVE_BOS_ARTIFACT_FLOW.md` and `PAPERCLIP_LIVE_VALIDATION_REPORT.md` and confirm they reference the canonical evidence without token values, cookies, raw secrets, direct DB mutation, private imports, or core patch claims.

## Expected outcomes

- All commands exit 0.
- The S04 final validator reports the final live artifact proof contract is satisfied.
- The runtime capability validator accepts the matrix and rejects broad runtime/plugin/agent overclaims by construction.
- The Paperclip-visible evidence shows BPI, Blueprint, Betting Table, Eval Gate, and Circuit Breaker markers on native issue document/comment surfaces.
- Native approvals, Hermes execution, GSD-Pi execution, plugin UI/data/action surfaces, durable plugin state, activity logs, and events are not promoted.
- No secret-like evidence appears in runtime evidence or docs.

## Edge cases

- If `/api/version` remains 404, the accepted build fingerprint is `health.version:0.3.1`; do not invent a commit SHA.
- If issue/document/comment readback fails, S04 must fail closed and the capability matrix must not confirm that surface.
- If any approval, Hermes, GSD-Pi, activity/event, core patch, direct DB, or private import side effect appears, reject the evidence and keep the surface unvalidated.
- If Paperclip route shapes change, update runner tests and rerun the bounded live proof before changing docs or matrix posture.
- If older docs contain stale fixture-era wording, prefer the JSON matrix, `docs/13_LIVE_BOS_ARTIFACT_FLOW.md`, and `docs/08_RUNTIME_CAPABILITY_HEALTH.md` until the drift is cleaned up in follow-up work.
