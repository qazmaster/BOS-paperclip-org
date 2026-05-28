# 08 - Runtime Capability Health

This report is the reader-facing S02 diagnostic surface for BOS Light's Paperclip runtime adapter. The capability matrix in `plugin-bos-light/capabilities.paperclip-runtime.json` remains the machine-readable source of truth; this document explains the current operational posture for downstream slices.

## Runtime Evidence

There is **no live Paperclip runtime evidence** captured in this repository. `python3 scripts/probe_paperclip_runtime.py` was run with no `--paperclip-dir`, reported `availability=not-provided`, spawned zero external processes, and intentionally kept all runtime behavior claims conservative. Runtime version/build evidence is therefore unknown: `plugin.runtime.version_build` remains `unvalidated`, and no requested manifest surface has been promoted to `confirmed`.

Local evidence that does exist:

- `python3 scripts/validate_company_template.py` proves only the repository-local company template contract.
- `python3 scripts/probe_paperclip_runtime.py` reports honest-unvalidated posture when no runtime path is supplied.
- `python3 scripts/validate_runtime_capabilities.py` checks matrix, manifest, source boundary, and this report for drift.

## C4/C5/C6/C7 Status

| Check | Current status | Boundary |
|---|---|---|
| C4 Company template import/export | `unvalidated` | A1 local package validation passes, but live Paperclip import/export schema has not accepted the template. |
| C5 AGENTS.md syntax compatibility | `unvalidated` | Profiles exist and are locally referenced, but Paperclip's AGENTS.md parser has not accepted them. |
| C6 Plugin runtime version check | `unvalidated` | Runtime version/build is unknown because no live Paperclip runtime evidence was collected. |
| C7 Plugin capability set confirmed | `unvalidated` / `fallback-only` only | Requested manifest surfaces are mapped, not confirmed. Runtime smoke tests must prove each surface before feature flow depends on it. |

## Import/Export and AGENTS.md Compatibility

The S01 company-template proof remains valid as a repository-local readiness check, but it does not weaken D002 or claim Paperclip import compatibility. `company_template.import_export` and `agents.syntax` stay `unvalidated` until a real Paperclip export/import run and AGENTS.md syntax validation produce runtime evidence.

Compatibility posture for releases and handoffs:

- ship `company-template/bos-company-template.json` as a semantic import-prep artifact, not a certified Paperclip export;
- keep AGENTS.md profiles as markdown operating briefs that can be copied or converted if Paperclip syntax rejects them;
- point operators from S01 proof artifacts to this S02 report before attempting import/export.

## Per-Surface Matrix Summary

Status totals: `fallback-only`=4, `unvalidated`=16. `confirmed`=0.

