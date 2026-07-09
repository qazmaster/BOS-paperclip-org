# Handoff: Real Paperclip Import and Runtime Validation

> **Canonical doctrine update:** Run live Paperclip validation through the active v1.4.1 doctrine package. Read `docs/BOS_Light_v1_4_1_CANONICAL_ORG.md`, the other `docs/BOS_Light_v1_4_1_*.md` files, and `skills/SKILL_*.md` before applying this historical M001/M002 runtime guide. Preserve the proof boundaries below, but use v1.4.1 for division ownership, tool permissions, trust boundaries, external-IO routing and A12-A20 acceptance.

Audience: the next AI agent who will import and test the completed BOS Light M001 work against a real Paperclip runtime.

Last known pushed commit: `1697db7 Merge milestone M001-bo1jcm BOS Light Baseline` on `main` / `origin/main`.

## Mission

Validate the already-completed BOS Light baseline on a real Paperclip runtime without overstating proof and without mutating production unless the human explicitly approves that exact environment and action.

Your job is not to rebuild M001. Your job is to collect live Paperclip evidence for the runtime gaps that M001 deliberately left unconfirmed.

## Non-negotiable proof boundary

M001 is complete only at repository-local contract plus fixture-integration level.

Safe claim before live validation:

> BOS Light baseline is locally validated and ready for real Paperclip import/runtime validation.

Do **not** claim any of the following until you collect live runtime evidence:

- Paperclip company import/export compatibility is proven.
- AGENTS.md syntax is accepted by the current Paperclip parser.
- Plugin runtime registration works.
- `piko:*` tools are host-registered or invokable.
- Betting Table dashboard widget renders inside Paperclip.
- Approve Batch creates/readbacks a Paperclip-native approval/request.
- Native issue document/comment/issue/activity/event/state/config/entity support is confirmed.
- Circuit Breaker can rely on terminal-run events.

Keep `native_support_confirmed: false` and runtime posture `unvalidated` unless a live Paperclip version/build/proof artifact supports changing a specific surface.

## Human approval gate

Before touching a real Paperclip environment, ask the human to identify the target and approve the scope.

Minimum approval question:

> Which Paperclip environment may I use for live validation: disposable sandbox, staging, or production? I recommend a disposable sandbox. May I create/import BOS Light test data there?

Rules:

- Prefer a disposable sandbox or staging company.
- Do not run against production unless the human explicitly says production is allowed.
- Do not create approvals, issues, comments, documents, agents, or plugin registrations in production without explicit approval for each class of mutation.
- Never paste or echo secrets. Use secure secret collection if credentials are needed.
- Keep all evidence paths free of tokens and private user data.

## Start here

Read these first:

1. `.gsd/milestones/M001-bo1jcm/M001-bo1jcm-SUMMARY.md`
2. `.gsd/milestones/M001-bo1jcm/M001-bo1jcm-VALIDATION.md`
3. `.gsd/milestones/M001-bo1jcm/M001-bo1jcm-ASSESSMENT.md`
4. `.gsd/milestones/M001-bo1jcm/M001-bo1jcm-BROWSER-ASSESSMENT.md`
5. `docs/10_A1_A10_DEMO.md`
6. `docs/08_RUNTIME_CAPABILITY_HEALTH.md`
7. `plugin-bos-light/capabilities.paperclip-runtime.json`
8. `company-template/a1-validation-evidence.md`

Useful source seams:

- `plugin-bos-light/src/paperclipAdapter.ts`
- `plugin-bos-light/src/persistence.ts`
- `plugin-bos-light/src/runtimeCapabilities.ts`
- `plugin-bos-light/src/issueBlueprintFlow.ts`
- `plugin-bos-light/src/bettingTable.ts`
- `plugin-bos-light/src/evalGateEvidence.ts`
- `plugin-bos-light/src/circuitBreakerFlow.ts`
- `plugin-bos-light/src/integratedDemo.ts`
- `plugin-bos-light/src/worker.ts`

## Baseline local verification

Before live testing, reproduce the local baseline from the repository root:

```bash
npm --prefix plugin-bos-light ci
python3 scripts/run_a1_a10_demo.py
python3 scripts/test_validate_company_template.py
npm --prefix plugin-bos-light test
npm --prefix plugin-bos-light run typecheck
python3 scripts/test_validate_runtime_capabilities.py
python3 scripts/validate_runtime_capabilities.py
python3 scripts/validate_a1_a10_demo_docs.py
```

Expected local evidence:

