# S01: Decision contract and classifier — UAT

**Milestone:** M003
**Written:** 2026-05-31T03:23:54.397Z

# UAT: S01 Decision contract and classifier

## UAT Type

Contract and fixture UAT for the repository-local `plugin-bos-light` decision module. This is not live Paperclip runtime UAT and does not validate plugin UI, Paperclip actions, native approvals, Hermes, GSD-Pi execution, or live host tool registration.

## Preconditions

- Worktree dependencies are installed for `plugin-bos-light`.
- The tester is in the M003 worktree.
- No live Paperclip credentials or runtime are required.

## Steps

1. Run `npm --prefix plugin-bos-light test -- tests/decision.test.ts`.
2. Confirm the fixture suite passes for CLEAR batch approval, COMPLICATED policy/budget exceptions, COMPLEX ambiguous strategy, CHAOTIC outage/circuit-breaker signals, and DISORDER mixed low-confidence signals.
3. Inspect the fixture assertions for the accepted decision shape: `decided_by: Div7.MissionControl`, Cynefin domain, clamped confidence, risk tier, recommended action, record detail level, domain evidence, risk reasons, sanitized diagnostics, optional OODA sections, and deterministic `record_markdown`.
4. Confirm CLEAR low-risk batch approval produces a compact record and expanded/high-risk cases produce OODA and expanded markdown sections.
5. Confirm malformed inputs return `accepted: false`, `error: invalid_decision_input`, bounded validation diagnostics, and no stack traces or secret-like fields.
6. Confirm the worker `piko:decide` seam returns the same typed result shape as direct decision calls while remaining optional.
7. Run `npm --prefix plugin-bos-light run typecheck`.
8. Run `npm --prefix plugin-bos-light test`.

## Expected Outcomes

- The focused decision suite passes with 9/9 tests.
- Typecheck exits 0.
- The full plugin suite exits 0 with 88/88 tests.
- Decision results are deterministic when `now` is provided.
- Invalid or under-specified inputs fail closed with structured sanitized diagnostics instead of partial records.
- Documentation describes this as contract/fixture proof only and does not claim live runtime or native Paperclip support.

## Edge Cases

- Confidence values above 1 and below 0 clamp to the supported range.
- Mixed low-confidence evidence is represented as DISORDER rather than forced into a confident domain.
- CHAOTIC outage or circuit-breaker evidence receives critical/high-risk handling and OODA detail.
- CLEAR batch approval remains compact unless evidence requires escalation.
- Secret-like extra fields in invalid input do not appear in serialized validation diagnostics.

## Operational Readiness

- Health signal: `npm --prefix plugin-bos-light test -- tests/decision.test.ts`, `npm --prefix plugin-bos-light run typecheck`, and `npm --prefix plugin-bos-light test` all exit 0; accepted decision results include risk tier, record detail, diagnostics, and deterministic markdown.
- Failure signal: any closeout command exits nonzero; malformed inputs throw or leak raw data instead of returning `accepted:false`; DISORDER/low-confidence cases force certainty; or optional worker registration failure bubbles instead of being bounded by the optional registration seam.
- Recovery procedure: inspect the failing fixture or TypeScript diagnostic, compare the decision output against `docs/04_DATA_CONTRACTS.md`, restore the typed DecisionResult union/renderer/worker seam behavior, and rerun the focused decision suite before the full plugin suite.
- Monitoring gaps: no live Paperclip runtime, native persistence, dashboard, or alerting exists in S01; operational proof is limited to deterministic repository-local tests and sanitized diagnostics for downstream slices.

