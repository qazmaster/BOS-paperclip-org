---
id: T01
parent: S01
milestone: M009
key_files:
  - plugin-bos-light/src/pluginRegistration.ts
  - plugin-bos-light/tests/pluginRegistration.test.ts
key_decisions:
  - Documented Paperclip plugin API from PLUGIN_SPEC.md rather than live runtime (0.3.1 has no plugin support)
  - Used local type definitions instead of importing from @paperclipai/plugin-sdk (not yet published/available in build env)
  - Structured registration as documentation-first module with full type contracts for manifest, context, events, RPC, and capabilities
duration: 
verification_result: passed
completed_at: 2026-06-02T10:41:15.849Z
blocker_discovered: false
---

# T01: Documented Paperclip plugin registration API surface including manifest contract, lifecycle events, capabilities, host-worker RPC protocol, and probe routes

**Documented Paperclip plugin registration API surface including manifest contract, lifecycle events, capabilities, host-worker RPC protocol, and probe routes**

## What Happened

Researched the Paperclip plugin system by studying the official PLUGIN_SPEC.md (proposed post-V1 spec) from the Paperclip GitHub repo. Key findings:

1. **Plugin Registration Model**: Plugins use `definePlugin()` from `@paperclipai/plugin-sdk` with a typed `PluginDefinition` interface. Registration is operator-driven via CLI (`pnpm paperclipai plugin install <package>`). The manifest exports from `dist/manifest.js` with a `PaperclipPluginManifestV1` shape.

2. **Issue Lifecycle Hooks**: Delivered via `onEvent()` RPC, NOT callback-style hooks. The host dispatches domain events to the worker. Issue lifecycle events include: `issue.created`, `issue.updated`, `issue.checked_out`, `issue.released`, `issue.comment.created`, `issue.document.created/updated/deleted`, `issue.relations.updated`, and `issue.assignment_wakeup_requested`. Delivery is at-least-once; handlers must be idempotent.

3. **Host-Worker Protocol**: Out-of-process JSON-RPC on stdio. Required RPCs: `initialize`, `health`, `shutdown`. Optional: `validateConfig`, `configChanged`, `onEvent`, `runJob`, `handleWebhook`, `getData`, `performAction`, `executeTool`.

4. **SDK Context**: Workers receive `PluginContext` with typed clients for `ctx.events`, `ctx.issues`, `ctx.tools`, `ctx.state`, `ctx.entities`, `ctx.data`, `ctx.actions`, `ctx.logger`, etc.

5. **Current Status (Critical)**: Paperclip 0.3.1 sandbox returns 404 on all 19+ plugin-specific probe routes. Plugin registration is BLOCKED until a Paperclip build with plugin runtime support is deployed. This is expected — the plugin system is post-V1 per the spec.

Created `pluginRegistration.ts` with complete type definitions for the manifest, context, events, capabilities, RPC protocol, and probe routes. Created `pluginRegistration.test.ts` with 33 tests covering all documented surfaces. All 651 tests pass across the full test suite.

## Verification

1. TypeScript typecheck passes clean (npx tsc --noEmit, exit 0)
2. All 33 new pluginRegistration tests pass
3. All 651 tests pass across 40 test files (full suite regression)
4. Manifest declares correct tools, UI slots, capabilities, and categories
5. Lifecycle events array covers all issue create/update/assign/document/comment/relation events
6. Probe routes cover plugin management, admin, data/actions, tools, state, events, webhooks
7. buildRegistrationStatus correctly reports runtimeAvailable=false for 0.3.1 sandbox

## Verification Evidence

| # | Command | Exit Code | Verdict | Duration |
|---|---------|-----------|---------|----------|
| 1 | `cd plugin-bos-light && npx tsc --noEmit` | 0 | ✅ pass | 3000ms |
| 2 | `cd plugin-bos-light && npx vitest run tests/pluginRegistration.test.ts` | 0 | ✅ pass | 630ms |
| 3 | `cd plugin-bos-light && npx vitest run` | 0 | ✅ pass | 3480ms |

## Deviations

None

## Known Issues

["Paperclip 0.3.1 sandbox does not expose plugin registration routes (all 404) - plugin runtime is post-V1 feature", "@paperclipai/plugin-sdk is not available as a published package - local type definitions used as bridge"]

## Files Created/Modified

- `plugin-bos-light/src/pluginRegistration.ts`
- `plugin-bos-light/tests/pluginRegistration.test.ts`
