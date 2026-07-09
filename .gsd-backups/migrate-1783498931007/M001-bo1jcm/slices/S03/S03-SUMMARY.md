---
id: S03
parent: M001-bo1jcm
milestone: M001-bo1jcm
provides:
  - Bounded BPI score contract with hard-gate behavior for seeded issues.
  - Five-section Product Blueprint markdown and artifact envelope.
  - Stable `blueprint_id` / `artifact_ref` handoff for S04 Betting Table candidates.
  - Documented native/comment/markdown fallback semantics and operational recovery guidance.
requires:
  - slice: S02
    provides: Capability health contract and adapter boundaries consumed for proof-gated native document/comment fallback behavior.
affects:
  - S04
  - S05
  - S06
key_files:
  - plugin-bos-light/src/blueprintArtifact.ts
  - plugin-bos-light/src/issueBlueprintFlow.ts
  - plugin-bos-light/src/worker.ts
  - plugin-bos-light/src/index.ts
  - plugin-bos-light/tests/blueprintArtifact.test.ts
  - plugin-bos-light/tests/acceptance.test.ts
  - plugin-bos-light/capabilities.paperclip-runtime.json
  - plugin-bos-light/src/runtimeCapabilities.ts
  - docs/04_DATA_CONTRACTS.md
  - docs/05_PERSISTENCE_MATRIX.md
  - docs/06_ACCEPTANCE_TESTS.md
  - docs/08_RUNTIME_CAPABILITY_HEALTH.md
  - docs/09_BACKLOG.md
  - scripts/validate_runtime_capabilities.py
key_decisions:
  - Use `ProductBlueprintArtifact.artifact_ref` as `status_overlay.blueprint_id` so downstream Betting Table work receives a stable surface-qualified reference without relying on plugin state.
  - Do not promote Paperclip document/comment/state capability posture from issue content, generated markdown, or fixture tests; native support remains proof-gated by runtime capability validation and live evidence.
  - Attempt native document writes only when capability posture is confirmed or explicitly enabled; otherwise fall back to comments or markdown-only diagnostics with sanitized failure metadata.
patterns_established:
  - Proof-gated native-first artifact envelope with explicit `selected_surface`, `mirrored_at`, `fallback.reason`, and stable `artifact_ref`.
  - Seeded issue composition path that keeps pure BPI/Blueprint logic separate from adapter writes and optional cache-overlay persistence.
  - Cache-overlay diagnostics report non-durable persistence status without becoming the source of truth.
observability_surfaces:
  - Artifact envelope exposes selected surface, mirrored timestamp, stable reference, and sanitized document/comment fallback diagnostics.
  - `status_overlay.cache_overlay` exposes optional persistence status per write (`saved`, `failed`, `not_attempted`, `missing`) with cache-only durability semantics.
  - Runtime capability validator remains the guardrail for detecting docs/config/source drift before native support is claimed.
drill_down_paths:
  - .gsd/milestones/M001-bo1jcm/slices/S03/tasks/T01-SUMMARY.md
  - .gsd/milestones/M001-bo1jcm/slices/S03/tasks/T02-SUMMARY.md
  - .gsd/milestones/M001-bo1jcm/slices/S03/tasks/T03-SUMMARY.md
  - .gsd/milestones/M001-bo1jcm/slices/S03/tasks/T04-SUMMARY.md
duration: ""
verification_result: passed
completed_at: 2026-05-28T04:37:10.870Z
blocker_discovered: false
---

# S03: BPI and Blueprint Native Artifact Flow

**Implemented and verified a seeded issue flow that computes bounded BPI, generates the five-section Product Blueprint, mirrors it through proof-gated native/comment/markdown artifact surfaces, and returns a stable `blueprint_id` for downstream Betting Table work.**

## What Happened

S03 connected the BPI and Product Blueprint path without treating plugin state as durable truth. T01 added `createProductBlueprintArtifact`, a proof-gated envelope that renders Product Blueprint markdown once, preserves the five required sections, attempts native document mirroring only when the runtime capability posture is confirmed or explicitly enabled, falls back to issue comments when document writes fail, and returns markdown-only diagnostics when adapter writes are unavailable or fail. The envelope exposes `artifact_id`, `artifact_ref`, `selected_surface`, `mirrored_at`, score metadata, markdown, and sanitized fallback diagnostics.

