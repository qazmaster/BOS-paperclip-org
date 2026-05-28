# 04 - Data Contracts

These are the minimal BOS Light contracts. Keep them stable. Add fields only with schema version increments.

```ts
export type Division =
  | "Div1.Executive"
  | "Div2.MasterPlanner"
  | "Div3.Production"
  | "Div4.Operations"
  | "Div5.Qualifications"
  | "Div6.Resources"
  | "Div7.Strategy";

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
  evaluated_by: "Div5.Qualifications";
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

export interface DecisionMetadata {
  schema_version: "1.0";
  decision_id: string;
  issue_id: string;
  cynefin_domain: "CLEAR" | "COMPLICATED" | "COMPLEX" | "CHAOTIC" | "DISORDER";
  confidence: number;
  decision_type: "POLICY_UPDATE" | "BATCH_APPROVAL" | "RUSH_AUTHORIZATION" | "EXPERIMENT" | "SELF_HEALING";
  emitted_events: string[];
  recommended_action: string;
  decided_by: "Div7.Executive";
  decided_at: string;
}
```

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
