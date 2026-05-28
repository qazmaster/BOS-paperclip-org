# 10 - A1-A10 Baseline Demo Runbook and Gap Ledger

This runbook is the durable S06 inspection surface for the integrated BOS Light A1-A10 baseline demo. It tells future agents how to reproduce the local baseline, which evidence each A-step uses, and which Paperclip runtime surfaces remain live-runtime-untrusted.

## Purpose and Proof Boundary

The baseline command composes the validated company template, runtime capability posture, BPI scoring, Product Blueprint artifact flow, Betting Table, approval request path, Eval Gate evidence, and Circuit Breaker evidence into one JSON evidence envelope.

**Fixture proof boundary:** the integrated A3-A10 fixture exercises adapter seams and pure orchestration logic only. It is repeatable repository evidence, not live Paperclip support. The expected posture is `native_support_confirmed: false`; any doc or code path that promotes fixture success to confirmed Paperclip runtime support is stale until the capability matrix has live runtime version/build proof.

The machine-readable capability source of truth remains `plugin-bos-light/capabilities.paperclip-runtime.json`, validated by `python3 scripts/validate_runtime_capabilities.py`.

## Reproduce the Baseline

Run from the repository root:

```bash
python3 scripts/run_a1_a10_demo.py
```

The command is standard-library Python and orchestrates local validators plus the TypeScript fixture demo. It should require no secrets, no network, no background service, and no live Paperclip runtime.

Optional local runtime evidence smoke input:

```bash
python3 scripts/run_a1_a10_demo.py --runtime-evidence /path/to/local/paperclip/runtime-or-checkout
```

Supplying `--runtime-evidence` only lets the no-runtime-safe probe inspect a local path. It does not confirm native support unless the runtime probe and capability matrix are extended with live Paperclip version/build evidence and successful surface-specific proof fields.

## Evidence Sources

| Evidence | Path or command | Boundary |
|---|---|---|
| A1 local template validation | `company-template/a1-validation-evidence.md`; `python3 scripts/validate_company_template.py` | Repository-local import readiness only; no live Paperclip import/export proof. |
| Runtime capability posture | `plugin-bos-light/capabilities.paperclip-runtime.json`; `docs/08_RUNTIME_CAPABILITY_HEALTH.md`; `python3 scripts/validate_runtime_capabilities.py` | Machine-readable blocker/fallback ledger; `confirmed` remains zero without live proof. |
| Paperclip runtime probe | `python3 scripts/probe_paperclip_runtime.py` via the demo runner | Honest unvalidated posture when no runtime path is supplied; malformed path details become gap-ledger entries. |
| Integrated A3-A10 fixture source | `plugin-bos-light/src/integratedDemo.ts` | Adapter-seam fixture proof for orchestration surfaces only. |
| Integrated A3-A10 fixture tests | `plugin-bos-light/tests/integratedDemo.test.ts` | Deterministic Vitest fixture proof; not host registration proof. |
| Demo runner | `scripts/run_a1_a10_demo.py` | Emits one JSON envelope with commands, phases, runtime posture, gap ledger, and failures. |
| Seed issues | `scripts/demo-seed-issues.json` | Local reproducible inputs for BPI, Blueprint, Betting Table, gates, and circuit evidence. |

## A1-A10 Evidence Map

