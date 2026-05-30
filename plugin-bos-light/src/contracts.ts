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
  score: number;
  formula: "bpi_v1.0";
  components: {
    expected_value: number;
    urgency: number;
    estimated_token_cost: number;
    risk_factor: number;
    company_token_budget_ref: number;
  };
  hard_gates: {
    strategic_weight_passed: boolean;
    budget_snapshot_available: boolean;
    acceptance_inputs_present: boolean;
    policy_precheck_passed: boolean;
    security_precheck_passed: boolean;
  };
  scored_by: "Div2.MasterPlanner";
  scored_at: string;
  source_issue_id: string;
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

export interface BosStatusOverlay {
  schema_version: "1.0";
  issue_id: string;
  bos_status: BosStatus;
  producer_division: Division;
  blueprint_id: string | null;
  bpi_score: number | null;
  updated_at: string;
}

export type NativeApprovalStatus = "PENDING" | "APPROVED" | "REJECTED";

export interface BettingTableItem {
  schema_version: "1.0";
  cycle_id: string;
  issue_id: string;
  bpi_score: number;
  blueprint_id: string | null;
  status: "CANDIDATE" | "APPROVAL_REQUESTED" | "APPROVED_FOR_CYCLE" | "REJECTED" | "COMPLETED";
  native_approval_request_id: string | null;
  native_approval_status: NativeApprovalStatus | null;
  approved_by: string | null;
  created_at: string;
  updated_at: string;
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
  native_approval_status: NativeApprovalStatus | null;
  approval_request_ref: string;
  requested_at: string;
  fallback: BettingApprovalRequestFallbackDiagnostics;
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

export interface DecisionMetadata {
  schema_version: "1.0";
  decision_id: string;
  issue_id: string;
  cynefin_domain: "CLEAR" | "COMPLICATED" | "COMPLEX" | "CHAOTIC" | "DISORDER";
  confidence: number;
  decision_type: "POLICY_UPDATE" | "BATCH_APPROVAL" | "RUSH_AUTHORIZATION" | "EXPERIMENT" | "SELF_HEALING";
  emitted_events: string[];
  recommended_action: string;
  decided_by: "Div7.MissionControl";
  decided_at: string;
}

export interface BOSConfig {
  schema_version: "1.0";
  company_token_budget_ref: number;
  bpi_cutline: number;
  betting_table_top_n: number;
  circuit_breaker_max_attempts: number;
  circuit_breaker_half_open_threshold: number;
}
