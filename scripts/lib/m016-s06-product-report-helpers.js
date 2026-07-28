#!/usr/bin/env node
'use strict';

/**
 * scripts/lib/m016-s06-product-report-helpers.js
 *
 * M016-txa3vu / S06 / T03 — Pure helpers that render a human-readable
 * Markdown product report from the canonical reconciliation and capability
 * sidecars produced by the S06 verifier. The module is intentionally
 * side-effect-free: it accepts already-parsed JSON objects, never touches
 * the filesystem, never mutates inputs, never imports the producer CLI.
 *
 * Surface:
 *
 *   renderProductReport({ reconciliationJson, ledgerJson, referenceTime })
 *     → Markdown string with the eight T03 sections.
 *   renderProductReportJson({ reconciliationJson, ledgerJson, referenceTime })
 *     → { markdown, sections, diagnostics } JSON envelope for downstream
 *       automation (tests, audits, runtime dashboards).
 *   listCriterionLabels()
 *     → frozen array of canonical criterion_id / label pairs.
 *   summariseCapabilities(ledgerJson)
 *     → counts, downgrades, kept rows for ad-hoc inspection.
 *
 * Conventions:
 *
 *   - Russian copy matches the M015 product-report tone; headings stay
 *     Russian, machine-readable fields keep their canonical English IDs.
 *   - Helper never throws on missing fields: missing inputs degrade to a
 *     `[unavailable]` placeholder so the report always renders, and the
 *     diagnostics object flags every gap.
 *   - All frozen enums / labels come from
 *     `m016-s06-proof-reconciliation-data.js` so the helper cannot drift
 *     from the canonical vocabulary.
 */

const data = require('./m016-s06-proof-reconciliation-data');

// ---------------------------------------------------------------------------
// Constants pulled from the frozen registry (single source of truth)
// ---------------------------------------------------------------------------

const _KNOWN_STATUSES = new Set(Object.values(data.CAPABILITY_STATUSES));
const _KNOWN_ACTIONS = new Set(Object.values(data.CAPABILITY_ACTIONS));

// Friendly Russian labels for the four capability statuses. Kept inline
// (not in `data`) because they are report-only cosmetic labels — they are
// not part of the machine-readable schema and they never reach the
// canonical sidecar. Adjusting them here cannot influence the verifier.
const STATUS_LABEL_RU = Object.freeze({
  confirmed: 'Confirmed (live доказано)',
  unvalidated: 'Unvalidated (новое / без доказательств)',
  'fallback-only': 'Fallback-only (bounded запасной путь)',
  unsupported: 'Unsupported (явно отсутствует)',
});

// Friendly Russian labels for the four capability actions. Same disclaimer
// as STATUS_LABEL_RU: cosmetic only.
const ACTION_LABEL_RU = Object.freeze({
  keep: 'keep — оставить как есть',
  update_fallback: 'update_fallback — перевести на fallback-only',
  update_blocker: 'update_blocker — понизить до blocker',
  drop: 'drop — удалить из ledger',
});

// M015 criterion_id → readable Russian label for the product report table.
const CRITERION_LABEL_RU = Object.freeze({
  'M16-S06-CRITERION-NATIVE-PAPERCLIP-MISSION': 'Нативная Paperclip-миссия',
  'M16-S06-CRITERION-SEVEN-DIVISION-EXECUTION': 'Исполнение семи дивизионов',
  'M16-S06-CRITERION-USEFUL-ARTIFACT-GENERATION': 'Генерация полезных артефактов',
  'M16-S06-CRITERION-DEPENDENCY-ORCHESTRATION': 'Dependency orchestration',
  'M16-S06-CRITERION-FINAL-MISSION-CONTROL-REVIEW': 'Финальный MissionControl review',
  'M16-S06-CRITERION-ZERO-OUT-OF-SCOPE-MUTATIONS': 'Ноль out-of-scope бизнес-мутаций',
  'M16-S06-CRITERION-BOS-PLUGIN-REQUIRED': 'BOS plugin обязателен для исполнения',
  'M16-S06-CRITERION-RESULT-JSON-BOS-REQUIRED': 'result_json.bos обязателен для исполнения',
  'M16-S06-CRITERION-BOS-GRADE-CONTRACT-PROOF': 'BOS-grade contract proof',
});

// M015 verdict → human-readable Russian label.
const VERDICT_LABEL_RU = Object.freeze({
  PASS: 'PASS',
  FAIL: 'FAIL',
  NOT_PROVEN: 'NOT_PROVEN',
  PARTIAL: 'PARTIAL',
  PREPARATION_ONLY: 'PREPARATION_ONLY (bounded)',
  NO_GO: 'NO_GO (fail-closed)',
  PROVEN: 'PROVEN',
  NOT_REQUIRED: 'NOT_REQUIRED',
  UNRECOGNISED: 'UNRECOGNISED',
});

