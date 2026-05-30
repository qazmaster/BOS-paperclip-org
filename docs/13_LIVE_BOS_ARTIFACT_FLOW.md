# 13 - Live BOS Artifact Flow

## Final S04 evidence

The canonical machine-readable S04 state surface is:

```text
runtime-evidence/M002-S04-live-artifact-flow.json
```

This file is the only source used to promote live native artifact support from S04. It records `schema_version: s04-live-artifact-flow/v1`, `artifact_type: live-evidence`, `phase: live`, Paperclip runtime `version: 0.3.1`, and runtime build fingerprint `health.version:0.3.1`.

The bounded run label is `s04-20260529T102822Z`. It targeted company `1a194762-74b6-4c84-ae3c-d2d8f6f31578` (`/BOSA`, `BOS Light S02 Hermes Runtime Gate`) and created a sandbox issue titled `BOS Light S04 sandbox s04-20260529T102822Z`.

`/BOSA` is a historical runtime-gate/artifact-probe company, not the canonical seven-agent validation company. To inspect the seven BOS Light division agents created in S07, use `/BOS/org` for `BOS Light Sandbox` (`43c74adb-b194-44d1-8f8e-ba142544bb9d`). Do not expect `/BOSA/org` to show those seven division agents.

## Supported-boundary proof

S04 used supported Paperclip HTTP issue, document, and comment endpoints only. The evidence explicitly records no core source patch, no direct database mutation, no private module import, no plugin registry mutation, no subprocess execution, and no raw secret diagnostics.

Confirmed live side effects are intentionally bounded:

| Side effect | Count | Evidence field |
|---|---:|---|
| Issues created | 1 | `side_effect_counts.issues_created` |
| Documents created | 1 | `side_effect_counts.documents_created` |
| Comments created | 1 | `side_effect_counts.comments_created` |
| Native approvals created | 0 | `side_effect_counts.approval_requests_created` |
| Hermes runs started | 0 | `side_effect_counts.hermes_runs_started` |
| GSD-Pi runs started | 0 | `side_effect_counts.gsd_pi_runs_started` |
| Activity logs written | 0 | `side_effect_counts.activity_logs_written` |

## Visible artifact references

The five BOS Light evidence families are visible in both the native issue document and the native issue comment: BPI, Blueprint, Betting Table, Eval Gate, and Circuit Breaker. The readbacks contain matching snippets and SHA-256 hashes so future agents can audit content without rerunning the sandbox probe.

| Surface | Ref | Readback | SHA-256 |
|---|---|---|---|
| Issue | `e7ede16c-6535-41ef-bd44-3f9d24980caf` | `readbacks.issue.ok=true`, status code `200` | `391e92efd9d78c673e1abd821e01b22fe29eed9056a25d69b7f5249007c102ce` |
| Document | `7595fd85-80e5-41a4-96c7-01cb3c2de588` | `readbacks.document.ok=true`, status code `200` | `a9a25242499c29048662f4ca340c81e3088d6016f17cc53bc6da2d23e3d04663` |
| Comment | `8233ea7b-ab03-4e9b-8684-6e3ceabde00f` | `readbacks.comments[0].ok=true`, status code `200` | `7bd1d276aaf8bf85255c4ed25598dc0a58b2f0314de45743c12db451d8c6fc0e` |

Capability posture promoted from this proof:

- `issues.native`: `confirmed` for bounded native issue create/readback only.
- `documents.native`: `confirmed` for bounded native issue document create/readback only.
- `comments.native`: `confirmed` for bounded native issue comment create/readback only.

## No-go guard posture

S04 deliberately propagates S02 and S03 no-go guards instead of bypassing them.

| Guard | Evidence ref | Status | Execution allowed | S04 interpretation |
|---|---|---|---|---|
| Hermes | `runtime-evidence/M002-S02-hermes-smoke.json` | `blocked` | `false` | Hermes execution remains no-go because the S02 smoke lacks passing `resultJson.bos` proof. |
| GSD-Pi | `runtime-evidence/M002-S03-gsdpi-smoke.json` | `blocked` | `false` | GSD-Pi execution remains no-go because `gsdpi_local` registration/testEnvironment/BosAdapterResult proof is absent. |

The final S04 run started zero Hermes and zero GSD-Pi runs. Any future document/comment containing BOS Gate or Circuit Breaker text must still be read as artifact evidence, not agent execution evidence.

## Fallback paths that remain active

