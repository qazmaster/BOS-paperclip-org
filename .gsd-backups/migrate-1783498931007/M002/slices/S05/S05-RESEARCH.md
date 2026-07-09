# M002 — Research

**Date:** 2026-05-29

## Summary

S05 is not blocked by a missing pure implementation; it is blocked by missing live Paperclip evidence for plugin registration and UI surfaces. The repository already has conservative draft seams for tools, data, actions, and UI, but all of them are explicitly guarded as unvalidated or fallback-only. S04 live issue/document/comment evidence must not be reused to promote anything in this slice.

Current code path shape:
- `plugin-bos-light/src/worker.ts` registers `piko:*` tools, a `betting-table` data provider, and `approve-batch` action behind optional chaining. It is designed to fail closed and warn instead of crashing.
- `plugin-bos-light/manifest.paperclip-plugin.json` requests the full surface set, while `plugin-bos-light/capabilities.paperclip-runtime.json` and `docs/08_RUNTIME_CAPABILITY_HEALTH.md` keep the runtime matrix conservative.
- `plugin-bos-light/widgets/BettingTableWidget.tsx` is only a React scaffold; it is not host-integrated proof.
- `scripts/validate_runtime_capabilities.py` is the guardrail enforcing that capability promotion is only accepted with its own live evidence.

## Recommendation

Treat S05 as a probe-and-classify slice, not a feature-complete delivery slice. The first unblocker is a host-visible plugin load / registration readback smoke that records actual registered tool keys, data-provider keys, action keys, and UI render ids. Only after that should any capability matrix row move beyond `unvalidated` or `fallback-only`, and only for the specific surface proved by its own readback.

Build the S05 evidence in the same style as S04: a bounded live probe, a validator, and a machine-readable evidence JSON. Keep the runtime matrix and health docs in sync with the probe output, but do not let fixture harness results or S04 native artifact proof stand in for host registration or UI rendering proof.

## Implementation Landscape

### Key Files

- `plugin-bos-light/src/worker.ts` — optional tool/data/action registration seams; likely the first place to instrument or smoke-test actual host registration keys.
- `plugin-bos-light/manifest.paperclip-plugin.json` — declares requested tools and UI slots; useful for comparing requested vs observed host support.
- `plugin-bos-light/capabilities.paperclip-runtime.json` — source of truth for capability status; any promotion must be reflected here first/with evidence.
- `plugin-bos-light/src/runtimeCapabilities.ts` — source-level mirror of the matrix keys/status vocabulary; must stay aligned with the JSON matrix.
- `plugin-bos-light/widgets/BettingTableWidget.tsx` — current UI scaffold; useful for local component behavior, not host-rendering proof.
- `docs/08_RUNTIME_CAPABILITY_HEALTH.md` and `docs/13_LIVE_BOS_ARTIFACT_FLOW.md` — downstream-facing posture docs; they should only narrate surfaces with live proof.
- `scripts/validate_runtime_capabilities.py` — validator that prevents overclaims and enforces S04/S05 consistency.
- `scripts/probe_paperclip_runtime.py` — conservative metadata probe; useful as a baseline, but it does not prove runtime behavior.
- `plugin-bos-light/tests/acceptance.test.ts` — local seam coverage for tools/data/actions/approval fallback logic; good regression net, not host proof.

### Natural seams

1. Pure logic modules: BPI, blueprint, betting table, eval gates, circuit breaker, decision.
2. Worker registrations: tool/data/action registration is isolated in `registerBosLightPlugin(ctx)`.
3. UI presentation: the widget is independent React code and can be validated locally before host integration.
4. Capability governance: matrix + validator + health docs are already separate, so probe results can be promoted surgically.

### Build order

1. Prove plugin load / registration readback first, because it unblocks every other host-surface claim.
2. Probe `registration.tools`, `registration.data`, and `registration.actions` independently; registration does not imply invocation or rendering.
3. Probe `ui.dashboard_widgets` and `ui.issue_detail_tabs` separately; rendering of one does not imply the other.
4. Only after a surface has its own host proof should the matrix/docs be updated, then rerun the capability validator.

### Verification approach

- Use a bounded live Paperclip probe that records:
  - runtime version/build;
  - registered tool/data/action keys;
  - dashboard widget render ids;
  - issue detail tab render ids;
  - negative/fallback diagnostics for anything absent.
- Keep the existing local regression net green:
  - `npm --prefix plugin-bos-light test`
  - `npm --prefix plugin-bos-light run typecheck`
  - `python3 scripts/validate_runtime_capabilities.py`
- If a live probe fails, preserve fallback-only/unvalidated posture and capture the failure as evidence instead of silently skipping it.

## Constraints

- S04 live issue/document/comment evidence must not be reused to confirm plugin registration or UI surfaces.
- `worker.ts` uses optional chaining for registrations, so a missing host surface can be silently skipped; the probe must explicitly record absence.
- `InMemoryPaperclipAdapter` and `InMemoryBOSPersistence` are test-only seams and do not prove host support.
- `approvals.native` remains unvalidated; `approve-batch` can only prove action wiring, not native approval ownership.
- GSD-Pi is still blocked, so S05 should not depend on Div4 automation for host capability proof.

## Common Pitfalls

- **Treating tool registration as invocation proof** — a registered handler may still not be callable from the host UI.
- **Treating widget code as dashboard proof** — local React rendering is not Paperclip dashboard rendering.
- **Promoting from fallback envelopes** — comment/markdown diagnostics are visible evidence, but they are not native host support for the underlying surface.
- **Letting docs drift ahead of proof** — the matrix and health report must never claim a surface before the live probe does.

## Open Risks

- The current runtime may accept some registrations but not render UI slots.
- The host may expose registration but not provide readback of rendered ids in a form that the probe can inspect cleanly.
- `ctx.tools.register` / `ctx.data.register` / `ctx.actions.register` may all have different failure modes, so one probe should not be assumed to cover all three.
- Issue-detail tabs and dashboard widgets are separate surfaces and may need separate smoke paths or separate UI-entry contexts.

## Skills Discovered

| Technology | Skill | Status |
|------------|-------|--------|
| Paperclip / plugin runtime | `paperclipai/paperclip@paperclip` | promising (`npx skills add paperclipai/paperclip@paperclip`) |
| Paperclip plugin authoring | `paperclipai/paperclip@paperclip-create-plugin` | promising (`npx skills add paperclipai/paperclip@paperclip-create-plugin`) |
| Agent adapter integration | `paperclipai/paperclip@create-agent-adapter` | promising (`npx skills add paperclipai/paperclip@create-agent-adapter`) |
| Paperclip dev workflow | `paperclipai/paperclip@paperclip-dev` | promising (`npx skills add paperclipai/paperclip@paperclip-dev`) |

## Sources

- `plugin-bos-light/src/worker.ts`
- `plugin-bos-light/capabilities.paperclip-runtime.json`
- `docs/08_RUNTIME_CAPABILITY_HEALTH.md`
- `docs/13_LIVE_BOS_ARTIFACT_FLOW.md`
- `docs/05_PERSISTENCE_MATRIX.md`
- `docs/06_ACCEPTANCE_TESTS.md`
- `scripts/validate_runtime_capabilities.py`
- `scripts/probe_paperclip_runtime.py`
- `plugin-bos-light/tests/acceptance.test.ts`