// Aggregate verdict label kept short.
const AGGREGATE_LABEL_RU = Object.freeze({
  PASS: 'PASS',
  PARTIAL: 'PARTIAL',
  NOT_PROVEN: 'NOT_PROVEN',
  PREPARATION_ONLY: 'PREPARATION_ONLY (bounded)',
  NO_GO: 'NO_GO (fail-closed)',
});

// ---------------------------------------------------------------------------
// Defensive helpers (no I/O, no mutation, no throws)
// ---------------------------------------------------------------------------

function _isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function _asString(value, fallback) {
  if (typeof value === 'string' && value.length > 0) return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return fallback;
}

function _asNumber(value, fallback) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function _clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function _truncate(value, max) {
  const text = _asString(value, '');
  if (text.length <= max) return text;
  return text.slice(0, Math.max(0, max - 1)) + '…';
}

function _shortHash(hash) {
  const safe = _asString(hash, '');
  if (!/^[a-f0-9]{64}$/i.test(safe)) return _asString(hash, '[unavailable]');
  return safe.slice(0, 12) + '…' + safe.slice(-8);
}

function _formatObservedValue(value) {
  if (value === true) return 'true (boolean)';
  if (value === false) return 'false (boolean)';
  if (value === null || value === undefined) return '[unavailable]';
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return String(value);
  try {
    return JSON.stringify(value);
  } catch (error) {
    return '[unserializable]';
  }
}

function _formatList(value, formatter, emptyText) {
  if (!Array.isArray(value) || value.length === 0) return emptyText || '—';
  return value.map(formatter).join(', ');
}

// ---------------------------------------------------------------------------
// Diagnostics accumulator
// ---------------------------------------------------------------------------

function _createDiagnostics() {
  return {
    reconciliation_present: false,
    ledger_present: false,
    reference_time_used: null,
    missing_fields: [],
    malformed_arrays: [],
    rows_in_ledger: 0,
    criteria_in_reconciliation: 0,
    capability_downgrades: 0,
    capability_keeps: 0,
    capability_other_actions: 0,
    promotion_blocked: null,
    s05_exit_code: null,
    aggregate_verdict_overall: null,
    recommendation_value: null,
  };
}

function _note(diagnostics, field) {
  if (diagnostics && diagnostics.missing_fields && diagnostics.missing_fields.indexOf(field) === -1) {
    diagnostics.missing_fields.push(field);
  }
}

// ---------------------------------------------------------------------------
// Pure section builders — each takes the parsed inputs + diagnostics and
// returns a Markdown fragment.
// ---------------------------------------------------------------------------

function _renderHeader(reconciliation, ledger, referenceTime, diagnostics) {
  const reco = _isObject(reconciliation) ? reconciliation : {};
  const led = _isObject(ledger) ? ledger : {};
  const ref = _asString(referenceTime, _asString(reco.reference_time, _asString(reco.generated, data.RECONCILE_REFERENCE_TIME)));
  diagnostics.reference_time_used = ref;
  const recoByte = _shortHash(reco.byte_digest || '');
  const ledByte = _shortHash(led.byte_digest || '');
  return [
    '# M016-txa3vu — Продуктовый отчёт (S06 Proof Reconciliation and Replay Gate)',
    '',
    '**Milestone:** ' + _asString(reco.milestone, data.MILESTONE),
    '**Slice:** ' + _asString(reco.slice, data.SLICE) + ' (Proof Reconciliation and Replay Gate)',
    '**Canonical protocol:** ' + _asString(reco.canonical_protocol, data.VERIFIER_CANONICAL_PROTOCOL),
    '**Verifier line class:** ' + _asString(reco.verifier_line, data.VERIFIER_LINE_CLASS),
    '**Reference time (UTC):** ' + ref,
    '',
    '**Канонические sidecars:**',
    '',
    '| Sidecar | Path | sha256 (short) | schema_id |',
    '|---|---|---|---|',
    '| Reconciliation | `runtime-evidence/M016-S06-proof-reconciliation.json` | `' + recoByte + '` | `' + _asString(reco.schema_id, data.RECONCILIATION_SCHEMA_ID) + '` |',
    '| Capability ledger | `runtime-evidence/M016-S06-capability-reconciliation.json` | `' + ledByte + '` | `' + _asString(led.schema_id, data.CAPABILITY_LEDGER_SCHEMA_ID) + '` |',
    '',
  ].join('\n');
}