- A1-A10 demo status: `passed`
- Company-template tests: 6/6 OK
- Plugin tests: 7 files, 63 tests passing
- Typecheck: `tsc --noEmit` passes
- Runtime capability tests: 12/12 OK
- Runtime validator: `Paperclip runtime capabilities OK`
- Docs validator: `A1-A10 demo docs OK`
- Runtime probe with no runtime path: `honest-unvalidated`
- `native_support_confirmed: false`

Note: `npm ci` previously reported 5 moderate npm audit findings. Do not run `npm audit fix --force` as part of runtime validation unless the human asks for a dependency remediation task.

## Live validation sequence

### Phase 0 — identify runtime evidence and credentials

Collect, without exposing secrets:

- Paperclip environment name: sandbox/staging/production.
- Paperclip runtime version and build.
- Plugin SDK/API docs version if available.
- Whether company import/export is supported in this runtime.
- Whether plugin installation/registration is available.
- Which mutations are approved by the human.

If a local Paperclip checkout/runtime directory exists, run:

```bash
python3 scripts/run_a1_a10_demo.py --runtime-evidence /path/to/local/paperclip/runtime-or-checkout
```

This still does **not** confirm support by itself. It only records bounded runtime evidence and gaps.

### Phase 1 — A1 import and AGENTS syntax

Goal: prove or reject live import compatibility for the seven-division company template.

Inputs:

- `company-template/bos-company-template.json`
- `company-template/org-chart.mmd`
- `company-template/task-routing.md`
- `company-template/rituals.md`
- `agents/Div1_Executive/AGENTS.md`
- `agents/Div2_MasterPlanner/AGENTS.md`
- `agents/Div3_Production/AGENTS.md`
- `agents/Div4_Operations/AGENTS.md`
- `agents/Div5_Qualifications/AGENTS.md`
- `agents/Div6_Resources/AGENTS.md`
- `agents/Div7_Strategy/AGENTS.md`

Evidence to collect:

- Import command/UI path used.
- Paperclip runtime version/build.
- Import result: success/failure.
- AGENTS.md parser result for all seven divisions.
- Any schema translation required.
- Created company/template ID if in non-production approved environment.
- Screenshots/logs only if they do not contain secrets.

Capability matrix keys affected if proven:

- `company_template.import_export`
- `agents.syntax`

Do not update these to `confirmed` unless Paperclip accepted the import or syntax and you have version/build/proof command evidence.

### Phase 2 — plugin load and registration

Goal: determine whether current Paperclip can load/register the plugin surfaces requested by `plugin-bos-light/manifest.paperclip-plugin.json`.

Check:

- Plugin entrypoint/load path.
- Tool registration for:
  - `piko:bpi-score`
  - `piko:blueprint-gen`
  - `piko:bpi-blueprint-artifact`
  - `piko:eval-gate`
  - `piko:eval-gate-evidence`
  - `piko:circuit-breaker-observe`
  - `piko:decide`
- Data provider registration for Betting Table.
- Action registration for Approve Batch.
- Dashboard widget slot rendering.
- Issue detail tab rendering.

Capability matrix keys affected if proven:

- `plugin.runtime.version_build`
- `plugin.runtime.registration`
- `registration.tools`
- `registration.data`
- `registration.actions`
- `ui.dashboard_widgets`
- `ui.issue_detail_tabs`

Failure is acceptable evidence. Record it clearly and keep posture `unvalidated` or `fallback-only`.

### Phase 3 — A2-A5 issue flow

Use a test issue in the approved environment.

Validate:

1. BPI scoring produces bounded/explainable score data.
2. Product Blueprint generates a five-section artifact.
3. Artifact is persisted to the best available Paperclip-visible surface:
   - native document if proven;
   - native comment if document unsupported;
   - markdown-only fallback if native writes fail.
4. Betting Table ranks top-N positive-BPI candidates.
5. Approve Batch creates a Paperclip-native approval/request **only if** the native approval API is proven.
6. Fallback paths do not mark rows as native-approved and do not become a plugin-side approval engine.

Important object semantics:

- Treat `artifact_ref` as opaque.
- `status_overlay.blueprint_id` must remain the surface-qualified Product Blueprint artifact reference.
- Do not interpret `blueprint_id` as an approval id, cycle id, or native durability proof.
- `cache_overlay` is cache/diagnostic state only, not Paperclip durable truth.

Capability matrix keys affected if proven:

- `documents.native`
- `comments.native`
- `approvals.native`
- `issues.native`
- `state.issue_scoped`
- `state.company_scoped`
- `entities.api`
- `config.api`

### Phase 4 — A6-A10 gate and circuit behavior

