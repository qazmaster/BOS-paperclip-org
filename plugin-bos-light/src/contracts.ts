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
  confidence: number;
  risk_tier: DecisionRiskTier;
  record_detail: DecisionRecordDetailLevel;
  decision_type: DecisionType;
  emitted_events: string[];
  recommended_action: string;
  decided_by: "Div7.MissionControl";
  decided_at: string;
  diagnostics: DecisionDiagnostics;
  ooda?: DecisionOODASections;
  record_markdown: string;
}

export interface DecisionValidationFailure {
  schema_version: "1.0";
  accepted: false;
  error: "invalid_decision_input";
  issue_id: string | null;
  decided_by: "Div7.MissionControl";
  decided_at: string;
  diagnostics: Pick<DecisionDiagnostics, "validation_errors" | "sanitized">;
}

export type DecisionResult = DecisionMetadata | DecisionValidationFailure;

export type DecisionArtifactSurface = "documents.native" | "comments.native" | "markdown-only";

export type DecisionArtifactCapabilityPosture = "confirmed" | "unsupported" | "fallback-only" | "unvalidated" | "enabled" | "failed";

export interface DecisionArtifactCapabilities {
  /**
   * `confirmed` means runtime proof exists; `enabled` means the caller is deliberately
   * exercising the adapter seam without claiming Paperclip support is proven.
   */
  documents_native?: DecisionArtifactCapabilityPosture;
  /** Comments are the preferred Paperclip-visible fallback unless explicitly unsupported/failed. */
  comments_native?: DecisionArtifactCapabilityPosture;
}

export type DecisionArtifactPersistenceAvailability = "missing" | "provided";
export type DecisionArtifactCacheSaveStatus = "saved" | "failed" | "not_attempted";

export interface DecisionArtifactCacheOverlayDiagnostics {
  durability: "cache-overlay-only";
  persistence: DecisionArtifactPersistenceAvailability;
  save: DecisionArtifactCacheSaveStatus;
  error: string | null;
  timestamp: string;
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
  decided_at: string;
  mirrored_at: string;
  markdown: string;
  cache_overlay: DecisionArtifactCacheOverlayDiagnostics;
  fallback: DecisionArtifactFallbackDiagnostics;
  decision: DecisionResult;
  invariants: DecisionArtifactInvariants;
}

export type DecisionArtifactReadbackStatus =
  | "matched"
  | "mismatch"
  | "fail-closed"
  | "denied"
  | "malformed"
  | "missing-content"
  | "timeout"
  | "unsafe-ref"
  | "unsupported-ref";

export interface DecisionArtifactReadbackDiagnostic {
  phase: "documents.read" | "comments.read" | "artifact-ref.parse";
  status_code: number | null;
  bounded_response_text: string | null;
  malformed_json_reason: string | null;
  timeout_ms: number | null;
  fallback_used: boolean;
  message: string;
}