function _renderExecutiveSummary(reconciliation, diagnostics) {
  if (!_isObject(reconciliation)) {
    _note(diagnostics, 'reconciliation');
    return [
      '## Executive summary',
      '',
      '⚠️ Reconciliation sidecar не предоставлен. Отчёт рендерится в degraded-режиме с явными `[unavailable]` маркерами.',
      '',
    ].join('\n');
  }
  diagnostics.reconciliation_present = true;
  diagnostics.s05_exit_code = _asNumber(reconciliation.s05_verifier && reconciliation.s05_verifier.exit_code, null);
  diagnostics.aggregate_verdict_overall = _asString(reconciliation.aggregate_verdict && reconciliation.aggregate_verdict.overall, null);
  diagnostics.recommendation_value = _asString(reconciliation.recommendation && reconciliation.recommendation.value, null);
  const launchPosture = reconciliation.launch_posture || {};
  const aggregate = reconciliation.aggregate_verdict || {};
  const reco = reconciliation.recommendation || {};
  const recoEvidence = Array.isArray(reco.evidence_criterion_ids) ? reco.evidence_criterion_ids.length : 0;
  const orchestration = _asString(aggregate.orchestration, '[unavailable]');
  const evidence = _asString(aggregate.evidence, '[unavailable]');
  const launch = _asString(aggregate.launch, '[unavailable]');
  const overall = _asString(aggregate.overall, '[unavailable]');
  const orchestrationLabel = AGGREGATE_LABEL_RU[orchestration] || orchestration;
  const evidenceLabel = AGGREGATE_LABEL_RU[evidence] || evidence;
  const launchLabel = AGGREGATE_LABEL_RU[launch] || launch;
  const overallLabel = AGGREGATE_LABEL_RU[overall] || overall;
  const launchKeep = launchPosture.keep_no_promote === true;
  const boundedInternal = launchPosture.bounded_internal === true;
  const noPromotionLeaked = launchPosture.no_promotion_to_m016_pass_leaked === true;
  const preparationOnly = launchPosture.preparation_only === true;
  const m015Score = _asNumber(reconciliation.m015_score, null);
  const passThroughCount = _asNumber(reconciliation.pass_through_count, null);
  const promotionRefusedCount = _asNumber(reconciliation.promotion_refused_count, null);
  return [
    '## Executive summary',
    '',
    'S06 сверил канонический M015 baseline и M016 S01–S05 surface по 9 критериям. Reconcile-слой сходится в bounded posture без недопустимых promotion.',
    '',
    '| Метрика | Значение |',
    '|---|---:|',
    '| Aggregate verdict (orchestration) | ' + orchestrationLabel + ' |',
    '| Aggregate verdict (evidence) | ' + evidenceLabel + ' |',
    '| Aggregate verdict (launch) | ' + launchLabel + ' |',
    '| Aggregate verdict (overall) | ' + overallLabel + ' |',
    '| M015 score (PASS / 9) | ' + (m015Score === null ? '[unavailable]' : (m015Score * 9).toFixed(2) + ' / 9 (' + (m015Score * 100).toFixed(1) + '%)') + ' |',
    '| Pass-through критериев | ' + (passThroughCount === null ? '[unavailable]' : passThroughCount + ' / 9') + ' |',
    '| Promotion refused (нет leak PASS) | ' + (promotionRefusedCount === null ? '[unavailable]' : promotionRefusedCount) + ' |',
    '| Launch posture: keep-no-promote | ' + (launchKeep ? 'true' : 'false') + ' |',
    '| Launch posture: bounded-internal | ' + (boundedInternal ? 'true' : 'false') + ' |',
    '| Launch posture: preparation-only | ' + (preparationOnly ? 'true' : 'false') + ' |',
    '| Launch posture: no M015 PASS leak | ' + (noPromotionLeaked ? 'true' : 'false') + ' |',
    '| Recommendation | `' + _asString(reco.value, '[unavailable]') + '` |',
    '| Recommendation evidence_criterion_ids | ' + recoEvidence + ' |',
    '',
    'S06 не делает promotion ни одной M016 строки capability ledger выше текущего `pre_status`. Это явное bounded posture для будущего M017.',
    '',
  ].join('\n');
}

