---
estimated_steps: 11
estimated_files: 3
skills_used: []
---

# T02: Wire circuit policy budget and strategy decisions

Skills expected for executor task plan frontmatter: api-design, tdd, verify-before-complete.

Why: The sketch explicitly includes circuit breaker, policy, budget, and strategy seams. These are the expanded risk-tiered paths for R010, R015, R003, R008, and the milestone demo. They must remain artifact-first and not become a new runtime controller.

Do:
1. Extend `plugin-bos-light/src/majorFlowDecision.ts` with `circuit_breaker_open`, `policy_exception`, `budget_exception`, and `strategic_choice` variants.
2. For `circuit_breaker_open`, consume the existing `CircuitBreakerEvidenceEnvelope` or a minimal OPEN record input. The decision signals must include circuit, breaker, incident, critical, stop, and self-healing language so S01 classifies the record as CHAOTIC, CRITICAL, expanded, and `SELF_HEALING`.
3. Preserve Div1.HCO operational ownership in text for Circuit Breaker control while keeping the actual decision record decided by Div7.MissionControl. Do not add live polling, event subscriptions, activity-log dependence, escalation issue automation beyond what `circuitBreakerFlow` already provides, or runtime capability promotion.
4. For `policy_exception` and `budget_exception`, build COMPLICATED expanded decision records that include policy owner or budget constraint context, a reversible next step, and sanitized diagnostics. These must use artifacts only and must not mutate external systems.
5. For `strategic_choice`, build a COMPLEX, HIGH-risk `EXPERIMENT` decision with OODA sections and a safe-to-fail probe/rollback description.
6. Expand `plugin-bos-light/tests/majorFlowDecision.test.ts` to cover all four variants, including a circuit breaker fixture that reaches OPEN using existing `circuitBreakerFlow` data, a policy exception, a budget exception, and a strategic choice.
7. Add negative assertions for unavailable/malformed document or comment adapter responses: the helper must return S02 markdown-only fallback artifacts with sanitized errors and `native_approval_mutated=false`.

Done when: every major-flow variant named in the S03 sketch produces a consistent S01/S02 decision artifact and the targeted integration fixture proves R010-style OPEN/self-healing escalation is visible without overclaiming runtime support.

## Inputs

- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M003/plugin-bos-light/src/majorFlowDecision.ts`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M003/plugin-bos-light/tests/majorFlowDecision.test.ts`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M003/plugin-bos-light/src/circuitBreakerFlow.ts`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M003/plugin-bos-light/src/decision.ts`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M003/plugin-bos-light/src/decisionArtifact.ts`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M003/plugin-bos-light/src/contracts.ts`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M003/plugin-bos-light/tests/circuitBreakerFlow.test.ts`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M003/plugin-bos-light/tests/decisionArtifact.test.ts`

## Expected Output

- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M003/plugin-bos-light/src/majorFlowDecision.ts`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M003/plugin-bos-light/tests/majorFlowDecision.test.ts`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M003/plugin-bos-light/src/contracts.ts`

## Verification

npm --prefix plugin-bos-light test -- tests/majorFlowDecision.test.ts

## Observability Impact

Extends the shared major-flow artifact envelope so future agents can inspect circuit, policy, budget, and strategy decisions through the same `decision`, `fallback`, `cache_overlay`, `artifact_ref`, and sanitized diagnostics fields.
