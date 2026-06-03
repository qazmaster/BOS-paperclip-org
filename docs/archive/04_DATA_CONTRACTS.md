# 04 - Data Contracts

These are the minimal BOS Light contracts. Keep them stable. Add fields only with schema version increments.

```ts
export type Division =
  | "Div7.MissionControl"
  | "Div1.HCO"
  | "Div2.MasterPlanner"
  | "Div3.Treasury"
  | "Div4.Production"
  | "Div5.QualificationsLibraryLearning"
  | "Div6.External";

export interface BPIScore {
  schema_version: "1.0";
  score: number; // 0.0 to 1.0, calculated
  formula: "bpi_v1.0";
  components: {
    expected_value: number; // 0.0 to 1.0
    urgency: number; // 0.0 to 1.0
    estimated_token_cost: number;
    risk_factor: number; // 1.0 = baseline, >1.0 increases cost
    company_token_budget_ref: number; // token budget for normalization
  };
  hard_gates: {
    strategic_weight_passed: boolean;
    budget_snapshot_available: boolean;
    acceptance_inputs_present: boolean;
    policy_precheck_passed: boolean; // P0 lightweight precheck, not full LARS
    security_precheck_passed: boolean; // P0 lightweight scan, not full Eval Gate
  };
  scored_by: "Div2.MasterPlanner";
  scored_at: string; // ISO 8601
  source_issue_id: string;
}

export interface BosStatusOverlay {
  schema_version: "1.0";
  issue_id: string;
  bos_status: BosStatus;
  producer_division: Division;
  /**
   * Stable Product Blueprint artifact reference, not a plugin-state primary key.
   * S03 writes `ProductBlueprintArtifact.artifact_ref` here so downstream
   * Betting Table work can distinguish document, comment, and markdown fallback
   * surfaces without treating plugin state as durable truth.
   */
  blueprint_id: string | null;
  bpi_score: number | null;
  updated_at: string;
}

export type BlueprintArtifactSurface = "documents.native" | "comments.native" | "markdown-only";

export interface ProductBlueprintArtifact {
  schema_version: "1.0";
  /** Adapter/native identifier, or `markdown-only:{issue_id}:product-blueprint` for markdown fallback. */
  artifact_id: string;
  /**
   * Surface-qualified stable reference:
   * - `paperclip://issues/{issue_id}/documents/{artifact_id}` for `documents.native`
   * - `paperclip://issues/{issue_id}/comments/{artifact_id}` for `comments.native`
   * - `markdown-only://issues/{issue_id}/product-blueprint` for markdown fallback
   */
  artifact_ref: string;
  issue_id: string;
  title: string;
  selected_surface: BlueprintArtifactSurface;
  mirrored_at: string; // ISO 8601
  markdown: string; // five-section Product Blueprint; issue text is inert/untrusted display content
  bpi: BPIScore;
  fallback: {
    /** `null` only when the selected surface required no fallback. */
    reason: string | null;
    document_error?: string;
    comment_error?: string;
  };
}

export interface CacheOverlayWriteDiagnostics {
  durability: "cache-overlay-only";
  persistence: "missing" | "provided";
  bpi: "not_attempted" | "saved" | "failed";
  status: "not_attempted" | "saved" | "failed";
  error: string | null;
}

export interface IssueBlueprintStatusOverlay extends BosStatusOverlay {
  cache_overlay: CacheOverlayWriteDiagnostics;
}

export enum BosStatus {
  RAW_ORDER = "RAW_ORDER",
  TRIAGED = "TRIAGED",
  SHAPING = "SHAPING",
  BLUEPRINT_READY = "BLUEPRINT_READY",
  BETTING_POOL = "BETTING_POOL",
  APPROVAL_REQUESTED = "APPROVAL_REQUESTED",
  APPROVED_FOR_CYCLE = "APPROVED_FOR_CYCLE",
  IN_PROGRESS = "IN_PROGRESS",
  QA_REVIEW = "QA_REVIEW",
  CORRECTION_REQUIRED = "CORRECTION_REQUIRED",
  ACCEPTED = "ACCEPTED",
  RELEASED = "RELEASED",
  ARCHIVED = "ARCHIVED",
  REJECTED_BPI = "REJECTED_BPI",
  CIRCUIT_BREAKER_OPEN = "CIRCUIT_BREAKER_OPEN",
  FAILED = "FAILED"
}