| Capability key | Status | Paperclip surface | Evidence boundary | Fallback | Blocker |
|---|---|---|---|---|---|
| `company_template.import_export` | `unvalidated` | Company template import/export runtime schema | Local repository validation only; live Paperclip import/export path has not been exercised. | Keep semantic company-template assets and AGENTS.md files as human/import-prep artifacts until live import/export compatibility is proven. | Cannot claim native company import/export support until a real Paperclip export/import run supplies schema/version evidence. |
| `agents.syntax` | `unvalidated` | AGENTS.md profile syntax compatibility | Local files exist and reference BOS Light divisions; current Paperclip agent profile parser has not validated the syntax. | Treat AGENTS.md profiles as markdown operating briefs that can be manually copied or converted if Paperclip syntax rejects them. | Do not mark template release syntax-compatible until Paperclip accepts the AGENTS.md files. |
| `plugin.runtime.version_build` | `unvalidated` | Plugin runtime version and build metadata | No runtime probe has captured Paperclip version/build in this repository. | Fail closed in health reports by showing runtime version/build as unknown and keeping SDK-dependent capabilities unvalidated. | Cannot set minimum supported runtime or breaking-change posture without live version/build evidence. |
| `plugin.runtime.registration` | `unvalidated` | Plugin entrypoint and definePlugin/import-path runtime | worker.ts explicitly says the definePlugin import path and SDK wiring are draft pseudo wiring. | Keep pure BOS Light logic callable directly while plugin entrypoint support is unknown. | Do not ship runtime plugin registration until current Paperclip SDK entrypoint is confirmed. |
| `registration.tools` | `unvalidated` | ctx.tools.register tool registration API | Draft manifest requests tools.register and worker.ts calls ctx.tools?.register with optional chaining; no host response evidence exists. | Run pure TypeScript functions directly in local tests or expose results through manual issue comments until host tool registration is proven. | Do not present piko:* tools as host-available until registration and invocation are observed. |
| `registration.data` | `unvalidated` | ctx.data.register data provider API | Draft manifest requests data.register and worker.ts calls ctx.data?.register; no Paperclip host registration evidence exists. | Render betting candidates from managed Paperclip issue/project artifacts or generated markdown if data providers are absent. | Do not rely on dashboard data provider hydration until Paperclip confirms data.register. |
| `registration.actions` | `unvalidated` | ctx.actions.register action API | Draft manifest requests actions.register and worker.ts calls ctx.actions?.register; no host action invocation evidence exists. | Use a managed approval issue/comment workflow when host actions are unavailable. | Do not expose Approve Batch as a working native action until action registration and invocation are proven. |
| `config.api` | `fallback-only` | Plugin config read/write API | Draft manifest requests config.read/config.write, but no ctx.config call or runtime evidence exists yet. | Restore BOS config from config JSON and company-template artifacts; do not store durable config only in plugin state. | Native plugin config cannot be treated as durable until read/write round-trip is proven. |
| `state.issue_scoped` | `unvalidated` | Issue-scoped plugin state read/write API | Persistence layer is in-memory only and docs require issue-scoped state spike before design freeze. | Mirror important results into issue documents/comments and reconstruct from native artifacts after state loss. | Do not make issue-scoped plugin state the only durable record until round-trip and restore evidence exists. |
| `state.company_scoped` | `fallback-only` | Company-scoped plugin state read/write API | docs/07_RISKS_AND_SPIKES.md records company-scoped ctx.state readback as a known risk. | Use config JSON, managed native issues/projects, and reconstructable artifacts instead of company-scoped state for durable truth. | Do not depend exclusively on company-scoped plugin state for Betting Table, circuit state, or config. |
| `entities.api` | `fallback-only` | Plugin entity read/write API | Draft manifest requests entities.read/entities.write, but no adapter implementation or runtime proof exists. | Represent recoverable cycle state in managed native issue/project artifacts until entity APIs are confirmed. | Do not design Betting Table durability around plugin entities until read/write proof exists. |
| `activity.logging` | `unvalidated` | Activity logging write API | Draft manifest requests activity.write and adapter exposes logActivity, but in-memory adapter no-ops it. | Attach issue comments or managed escalation issue updates when activity logging is unavailable. | Circuit Breaker fallback cannot depend on activity logs until write and scan behavior are proven. |
| `events.issue_lifecycle` | `unvalidated` | Issue lifecycle event subscription API | Draft manifest requests events.subscribe, but no worker subscription is implemented or observed. | Use explicit tool/action invocation and bounded polling where lifecycle events are missing. | Do not assume event-driven issue transitions until event delivery evidence exists. |
| `events.terminal_runs` | `fallback-only` | Terminal/agent run event subscription API | docs/07_RISKS_AND_SPIKES.md records run events as declared-but-maybe-not-emitted in some runtime versions. | Poll active runs only with jitter/backoff and fall back to activity-log scanning. | Circuit Breaker must not rely only on run events until C2/C7 prove emission in the target runtime. |
| `issues.native` | `unvalidated` | Native issue read/write/create API | Draft manifest requests issues.read/issues.write and adapter exposes createEscalationIssue, but implementation is in-memory only. | If native issue APIs are absent, write escalation details to comments/documents and require manual issue creation. | Do not claim automated escalation issue creation until native issues API proof exists. |
| `documents.native` | `unvalidated` | Native issue document API | Adapter exposes createIssueDocument but current implementation stores documents in memory only; manifest has no explicit documents capability. | Use issue description or comments for markdown artifacts if native documents are unavailable. | Blueprint and gate documents must not be described as native Paperclip documents until create/read proof exists. |
| `comments.native` | `unvalidated` | Native issue comment API | Adapter exposes addIssueComment but current implementation stores comments in memory only; manifest has no explicit comments capability. | Use issue documents or issue descriptions where native comments are unavailable. | Do not rely on issue history restore from comments until native comment behavior is proven. |
| `approvals.native` | `unvalidated` | Native approval/request creation API | worker.ts calls ctx.approvals?.create and adapter exposes createApprovalRequest, but no Paperclip runtime approval was created. | Create a manual approval issue/comment requesting review; never substitute a plugin-side decision for native approval. | A5 cannot pass until Paperclip-native approval/request creation is proven. |
| `ui.dashboard_widgets` | `unvalidated` | Dashboard widget UI slot | Draft manifest declares dashboard_widgets=['betting-table']; no runtime UI slot rendering evidence exists. | Publish Betting Table as a managed native issue/project or markdown artifact when dashboard widgets are unavailable. | Do not promise dashboard Pitch Deck rendering until Paperclip renders the declared widget. |
| `ui.issue_detail_tabs` | `unvalidated` | Issue detail tab UI slots | Draft manifest declares issue_detail_tabs but no Paperclip issue view has rendered them. | Surface status, circuit, and gate results through issue labels/comments/documents when tabs are unavailable. | Do not present issue overlay tabs as available until runtime UI rendering evidence exists. |