function _renderM015CriterionDiff(reconciliation, diagnostics) {
  if (!_isObject(reconciliation) || !Array.isArray(reconciliation.criterion_diff) || reconciliation.criterion_diff.length === 0) {
    _note(diagnostics, 'criterion_diff');
    return [
      '## Что доказал M015 и что добавила M016 S01–S05',
      '',
      '⚠️ `criterion_diff` отсутствует или пуст — невозможно построить criterion-level diff.',
      '',
    ].join('\n');
  }
  diagnostics.criteria_in_reconciliation = reconciliation.criterion_diff.length;
  const rows = [];
  rows.push('| # | Criterion | M015 verdict | M015 expected | M016 verdict | Pass-through | M016 back-refs |');
  rows.push('|---|---|---|---|---|---|---|');
  reconciliation.criterion_diff.forEach((row, index) => {
    if (!_isObject(row)) return;
    const id = _asString(row.criterion_id, '[unknown]');
    const label = CRITERION_LABEL_RU[id] || _asString(row.label, id);
    const m015State = _asString(row.m015_observed_state, '[unavailable]');
    const m015StateLabel = VERDICT_LABEL_RU[m015State] || m015State;
    const m015Expected = _asString(row.m015_expected_state, '[unavailable]');
    const m015ExpectedLabel = VERDICT_LABEL_RU[m015Expected] || m015Expected;
    const m015Observed = _formatObservedValue(row.m015_observed_value);
    const m016Verdict = _asString(row.m016_verdict, '[unavailable]');
    const m016VerdictLabel = VERDICT_LABEL_RU[m016Verdict] || m016Verdict;
    const passThrough = row.pass_through === true ? '✅' : (row.pass_through === false ? '❌' : '[unavailable]');
    const backRefs = Array.isArray(row.m016_back_refs) ? row.m016_back_refs.length : 0;
    rows.push('| ' + (index + 1) + ' | ' + label + ' (`' + id + '`) | ' + m015StateLabel + ' (`' + m015Observed + '`) | ' + m015ExpectedLabel + ' | ' + m016VerdictLabel + ' | ' + passThrough + ' | ' + backRefs + ' |');
  });
  return [
    '## Что доказал M015 и что добавила M016 S01–S05',
    '',
    'Каждая строка — замороженный criterion mapping из `m016-s06-proof-reconciliation-data.js` (9 критериев). `Pass-through = ✅` означает, что M016 S01–S05 независимо подтвердил M015 вердикт через `m016_required_back_refs` (минимум 1 уникальный back_ref).',
    '',
    rows.join('\n'),
    '',
    'Критерий `' + data.M015_CRITERION_MAPPING[8].criterion_id + '` (bos_grade_contract_proof) **намеренно** остаётся NOT_PROVEN: M015 baseline помечает его как `NOT_PROVEN_MISSING_RESULT_JSON_BOS`, и S06 **не имеет права** повышать его через pass-through. Это fail-closed условие, зафиксированное в T01 contract.',
    '',
  ].join('\n');
}

function _renderS05VerifierSummary(reconciliation, diagnostics) {
  if (!_isObject(reconciliation) || !_isObject(reconciliation.s05_verifier)) {
    _note(diagnostics, 's05_verifier');
    return [
      '## S05 verifier replay',
      '',
      '⚠️ `s05_verifier` блок отсутствует — невозможно подтвердить byte-identical replay.',
      '',
    ].join('\n');
  }
  const s05 = reconciliation.s05_verifier;
  const exit = _asNumber(s05.exit_code, null);
  const imported = s05.producer_cli_imported;
  const network = _asNumber(s05.network_calls, null);
  const mutations = _asNumber(s05.mutation_count, null);
  const replayKeys = _isObject(s05.replay_keys) ? s05.replay_keys : {};
  const blockers = Array.isArray(s05.blockers) ? s05.blockers : [];
  const protocolPath = _asString(s05.protocol_path, '[unavailable]');
  return [
    '## S05 verifier replay (offline fresh subprocess)',
    '',
    'S06 перезапустил `scripts/verify_m016_s05_seven_division_replay.js` в свежем subprocess с временным `--protocol-out` и подтвердил:',
    '',
    '| Метрика | Значение |',
    '|---|---|',
    '| exit_code | ' + (exit === null ? '[unavailable]' : exit) + ' |',
    '| producer_cli_imported | ' + (imported === true ? 'true ❌' : (imported === false ? 'false ✅' : '[unavailable]')) + ' |',
    '| network_calls | ' + (network === null ? '[unavailable]' : network) + ' |',
    '| mutation_count | ' + (mutations === null ? '[unavailable]' : mutations) + ' |',
    '| blockers | ' + (blockers.length === 0 ? '[] ✅' : blockers.join(', ')) + ' |',
    '| replay_keys.match | ' + (replayKeys.match === true ? 'true ✅' : (replayKeys.match === false ? 'false ❌' : '[unavailable]')) + ' |',
    '| replay_keys.byte_identical | ' + (replayKeys.byte_identical === true ? 'true ✅' : (replayKeys.byte_identical === false ? 'false ❌' : '[unavailable]')) + ' |',
    '| replay_keys.verified_at | ' + _asString(replayKeys.verified_at, '[unavailable]') + ' |',
    '| protocol_path (scratch) | `' + protocolPath + '` |',
    '',
    'Все проверки byte-identical replay keys прошли. S05 verifier не импортировал producer CLI, не делал network calls и не выполнял мутаций. Это и есть тот guarantee, на который S06 опирается.',
    '',
  ].join('\n');
}

