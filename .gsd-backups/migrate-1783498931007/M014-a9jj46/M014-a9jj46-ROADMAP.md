# M014-a9jj46: Paperclip Runtime Stability Gate for BOS Light E2E

**Vision:** Create a proof-gated runtime stability path that stops repeated Paperclip restoration loops and allows one bounded BOS Light E2E attempt only after source truth, VPS forensics, script hardening, and persistence proof are in place.

## Success Criteria

- A source truth map reconciles BOS Light v1.4.1 plus R026 doctrine, company identity claims, runtime surfaces, and proof gaps with cited evidence.
- Read-only VPS forensic evidence distinguishes Docker or data wipe from auth, ownership, company, or proxy drift, or records a precise inconclusive verdict.
- Mutation-capable Paperclip scripts no longer silently target hardcoded stale company IDs and fail closed before mutation when auth, company visibility, or confirmation is missing.
- A persistence canary proves native Paperclip state survives the documented safe restart or writes a structured fail-closed blocker.
- The bounded BOS Light E2E gate requires terminal status, schema-valid resultJson.bos, native Paperclip artifact readback, and zero unconfirmed live side effects.

## Slices

- [ ] **S01: Source Inventory and Runtime Truth Map** `risk:high` `depends:[]`
  > After this: After this: a future agent can read one evidence-cited map and know which BOS doctrine, company IDs, runtime surfaces, and proof gaps are authoritative or still uncertain.

- [ ] **S02: VPS Read Only Forensics** `risk:high` `depends:[S01]`
  > After this: After this: the project has read-only VPS evidence showing whether the failure pattern is Docker or data wipe, container recreate, auth drift, ownership drift, proxy drift, or inconclusive.

- [ ] **S03: Runtime Lockfile and Script Hardening** `risk:high` `depends:[S01,S02]`
  > After this: After this: mutation-capable Paperclip scripts fail closed when runtime target, auth, company visibility, adapter support, or confirmation is missing.

- [ ] **S04: Persistence Canary** `risk:high` `depends:[S03]`
  > After this: After this: a native Paperclip marker is read back before and after the documented safe restart, or a precise fail-closed blocker explains why persistence cannot be proven.

- [ ] **S05: Bounded BOS Light E2E Gate** `risk:high` `depends:[S04]`
  > After this: After this: one minimal BOS Light workflow either produces schema-valid resultJson.bos plus native Paperclip readback, or records a fail-closed E2E blocker without overclaiming capability.

## Boundary Map

### S01 → S02

Produces:
- Source truth map with company ID confidence levels, capability posture, and forbidden assumptions.
- Target list for VPS evidence collection.

Consumes:
- Current repo docs, runtime evidence, sibling v1.4.1 and v1.4.2 packages, project memory.

### S02 → S03

Produces:
- VPS forensic verdict or inconclusive evidence package.
- Verified or rejected assumptions about container, volume, data directory, auth, ownership, and proxy state.

Consumes:
- S01 target and risk map.

### S03 → S04

Produces:
- Runtime lockfile or equivalent config contract.
- Script preflight behavior that blocks missing auth, stale company ID, unsupported target, and missing confirmation.

Consumes:
- S01 source truth map and S02 forensic findings.

### S04 → S05

Produces:
- Persistence canary evidence with native Paperclip marker readback before and after safe restart, or a fail-closed blocker.

Consumes:
- S03 hardened preflight and explicit user confirmation.

### S05 → downstream milestones

Produces:
- Bounded BOS-shaped E2E evidence or blocker with terminal status, resultJson.bos schema check, native artifact readback, and side-effect accounting.

Consumes:
- S01-S04 completed proof gates.
