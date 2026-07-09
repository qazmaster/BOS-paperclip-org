# S01: Plugin Registration and Issue Lifecycle Hooks

**Goal:** Prove BOS Light plugin can register and hook into Paperclip issue lifecycle
**Demo:** Plugin registers on live Paperclip, hooks fire on issue create/update/assign

## Must-Haves

- Plugin installs without error, issue lifecycle hooks fire, plugin state initializes

## Proof Level

- This slice proves: Live Paperclip instance

## Integration Closure

Plugin hooks wired to issue create/update/assign events

## Verification

- Plugin registration status visible in Paperclip logs

## Tasks

- [x] **T01: Research Paperclip plugin registration API** `est:2h`
  Study how Paperclip plugins register. Find plugin lifecycle hooks (issue create, update, assign). Document API surface.
  - Files: `plugin-bos-light/src/pluginRegistration.ts`
  - Verify: Plugin registration API documented, hooks identified

- [x] **T02: Implement plugin registration with Paperclip** `est:3h`
  Implement BOS Light plugin registration. Connect to Paperclip instance. Initialize plugin state.
  - Files: `plugin-bos-light/src/pluginRegistration.ts`
  - Verify: Plugin registers on live Paperclip without error

- [x] **T03: Implement issue lifecycle hooks** `est:3h`
  Implement hooks for issue create, update, assign events. Log hook invocations.
  - Files: `plugin-bos-light/src/issueLifecycleHooks.ts`
  - Verify: Hooks fire on issue create/update/assign

- [x] **T04: Test plugin registration on live Paperclip** `est:1h`
  Run registration probe against live Paperclip. Verify hooks fire. Verify state initializes.
  - Files: `plugin-bos-light/tests/pluginRegistration.test.ts`
  - Verify: All registration tests pass against live instance

## Files Likely Touched

- plugin-bos-light/src/pluginRegistration.ts
- plugin-bos-light/src/issueLifecycleHooks.ts
- plugin-bos-light/tests/pluginRegistration.test.ts