## Adapter Contract Rules

- `plugin-bos-light/src/runtimeCapabilities.ts` mirrors capability keys and status vocabulary only; `plugin-bos-light/capabilities.paperclip-runtime.json` remains the evidence source of truth.
- `InMemoryPaperclipAdapter` and `InMemoryBOSPersistence` are test/draft-only seams. They keep pure BOS Light logic executable without implying Paperclip support.
- Requested manifest capabilities distinguish integration intent from confirmed runtime capabilities; manifest entries are not proof that the host can load, register, render, or invoke them.
- No BPI, Blueprint, Betting Table, Eval Gate, or Circuit Breaker feature flow should depend on a runtime surface until that surface has proof evidence.

## Persistence and State Boundaries

Native artifact-first persistence remains the durable policy. Issue documents/comments are the preferred Paperclip-visible artifact path once native behavior is proven; until then, markdown issue descriptions, comments, managed issues/projects, and config JSON remain the recoverable fallback.

Plugin state limits:

- `state.issue_scoped` is `unvalidated`; use it only as a cache/overlay after round-trip and restart/readback proof.
- `state.company_scoped` is `fallback-only`; do not use it as the sole source for Betting Table cycles, circuit/config state, or durable decisions.
- `entities.api` and `config.api` are `fallback-only`; native issues/projects and config JSON remain the recovery path.

## Events, Polling, and Activity Fallback

`events.issue_lifecycle` is `unvalidated` and `events.terminal_runs` is `fallback-only`. Circuit Breaker and gate transitions must work through explicit tool/action invocation and bounded polling before they depend on event delivery. When events are missing, use active-run polling with jitter/backoff and activity-log or issue-comment fallback.

Polling posture remains aligned with `docs/07_RISKS_AND_SPIKES.md`: active runs only, `interval_ms=30000`, `jitter_ms=5000`, `backoff_after_attempts=10`, and no archived/completed issue scans.

## Approval and Request Ownership

Approval/request ownership stays with Paperclip. `approvals.native` is `unvalidated`; `registration.actions` only requests an action seam and does not prove native approval creation. Fallbacks may create an issue/comment asking humans to review a batch, but must not substitute a local/test-double decision for Paperclip-native approvals.

## Known Blockers

- No Paperclip runtime version/build evidence is available.
- Company template import/export and AGENTS.md syntax have not been exercised against a live Paperclip instance.
- Plugin registration, tools/data/actions registration, UI slots, native issues/documents/comments, approvals, state/entities/config, and activity/events all lack live behavior proof.
- Company-scoped state and terminal-run events remain fallback-only because prior risks say they may not read back or emit in some runtime versions.

## Downstream Guidance

- **S03**: Build BPI/Blueprint/Eval Gate logic against pure functions and native-artifact fallbacks first. Do not assume `ctx.tools.register`, native documents, or issue detail tabs are available.
- **S04**: Treat Betting Table UI/data providers as optional. Use managed native issues/projects or generated markdown until `registration.data`, `ui.dashboard_widgets`, entities, and approvals are proven.
- **S05**: Implement Circuit Breaker with polling/activity/comment fallbacks before event-driven paths. Do not rely only on run events or company-scoped state.
- **S06**: Make runtime smoke tests the closure gate: capture version/build, plugin load, each requested registration surface, native artifacts, approval/request creation, and import/export/AGENTS.md compatibility before any capability becomes `confirmed`.