| Step | Runner phase label | What the baseline demonstrates | Evidence source paths | Expected fixture output to inspect | Live runtime gap |
|---|---|---|---|---|---|
| A1 | Company template validator | BOS Light company-template package is internally consistent and references seven division `AGENTS.md` profiles. | `company-template/bos-company-template.json`; `company-template/a1-validation-evidence.md`; `scripts/validate_company_template.py` | `phases.A1.status=passed`; command label `company-template-validator`. | `company_template.import_export` and `agents.syntax` remain `unvalidated` until live Paperclip import/export and AGENTS parser evidence exists. |
| A2 | Runtime capability posture | Runtime support is fail-closed and explicit before downstream proof is trusted. | `plugin-bos-light/capabilities.paperclip-runtime.json`; `docs/08_RUNTIME_CAPABILITY_HEALTH.md`; `scripts/validate_runtime_capabilities.py`; `scripts/probe_paperclip_runtime.py` | `phases.A2.status=passed`; `runtime_capability_posture.native_support_confirmed=false`; no promoted `confirmed` surfaces. | Runtime version/build, plugin load, registration, state, entities, issues, docs, comments, approvals, UI, activity, and events remain unvalidated or fallback-only. |
| A3 | Product Blueprint artifact flow | Seed issues become five-section Product Blueprint artifact envelopes with selected surfaces, refs, cache-overlay diagnostics, and fallback reasons. | `plugin-bos-light/src/issueBlueprintFlow.ts`; `plugin-bos-light/src/integratedDemo.ts`; `plugin-bos-light/tests/integratedDemo.test.ts` | `phases.A3.selected_surfaces`; `artifact_refs`; `cache_overlay`; `fallback`; timestamps. | `documents.native`, `comments.native`, and issue-scoped durability remain unvalidated until live create/read and restart proof exists. |
| A4 | Betting Table cycle | Positive-BPI issues are ranked into a cycle with top-N selections, opaque Blueprint refs, and cache-overlay diagnostics. | `plugin-bos-light/src/bettingTable.ts`; `plugin-bos-light/src/integratedDemo.ts`; `plugin-bos-light/tests/integratedDemo.test.ts` | `phases.A4.selected_surface=cache-overlay`; `selected_issue_ids`; `blueprint_ids`; `fallback.reason`. | Dashboard data-provider hydration, widget rendering, entities, and durable cycle restore remain unvalidated/fallback-only. |
| A5 | Approval request | Approve Batch delegates to the adapter seam and reports native/comment/markdown selected surface without plugin-side approval decisions. | `plugin-bos-light/src/bettingTable.ts`; `plugin-bos-light/src/paperclipAdapter.ts`; `plugin-bos-light/src/integratedDemo.ts` | `phases.A5.selected_surface`; `artifact_ref`; `native_support_confirmed=false`; `cache_overlay`; `fallback`. | `registration.actions` and `approvals.native` require live action invocation plus native request create/read proof before A5 can be called Paperclip-native. |
| A6 | Eval Gate pass evidence | Passing or warning gate output is mirrored into a bounded evidence envelope with guidance and artifact diagnostics. | `plugin-bos-light/src/evalGateEvidence.ts`; `plugin-bos-light/src/integratedDemo.ts`; `plugin-bos-light/tests/integratedDemo.test.ts` | `phases.A6.selected_surface`; `artifact_ref`; `cache_overlay`; `fallback`; timestamp. | Tool registration and native comments remain unvalidated until a real Paperclip host registers/invokes the tool and reads back comments. |
| A7 | Eval Gate warning/failure visibility | Blocking failure or warning paths remain visible through result guidance, fallback diagnostics, and bounded evidence. | `plugin-bos-light/src/evalGateEvidence.ts`; `plugin-bos-light/src/integratedDemo.ts`; `plugin-bos-light/tests/integratedDemo.test.ts` | `phases.A7.selected_surface`; `artifact_ref`; `cache_overlay`; `fallback`; timestamp. | Issue lifecycle events and automatic status movement remain unvalidated; consumers must inspect the envelope. |
| A8 | Circuit Breaker open evidence | Threshold failures produce OPEN evidence, escalation refs, attempt counts, fallback diagnostics, and cache/activity diagnostics. | `plugin-bos-light/src/circuitBreakerFlow.ts`; `plugin-bos-light/src/integratedDemo.ts`; `plugin-bos-light/tests/integratedDemo.test.ts` | `phases.A8.selected_surface`; `artifact_ref`; `cache_overlay`; `fallback`; timestamp. | Native issue/comment escalation and activity logging remain unvalidated; OPEN evidence is fixture-only until live create/read/log proof exists. |
| A9 | Circuit Breaker half-open evidence | A bounded half-open observation is visible with selected surface, artifact ref, cache overlay, and fallback reason. | `plugin-bos-light/src/circuitBreakerFlow.ts`; `plugin-bos-light/src/integratedDemo.ts`; `plugin-bos-light/tests/integratedDemo.test.ts` | `phases.A9.selected_surface`; `artifact_ref`; `cache_overlay`; `fallback`; timestamp. | Terminal run events remain fallback-only; half-open detection must use explicit observation or bounded active-run polling until event emission is proven. |
| A10 | Circuit Breaker recovery evidence | Recovery closes the loop with explicit evidence and does not hide event dependencies. | `plugin-bos-light/src/circuitBreakerFlow.ts`; `plugin-bos-light/src/integratedDemo.ts`; `plugin-bos-light/tests/integratedDemo.test.ts` | `phases.A10.selected_surface`; `artifact_ref`; `cache_overlay`; `fallback`; timestamp. | Runtime run-event, activity-log, and cache durability support remain unconfirmed; recovery proof is fixture-only. |

