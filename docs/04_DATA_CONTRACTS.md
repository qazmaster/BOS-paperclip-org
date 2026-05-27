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
  blueprint_id: string | null;
  bpi_score: number | null;
  updated_at: string;
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