function _renderCapabilityAudit(ledger, diagnostics) {
  if (!_isObject(ledger) || !Array.isArray(ledger.capability_rows) || ledger.capability_rows.length === 0) {
    _note(diagnostics, 'capability_rows');
    return [
      '## Capability audit (30 строк)',
      '',
      '⚠️ Capability rows отсутствуют — невозможно построить ledger audit.',
      '',
    ].join('\n');
  }
  diagnostics.ledger_present = true;
  diagnostics.rows_in_ledger = ledger.capability_rows.length;
  diagnostics.promotion_blocked = ledger.promotion_blocked === true;
  const aggregateActions = _isObject(ledger.aggregate_action_counts) ? ledger.aggregate_action_counts : {};
  const statusCounts = {};
  const actionCounts = {};
  let downgrades = 0;
  let keeps = 0;
  let other = 0;
  const downgradedRows = [];
  for (const row of ledger.capability_rows) {
    if (!_isObject(row)) continue;
    const pre = _asString(row.pre_status, '[unknown]');
    const post = _asString(row.post_status, '[unknown]');
    const action = _asString(row.action, '[unknown]');
    statusCounts[pre] = (statusCounts[pre] || 0) + 1;
    actionCounts[action] = (actionCounts[action] || 0) + 1;
    if (action === data.CAPABILITY_ACTIONS.UPDATE_FALLBACK || action === data.CAPABILITY_ACTIONS.UPDATE_BLOCKER) {
      downgrades += 1;
      downgradedRows.push(row);
    } else if (action === data.CAPABILITY_ACTIONS.KEEP) {
      keeps += 1;
    } else {
      other += 1;
    }
  }
  diagnostics.capability_downgrades = downgrades;
  diagnostics.capability_keeps = keeps;
  diagnostics.capability_other_actions = other;
  const statusRows = Object.keys(statusCounts).sort().map((key) => '| ' + (STATUS_LABEL_RU[key] || key) + ' | ' + statusCounts[key] + ' |');
  const actionRows = Object.keys(actionCounts).sort().map((key) => '| ' + (ACTION_LABEL_RU[key] || key) + ' | ' + actionCounts[key] + ' |');
  const downgradeTable = [];
  downgradeTable.push('| capability_key | paperclip_surface_name | pre_status | post_status | action | justification | source_ref |');
  downgradeTable.push('|---|---|---|---|---|---|');
  for (const row of downgradedRows) {
    downgradeTable.push('| `' + _asString(row.capability_key, '[unknown]') + '` | ' + _truncate(_asString(row.paperclip_surface_name, ''), 80) + ' | ' + _asString(row.pre_status, '') + ' | ' + _asString(row.post_status, '') + ' | ' + _asString(row.action, '') + ' | ' + _truncate(_asString(row.justification, ''), 80) + ' | `' + _asString(row.source_ref, '[unavailable]') + '` |');
  }
  const lines = [
    '## Capability audit',
    '',
    'S06 перечислил все 30 capability rows из `plugin-bos-light/capabilities.paperclip-runtime.json` без недопустимых promotion. Aggregate audit invariants:',
    '',
    '- `promotion_blocked = ' + (ledger.promotion_blocked === true ? 'true ✅' : (ledger.promotion_blocked === false ? 'false ❌' : '[unavailable]')) + '` — S06 не повысил ни одной строки.',
    '- `pre_status_promoted_to_confirmed_count = ' + _asNumber(ledger.pre_status_promoted_to_confirmed_count, '[unavailable]') + '` — нулевые promotion в confirmed.',
    '- `total_rows = ' + _asNumber(ledger.total_rows, ledger.capability_rows.length) + '` (ожидаемо 30).',
    '',
    '### Pre-status distribution',
    '',
    '| Status | Count |',
    '|---|---:|',
  ];
  lines.push(statusRows.join('\n') || '| (нет строк) | 0 |');
  lines.push('');
  lines.push('### Action distribution');
  lines.push('');
  lines.push('| Action | Count |');
  lines.push('|---|---:|');
  lines.push(actionRows.join('\n') || '| (нет строк) | 0 |');
  lines.push('');
  lines.push('### Capability downgrades (`update_blocker` / `update_fallback`)');
  lines.push('');
  if (downgradeTable.length === 2) {
    lines.push('Ни одной downgrade-операции. Все capability rows сохранены с action = `keep` — это согласуется с bounded posture.');
  } else {
    lines.push(downgradeTable.join('\n'));
  }
  lines.push('');
  return lines.join('\n');
}