## Expected Fixture Output

A successful local run emits JSON with this high-level shape:

- `schema_version: "1.0"`
- `demo: "A1-A10 baseline"`
- `status: "passed"`
- `mode: "fixture-only"` when no `--runtime-evidence` path is supplied
- `evidence_paths` naming seed issues, the capability matrix, integrated demo source, and test file
- `phases.A1` through `phases.A10`, each with `status=passed` on the happy path
- `commands[]` entries with command label, phase, exit code, duration, and bounded stdout/stderr digests
- `runtime_capability_posture.native_support_confirmed=false`
- `gap_ledger[]` entries for absent runtime evidence and fixture-only/fallback/cache-overlay surfaces
- `failures[]` empty on success, or populated with failing phase, command, exit code, status, and bounded digests

The most important expected fixture boundary is that selected surfaces such as `documents.native`, `comments.native`, `issues.native`, `activity.logging`, or `approvals.native` can appear as adapter-seam outputs while `native_support_confirmed` remains false.

## Live Runtime Smoke Instructions

Use these steps only when a real Paperclip runtime or checkout is available locally. Do not replace the capability matrix with optimistic claims from fixture output.

1. Run `python3 scripts/run_a1_a10_demo.py --runtime-evidence /path/to/local/paperclip/runtime-or-checkout` and save the JSON evidence outside any secret-bearing path.
2. Confirm the probe records runtime version/build fields before considering any capability promotion.
3. Exercise plugin load, tool registration/invocation, data-provider registration, action invocation, dashboard widget rendering, issue detail tabs, native issue/document/comment create-read, native approval create-read, config/state/entities round trips, activity write/read visibility, issue lifecycle events, and terminal-run event emission separately.
4. Update `plugin-bos-light/capabilities.paperclip-runtime.json` only for surfaces with live evidence fields and proof commands, then run `python3 scripts/validate_runtime_capabilities.py`.
5. Re-run `python3 scripts/run_a1_a10_demo.py` and this docs validator before claiming S06 closure.

## Live Runtime Gap Ledger

| Surface | Current posture | Why it is still a gap | Proof needed before promotion |
|---|---|---|---|
| `company_template.import_export` | `unvalidated` | A1 validates local assets only. | Live Paperclip export/import accepts the template and records schema/version evidence. |
| `agents.syntax` | `unvalidated` | Local files exist but Paperclip's AGENTS parser has not accepted them. | Live AGENTS.md syntax validation or import result. |
| `plugin.runtime.version_build` | `unvalidated` | No runtime version/build has been captured. | Runtime probe records version/build from a real host. |
| `plugin.runtime.registration` | `unvalidated` | Worker entrypoint/import path is draft pseudo wiring. | Plugin load smoke test against current runtime. |
| `registration.tools` | `unvalidated` | Manifest and optional chaining request tools but do not prove host registration. | Registered `piko:*` tool keys and invocation results from Paperclip. |
| `registration.data` / `ui.dashboard_widgets` | `unvalidated` | Betting Table fixture uses cache-overlay data, not live dashboard UI. | Data provider registration plus dashboard render/read evidence. |
| `registration.actions` / `approvals.native` | `unvalidated` | Fixture approval seam is not Paperclip-owned request proof. | Approve Batch action invocation and native approval create/read evidence. |
| `documents.native` / `comments.native` | `unvalidated` | Fixture adapter refs are in-memory seam results. | Native issue document/comment create/read evidence. |
| `issues.native` | `unvalidated` | Escalation issue creation is seam-only. | Native issue create/read/update evidence. |
| `state.issue_scoped` | `unvalidated` | Cache overlay is explicitly not durable truth. | State set/get plus restart/readback evidence. |
| `state.company_scoped`, `entities.api`, `config.api` | `fallback-only` | Existing docs record readback/API uncertainty. | Round-trip and restore proof for each surface. |
| `activity.logging` | `unvalidated` | Circuit evidence reports activity diagnostics only. | Activity write/read visibility proof. |
| `events.issue_lifecycle` | `unvalidated` | Gate/circuit transitions use explicit invocation. | Delivered issue event payload evidence. |
| `events.terminal_runs` | `fallback-only` | Known fallback posture is active-run polling with jitter/backoff. | Delivered terminal run event proof in the target runtime. |
| `ui.issue_detail_tabs` | `unvalidated` | No live issue view rendered BOS tabs. | Runtime UI render evidence. |

