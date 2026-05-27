# 10 - Paperclip Assumptions to Validate

This file records the external assumptions BOS Light depends on. Do not treat it as a substitute for checking the current Paperclip repo.

## Assumption A - Paperclip is the organization runtime

Paperclip models companies with org charts, goals, budgets and governance. BOS Light must not duplicate this.

Validation:

- Read current Paperclip README.
- Confirm companies, agents, budgets, governance and issue/task surfaces still exist.

## Assumption B - Plugin SDK has host clients

Expected clients include config, events, state, entities, projects, issues, agents, data, actions, tools and logger.

Validation:

- Inspect current `doc/plugins/PLUGIN_SPEC.md`.
- Inspect current examples/plugins.
- Verify runtime package names and import paths.

## Assumption C - Durable plugin work should use managed/native Paperclip resources

BOS Light mirrors durable truth into native issue documents, comments, approvals and managed resources.

Validation:

- Confirm current SDK supports issue create/update, comments/documents and approvals/requests.
- If not, adapt persistence matrix to the closest native surfaces.

## Assumption D - agent run terminal events may be unreliable

Circuit Breaker must work through polling fallback until event delivery is validated.

Validation:

- C2 event emission test.

## Assumption E - company-scoped state may be unreliable

Use config JSON or managed resources until C3 proves company state is reliable.

Validation:

- C3 state spike.
