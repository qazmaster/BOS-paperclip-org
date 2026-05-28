# 07 - Risks and Required Spikes

## Umbrella risk: Paperclip plugin runtime caveat

The Paperclip plugin spec is rich, but the current runtime may not implement every part exactly as described. Treat plugin API details as assumptions until validated against the current Paperclip commit/version. S02 captures the current conservative posture in `docs/08_RUNTIME_CAPABILITY_HEALTH.md`: there is no live Paperclip runtime evidence yet, so requested manifest capabilities are not confirmed runtime capabilities.

Mitigation:

- template-first: Phase 1 works without plugin runtime;
- thin adapter: isolate SDK calls in `paperclipAdapter.ts` and `persistence.ts`;
- use native artifacts for durable truth;
- keep plugin-specific state reconstructable.

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

## Spike checklist C1-C7

| # | Check | Method | Required before |
|---|---|---|---|
| C1 | Conceptual approval | Pitch + feedback thread | public/core integration |
| C2 | Event emission | Subscribe and trigger run failure | Circuit Breaker event path |
| C3 | Plugin state | Write/read company-scoped and issue-scoped state | persistence design freeze |
| C4 | Company template import/export | Test `companies.sh` or current import flow, then update `docs/08_RUNTIME_CAPABILITY_HEALTH.md` | Phase 1 acceptance |
| C5 | AGENTS.md syntax compatibility | Validate against current Paperclip agent config, then update health report | template release |
| C6 | Plugin runtime version check | Confirm min version/build and breaking changes in health report | plugin implementation |
| C7 | Plugin capability set confirmed | Verify issues, approvals, state, data/actions, UI slots and update matrix/report evidence | plugin implementation |

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