S04 removes the need to treat native issue/document/comment surfaces as unknown for this sandboxed artifact flow, but fallback behavior remains required for unavailable runtimes, failed writes, malformed readbacks, or stricter future permissions:

- If native documents fail, mirror the artifact into a native comment when comments remain available.
- If comments also fail, preserve the deterministic markdown-only artifact and operator instructions.
- If native issue creation fails for escalation flows, attach escalation details to the current issue document/comment or require manual issue creation.
- Approval fallbacks may request human review through comments or markdown, but they must not populate native approval ids/statuses.

## Remaining gaps and non-promotions

The following surfaces are **not** promoted by S04:

- BOS Light plugin registration or `definePlugin` host loading.
- `ctx.tools.register`, `ctx.data.register`, and `ctx.actions.register` availability.
- Dashboard widgets, issue detail tabs, and any plugin UI surface.
- `approvals.native` native approvals or request creation/readback.
- Plugin state, entities, config, activity logs, or event delivery.
- Hermes agent execution.
- GSD-Pi adapter registration, testEnvironment routing, or execution.
- Company-template import/export and AGENTS.md parser compatibility.

Future capability promotions must name a separate evidence path and pass `scripts/validate_runtime_capabilities.py` without borrowing S04's artifact proof for unrelated surfaces.

## Failure Modes

| Dependency | Failure path | Handling / evidence |
|---|---|---|
| Paperclip HTTP API | Connection loss, timeout, non-2xx status, malformed JSON, or bounded response text returned by a phase. | `scripts/run_s04_live_artifact_flow.py` records phase, status code, bounded response text, timeout, malformed JSON reason, and fallback usage in diagnostics without secrets. |
| Runtime evidence file | Missing file, wrong phase, malformed JSON, absent readbacks, missing runtime version/build, or overclaiming side effects. | `scripts/validate_s04_live_artifact_flow.py --phase final` fails closed and names the missing or invalid evidence path/field. |
| Capability matrix/docs drift | Confirmed status without live version/build/S04 readback proof, unsupported status without fallback/blocker text, missing capability keys, missing health report sections. | `scripts/validate_runtime_capabilities.py` rejects the drift and reports every offending file/context. |
| Prior no-go evidence | S02/S03 guard evidence missing or reporting execution allowed. | S04 evidence keeps `no_go_guards.hermes` and `no_go_guards.gsd_pi` blocked; final validation rejects execution side effects. |
| Secret handling | Auth token or raw secret captured in diagnostics. | Evidence must keep `invariants.no_secret_diagnostics=true`; docs only reference `PAPERCLIP_API_KEY` by name and never include the token value. |

## Load Profile

S04 is a bounded closeout artifact flow, not a high-throughput service. The expected load is one sandbox issue, one document, one comment, and three local validation commands. At 10x load, the first likely saturation point is Paperclip API write/readback rate and operator auditability, not local CPU.

Protections applied:

- The live run records a bounded expected shape and side-effect counts so accidental fan-out is visible.
- Validators are deterministic local file checks with no network calls.
- Future reruns should keep unique run labels, bounded response capture, and explicit side-effect counts; bulk artifact migration requires a separate rate-limit/pagination plan.

## Negative Tests

Negative coverage for this closeout is concentrated in the validator tests:

- `scripts/test_run_s04_live_artifact_flow.py` covers redaction, malformed responses, fallback-only/blocker evidence, unsupported overclaims, and live readback shape enforcement for the S04 runner/validator path.
- `scripts/test_validate_runtime_capabilities.py` covers malformed matrix JSON, missing keys, missing manifest coverage, unsupported statuses without fallback/blocker text, confirmed claims without proof fields, placeholder/future proof text, missing version/build, missing health-report sections, and forbidden wording around events, durable plugin state, and plugin-owned approvals.
- T04 extends runtime capability validation so confirmed `issues.native`, `documents.native`, and `comments.native` require `runtime-evidence/M002-S04-live-artifact-flow.json` with runtime version/build and corresponding live readback evidence; S04 evidence cannot promote approvals, plugin registration, UI/data/action, state, activity, events, Hermes, or GSD-Pi execution.

## Audit commands

```bash
python3 scripts/validate_s04_live_artifact_flow.py --evidence runtime-evidence/M002-S04-live-artifact-flow.json --phase final
python3 scripts/validate_runtime_capabilities.py
npm --prefix plugin-bos-light run typecheck
```