export interface BettingTableItem {
  schema_version: "1.0";
  cycle_id: string;
  issue_id: string;
  bpi_score: number;
  blueprint_id: string | null;
  status:
    | "CANDIDATE"
    | "APPROVAL_REQUESTED"
    | "APPROVED_FOR_CYCLE"
    | "REJECTED"
    | "COMPLETED";
  native_approval_request_id: string | null;
  native_approval_status: "PENDING" | "APPROVED" | "REJECTED" | null;
  approved_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface BettingCycleCacheOverlayDiagnostics {
  durability: "cache-overlay-only";
  persistence: "missing" | "provided";
  save: "saved" | "failed" | "not_attempted";
  load: "loaded" | "missing" | "failed" | "not_attempted";
  error: string | null;
  timestamp: string; // ISO 8601
}

export interface BettingCycleResult {
  schema_version: "1.0";
  cycle_id: string;
  items: BettingTableItem[];
  selected_issue_ids: string[];
  cache_overlay: BettingCycleCacheOverlayDiagnostics;
}

export type BettingApprovalRequestSurface = "approvals.native" | "comments.native" | "markdown-only";

export interface BettingApprovalRequestFallbackDiagnostics {
  reason: string | null;
  native_error?: string;
  comment_error?: string;
}

export interface BettingApprovalRequestEnvelope {
  schema_version: "1.0";
  cycle_id: string;
  selected_issue_ids: string[];
  selected_surface: BettingApprovalRequestSurface;
  native_approval_request_id: string | null;
  native_approval_status: "PENDING" | "APPROVED" | "REJECTED" | null;
  /** Native approval ref, comment ref, or deterministic markdown-only fallback ref. */
  approval_request_ref: string;
  requested_at: string; // ISO 8601
  fallback: BettingApprovalRequestFallbackDiagnostics;
}

export interface BettingApprovalRequestResult extends BettingApprovalRequestEnvelope {
  updated_rows: BettingTableItem[];
  cache_overlay: BettingCycleCacheOverlayDiagnostics;
}

export interface EvalGateResult {
  schema_version: "1.0";
  issue_id: string;
  run_id: string | null;
  gates: Array<{
    gate_id: "LARS.Deterministic" | "LARS.SecurityPolicy" | "LARS.ArtifactIntegrity" | "LARS.Budget";
    status: "PASSED" | "FAILED" | "NOT_RUN";
    evidence: string | null;
    is_blocking: boolean;
  }>;
  overall: "PASSED" | "PASSED_WITH_WARNINGS" | "FAILED_BLOCKING" | "INCOMPLETE";
  blocking_failure_count: number;
  warning_count: number;
  not_run_count: number;
  evaluated_at: string;
  evaluated_by: "Div5.QualificationsLibraryLearning";
}

export type EvalGateEvidenceSurface = "comments.native" | "markdown-only";

export interface EvalGateEvidenceEnvelope {
  schema_version: "1.0";
  issue_id: string;
  run_id: string | null;
  selected_surface: EvalGateEvidenceSurface;
  artifact_id: string;
  artifact_ref: string; // `paperclip://issues/{issue}/comments/{id}` or `markdown-only://issues/{issue}/eval-gates/{run}`
  evaluated_at: string;
  mirrored_at: string;
  result: EvalGateResult;
  guidance: string;
  markdown: string;
  cache_overlay: {
    durability: "cache-overlay-only";
    persistence: "missing" | "provided";
    save: "saved" | "failed" | "not_attempted";
    error: string | null;
    timestamp: string;
  };
  fallback: {
    reason: string | null;
    validation_error?: string;
    comment_error?: string;
  };
}

export interface CircuitBreakerRecord {
  schema_version: "1.0";
  issue_id: string;
  state: "CLOSED" | "HALF_OPEN" | "OPEN";
  attempt_count: number;
  max_attempts: number;
  half_open_threshold: number;
  last_failure_at: string | null;
  last_failure_reason: string | null;
  opened_at: string | null;
  escalation_issue_id: string | null;
  updated_at: string;
}

export type CircuitBreakerEvidenceSurface = "issues.native" | "comments.native" | "cache-overlay" | "markdown-only";

export interface CircuitBreakerEvidenceEnvelope {
  schema_version: "1.0";
  issue_id: string;
  run_id: string | null;
  observation: "failure" | "success" | "half_open";
  previous_state: "CLOSED" | "HALF_OPEN" | "OPEN";
  next_state: "CLOSED" | "HALF_OPEN" | "OPEN";
  attempt_count: number;
  max_attempts: number;
  half_open_threshold: number;
  transition_reason: "failure_recorded" | "failure_threshold_reached" | "success_recorded" | "half_open_probe_succeeded" | "half_open_probe_started" | "half_open_ignored_non_open_record" | "invalid_input";
  failure_reason: string | null;
  opened_at: string | null;
  observed_at: string;
  selected_surface: CircuitBreakerEvidenceSurface;
  escalation_issue_id: string | null;
  escalation_ref: string | null;
  artifact_ref: string; // escalation issue/comment ref, cache-overlay ref, or markdown-only ref
  record: CircuitBreakerRecord;
  polling_config: {
    poll_scope: "ACTIVE_RUNS_ONLY";
    interval_ms: 30000;
    jitter_ms: 5000;
    backoff_after_attempts: 10;
    max_retries: 3;
    fallback_source: "activity-log";
  };
  cache_overlay: {
    durability: "cache-overlay-only";
    persistence: "missing" | "provided";
    get: "loaded" | "missing" | "failed" | "malformed" | "not_attempted";
    save: "saved" | "failed" | "not_attempted";
    get_error: string | null;
    save_error: string | null;
    timestamp: string;
  };
  activity: {
    status: "logged" | "failed" | "not_attempted";
    error: string | null;
  };
  fallback: {
    reason: string | null;
    validation_error?: string;
    escalation_create_error?: string;
    comment_error?: string;
    activity_error?: string;
  };
  markdown: string;
}

export type CynefinDomain = "CLEAR" | "COMPLICATED" | "COMPLEX" | "CHAOTIC" | "DISORDER";

export type DecisionRiskTier = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export type DecisionRecordDetailLevel = "compact" | "expanded";

export type DecisionType = "POLICY_UPDATE" | "BATCH_APPROVAL" | "RUSH_AUTHORIZATION" | "EXPERIMENT" | "SELF_HEALING";

export interface DecisionDomainEvidence {
  domain: CynefinDomain;
  matched_signals: string[];
  score: number;
  reasons: string[];
}

export interface DecisionDiagnostics {
  domain_evidence: DecisionDomainEvidence[];
  selected_domain_reasons: string[];
  risk_reasons: string[];
  validation_errors: string[];
  uncertainty_reasons: string[];
  sanitized: true;
}

export interface DecisionOODASections {
  observe: string[];
  orient: string[];
  decide: string[];
  act: string[];
}

export interface DecisionMetadata {
  schema_version: "1.0";
  accepted: true;
  decision_id: string;
  issue_id: string;
  cynefin_domain: CynefinDomain;
  confidence: number; // clamped 0.0 to 1.0
  risk_tier: DecisionRiskTier;
  record_detail: DecisionRecordDetailLevel;
  decision_type: DecisionType;
  emitted_events: string[];
  recommended_action: string;
  decided_by: "Div7.MissionControl";
  decided_at: string; // ISO 8601
  diagnostics: DecisionDiagnostics;
  /** Present for COMPLEX, CHAOTIC, and DISORDER decisions. */
  ooda?: DecisionOODASections;
  /** Deterministic markdown record; compact for low-risk CLEAR, expanded otherwise. */
  record_markdown: string;
}

export interface DecisionValidationFailure {
  schema_version: "1.0";
  accepted: false;
  error: "invalid_decision_input";
  issue_id: string | null;
  decided_by: "Div7.MissionControl";
  decided_at: string; // ISO 8601
  diagnostics: Pick<DecisionDiagnostics, "validation_errors" | "sanitized">;
}

export type DecisionResult = DecisionMetadata | DecisionValidationFailure;

export type DecisionArtifactSurface = "documents.native" | "comments.native" | "markdown-only";

export type DecisionArtifactCapabilityPosture =
  | "confirmed"
  | "unsupported"
  | "fallback-only"
  | "unvalidated"
  | "enabled"
  | "failed";

export interface DecisionArtifactCapabilities {
  /**
   * `confirmed` means runtime proof exists; `enabled` means the caller is deliberately
   * exercising the adapter seam without claiming Paperclip support is proven.
   */
  documents_native?: DecisionArtifactCapabilityPosture;
  /** Comments are the preferred Paperclip-visible fallback unless explicitly unsupported/failed. */
  comments_native?: DecisionArtifactCapabilityPosture;
}

export interface DecisionArtifactCacheOverlayDiagnostics {
  durability: "cache-overlay-only";
  persistence: "missing" | "provided";
  save: "saved" | "failed" | "not_attempted";
  error: string | null;
  timestamp: string; // ISO 8601
}

export interface DecisionArtifactFallbackDiagnostics {
  reason: string | null;
  validation_error?: string;
  document_error?: string;
  comment_error?: string;
}

export interface DecisionArtifactInvariants {
  decided_by: "Div7.MissionControl";
  diagnostics_sanitized: true;
  native_approval_mutated: false;
}

export interface DecisionArtifactEnvelope {
  schema_version: "1.0";
  phase: "S02.decision_artifact";
  issue_id: string | null;
  decision_id: string | null;
  selected_surface: DecisionArtifactSurface;
  artifact_id: string;
  artifact_ref: string;
  decided_at: string; // ISO 8601
  mirrored_at: string; // ISO 8601
  markdown: string; // deterministic DecisionResult record or validation-failure record
  cache_overlay: DecisionArtifactCacheOverlayDiagnostics;
  fallback: DecisionArtifactFallbackDiagnostics;
  decision: DecisionResult;
  invariants: DecisionArtifactInvariants;
}

export interface MajorFlowBatchApprovalDecisionInput {
  kind: "batch_approval";
  cycle_id: string;
  selected_issue_ids: string[];
  reason: string;
  bpi_ref?: string | null;
  approval_request_ref?: string | null;
  confidence?: number;
}

export interface MajorFlowEvalGateFailureDecisionInput {
  kind: "eval_gate_failure";
  result: EvalGateResult;
  guidance?: string | null;
  confidence?: number;
}

export interface MajorFlowCircuitBreakerOpenDecisionInput {
  kind: "circuit_breaker_open";
  issue_id: string;
  run_id?: string | null;
  record: CircuitBreakerRecord;
  transition_reason?: string | null;
  failure_reason?: string | null;
  evidence_artifact_ref?: string | null;
  escalation_ref?: string | null;
  operational_owner?: "Div1.HCO";
  confidence?: number;
}

export interface MajorFlowPolicyExceptionDecisionInput {
  kind: "policy_exception";
  issue_id: string;
  policy_owner: string;
  exception: string;
  policy_ref?: string | null;
  constraint_context?: string | null;
  reversible_next_step: string;
  diagnostics?: string | null;
  confidence?: number;
}

export interface MajorFlowBudgetExceptionDecisionInput {
  kind: "budget_exception";
  issue_id: string;
  budget_owner?: string | null;
  budget_constraint: string;
  requested_exception: string;
  budget_ref?: string | null;
  reversible_next_step: string;
  diagnostics?: string | null;
  confidence?: number;
}

export interface MajorFlowStrategicChoiceDecisionInput {
  kind: "strategic_choice";
  issue_id: string;
  strategic_question: string;
  choice: string;
  hypothesis: string;
  safe_to_fail_probe: string;
  rollback: string;
  owner?: string | null;
  diagnostics?: string | null;
  confidence?: number;
}

export type MajorFlowDecisionInput =
  | MajorFlowBatchApprovalDecisionInput
  | MajorFlowEvalGateFailureDecisionInput
  | MajorFlowCircuitBreakerOpenDecisionInput
  | MajorFlowPolicyExceptionDecisionInput
  | MajorFlowBudgetExceptionDecisionInput
  | MajorFlowStrategicChoiceDecisionInput;
```

## piko:decide decision contract

S01 proves `piko:decide` at contract and fixture level only. The accepted `DecisionMetadata` branch returns the selected Cynefin domain, clamped confidence, risk tier, record detail level, recommendation, sanitized diagnostics, and deterministic markdown record. Invalid inputs return the bounded `DecisionValidationFailure` branch with `accepted: false`, `error: "invalid_decision_input"`, a sanitized issue id when possible, and validation errors only; callers must not expect secrets, raw inputs, stack traces, or thrown exceptions for ordinary malformed decision payloads.

Decision classification rules:

- `CLEAR` covers repeatable batch approval or known playbook signals and may emit `record_detail: "compact"` only when risk is `LOW` and confidence is at least `0.75`.
- `COMPLICATED` covers expert, policy, budget, compliance, or constraint signals and emits expanded diagnostics for review.
- `COMPLEX` covers ambiguous, emerging, experiment, hypothesis, strategy, or probe signals and includes OODA sections for bounded safe-to-fail work.
- `CHAOTIC` covers outage, incident, emergency, runaway, circuit-breaker, or stop signals, sets `risk_tier: "CRITICAL"`, and recommends immediate containment before analysis.
- `DISORDER` is selected when low confidence and mixed or insufficient evidence would make automation choose the wrong control loop; callers should pause, separate signals, and reclassify.

Diagnostic and no-overclaim rules:

- `diagnostics.domain_evidence`, `selected_domain_reasons`, `risk_reasons`, `validation_errors`, and `uncertainty_reasons` are the inspection surface for future agents.
- `diagnostics.sanitized` must remain `true`; diagnostic text is compacted single-line content suitable for issue records.
- `record_markdown` is deterministic fallback-ready markdown. It is not durable Paperclip persistence by itself.
- `decided_by` remains `Div7.MissionControl` for both accepted and rejected decisions. The active division vocabulary is the v1.4.1 vocabulary shown in the `Division` union above; do not reintroduce legacy `Div3.Production` ownership or other deprecated division names.
- S01 does not prove plugin UI, Paperclip actions, native approvals, Hermes, GSD-Pi host behavior, or live host tool registration. The optional worker seam delegates to the same pure decision function but remains fixture evidence until a Paperclip host confirms registration and invocation.

## S02 Decision artifact envelope contract

S02 wraps a `DecisionResult` in a `DecisionArtifactEnvelope` so later flows can tell exactly where the decision record was mirrored. The envelope is the inspection surface: consumers must read `selected_surface`, `artifact_ref`, `cache_overlay`, `fallback`, and `invariants` before treating the record as Paperclip-visible or markdown-only.

Surface selection rules:

- Prefer `documents.native` when `documents_native` is `confirmed` or when a caller explicitly sets `enabled` to exercise the adapter seam. `enabled` is adapter proof only and must not be promoted to live Paperclip proof by itself.
- Fall back to `comments.native` when document support is unvalidated, unavailable, malformed, or rejected and comments are not explicitly `unsupported` or `failed`. Comment fallback keeps the decision visible to Paperclip readers but does not create or mutate a native approval.
- Return `markdown-only` when the input decision is invalid, the document/comment adapter methods are unavailable, native responses are malformed, writes fail, or comment support is unsupported/failed. Markdown-only output is deterministic handoff data for an operator or later retry.
- Invalid `DecisionValidationFailure` input fails closed: no document write, comment write, or cache save is attempted; the envelope embeds sanitized validation diagnostics and uses `decision_id: null`.

Reference and persistence rules:

- Document refs use `paperclip://issues/{issue_id}/documents/{document_id}`. Comment refs use `paperclip://issues/{issue_id}/comments/{comment_id}`. Markdown fallback refs use `markdown-only://issues/{issue_id}/decisions/{decision_id}` for accepted decisions and `markdown-only://issues/{issue_id_or_missing}/decisions/invalid` for validation failures.
- `artifact_id` is the adapter-native document/comment id on native surfaces. Markdown fallback ids are deterministic: `markdown-only:{issue_id_or_missing}:decisions:{decision_id_or_invalid}`.
- `cache_overlay.durability` is always `cache-overlay-only`. A saved cache entry is useful for diagnostics or fast local hydration, but Paperclip documents, Paperclip comments, or the markdown fallback ref remain the visible system-of-record surface. Cache failure must not block document/comment/markdown artifact creation.
- `fallback.validation_error`, `document_error`, `comment_error`, and `cache_overlay.error` are sanitized, single-line, bounded diagnostics. They must not expose secrets, raw stack traces, cookies, bearer tokens, or unbounded dependency output.

Boundary rules:

- `invariants.decided_by` and the embedded `decision.decided_by` remain `Div7.MissionControl`. The v1.4.1 division vocabulary remains active; S02 introduces no legacy `Div3.Production` or deprecated division ownership.
- `invariants.native_approval_mutated` must remain `false`. Fallback comments and markdown records are visible review artifacts only; they never substitute for Paperclip-native approval ids, statuses, or Betting Table approval transitions.
- All external interaction stays behind the `PaperclipAdapter` and optional cache persistence seams. S02 does not grant raw web, API, customer, vendor, host, or approval tools to internal divisions.
- S02 is fixture/adapter proof over decision artifact mirroring. It does not prove plugin UI, host `piko:*` tool registration, native approvals, Hermes, GSD-Pi execution, activity logs, events, or any live runtime support.

## S03 Major-flow decision artifact contract

S03 exposes `persistMajorFlowDecisionArtifact(input, options)` from `plugin-bos-light/src/index.ts` as a discoverable adapter helper. The helper is a composition seam, not a new runtime tool: it derives an S01 `DecisionResult` from a major-flow input, appends bounded major-flow context to the deterministic markdown record, then delegates persistence unchanged to the S02 `DecisionArtifactEnvelope` path.

Supported input variants:

Before deriving classifier signals, S03 validates and normalizes the direct major-flow input shape. Malformed variants, unsupported `kind` values, invalid nested gate/circuit records, and unsafe public issue ids fail closed as S01 `DecisionValidationFailure` values and then flow through the S02 markdown-only artifact envelope with bounded sanitized diagnostics. Untrusted display fields are redacted, compacted, and markdown/HTML-neutralized before rendering; raw gate/circuit evidence, bearer tokens, cookies, API keys, stack traces, and token-like issue ids must not be persisted into markdown, artifact ids, or refs.

- `batch_approval`: records routine Betting Table batch selection context (`cycle_id`, `selected_issue_ids`, optional `bpi_ref`, optional `approval_request_ref`, and reason) as a `CLEAR`/low-risk batch approval when signals are routine. It must not mark Betting Table rows `APPROVAL_REQUESTED` or set native approval ids/statuses.
- `eval_gate_failure`: accepts either a direct `EvalGateResult` or an `EvalGateEvidenceEnvelope` and records blocking or incomplete gate outcomes as expanded review decisions. Raw gate evidence is intentionally omitted; only gate ids, statuses, counts, run id, and sanitized guidance are carried into the decision artifact.
- `circuit_breaker_open`: accepts either a direct OPEN circuit-breaker record context or a `CircuitBreakerEvidenceEnvelope` and records containment as a `CHAOTIC`/`CRITICAL` self-healing decision. Missing records, non-`OPEN` records, and issue-id mismatches fail closed through the S02 markdown-only validation envelope rather than fabricating containment state. Div1.HCO retains operational containment, retry, and recovery ownership while Div7.MissionControl records the artifact-only decision.
- `policy_exception` and `budget_exception`: record complicated policy/budget exception decisions with owner, constraint, requested exception, reversible next step, and sanitized diagnostics. Free-form diagnostics are context only; they are not classifier signals and must not carry secrets or raw dependency output.
- `strategic_choice`: records a complex strategic experiment decision with hypothesis, bounded safe-to-fail probe, rollback, owner, and OODA context.

Relationship to S01 and S02:

- S01 remains the only decision classifier contract. S03 adapters supply controlled signals and confidence defaults; they do not add new Cynefin domains, risk tiers, decision types, events, or division owners.
- S02 remains the only persistence envelope contract. S03 returns the same `DecisionArtifactEnvelope` fields: `selected_surface`, `artifact_ref`, `fallback.reason`, `document_error`, `comment_error`, `cache_overlay.save`, `cache_overlay.error`, embedded `decision.diagnostics`, and `invariants`.
- `documents.native` and `comments.native` mean the supplied adapter seam returned a valid document/comment id under the caller's capability posture. Fixture tests exercise these seams; S03 itself does not add live Paperclip readback proof.
- `markdown-only` remains the deterministic handoff for invalid decisions, unavailable adapter methods, malformed native responses, write failures, or unsupported comments. Operators must copy/retry it before treating it as Paperclip-visible.
- `invariants.native_approval_mutated` must remain `false` for every S03 artifact. Decision artifacts may explain approval, gate, circuit, policy, budget, or strategy decisions, but they never create, approve, reject, or emulate Paperclip-native approvals.

Requirement impact:

- **R003**: improves the visible BOS decision trail by making batch approval, Eval Gate, Circuit Breaker, policy exception, budget exception, and strategic-choice decisions inspectable through the shared artifact envelope.
- **R008**: preserves runtime capability honesty by keeping S03 fixture/integration proof separate from plugin UI, action, host registration, activity/event, and live readback claims.
- **R009**: preserves fail-closed operation for malformed input and dependency failures by returning sanitized fallback diagnostics and markdown-only handoff records instead of throwing ordinary flow errors or mutating native approvals.
- **R010**: keeps cache overlay diagnostic-only; saved cache entries may aid local hydration, but document/comment/markdown artifact refs are the inspection and recovery surface.
- **R015**: supports strategic governance/OODA handoff for complex choices while keeping safe-to-fail probes bounded and rollback instructions explicit.

S04 handoff notes:

- Live readback remains out of scope for S03. A later S04-style proof must create/read native documents or comments for these major-flow artifacts before claiming Paperclip-visible runtime support for this helper in a target environment.
- Fail-closed blocker evidence should cite the S02 envelope fields (`fallback`, `cache_overlay`, `decision.diagnostics`, and `invariants`) rather than raw stack traces or raw external evidence.
- Decision artifacts are not approval substitutes. Native approval creation/readback remains controlled by `approvals.native` evidence and must stay unvalidated until a separate live proof exists.

## M003 S04 decision artifact readback evidence contract

`runtime-evidence/M003-S04-live-decision-artifact-readback.json` is the inspection surface for the bounded live decision artifact readback attempt. It is validated by `python3 scripts/validate_m003_s04_live_decision_artifact_readback.py --evidence runtime-evidence/M003-S04-live-decision-artifact-readback.json --phase final` and records either native document/comment proof for a decision artifact or fail-closed blocker evidence when Paperclip access is unavailable.

Evidence shape:

- `schema_version` is `m003-s04-live-decision-artifact-readback/v1`; `phase` is `live`; `generated_at` is ISO-8601.
- `inputs` echoes only redacted or non-secret inputs: `base_url`, `companyId`, `issueId`, `trusted_origin`, `auth_token_env`, and `auth_header_name`. Token values, cookies, bearer headers, and raw response bodies that may contain secrets must not be persisted.
- `runtime.version` and `runtime.build` are populated only when reachable through supported health/version readback. Null or `unknown` runtime fields are blocker diagnostics, not plugin-runtime proof.
- `selected_surface` is one of `documents.native`, `comments.native`, or `markdown-only`; `artifact_ref` names the chosen native ref or deterministic markdown fallback; `artifact_refs` separately lists document, comments, markdown fallback, and a forbidden `native_approval` ref that must stay null.
- `readback_status`, `content_hash`, `bounded_snippet`, and `readbacks.documents[]`/`readbacks.comments[]` are the hash/snippet proof surface. Live proof requires at least one successful native document or comment readback with matching sha256; a markdown-only ref never counts as live readback.
- `diagnostics[]` uses bounded phase names such as `auth.preflight`, `runtime.health`, `documents.native`, `comments.native`, `documents.read`, `comments.read`, and `readback.mismatch`; every diagnostic is sanitized, single-line, and bounded.
- `side_effect_counts` must show no unsupported side effects: `approval_requests_created=0`, `activity_logs_written=0`, `hermes_runs_started=0`, `gsd_pi_runs_started=0`, and `plugin_actions_invoked=0`. Issue/document/comment counters describe only the bounded native artifact attempt when it actually reaches those phases.
- `capability_claims` must keep `native_approval`, `activity_log`, `hermes`, `gsd_pi`, `plugin_actions`, and `unsupported_capability_promoted` as `false`.
- `invariants` must include `decided_by="Div7.MissionControl"`, `diagnostics_sanitized=true`, `native_approval_mutated=false`, `no_secret_diagnostics=true`, `hermes_execution_attempted=false`, and `gsd_pi_execution_attempted=false`.

Current M003 S04 outcome:

- The current artifact is `fail-closed-blocker` with `selected_surface=markdown-only`, `readback_status=blocked_preflight`, and `blocker_reason=missing_base_url_company_id_auth_token_env`.
- Its deterministic markdown fallback ref and content hash/snippet are handoff evidence only. They do not prove Paperclip-visible persistence, plugin UI, host `piko:*` tool registration, host actions, data providers, config/state/entities APIs, activity logs, events, native approvals, Hermes, or GSD-Pi.
- Cache-overlay diagnostics remain `cache-overlay-only` posture. Any local cache save is diagnostic/latency support and must be reconstructable from native document/comment readback or markdown-only fallback.
- Approval immutability is mandatory: decision readback can explain an approval-related decision, but it never creates, approves, rejects, mutates, or emulates a Paperclip-native approval request.

## Deterministic BPI formula

```ts
normalized_cost = clamp01(estimated_token_cost / company_token_budget_ref)
raw_score = (expected_value * urgency) / max(0.01, normalized_cost * risk_factor)
score = clamp01(raw_score)
```

Rules:

- Clamp all user/model-provided component values.
- `company_token_budget_ref` must be part of BOS config.
- If any hard gate fails, mark issue `REJECTED_BPI` or send to manual review depending on product policy.

## Product Blueprint artifact contract

The S03 seeded issue path computes BPI, generates the required five-section Product Blueprint, and returns a `ProductBlueprintArtifact` envelope. Consumers must inspect `selected_surface`, `artifact_ref`, `fallback.reason`, `document_error`/`comment_error`, and `mirrored_at` before deciding whether the artifact is a confirmed Paperclip native document, a comment fallback, or markdown-only diagnostic output.

Surface selection rules:

- Prefer `documents.native` only when `documents_native` is runtime `confirmed` or an explicit local `enabled` adapter-seam exercise. `enabled` is not Paperclip proof and must not promote `documents.native` in the capability matrix.
- Fall back to `comments.native` when document support is unvalidated, unsupported, or a document write fails and comments are not explicitly unsupported/failed.
- Return `markdown-only` when hard gates fail, required Blueprint inputs are missing, comment writes fail, or no native/comment fallback is usable.
- `BosStatusOverlay.blueprint_id` and `BettingTableItem.blueprint_id` carry `artifact_ref`, not transient plugin-state identity. S04 must pass the value through as an opaque reference and must not infer approval/request scope from it.
- `IssueBlueprintStatusOverlay.cache_overlay` reports whether optional cache writes happened, but its durability is always `cache-overlay-only`; native document/comment/markdown artifacts remain the recovery surface.
- Issue title/body/acceptance/resources are untrusted display content. The current Blueprint is inert markdown; consumers must not execute embedded markup or scripts.

## Betting Table cycle and approval request contract

The S04 Betting Table flow is proven at fixture level only. It ranks candidates by BPI, preserves each S03 `blueprint_id` as an opaque artifact reference, and may cache the current cycle for worker data-provider hydration. The `BettingCycleResult` inspection surface is the contract: `cycle_id`, `selected_issue_ids`, ranked `items`, and `cache_overlay` are returned together so consumers can show useful diagnostics without claiming durable Paperclip state.

Cycle cache rules:

- `cache_overlay.durability` is always `cache-overlay-only`, even when `save` or `load` is `saved`/`loaded`.
- `persistence: "missing"` plus `save`/`load: "not_attempted"` means no cache seam was supplied; it is not an error and not a native Paperclip state claim.
- `load: "missing"` means a cache seam exists but no cycle was found. Callers must return empty rows plus diagnostics rather than infer a default cycle.
- `save: "failed"` or `load: "failed"` must include a sanitized single-line `error`. Cache failures must not hide the ranked candidate output or native approval result.

Approval request rules:

- `selected_surface: "approvals.native"` means the adapter seam returned a valid native approval id and status. In this repository that is fixture evidence only while `approvals.native` remains `unvalidated`.
- `selected_surface: "comments.native"` records a human-visible fallback request comment when native approvals are unavailable or fail. It must not mutate Betting Table rows or simulate approval status.
- `selected_surface: "markdown-only"` records deterministic fallback diagnostics for empty selections, stale issue ids, missing cycles, already-decided rows, malformed native responses, adapter failures, or missing comment support.
- `native_approval_request_id` and `native_approval_status` are non-null only for a validated native approval response. Comment and markdown fallbacks keep both fields null.
- `approval_request_ref` is surface-qualified: `paperclip://approval-requests/{id}` for native approval seams, `paperclip://issues/{issue_id}/comments/{comment_id}` for comment fallback seams, or `markdown-only://betting-cycles/{cycle_id}/approval-request` for diagnostic markdown.
- Only native approval success may mark selected rows `APPROVAL_REQUESTED` and persist `native_approval_request_id`; fallback paths return/comment-record diagnostics without becoming a plugin-side approval engine.

## S05 Eval Gate and Circuit Breaker evidence contracts

S05 adds explicit evidence envelopes for A6-A10 without changing the runtime capability posture. `piko:eval-gate` remains a pure gate calculation. `piko:eval-gate-evidence` composes that result with cache-overlay save diagnostics and a Paperclip-visible comment seam when available; `piko:circuit-breaker-observe` records one bounded Circuit Breaker observation at a time. Tool registration remains `unvalidated` until a live Paperclip host proves `registration.tools` and returns registered/invokable tool keys.

Eval Gate evidence rules:

- `selected_surface: "comments.native"` means the adapter seam returned a non-empty `comment_id`. Because `comments.native` is still `unvalidated`, this is fixture/adapter evidence, not live Paperclip proof.
- `selected_surface: "markdown-only"` is returned for invalid inputs, missing comment support, malformed comment responses, or comment write failures. The `markdown` payload and `markdown-only://issues/{issue_id}/eval-gates/{run_id}` reference are the deterministic handoff.
- `cache_overlay.durability` is always `cache-overlay-only`; `save: "saved"` means the supplied persistence seam accepted the gate result, not that Paperclip state is durable.
- `guidance`, `result.overall`, blocking counts, `fallback.reason`, `validation_error`, and `comment_error` are the inspection fields that future agents should use before moving status to `ACCEPTED` or `CORRECTION_REQUIRED`.

Circuit Breaker evidence rules:

- The envelope exposes `previous_state`, `next_state`, `attempt_count`, `failure_reason`, `transition_reason`, `selected_surface`, `escalation_ref`, `cache_overlay`, `activity`, `fallback`, `observed_at`, and the full `record` so CLOSED, HALF_OPEN, and OPEN behavior is inspectable without hidden plugin state.
- `selected_surface: "cache-overlay"` is the normal non-OPEN observation surface. It is diagnostic only and must not be described as durable Paperclip storage.
- `selected_surface: "issues.native"` or `"comments.native"` means the adapter seam returned an escalation issue/comment reference. Both native issues and comments remain `unvalidated` until live create/read evidence exists.
- `selected_surface: "markdown-only"` is returned for invalid input, missing issue/comment support, malformed escalation creation, or escalation/comment write failures. Operators must preserve or copy the markdown into a visible Paperclip artifact before retrying an OPEN issue.
- Activity logging is non-blocking. `activity.status` can be `logged`, `failed`, or `not_attempted`; an activity log alone is diagnostic and is never the durable evidence path while `activity.logging` is `unvalidated`.
- `polling_config` preserves the fallback posture: active runs only, 30000 ms interval, 5000 ms jitter, backoff after 10 attempts, max 3 retries, and activity-log fallback. Terminal run events remain `fallback-only`; do not claim event-driven run support without live C2/C7 proof.