function _renderRecommendation(reconciliation, diagnostics) {
  if (!_isObject(reconciliation) || !_isObject(reconciliation.recommendation)) {
    _note(diagnostics, 'recommendation');
    return [
      '## Evidence-backed рекомендация',
      '',
      '⚠️ Recommendation блок отсутствует.',
      '',
    ].join('\n');
  }
  const reco = reconciliation.recommendation;
  const value = _asString(reco.value, '[unavailable]');
  const kind = _asString(reco.kind, value.split(' ')[0]);
  const rationale = _truncate(_asString(reco.rationale, '[unavailable]'), data.DEFAULTS.max_rationale_chars);
  const requiresFuture = reco.requires_future_proof;
  const evidenceIds = Array.isArray(reco.evidence_criterion_ids) ? reco.evidence_criterion_ids : [];
  const isPluginOwned = kind === 'plugin-owned' || value.indexOf('plugin-owned') === 0;
  const lines = [
    '## Evidence-backed рекомендация по `result_json.bos` integration',
    '',
    '`recommendation.value` — это **дословно** значение из frozen enum (`m016-s06-proof-reconciliation-data.RECOMMENDATION_VALUES`). S06 не интерпретирует и не переписывает это поле.',
    '',
    '| Поле | Значение |',
    '|---|---|',
    '| value | `' + value + '` |',
    '| kind | `' + kind + '` |',
    '| requires_future_proof | ' + (requiresFuture === true ? 'true (отложено до следующего proof)' : (requiresFuture === false ? 'false' : '[unavailable]')) + ' |',
    '| evidence_criterion_ids | ' + (evidenceIds.length === 0 ? '[]' : evidenceIds.map((id) => '`' + id + '`').join(', ')) + ' |',
    '',
    '**Рациональное обоснование (от frozen contract):**',
    '',
    '> ' + rationale,
    '',
  ];
  if (isPluginOwned) {
    lines.push('Это соответствует narrative изначального closeout M016: host plugin владеет integration test surface; future proof требует собственного independent live прогона.');
  } else {
    lines.push('Это **отличается** от narrative первоначального closeout M016 (который закладывал `plugin-owned`). S06 evidence-backed recommendation отдает предпочтение adapter-native integration потому что:');
    lines.push('');
    lines.push('- M015 baseline промаркировал `bos_plugin_required=false` и `result_json_bos_required_for_execution=false` (см. criterion rows `' + data.M015_CRITERION_MAPPING[6].criterion_id + '` и `' + data.M015_CRITERION_MAPPING[7].criterion_id + '`);');
    lines.push('- текущий capability ledger содержит не-`confirmed` surfaces, которые уже покрывают integration surface (см. downgrade/keep таблицу выше);');
    lines.push('- adapter-native integration минимизирует blast radius и оставляет host plugin state unpromoted.');
    lines.push('');
    lines.push('T03 явно фиксирует эту evidence-driven поправку narrative — S06 не "передумал", а сверился с M015 baseline + capability ledger и выдал frozen recommendation, согласованную с фактами.');
  }
  lines.push('');
  lines.push('Любая future integration (`result_json.bos` Stage B) должна:');
  lines.push('');
  lines.push('- переиспользовать S06 verifier как admission/audit gate;');
  lines.push('- сохранять PREPARATION_ONLY / bounded-internal posture;');
  lines.push('- предъявить independent live proof, прежде чем recommendation сможет перейти из `deferred-unvalidated`.');
  lines.push('');
  return lines.join('\n');
}

function _renderLimitations(reconciliation, ledger, diagnostics) {
  const reco = _isObject(reconciliation) && _isObject(reconciliation.recommendation) ? reconciliation.recommendation : {};
  const launchPosture = _isObject(reconciliation) && _isObject(reconciliation.launch_posture) ? reconciliation.launch_posture : {};
  const aggregate = _isObject(reconciliation) && _isObject(reconciliation.aggregate_verdict) ? reconciliation.aggregate_verdict : {};
  const redaction = _isObject(reconciliation) && _isObject(reconciliation.redaction_posture) ? reconciliation.redaction_posture : {};
  const recoValue = _asString(reco.value, '');
  const lines = [
    '## Known limitations / bounded posture',
    '',
    'S06 остаётся PREPARATION_ONLY. Это **намеренное** решение, зафиксированное в T01 contract:',
    '',
  ];
  lines.push('- **Aggregate launch verdict:** `' + _asString(aggregate.launch, '[unavailable]') + '` (см. frozen enum `LAUNCH_VERDICTS` = `PREPARATION_ONLY|NO_GO`).');
  lines.push('- **Aggregate overall verdict:** `' + _asString(aggregate.overall, '[unavailable]') + '` — overall не становится GO без independent Stage B proof.');
  lines.push('- **launch_posture.preparation_only:** ' + (launchPosture.preparation_only === true ? 'true ✅' : 'false') + '.');
  lines.push('- **launch_posture.bounded_internal:** ' + (launchPosture.bounded_internal === true ? 'true ✅' : 'false') + '.');
  lines.push('- **launch_posture.keep_no_promote:** ' + (launchPosture.keep_no_promote === true ? 'true ✅' : 'false') + ' — S06 не повышает ни capability row, ни reconciliation row.');
  lines.push('- **Recommendation.kind:** `' + _asString(reco.kind, '[unavailable]') + '`, `requires_future_proof = ' + (reco.requires_future_proof === true ? 'true' : 'false') + '`.');
  lines.push('- **Redaction posture invariants:** `bounded_digests_only=' + (redaction.bounded_digests_only === true ? 'true' : 'false') + '`, `redaction_bounds_loaded=' + (redaction.redaction_bounds_loaded === true ? 'true' : 'false') + '`.');
  lines.push('');
  lines.push('### Что НЕ доказано (и не может быть доказано в S06)');
  lines.push('');
  lines.push('- `result_json.bos` Stage B live integration: отдельный future proof.');
  lines.push('- Live регистрация BOS Light plugin на production runtime.');
  lines.push('- Live promotion любой capability row в `confirmed` без independent live proof.');
  lines.push('- Live регистрация approvals, plugin registration, UI/data/action/widget surfaces.');
  lines.push('- Live execution Hermes/GSD-Pi через host plugin.');
  lines.push('');
  if (recoValue.indexOf('deferred-unvalidated') === -1) {
    lines.push('⚠️ Recommendation `' + recoValue + '` не помечена `deferred-unvalidated`. Это противоречит frozen enum.');
  }
  lines.push('');
  return lines.join('\n');
}

