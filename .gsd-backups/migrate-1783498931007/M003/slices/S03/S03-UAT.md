# S03: Major flow decision integration — UAT

**Milestone:** M003
**Written:** 2026-05-31T05:05:43.617Z

# UAT: S03 Major flow decision integration

**UAT Type:** Automated fixture and documentation guardrail UAT; no human/live Paperclip runtime required for this slice.

## Preconditions

- Worktree dependencies are installed for `plugin-bos-light`.
- No live Paperclip credentials are required.
- The S01 decision contract and S02 artifact envelope code are present.

## Steps

1. Run `npm --prefix plugin-bos-light test -- tests/majorFlowDecision.test.ts`.
2. Confirm fixtures cover batch approval, Eval Gate failure, Circuit Breaker OPEN, policy exception, budget exception, strategic choice, malformed adapter fallbacks, markdown/HTML injection, token-like issue ids, malformed direct inputs, missing circuit records, and non-OPEN circuit records.
3. Run `npm --prefix plugin-bos-light test -- tests/majorFlowDecision.test.ts tests/decisionArtifact.test.ts tests/evalGateEvidence.test.ts tests/circuitBreakerFlow.test.ts`.
4. Run `npm --prefix plugin-bos-light run typecheck`.
5. Run `npm --prefix plugin-bos-light test`.
6. Run `python3 scripts/validate_runtime_capabilities.py`.
7. Review the generated/documented contract wording in `docs/04_DATA_CONTRACTS.md` and `docs/08_RUNTIME_CAPABILITY_HEALTH.md` for fixture-only scope and no unsupported runtime claims.

## Expected Outcomes

- Batch approval produces a CLEAR, LOW-risk, compact Div7.MissionControl decision artifact and does not call `createApprovalRequest` or mutate Betting Table native approval ids/statuses.
- Eval Gate failure produces an expanded COMPLICATED artifact with run/gate context, sanitized diagnostics, and no raw gate evidence.
- Circuit Breaker OPEN produces a CHAOTIC, CRITICAL, SELF_HEALING artifact that preserves Div1.HCO containment ownership and avoids event/activity/plugin/runtime claims.
- Policy and budget exceptions produce COMPLICATED expanded artifact-only decisions with reversible next steps.
- Strategic choice produces a COMPLEX/HIGH EXPERIMENT artifact with OODA and safe-to-fail rollback context.
- All artifacts preserve `decided_by=Div7.MissionControl`, `diagnostics_sanitized=true`, and `native_approval_mutated=false`.
- Invalid major-flow inputs return markdown-only S02 validation envelopes with bounded sanitized diagnostics and no document/comment/cache/native approval mutation.
- Runtime capability validation passes without promoting plugin UI, host actions, host piko registration, Paperclip-native approvals, Hermes, GSD-Pi, activity logs, events, or S03 live readback.

## Edge Cases

- Token-like public issue ids are rejected and do not appear in markdown-only ids or refs.
- Markdown, HTML, control characters, fake headings, JavaScript links, secrets, and stack-like text are neutralized or redacted before rendering.
- Malformed document/comment adapter responses fall back to deterministic markdown-only artifacts with sanitized diagnostics.
- Direct `circuit_breaker_open` inputs with missing records or non-OPEN records fail closed instead of fabricating OPEN containment state.

## Evidence

- Focused major-flow fixtures: 12/12 tests passed.
- S03 integration fixture set: 45/45 tests passed.
- Full plugin suite: 112/112 tests passed.
- Typecheck and runtime capability validator passed.