## Failure Modes

| Dependency | Failure path | Expected handling |
|---|---|---|
| Local filesystem docs and fixtures | Missing/unreadable seed, docs, source, test, or capability files. | The demo runner reports seed validation failure or command failure with path context; the docs validator reports all missing required files/sections. |
| JSON fixtures and command output | Malformed seed JSON, non-array seed, malformed probe JSON, or malformed integrated demo JSON. | The runner returns `status=failed`, marks affected phases skipped/failed, and includes bounded stdout/stderr digests without secrets. |
| Subprocesses | Validator, probe, Vite Node, or Vitest exits non-zero. | The runner records label, phase, command, exit code, duration, stdout digest, and stderr digest in `commands` and `failures`. |
| Subprocess timeout | A child command exceeds `--timeout-seconds`. | The runner records `status=timeout`, `exit_code=null`, bounded partial output, and overall demo failure. |
| Optional Paperclip runtime path | Path absent, not a directory, malformed, or no version/build evidence. | The runner adds `runtime.evidence_path` entries to `gap_ledger`; capabilities stay unvalidated. |
| Documentation drift | Required headings, A-step labels, command references, proof-boundary wording, or gap-ledger headings are removed. | `python3 scripts/validate_a1_a10_demo_docs.py` fails with the stale/missing section context. |

## Load Profile

The baseline is a bounded local CLI workflow over a small fixed repository fixture set. At 10x the expected seed issue count, the first likely saturation point is the TypeScript fixture/Vitest subprocess runtime and JSON output size, not a network service or connection pool. Protections are local and explicit: per-subprocess timeout defaults to 120 seconds, stdout/stderr digests are bounded, the seed JSON must be an array, and no background service or unbounded Paperclip scan is started.

Live runtime smoke tests have a separate load profile and must stay bounded to explicit probe/readback operations. Do not add archived/completed issue scans or unbounded run polling to this baseline.

## Negative Tests

Negative coverage for this documentation surface lives in `scripts/test_validate_a1_a10_demo_docs.py`:

- `test_missing_a_step_entry_is_rejected` removes an A-step entry and expects validation failure.
- `test_missing_fixture_boundary_is_rejected` removes the fixture proof boundary wording and expects validation failure.
- `test_missing_gap_ledger_heading_is_rejected` removes the live runtime gap ledger heading and expects validation failure.
- `test_missing_runner_command_is_rejected` removes `python3 scripts/run_a1_a10_demo.py` references and expects validation failure.

The docs validator also rejects missing required sections, missing references from `docs/06_ACCEPTANCE_TESTS.md`, `docs/08_RUNTIME_CAPABILITY_HEALTH.md`, or `docs/09_BACKLOG.md`, and missing expected runner output fields such as `runtime_capability_posture`, `gap_ledger`, and `native_support_confirmed=false`.

## Observability and Diagnostics

Future agents should inspect these surfaces before changing S06 claims:

- `python3 scripts/run_a1_a10_demo.py` for the integrated JSON evidence envelope.
- `commands[]` for phase label, command, exit code, duration, and bounded digests.
- `failures[]` for failing phase and sanitized diagnostics.
- `runtime_capability_posture` for current live runtime confidence.
- `gap_ledger[]` for unvalidated runtime paths, fixture-only surfaces, fallback reasons, and cache-overlay-only posture.
- `phases.A1` through `phases.A10` for selected surfaces, cache-overlay diagnostics, fallback reasons, timestamps, and artifact refs.
- `python3 scripts/validate_a1_a10_demo_docs.py` for runbook drift.