T02 added `runSeededIssueBlueprintFlow`, which accepts seeded issue inputs, computes bounded/explainable BPI including hard-gate behavior, invokes the artifact contract, records cache-overlay status diagnostics when optional persistence is present, and returns `{ bpi, blueprint_markdown, artifact, status_overlay }`. `status_overlay.blueprint_id` is intentionally the opaque `artifact.artifact_ref`, giving S04 a stable surface-qualified Product Blueprint reference without implying native approval/request scope or plugin-state durability. Worker/tool wiring now exposes an optional draft `piko:bpi-blueprint-artifact` path and returns `adapter_unavailable` diagnostics when no caller-provided Paperclip adapter seam exists.

T03 documented the contract in the data contracts, persistence matrix, acceptance tests, runtime capability health report, and backlog. The docs keep Paperclip document/comment/state capabilities unvalidated/fallback-only unless live runtime evidence exists, and instruct downstream Betting Table work to consume `blueprint_id` as an opaque artifact reference.

T04 reran the full closure checks and confirmed that no live Paperclip runtime support was simulated or promoted. The final state proves contract plus fixture integration: BPI scoring is bounded and explainable, Blueprint output has the required five sections, document/comment/markdown fallback semantics are explicit, cache-overlay diagnostics remain non-durable, and capability guardrails continue to prevent unproven native claims.

## Verification

Fresh closeout verification passed via `gsd_exec` run `60fcfe61-248b-4771-bb58-0a85c67f3d59`:

- `npm --prefix plugin-bos-light test` exited 0: Vitest ran 4 files and 17 tests; `tests/bpi.test.ts`, `tests/circuitBreaker.test.ts`, `tests/blueprintArtifact.test.ts`, and `tests/acceptance.test.ts` all passed.
- `npm --prefix plugin-bos-light run typecheck` exited 0: `tsc --noEmit` completed without errors.
- `python3 scripts/validate_runtime_capabilities.py` exited 0: `Paperclip runtime capabilities OK: manifest surfaces, adapter assumptions, and guardrail fields are mapped.`

Earlier task-level evidence also covered targeted negative cases: hard-gate zero score, missing acceptance/resources defaults, document-write failure fallback, all-adapter failure returning markdown-only diagnostics, cache-overlay save failures, missing persistence, optional worker registration surfaces, stable `artifact_ref` propagation as `blueprint_id`, and no `.gsd` references in plugin tests.

## Requirements Advanced

- R003 — S03 keeps durable truth in Paperclip-visible artifact references or explicit fallback diagnostics, not hidden plugin state.
- R004 — S03 preserves proof-gated runtime capability validation and prevents unproven native document/comment/state support from being claimed.
- R007 — S03 prepares Betting Table work by returning a stable `blueprint_id` artifact reference for ranked candidates.
- R011 — S03 supplies contract plus fixture integration proof while explicitly avoiding simulated live Paperclip runtime claims.
- R012 — S03 routes native artifact behavior through adapter and persistence seams with covered fallback/error paths.
- R013 — S03 implements native-first mirroring semantics with explicit comment and markdown-only fallback metadata.

## Requirements Validated

- R005 — Fresh closeout verification passed full plugin tests, including BPI bounds, hard-gate zero-score behavior, rationale/explainability, and default handling coverage.
- R006 — Fresh closeout verification passed Product Blueprint artifact and acceptance tests proving five required sections plus stable native/comment/markdown artifact references.

## New Requirements Surfaced

- None.

## Requirements Invalidated or Re-scoped

None.

## Operational Readiness

Health signal: S03 is healthy when `npm --prefix plugin-bos-light test`, `npm --prefix plugin-bos-light run typecheck`, and `python3 scripts/validate_runtime_capabilities.py` all pass, and seeded issue flow results include a non-empty `artifact_ref`/`status_overlay.blueprint_id`, `selected_surface`, and `mirrored_at`. Runtime-level health for a processed issue is the returned artifact envelope showing either `paperclip-document`, `paperclip-comment`, or explicit `markdown-only` fallback with sanitized diagnostics.

