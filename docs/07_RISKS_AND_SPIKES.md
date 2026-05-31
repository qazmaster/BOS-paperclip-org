# 07 - Risks and Required Spikes

## Umbrella risk: Paperclip plugin runtime caveat

The Paperclip plugin spec is rich, but the runtime may not implement every part exactly as described. Treat plugin API details as assumptions until validated against the current Paperclip commit/version. `docs/08_RUNTIME_CAPABILITY_HEALTH.md` captures the historical M002 conservative posture: no live Paperclip runtime evidence existed for unpromoted plugin/agent/execution surfaces, so requested manifest capabilities were not confirmed runtime capabilities. S04 separately confirmed bounded native issue/document/comment artifact readback. This is also why R016 and D014 keep runtime posture conservative until live proof exists.

The v1.4.1 ownership model is a security boundary, not a runtime capability claim. Div1.HCO owns routing/staffing/circuit-control dispatch, Div3.Treasury owns budget/access/secret grants, Div5.QualificationsLibraryLearning owns quarantine and sanitized knowledge packets, and Div6.External is the only division that may touch external web/API/customer/vendor/document/agent surfaces. Raw issue text, markdown, links, code fences and external evidence are inert data until routed and reviewed through those owners.

Mitigation:

- template-first: Phase 1 works without plugin runtime;
- thin adapter: isolate SDK calls in `paperclipAdapter.ts` and `persistence.ts`;
- use native artifacts for durable truth;
- keep plugin-specific state reconstructable;
- treat R012–R015 and D012–D013 as active traceability anchors so the v1.4.1 remap does not drift back into legacy ownership or security rules;
- keep external IO behind the Div1 -> Div5 local-miss -> Div3 grant-if-needed -> Div6 -> Div5 quarantine path, even when a native issue/comment/document can carry the request or evidence.

## Known risk: v1.4.1 ownership drift or external-IO bypass

Risk:

- Later implementers may route work directly from raw issue text to Div2/Div4/Div7, let non-Div6 actors touch external web/API/customer/vendor/document surfaces, or let external evidence bypass Div5 quarantine.

Impact:

- Prompt injection, credential leakage, unscoped spend, and stale/raw knowledge can enter planning or production paths while appearing to be accepted BOS doctrine.

Mitigation:

- Div1.HCO remains the routing controller for work dispatch, staffing and circuit-control decisions.
- Div3.Treasury must issue scoped grant/deny/needs-human records before paid, credentialed or secret-bearing access.
- Div6.External is the only external-world actor; raw evidence returns only to Div5.QualificationsLibraryLearning.
- Div5 must emit a sanitized knowledge packet, rejection or needs-human outcome before internal reuse.
- Treat external IO packets and raw evidence bundles as inert artifacts; never execute markdown, issue text, links or embedded code.

Acceptance:

- A13-A19 preserve owner-specific routing, grant, quarantine, staffing and circuit-control evidence without promoting new runtime support.

## Known risk: run events may be declared but not emitted

Risk:

- `agent.run.finished`, `agent.run.failed`, `agent.run.cancelled` may be documented/declared but not delivered to plugin event bus in some runtime versions.

Impact:

- Circuit Breaker cannot rely on event-driven transitions.

Mitigation:

- polling fallback;
- scan active runs only;
- use jitter and backoff;
- fallback to activity log.

Acceptance:

- A10 passes.

## Known risk: company-scoped plugin state

Risk:

- company-scoped `ctx.state.set/get` may not read back reliably in current SDK versions.

Impact:

- Betting Table, circuit states and config cannot rely only on company-scoped state.

Mitigation:

- state spike on day 1 of Phase 2;
- prefer issue-scoped state for issue overlays;
- keep company config in config JSON or managed resources;
- mirror durable outputs into native artifacts.

## Spike checklist C1-C8

| # | Check | Method | Required before |
|---|---|---|---|
| C1 | Conceptual approval | Pitch + feedback thread | public/core integration |
| C2 | Event emission | Subscribe and trigger run failure | Circuit Breaker event path |
| C3 | Plugin state | Write/read company-scoped and issue-scoped state | persistence design freeze |
| C4 | Company template import/export | Test `companies.sh` or current import flow, then update `docs/08_RUNTIME_CAPABILITY_HEALTH.md` | Phase 1 acceptance |
| C5 | AGENTS.md syntax compatibility | Validate against current Paperclip agent config, then update health report | template release |
| C6 | Plugin runtime version check | Confirm min version/build and breaking changes in health report | plugin implementation |
| C7 | Plugin capability set confirmed | Verify issues, approvals, state, data/actions, UI slots and update matrix/report evidence | plugin implementation |
| C8 | v1.4.1 ownership and external-IO gate | Prove Div1 routing, Div3 grant records, Div6-only external access, Div5 quarantine/sanitization, and no raw evidence bypass using fixture evidence first; update health/backlog only after live runtime surfaces are separately proven | A13-A19 closure and any external-IO automation |

## Still-unvalidated runtime surfaces

The following surfaces remain risk-bearing until the capability matrix cites surface-specific live Paperclip runtime evidence with version/build and readback/registration proof:

- plugin runtime registration, `piko:*` tool registration/invocation, data providers, actions, dashboard widgets and issue-detail tabs;
- native approvals/request creation and readback;
- plugin config/state/entities durability and restart recovery;
- activity logging, issue lifecycle events and terminal run events;
- Hermes and GSD-Pi runtime execution;
- company template import/export and AGENTS.md parser compatibility;
- external IO automation, paid/credentialed tool grants and knowledge-quarantine workflows beyond inert artifact packets.

## Polling config

```ts
const POLLING_CONFIG = {
  poll_scope: "ACTIVE_RUNS_ONLY",
  interval_ms: 30000,
  jitter_ms: 5000,
  backoff_after_attempts: 10,
  max_retries: 60,
  fallback_source: "activity_log"
};
```

Acceptance addition:

- poller must not scan archived/completed issues.