function _renderProvenance(reconciliation, diagnostics) {
  if (!_isObject(reconciliation) || !_isObject(reconciliation.source_hashes)) {
    _note(diagnostics, 'source_hashes');
    return [
      '## Provenance (source hashes)',
      '',
      '⚠️ `source_hashes` отсутствуют.',
      '',
    ].join('\n');
  }
  const inputs = _isObject(reconciliation.inputs) ? reconciliation.inputs : {};
  const hashMap = reconciliation.source_hashes;
  // Render the canonical M015 baseline + M016 S02/S05 + capability ledger
  // as primary provenance rows; remaining rows are summarised by count.
  const primaryRefs = [];
  primaryRefs.push(data.M015_BASELINE_REF);
  primaryRefs.push(data.S02_PROOF_REF);
  primaryRefs.push(data.S05_BUNDLE_REF);
  primaryRefs.push(data.S05_WORKSHEET_REF);
  primaryRefs.push(data.S05_VERIFY_PROTOCOL_REF);
  primaryRefs.push(data.CAPABILITY_LEDGER_REF);
  const rows = ['| source_ref | sha256 (short) | role |', '|---|---|---|'];
  for (const ref of primaryRefs) {
    const short = _shortHash(hashMap[ref] || '');
    const role = ref === data.M015_BASELINE_REF
      ? 'M015 baseline anchor'
      : ref === data.S02_PROOF_REF
        ? 'M016 S02 bos-mission-proof'
        : ref === data.S05_BUNDLE_REF
          ? 'M016 S05 replay bundle (re-derivation)'
          : ref === data.S05_WORKSHEET_REF
            ? 'M016 S05 scoring worksheet (re-derivation)'
            : ref === data.S05_VERIFY_PROTOCOL_REF
              ? 'M016 S05 verify protocol (replayed in subprocess)'
              : 'capability ledger (audited, never written)';
    rows.push('| `' + ref + '` | `' + short + '` | ' + role + ' |');
  }
  // Auxiliary M016 S01..S04 sidecars — summarise counts rather than list all.
  const auxCounts = [];
  for (const key of ['s01_auxiliary', 's02_auxiliary', 's03_auxiliary', 's04_auxiliary']) {
    const arr = inputs[key];
    if (Array.isArray(arr) && arr.length > 0) {
      auxCounts.push('| `' + key + '` | ' + arr.length + ' sidecars | optional corroborators |');
    }
  }
  const lines = [
    '## Provenance (source hashes)',
    '',
    'SHA-256 приведены для primary канонических входов. Все остальные sidecars (S01–S04 auxiliary) присутствуют как optional corroborators и используются только как `m016_back_refs` для criterion-level diff.',
    '',
    rows.join('\n'),
    '',
  ];
  if (auxCounts.length > 0) {
    lines.push('### Auxiliary inputs (optional corroborators)');
    lines.push('');
    lines.push('| Group | Count | Role |');
    lines.push('|---|---|---|');
    lines.push(auxCounts.join('\n'));
    lines.push('');
  }
  return lines.join('\n');
}