Failure signal: a non-zero Vitest/typecheck/capability-validator result, missing `blueprint_id`, BPI outside expected bounds, hard-gated input attempting adapter writes, `selected_surface` missing from the artifact envelope, or capability docs/config promoting unproven Paperclip surfaces to `confirmed` should trigger investigation. In runtime use, repeated `document_write_failed`, `comment_write_failed`, or `adapter_unavailable` fallbacks indicate native Paperclip artifact support is unavailable and should trigger follow-up before claiming native durability.

Recovery procedure: first rerun the three closure commands from the worktree. If tests fail, inspect `plugin-bos-light/tests/blueprintArtifact.test.ts` and `plugin-bos-light/tests/acceptance.test.ts` for the failing contract. If capability validation fails, reconcile `plugin-bos-light/capabilities.paperclip-runtime.json`, `plugin-bos-light/src/runtimeCapabilities.ts`, and `docs/08_RUNTIME_CAPABILITY_HEALTH.md` without promoting capabilities absent live evidence. If native writes fail at runtime, keep the markdown/comment fallback artifact reference, preserve sanitized fallback diagnostics, and gather live Paperclip document/comment proof before changing capability posture.

Monitoring gaps: this slice has fixture-level proof only. There is no live Paperclip runtime monitor, no dashboard over fallback rates, and no paging integration. S06 or a later runtime integration slice should add live runtime smoke evidence and aggregate fallback-rate reporting once a concrete Paperclip build and SDK surfaces are available.

## Deviations

The harness rejected a literal verification command containing `cd plugin-bos-light && ... && cd ..`; the equivalent closeout verification was rerun with repository-relative commands and passed. T01 also generated `plugin-bos-light/package-lock.json` because the worktree lacked installed npm dev dependencies.

## Known Limitations

No live Paperclip runtime document/comment/state proof exists in this slice; native surfaces remain unvalidated or fallback-only by design. There is no runtime dashboard or alerting for fallback rates yet; S06 or a later live integration slice should add smoke evidence and operational monitoring once a concrete Paperclip runtime build is available.

## Follow-ups

S04 should consume `status_overlay.blueprint_id` as an opaque Product Blueprint artifact reference and not as an approval/request id. S06 or later runtime integration should gather live Paperclip document/comment proof before promoting native capability posture and should add fallback-rate observability for repeated adapter failures. Dependency audit findings from npm install remain outside S03 scope.

## Files Created/Modified

- `plugin-bos-light/src/blueprintArtifact.ts` — Added proof-gated Product Blueprint artifact envelope and native/comment/markdown fallback logic.
- `plugin-bos-light/src/issueBlueprintFlow.ts` — Added seeded issue composition flow for BPI scoring, Blueprint artifact creation, cache-overlay diagnostics, and `blueprint_id` handoff.
- `plugin-bos-light/src/worker.ts` — Registered optional worker tool wiring and adapter-unavailable diagnostics without overclaiming host support.
- `plugin-bos-light/src/index.ts` — Exported the new S03 artifact and seeded issue flow surfaces.
- `plugin-bos-light/tests/blueprintArtifact.test.ts` — Added contract tests for native fallback, hard gates, incomplete inputs, stable references, and inert markdown handling.
- `plugin-bos-light/tests/acceptance.test.ts` — Added seeded-flow acceptance tests for adapter failures, cache diagnostics, worker optional surfaces, and Betting Table `blueprint_id` propagation.
- `docs/04_DATA_CONTRACTS.md` — Documented Product Blueprint artifact and `blueprint_id` contract.
- `docs/05_PERSISTENCE_MATRIX.md` — Documented native-first artifact persistence and cache-overlay non-durability.
- `docs/06_ACCEPTANCE_TESTS.md` — Documented acceptance coverage and fallback expectations.
- `docs/08_RUNTIME_CAPABILITY_HEALTH.md` — Documented capability posture, artifact envelope, and no-live-runtime-evidence guardrails.
- `docs/09_BACKLOG.md` — Added downstream notes for S04/S06 live proof and observability follow-up.
- `plugin-bos-light/package-lock.json` — Captured npm dependency lockfile generated to make local verification reproducible.
