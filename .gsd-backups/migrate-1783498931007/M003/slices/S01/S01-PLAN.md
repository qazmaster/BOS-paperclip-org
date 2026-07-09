# S01: Decision contract and classifier

**Goal:** Define and prove the shared piko:decide contract for major BOS Light choices before persistence or product-flow integrations depend on it.
**Demo:** Run decision fixture tests showing CLEAR, COMPLICATED, COMPLEX, CHAOTIC, and DISORDER inputs produce validated recommendations, confidence, risk tiers, and compact or expanded records.

## Must-Haves

- Valid decision inputs return Div7.MissionControl metadata with Cynefin domain, confidence, risk tier, recommended action, record detail level, and domain-dependent OODA data.
- CLEAR batch approval examples stay compact while policy, budget, incident, strategic, ambiguous, and chaotic examples include the required OODA sections.
- DISORDER and low-confidence mixed signals are represented truthfully instead of forcing certainty.
- Invalid or under-specified inputs return structured validation errors rather than partial decision records.
- Markdown rendering is deterministic, sanitized, and suitable for downstream Paperclip document/comment artifacts.
- `piko:decide` continues to register through the existing optional worker tool seam without promoting unvalidated host registration support.

## Proof Level

- This slice proves: Contract and fixture tests over plugin-bos-light decision module, rendered decision record shape, and piko:decide worker entrypoint behavior.

## Integration Closure

S01 leaves a stable decision result surface for S02/S03: typed input validation, Cynefin classification, confidence clamping, risk-tier and detail-level selection, OODA rendering data, polished markdown rendering, and worker entrypoint behavior covered by tests. No Paperclip native persistence or live runtime claim is introduced in this slice.

## Verification

- Decision results expose structured diagnostics for domain evidence, risk reasons, validation errors, and record detail level. Invalid inputs return bounded structured errors without secrets or stack traces, so future agents can inspect why a decision was rejected or classified as DISORDER.

## Tasks

- [x] **T01: Add decision contract fixture tests** `est:45m`
  Add focused S01 fixture coverage before implementation changes. Create `plugin-bos-light/tests/decision.test.ts` with cases for CLEAR batch approval, COMPLICATED policy and budget exceptions, COMPLEX ambiguous strategy, CHAOTIC outage or circuit breaker OPEN, DISORDER mixed or underdetermined signals, confidence clamping, deterministic `now`, markdown rendering, and invalid input errors. Tests should assert the contract shape that downstream S02/S03 will consume, not implementation internals.
  - Files: `plugin-bos-light/tests/decision.test.ts`
  - Verify: npm --prefix plugin-bos-light test -- tests/decision.test.ts

- [x] **T02: Implement risk-tiered classifier contract** `est:1h 30m`
  Extend the decision contract and implement classifier behavior to satisfy the S01 fixtures. Update `DecisionMetadata` or introduce a typed decision result surface with risk tier, record detail level, domain evidence, OODA sections when warranted, structured validation errors, and sanitized diagnostics. Preserve `Div7.MissionControl`, clamp confidence into 0..1, classify mixed low-confidence evidence as DISORDER, and keep CLEAR batch approval compact.
  - Files: `plugin-bos-light/src/contracts.ts`, `plugin-bos-light/src/decision.ts`
  - Verify: npm --prefix plugin-bos-light test -- tests/decision.test.ts

- [x] **T03: Render decision records through piko decide** `est:1h`
  Add deterministic decision record markdown rendering and ensure the worker `piko:decide` seam returns the same typed result shape the tests exercise. The renderer should produce a compact record for CLEAR choices and expanded sections for policy, budget, incident, strategic, ambiguous, complex, chaotic, and high-risk decisions. Keep worker registration optional and avoid any claim that host tool registration has live proof.
  - Files: `plugin-bos-light/src/decision.ts`, `plugin-bos-light/src/worker.ts`, `plugin-bos-light/tests/decision.test.ts`
  - Verify: npm --prefix plugin-bos-light test -- tests/decision.test.ts

- [x] **T04: Document and verify the S01 contract** `est:45m`
  Update contract documentation and run the slice-level regression checks. Align `docs/04_DATA_CONTRACTS.md` with the new decision result fields and confirm plugin typecheck plus the full local plugin test suite still pass. Do not promote plugin UI, actions, native approvals, Hermes, GSD-Pi, or host registration support; document S01 as contract or fixture proof only.
  - Files: `docs/04_DATA_CONTRACTS.md`, `plugin-bos-light/src/contracts.ts`, `plugin-bos-light/src/decision.ts`, `plugin-bos-light/tests/decision.test.ts`
  - Verify: npm --prefix plugin-bos-light run typecheck

## Files Likely Touched

- plugin-bos-light/tests/decision.test.ts
- plugin-bos-light/src/contracts.ts
- plugin-bos-light/src/decision.ts
- plugin-bos-light/src/worker.ts
- docs/04_DATA_CONTRACTS.md
