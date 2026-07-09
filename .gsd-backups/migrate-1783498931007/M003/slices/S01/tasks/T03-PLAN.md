---
estimated_steps: 1
estimated_files: 3
skills_used: []
---

# T03: Render decision records through piko decide

Add deterministic decision record markdown rendering and ensure the worker `piko:decide` seam returns the same typed result shape the tests exercise. The renderer should produce a compact record for CLEAR choices and expanded sections for policy, budget, incident, strategic, ambiguous, complex, chaotic, and high-risk decisions. Keep worker registration optional and avoid any claim that host tool registration has live proof.

## Inputs

- `plugin-bos-light/src/decision.ts`
- `plugin-bos-light/src/worker.ts`
- `plugin-bos-light/tests/decision.test.ts`

## Expected Output

- `plugin-bos-light/src/decision.ts`
- `plugin-bos-light/src/worker.ts`
- `plugin-bos-light/tests/decision.test.ts`

## Verification

npm --prefix plugin-bos-light test -- tests/decision.test.ts

## Observability Impact

Rendered markdown includes explicit fallback-ready fields and validation diagnostics while worker errors remain structured and bounded.