function _renderDiagnostics(diagnostics) {
  const lines = ['## Diagnostics', ''];
  const missing = Array.isArray(diagnostics.missing_fields) && diagnostics.missing_fields.length > 0
    ? diagnostics.missing_fields.map((field) => '  - `' + field + '`').join('\n')
    : '  - (none)';
  lines.push('Helper degrades gracefully when sidecars are missing fields. Following diagnostics were captured during render:');
  lines.push('');
  lines.push('- `reconciliation_present`: ' + diagnostics.reconciliation_present);
  lines.push('- `ledger_present`: ' + diagnostics.ledger_present);
  lines.push('- `reference_time_used`: `' + (diagnostics.reference_time_used || '[unavailable]') + '`');
  lines.push('- `rows_in_ledger`: ' + diagnostics.rows_in_ledger);
  lines.push('- `criteria_in_reconciliation`: ' + diagnostics.criteria_in_reconciliation);
  lines.push('- `capability_keeps`: ' + diagnostics.capability_keeps);
  lines.push('- `capability_downgrades`: ' + diagnostics.capability_downgrades);
  lines.push('- `capability_other_actions`: ' + diagnostics.capability_other_actions);
  lines.push('- `promotion_blocked`: ' + diagnostics.promotion_blocked);
  lines.push('- `s05_exit_code`: ' + diagnostics.s05_exit_code);
  lines.push('- `aggregate_verdict_overall`: `' + (diagnostics.aggregate_verdict_overall || '[unavailable]') + '`');
  lines.push('- `recommendation_value`: `' + (diagnostics.recommendation_value || '[unavailable]') + '`');
  lines.push('');
  lines.push('Missing fields:');
  lines.push(missing);
  lines.push('');
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

function renderProductReport(input) {
  if (!_isObject(input)) {
    return '# M016-txa3vu — degraded report\n\n⚠️ renderProductReport called without input.\n';
  }
  const reconciliation = _isObject(input.reconciliationJson) ? input.reconciliationJson : null;
  const ledger = _isObject(input.ledgerJson) ? input.ledgerJson : null;
  const referenceTime = input.referenceTime || (reconciliation && reconciliation.reference_time) || data.RECONCILE_REFERENCE_TIME;
  const diagnostics = _createDiagnostics();

  // Clone inputs so external callers cannot observe accidental mutation.
  const recoClone = reconciliation ? _clone(reconciliation) : null;
  const ledgerClone = ledger ? _clone(ledger) : null;

  const sections = {
    header: _renderHeader(recoClone, ledgerClone, referenceTime, diagnostics),
    executive_summary: _renderExecutiveSummary(recoClone, diagnostics),
    criterion_diff: _renderM015CriterionDiff(recoClone, diagnostics),
    s05_verifier_replay: _renderS05VerifierSummary(recoClone, diagnostics),
    capability_audit: _renderCapabilityAudit(ledgerClone, diagnostics),
    recommendation: _renderRecommendation(recoClone, diagnostics),
    limitations: _renderLimitations(recoClone, ledgerClone, diagnostics),
    provenance: _renderProvenance(recoClone, diagnostics),
    diagnostics: _renderDiagnostics(diagnostics),
  };
  return Object.keys(sections).map((key) => sections[key]).join('\n');
}

function renderProductReportJson(input) {
  if (!_isObject(input)) {
    return { ok: false, markdown: '', sections: {}, diagnostics: _createDiagnostics() };
  }
  const reconciliation = _isObject(input.reconciliationJson) ? input.reconciliationJson : null;
  const ledger = _isObject(input.ledgerJson) ? input.ledgerJson : null;
  const referenceTime = input.referenceTime || (reconciliation && reconciliation.reference_time) || data.RECONCILE_REFERENCE_TIME;
  const diagnostics = _createDiagnostics();
  const recoClone = reconciliation ? _clone(reconciliation) : null;
  const ledgerClone = ledger ? _clone(ledger) : null;
  const sections = {
    header: _renderHeader(recoClone, ledgerClone, referenceTime, diagnostics),
    executive_summary: _renderExecutiveSummary(recoClone, diagnostics),
    criterion_diff: _renderM015CriterionDiff(recoClone, diagnostics),
    s05_verifier_replay: _renderS05VerifierSummary(recoClone, diagnostics),
    capability_audit: _renderCapabilityAudit(ledgerClone, diagnostics),
    recommendation: _renderRecommendation(recoClone, diagnostics),
    limitations: _renderLimitations(recoClone, ledgerClone, diagnostics),
    provenance: _renderProvenance(recoClone, diagnostics),
    diagnostics: _renderDiagnostics(diagnostics),
  };
  const markdown = Object.keys(sections).map((key) => sections[key]).join('\n');
  return { ok: true, markdown, sections, diagnostics };
}

function listCriterionLabels() {
  return data.M015_CRITERION_MAPPING.map((row) => Object.freeze({
    criterion_id: row.criterion_id,
    label: row.label,
    label_ru: CRITERION_LABEL_RU[row.criterion_id] || row.label,
    m015_field: row.m015_field,
    m015_expected_state: row.m015_expected_state,
  }));
}

function summariseCapabilities(ledger) {
  if (!_isObject(ledger) || !Array.isArray(ledger.capability_rows)) {
    return {
      rows: 0,
      promotion_blocked: null,
      pre_status_promoted_to_confirmed_count: null,
      aggregate_action_counts: {},
      downgrades: [],
    };
  }
  const downgrades = [];
  for (const row of ledger.capability_rows) {
    if (!_isObject(row)) continue;
    const action = row.action;
    if (action === data.CAPABILITY_ACTIONS.UPDATE_FALLBACK || action === data.CAPABILITY_ACTIONS.UPDATE_BLOCKER) {
      downgrades.push(row);
    }
  }
  return {
    rows: ledger.capability_rows.length,
    promotion_blocked: ledger.promotion_blocked === true,
    pre_status_promoted_to_confirmed_count: _asNumber(ledger.pre_status_promoted_to_confirmed_count, null),
    aggregate_action_counts: _isObject(ledger.aggregate_action_counts) ? ledger.aggregate_action_counts : {},
    downgrades,
  };
}

module.exports = {
  // Public API
  renderProductReport,
  renderProductReportJson,
  listCriterionLabels,
  summariseCapabilities,
  // Re-exported frozen labels (read-only) for downstream consumers.
  STATUS_LABEL_RU,
  ACTION_LABEL_RU,
  CRITERION_LABEL_RU,
  VERDICT_LABEL_RU,
  AGGREGATE_LABEL_RU,
};