# BOS Chimera -> Paperclip Handoff Package

Дата сборки: 2026-05-27
Статус: implementation baseline / ready for Phase 0-1, with required Paperclip runtime spikes before deep plugin work.

Этот пакет предназначен для нового AI-агента или разработчика, который ничего не знает о BOS Chimera. Он содержит самодостаточное объяснение, архитектурные границы, минимальные контракты, профили 7 divisions, scaffold Paperclip plugin и acceptance tests.

## Главная формула

BOS Chimera 4.1 не портируется в Paperclip как kernel. BOS редуцируется до **organizational intelligence layer**:

- company template;
- role semantics / hat profiles / VFP;
- BPI prioritization;
- batch governance через Betting Table;
- lightweight quality gates;
- Circuit Breaker;
- Div7 decision protocol.

Paperclip остается **system of record** и **execution plane**: agents, issues, status, budget, heartbeat, governance, events, UI, DB.

## С чего начать новому агенту

1. Прочитать `00_START_HERE_FOR_NEW_AI_AGENT.md`.
2. Скопировать `HANDOFF_PROMPT_FOR_NEW_AI_AGENT.md` в новый чат/agent session.
3. Изучить `docs/01_CONTEXT_AND_DECISION.md`, затем `docs/03_IMPLEMENTATION_PLAN_V1_2.md`.
4. Перед написанием production plugin выполнить spike-чеклист из `docs/07_RISKS_AND_SPIKES.md`.
5. Начать Phase 1: company template and AGENTS.md profiles.
6. Затем Phase 2: state spike + minimal plugin.

## Структура пакета

```text
BOS_Chimera_Paperclip_Handoff/
  README.md
  00_START_HERE_FOR_NEW_AI_AGENT.md
  HANDOFF_PROMPT_FOR_NEW_AI_AGENT.md
  MANIFEST.md
  docs/
  agents/
  company-template/
  plugin-bos-light/
  scripts/
  source-pdfs/
```

## Что является авторитетным

1. `docs/03_IMPLEMENTATION_PLAN_V1_2.md` - cutline и фазы.
2. `docs/04_DATA_CONTRACTS.md` - минимальные схемы.
3. `docs/05_PERSISTENCE_MATRIX.md` - где хранить BOS данные.
4. `docs/06_ACCEPTANCE_TESTS.md` - критерии готовности.
5. `source-pdfs/BOS_Light_v1_2_Implementation_Baseline.pdf` - исходный baseline PDF.

## Не делать

- Не строить BOS Kernel, event ledger, policy engine, 26-state machine или hash-chain audit.
- Не обходить Paperclip governance через plugin-side approval.
- Не хранить durable organizational truth только в private plugin state.
- Не полагаться на agent.run.finished/failed/cancelled events без проверки текущего runtime.
- Не считать company-scoped ctx.state надежным до state spike.

## Ожидаемый результат MVP

MVP готов, если импортируется 7-agent company template, issue получает BPI score, blueprint генерируется как 5-секционный issue document, Betting Table создает Paperclip-native approval/request, минимум 3 Eval Gates пишут результаты в native artifacts, Circuit Breaker работает через polling fallback, а все BOS данные имеют storage + fallback + migration path.
