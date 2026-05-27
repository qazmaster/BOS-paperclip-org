# Event Spike Checklist

Goal: validate which Paperclip events are actually delivered to plugins.

## Events to check

- `issue.created`
- `issue.updated`
- `agent.run.started`
- `agent.run.finished`
- `agent.run.failed`
- `agent.run.cancelled`
- `approval.created`
- `approval.decided`
- `cost_event.created`
- `activity.logged`

## Procedure

1. Register plugin event subscriptions with logging.
2. Trigger each event in a local Paperclip instance.
3. Record whether handler fires and what payload shape is delivered.
4. Compare with plugin spec.
5. Update `plugin-bos-light/src/worker.ts` and adapters accordingly.

## Required conclusion

If terminal run events do not fire, keep Circuit Breaker polling path as primary and event path as optional optimization.