Use explicit invocation first. Do not rely on events until event delivery is proven.

Validate:

1. Eval Gate pass/warning/blocking/incomplete outputs create visible evidence.
2. Blocking Eval Gate failure prevents silent acceptance and produces correction guidance.
3. Circuit Breaker opens after repeated failures.
4. Circuit Breaker creates visible escalation evidence if issue/comment/activity surfaces exist.
5. Circuit Breaker transitions HALF_OPEN and closes/resets after a successful retry path.
6. Polling/activity fallback works when events are unavailable.

Capability matrix keys affected if proven:

- `activity.logging`
- `events.issue_lifecycle`
- `events.terminal_runs`
- `issues.native`
- `comments.native`
- `state.issue_scoped`

Known safe fallback posture:

- Poll active runs only.
- Use jitter/backoff.
- Do not scan archived/completed issue history unboundedly.
- Do not assume `agent.run.finished/failed/cancelled` events until observed in the target runtime.

## Updating capability posture

Only update `plugin-bos-light/capabilities.paperclip-runtime.json` after live proof exists.

For every surface you promote, include evidence with:

- Paperclip runtime version/build.
- Environment type: sandbox/staging/production.
- Proof command or UI action.
- Artifact IDs or readback result, redacted as needed.
- Failure behavior if partial.
- Date/time.

Then run:

```bash
python3 scripts/validate_runtime_capabilities.py
python3 scripts/run_a1_a10_demo.py
python3 scripts/validate_a1_a10_demo_docs.py
```

If docs change, update:

- `docs/08_RUNTIME_CAPABILITY_HEALTH.md`
- `docs/10_A1_A10_DEMO.md`
- `docs/09_BACKLOG.md`
- `.gsd/milestones/M001-bo1jcm/M001-bo1jcm-ASSESSMENT.md` only if recording historical validation follow-up is appropriate.

## Evidence artifact to produce

Create a new file after live testing:

```text
PAPERCLIP_LIVE_VALIDATION_REPORT.md
```

Suggested structure:

```markdown
# Paperclip Live Validation Report

## Environment
- Runtime:
- Version/build:
- Environment type:
- Human approval scope:
- Date/time:

## Summary Verdict
- Import/export:
- AGENTS syntax:
- Plugin load:
- Tools/data/actions registration:
- UI rendering:
- Native artifacts:
- Approval/request:
- State/config/entities:
- Activity/events:

## Evidence Matrix
| Surface | Previous posture | New posture | Proof | Remaining gap |
|---|---|---|---|---|

## A1-A10 Results
| Step | Result | Evidence | Notes |
|---|---|---|---|

## Failures and Fallbacks
| Failure | Expected handling | Observed behavior | Follow-up |
|---|---|---|---|

## Capability Matrix Changes
- Files changed:
- Validator output:

## Do Not Claim Yet
- ...
```

## Hard stop conditions

Stop and ask the human before proceeding if:

- The only available target is production and the human has not explicitly approved production mutation.
- Paperclip requires credentials/secrets not yet collected securely.
- Import would overwrite an existing company or agent set.
- Plugin install requires elevated workspace permissions.
- Any test would create real approvals, notify real users, or alter production issue state.
- Runtime evidence contradicts local assumptions and requires design changes.

## Known traps

- Do not treat fixture adapter refs such as `paperclip://...` from local tests as real Paperclip artifacts.
- Do not promote manifest-requested capabilities to `confirmed` just because they appear in `manifest.paperclip-plugin.json`.
- Do not mark Betting Table rows as approved unless Paperclip-native approval/request create/read proof exists.
- Do not rely on company-scoped plugin state as durable truth without round-trip and restart/readback proof.
- Do not rely on terminal-run events until event emission is proven in the target runtime.
- Do not expose secrets in logs, screenshots, reports, or capability files.

## If live validation fails

A failure is useful. Preserve it as evidence.

- Record the runtime version/build.
- Record the exact surface that failed.
- Record the error message after redaction.
- Keep capability posture unvalidated/fallback-only.
- Prefer adapting through `paperclipAdapter.ts` or `persistence.ts` seams instead of changing pure BPI/Blueprint/Gate/Circuit logic.
- Update backlog/docs with concrete follow-up work.

## Final expected handoff back

When finished, the live-validation agent should leave:

- `PAPERCLIP_LIVE_VALIDATION_REPORT.md`
- Updated `plugin-bos-light/capabilities.paperclip-runtime.json` only for proven surfaces.
- Updated runtime docs if posture changed.
- Fresh local verification output.
- A clear list of still-unvalidated surfaces.
- No unapproved production mutations.
