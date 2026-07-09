# S03: GrantPolicy and BosTaskMetadata Live Enforcement

**Goal:** Enforce grant policy and metadata mirror on live instance
**Demo:** Div4 blocked from external access, BudgetGrant issued for BOS-T2, metadata mirrored to comments

## Must-Haves

- GrantPolicy denies Div4 external access, BudgetGrant issued for valid requests, BosTaskMetadata stored and mirrored

## Proof Level

- This slice proves: Live enforcement with BOS-T2 test task

## Integration Closure

GrantPolicy hooks into agent action validation, BosTaskMetadata stored in plugin state

## Verification

- Grant decisions logged, metadata visible in issue comments

## Tasks

- [x] **T01: Wire GrantPolicy to agent action validation** `est:3h`
  Connect GrantPolicy to agent action hook. Validate tools, secrets, cost before execution.
  - Files: `plugin-bos-light/src/grantPolicy.ts`
  - Verify: GrantPolicy validates agent actions

- [x] **T02: Implement BosTaskMetadata storage and mirror** `est:3h`
  Store BosTaskMetadata in plugin state. Mirror to Paperclip comments.
  - Files: `plugin-bos-light/src/bosTaskMetadata.ts`, `plugin-bos-light/src/metadataMirror.ts`
  - Verify: Metadata stored and mirrored to comments

- [x] **T03: Test grant enforcement with BOS-T2** `est:2h`
  Assign BOS-T2 to Div7 agent. Verify grant policy validates. Verify Div4 external access denied.
  - Files: `plugin-bos-light/tests/grantEnforcement.test.ts`
  - Verify: BOS-T2 grant policy enforced

## Files Likely Touched

- plugin-bos-light/src/grantPolicy.ts
- plugin-bos-light/src/bosTaskMetadata.ts
- plugin-bos-light/src/metadataMirror.ts
- plugin-bos-light/tests/grantEnforcement.test.ts