export interface DecisionArtifactReadbackResult {
  schema_version: "live-decision-artifact-readback/v1";
  selected_surface: DecisionArtifactSurface;
  artifact_ref: string;
  artifact_id: string;
  issue_id: string | null;
  status: DecisionArtifactReadbackStatus;
  live_proof: boolean;
  sha256: string | null;
  expected_sha256: string | null;
  snippet: string | null;
  diagnostics: DecisionArtifactReadbackDiagnostic[];
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

export interface BOSConfig {
  schema_version: "1.0";
  company_token_budget_ref: number;
  bpi_cutline: number;
  betting_table_top_n: number;
  circuit_breaker_max_attempts: number;
  circuit_breaker_half_open_threshold: number;
}

/* ── Boundary packet contracts (Owner Interface Boundary) ── */

export interface DivisionPacket {
  schema_version: "1.0";
  packet_id: string;
  from_division: Division;
  to_division: Division;
  payload: unknown;
  timestamp: string;
}

export interface ExecutiveStatusPacket {
  schema_version: "1.0";
  packet_id: string;
  from_division: Division;
  status: "PENDING" | "IN_PROGRESS" | "COMPLETED" | "FAILED";
  payload: unknown;
  timestamp: string;
}

export interface ExecutiveReport {
  schema_version: "1.0";
  report_id: string;
  issued_by: "Div7.MissionControl";
  title: string;
  summary: string;
  findings: Array<{
    division: Division;
    status: string;
    detail: string;
  }>;
  issued_at: string;
}

export type OwnerBoundaryResult =
  | { authorized: true; caller: Division; allowed: Division }
  | { authorized: false; caller: Division; allowed: Division; reason: string };

/* ── Mission routing contracts (Div1 Internal Routing Control) ── */

export interface RoutingDecisionPacket {
  schema_version: "1.0";
  packet_id: string;
  mission_id: string;
  activated_divisions: Division[];
  excluded_divisions: Division[];
  routing_rule: string;
  routed_by: "Div1.HCO";
  routed_at: string;
}

export interface MissionRoutingState {
  schema_version: "1.0";
  mission_id: string;
  status: "PENDING" | "ROUTED" | "REJECTED" | "IN_PROGRESS" | "COMPLETED" | "FAILED";
  routing_packet_id: string | null;
  activated_divisions: Division[];
  excluded_divisions: Division[];
  current_division: Division | null;
  updated_at: string;
}

export interface MissionRouterUnauthorized {
  schema_version: "1.0";
  authorized: false;
  caller: Division;
  required_role: "Div1.HCO";
  reason: string;
  rejected_at: string;
}

/* ── Decision Delegation contracts (Div7 → Div1) ── */

export type RoutingPhase =
  | "pre_decision"
  | "post_div7_decision"
  | "operational";

export type RecommendedMode =
  | "PLAYBOOK"
  | "EXPERT_REVIEW"
  | "SAFE_TO_FAIL_EXPERIMENT"
  | "STABILIZE_FIRST";

export interface RoutingDirective {
  targetDivisions: Division[];
  routingRule: string;
  requiresBudgetGrant: boolean;
  requiresQA: boolean;
  requiresQuarantine: boolean;
  requiresHumanApproval: boolean;
}

export interface DecisionDelegatedPayload {
  schema_version: "1.0";
  decision_id: string;
  cynefin_domain: CynefinDomain;
  recommended_mode: RecommendedMode;
  routing_directive: RoutingDirective;
  constraints: string[];
  required_followup_divisions: Division[];
  escalation_level: "none" | "monitor" | "escalate" | "critical";
}

export interface DecisionDelegatedPacket {
  schema_version: "1.0";
  packet_id: string;
  packet_type: "decision_delegated";
  from_division: "Div7.MissionControl";
  to_division: "Div1.HCO";
  payload: DecisionDelegatedPayload;
  timestamp: string;
}

/* ── Treasury scoped access contracts (Div3 Secret Management) ── */

export interface PaperclipSecretRef {
  type: "secret_ref";
  secret_id: string;
  version: "latest";
}

export interface InlineEnvRef {
  type: "inline_env";
  env_key: string;
}

export type SecretRef = PaperclipSecretRef | InlineEnvRef;

export type AllowedGitOperation = "clone" | "fetch" | "pull" | "push" | "read" | "write";

export interface ScopedAccessGrant {
  schema_version: "1.0";
  grant_id: string;
  mission_id: string;
  repo_url: string;
  allowed_ops: AllowedGitOperation[];
  secret_ref: SecretRef;
  granted_by: Division;
  granted_at: string;
  expires_at: string;
}

export interface TreasuryUnauthorized {
  schema_version: "1.0";
  authorized: false;
  caller: Division;
  required_role: "Div3.Treasury";
  reason: string;
  rejected_at: string;
}

export interface ExternalGitGatewayUnauthorized {
  schema_version: "1.0";
  authorized: false;
  caller: Division;
  required_role: "Div6.External";
  reason: string;
  rejected_at: string;
}

/* ── Div5 Quarantine and Verification contracts ── */

export interface Div5QuarantineUnauthorized {
  schema_version: "1.0";
  authorized: false;
  caller: Division;
  required_role: "Div5.QualificationsLibraryLearning";
  reason: string;
  rejected_at: string;
}

export interface PostProductionCheck {
  check_id: string;
  passed: boolean;
  detail: string;
}

export interface PostProductionVerdict {
  schema_version: "1.0";
  mission_id: string;
  snapshot_id: string;
  branch_created: string;
  commit_sha: string;
  checks: PostProductionCheck[];
  overall: "PASS" | "FAIL";
  evaluated_at: string;
  evaluated_by: "Div5.QualificationsLibraryLearning";
}

export interface Div5PostProductionUnauthorized {
  schema_version: "1.0";
  authorized: false;
  caller: Division;
  required_role: "Div5.QualificationsLibraryLearning";
  reason: string;
  rejected_at: string;
}

export interface QuarantineVerdict {
  schema_version: "1.0";
  quarantine_ref: string;
  mission_id: string;
  grant_id: string;
  status: "PENDING" | "SCANNING" | "APPROVED" | "REJECTED";
  secret_scan_passed: boolean;
  branch_inventory: string[];
  ref_inventory: string[];
  commit_shas: string[];
  scanned_at: string;
  scanned_by: "Div5.QualificationsLibraryLearning";
  security_flags_ref: string[];
}

export interface SanitizedRepoSnapshot {
  schema_version: "1.0";
  snapshot_id: string;
  quarantine_ref: string;
  mission_id: string;
  approved_for_division: "Div4.Production";
  branch_inventory: string[];
  ref_inventory: string[];
  commit_shas: string[];
  secret_scan_passed: boolean;
  approved_at: string;
  approved_by: "Div5.QualificationsLibraryLearning";
  /** Optional local workspace path propagated from Div6 → Div5 → Div4. */
  local_path?: string;
}

/* ── Div4 Production contracts ── */

export interface Div4ProductionUnauthorized {
  schema_version: "1.0";
  authorized: false;
  caller: Division;
  required_role: "Div4.Production";
  reason: string;
  rejected_at: string;
}

export interface ProductionWorkEvidence {
  schema_version: "1.0";
  mission_id: string;
  snapshot_id: string;
  commit_sha: string;
  diff_hash: string;
  branch_created: string;
  files_changed: string[];
  pushed: false;
  produced_at: string;
  produced_by: "Div4.Production";
}

/* ── Div3 Treasury Grant contracts ── */

export interface GrantRequest {
  schema_version: "1.0";
  requested_by: "Div1.HCO";
  target_division: Division;
  mission_id: string;
  paperclip_task_id?: string;
  purpose: string;
  requested_tools: string[];
  requested_secrets: string[];
  estimated_cost: number;
  risk_level: DecisionRiskTier;
  ttl_minutes: number;
  requested_at: string;
}

export interface BudgetGrant {
  schema_version: "1.0";
  grant_id: string;
  grant_type: "BUDGET_GRANT";
  mission_id: string;
  target_division: Division;
  allowed_tools: string[];
  denied_tools: string[];
  token_cap: number;
  ttl_minutes: number;
  secrets: string[];
  requires_qa: boolean;
  granted_by: "Div3.Treasury";
  granted_at: string;
  expires_at: string;
}

export interface AccessGrant {
  schema_version: "1.0";
  grant_id: string;
  grant_type: "ACCESS_GRANT";
  mission_id: string;
  target_division: Division;
  allowed_tools: string[];
  denied_tools: string[];
  secrets: string[];
  adapter_scope: string;
  granted_by: "Div3.Treasury";
  granted_at: string;
  expires_at: string;
}

export interface EmergencyGrant {
  schema_version: "1.0";
  grant_id: string;
  grant_type: "EMERGENCY_GRANT";
  mission_id: string;
  target_division: Division;
  authorization_ref: string;
  authorized_by: "Div7.MissionControl";
  allowed_tools: string[];
  denied_tools: string[];
  token_cap: number;
  ttl_minutes: number;
  secrets: string[];
  requires_qa: boolean;
  granted_by: "Div3.Treasury";
  granted_at: string;
  expires_at: string;
}

export interface GrantApproved {
  schema_version: "1.0";
  decision_id: string;
  status: "approved";
  budget_grant_id: string;
  access_grant_id?: string;
  allowed_tools: string[];
  denied_tools: string[];
  token_cap: number;
  ttl_minutes: number;
  rationale: string;
  decided_by: "Div3.Treasury";
  decided_at: string;
}

export interface GrantDenied {
  schema_version: "1.0";
  decision_id: string;
  status: "denied";
  reason: string;
  required_route?: Division[];
  rationale: string;
  decided_by: "Div3.Treasury";
  decided_at: string;
}

export interface GrantEscalated {
  schema_version: "1.0";
  decision_id: string;
  status: "escalate";
  reason: string;
  escalation_target: "Div1.HCO" | "Div7.MissionControl" | "HumanOwner";
  rationale: string;
  decided_by: "Div3.Treasury";
  decided_at: string;
}

export type GrantDecision = GrantApproved | GrantDenied | GrantEscalated;

/* ── Div4 Production task contracts ── */

export interface ProductionTaskPacket {
  schema_version: "1.0";
  task_id: string;
  mission_id: string;
  blueprint_id: string;
  target_division: "Div4.Production";
  scope: {
    files_allowed: string[];
    implementation_plan: string;
    constraints: string[];
    acceptance_criteria: string[];
  };
  grant: {
    budget_grant_id: string;
    access_grant_id?: string;
    allowed_tools: string[];
    denied_tools: string[];
    token_cap: number;
    ttl_minutes: number;
  };
  assigned_by: "Div1.HCO";
  assigned_at: string;
}

export interface BlockerRaisedPacket {
  schema_version: "1.0";
  packet_type: "blocker_raised";
  blocker_id: string;
  mission_id: string;
  task_id: string;
  blocker_type:
    | "missing_blueprint"
    | "missing_access"
    | "missing_budget"
    | "missing_dependency"
    | "external_info_needed"
    | "tests_impossible"
    | "acceptance_criteria_unclear"
    | "scope_conflict"
    | "grant_expired"
    | "grant_revoked"
    | "budget_exhausted"
    | "circuit_breaker_triggered";
  description: string;
  requested_action: string;
  raised_by: "Div4.Production";
  raised_at: string;
}

export interface QAReviewRequestedPacket {
  schema_version: "1.0";
  packet_type: "qa_review_requested";
  mission_id: string;
  task_id: string;
  snapshot_id: string;
  commit_sha: string;
  branch_created: string;
  files_changed: string[];
  local_checks_passed: boolean;
  implementation_notes: string;
  requested_by: "Div4.Production";
  requested_at: string;
}

export interface ProductionCompletedPacket {
  schema_version: "1.0";
  packet_type: "production_completed";
  mission_id: string;
  task_id: string;
  evidence: ProductionWorkEvidence;
  completed_by: "Div4.Production";
  completed_at: string;
}
