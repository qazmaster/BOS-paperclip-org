# plugin-bos-light

Draft Paperclip plugin scaffold for BOS Light.

## Scope

This plugin is a thin adapter. It provides:

- `piko:bpi-score`;
- `piko:blueprint-gen`;
- Betting Table data/action handlers;
- Eval Gates;
- Circuit Breaker with polling fallback;
- `piko:decide` after usage traces.

## Important

SDK import paths and exact host client method names must be validated against the current Paperclip runtime before compile/use. Pure logic modules should be usable immediately in tests.

## Development order

1. Run state spike and event spike.
2. Confirm Paperclip SDK capabilities.
3. Wire `paperclipAdapter.ts` to real SDK.
4. Keep pure logic modules unchanged.

## Pure logic modules

- `src/bpi.ts`
- `src/blueprint.ts`
- `src/bettingTable.ts`
- `src/evalGates.ts`
- `src/circuitBreaker.ts`
- `src/decision.ts`

## Paperclip-specific modules

- `src/paperclipAdapter.ts`
- `src/persistence.ts`
- `src/worker.ts`
