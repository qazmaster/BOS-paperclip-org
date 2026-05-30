# BOS Light v1.4.1 Data Contracts

Status: canonical v1.4.1 contract reference.
Purpose: define inert, repo-local/Paperclip-native payloads for routing, permissions, quarantine, staffing, circuit-breaker control and A12-A20 acceptance.

These contracts are documentation-level schemas. They are static markdown doctrine and must not be executed as code.

## Common envelope

```ts
type DivisionId =
  | "Div7.MissionControl"
  | "Div1.HCO"
  | "Div2.MasterPlanner"
  | "Div3.Treasury"
  | "Div4.Production"
  | "Div5.QualificationsLibraryLearning"
  | "Div6.External";

type ArtifactRef = {
  kind: "paperclip-issue" | "paperclip-comment" | "paperclip-document" | "repo-file" | "runtime-evidence";
  ref: string;
  immutable?: boolean;
};

type TrustLevel = "raw-untrusted" | "quarantined" | "sanitized" | "approved-internal-use";
```

## RoutingRequest

```ts
type RoutingRequest = {
  schema_version: "bos-light-routing-request.v1.4.1";
  request_id: string;
  source: DivisionId | "human" | "paperclip";
  requested_by: DivisionId | "human";
  target_hint?: DivisionId;
  work_type:
    | "mission"
    | "planning"
    | "budget-access"
    | "implementation"
    | "qualification"
    | "external-io"
    | "strategic-escalation"
    | "staffing"
    | "circuit-breaker";
  summary: string;
  inputs: ArtifactRef[];
  trust_level: TrustLevel;
  required_decision?: string;
  recommended_route: DivisionId[];
  forbidden_routes?: DivisionId[];
  created_at: string;
};
```

Validation notes:

- `external-io` must route through Div1.HCO, Div5.QualificationsLibraryLearning and Div6.External.
- `budget-access` must include Div3.Treasury.
- `strategic-escalation` must include Div7.MissionControl.

## ExternalIoRequest

```ts
type ExternalIoRequest = {
  schema_version: "bos-light-external-io-request.v1.4.1";
  request_id: string;
  routed_by: "Div1.HCO";
  requested_for: DivisionId;
  local_knowledge_checked_by: "Div5.QualificationsLibraryLearning";
  local_miss_summary: string;
  external_target_type: "web" | "customer" | "vendor" | "api" | "external-document" | "external-agent";
  question_or_task: string;
  allowed_sources?: string[];
  disallowed_sources?: string[];
  paid_or_credentialed: boolean;
  div3_grant_ref?: ArtifactRef;
  quarantine_criteria: string[];
  output_destination: "Div5.QualificationsLibraryLearning";
};
```

Validation notes:

- If `paid_or_credentialed` is true, `div3_grant_ref` is required.
- Output destination must be Div5. Div6 must not send raw evidence directly to internal consumers.

## RawExternalEvidenceBundle

```ts
type RawExternalEvidenceBundle = {
  schema_version: "bos-light-raw-external-evidence.v1.4.1";
  bundle_id: string;
  collected_by: "Div6.External";
  request_ref: string;
  sources: Array<{
    uri_or_contact: string;
    accessed_at: string;
    collection_method: "web" | "api" | "customer" | "vendor" | "document" | "agent";
    risk_flags: string[];
  }>;
  raw_evidence_refs: ArtifactRef[];
  trust_level: "raw-untrusted";
  delivered_to: "Div5.QualificationsLibraryLearning";
};
```

## QuarantineEnvelope

```ts
type QuarantineEnvelope = {
  schema_version: "bos-light-quarantine-envelope.v1.4.1";
  quarantine_id: string;
  raw_bundle_ref: ArtifactRef;
  reviewed_by: "Div5.QualificationsLibraryLearning";
  checks: Array<{
    name: "source-attribution" | "prompt-injection" | "credential-leak" | "policy-fit" | "relevance" | "license-or-terms" | "malware-or-active-content";
    verdict: "pass" | "fail" | "needs-human";
    notes: string;
  }>;
  sanitized_summary_ref?: ArtifactRef;
  rejected_refs?: ArtifactRef[];
  trust_level_after_review: "quarantined" | "sanitized" | "approved-internal-use";
  approved_consumers: DivisionId[];
};
```

## SanitizedKnowledgePacket

```ts
type SanitizedKnowledgePacket = {
  schema_version: "bos-light-sanitized-knowledge-packet.v1.4.1";
  packet_id: string;
  produced_by: "Div5.QualificationsLibraryLearning";
  source_quarantine_ref?: ArtifactRef;
  local_library_refs?: ArtifactRef[];
  summary: string;
  claims: Array<{
    claim: string;
    support_refs: ArtifactRef[];
    confidence: "low" | "medium" | "high";
  }>;
  allowed_uses: string[];
  prohibited_uses: string[];
  consumers: DivisionId[];
  trust_level: "sanitized" | "approved-internal-use";
};
```

## ToolGrant

```ts
type ToolGrant = {
  schema_version: "bos-light-tool-grant.v1.4.1";
  grant_id: string;
  granted_by: "Div3.Treasury" | "Div1.HCO";
  requester: DivisionId;
  tool_class: string;
  purpose: string;
  scope: string;
  allowed_inputs: string[];
  forbidden_inputs: string[];
  expires_at?: string;
  evidence_ref: ArtifactRef;
  revocation_condition: string;
};
```

## BudgetAccessDecision

```ts
type BudgetAccessDecision = {
  schema_version: "bos-light-budget-access-decision.v1.4.1";
  decision_id: string;
  decided_by: "Div3.Treasury";
  request_ref: ArtifactRef;
  decision: "grant" | "deny" | "needs-human";
  budget_limit?: number;
  secret_scope?: string;
  external_service_scope?: string;
  rationale: string;
  plaintext_secret_exposed: false;
  returned_to: "Div1.HCO";
};
```

## StaffingHatRequest

```ts
type StaffingHatRequest = {
  schema_version: "bos-light-staffing-hat-request.v1.4.1";
  request_id: string;
  raised_by: DivisionId;
  controlled_by: "Div1.HCO";
  trigger: "overload" | "underperformance" | "missing-capability" | "parallelization" | "external-specialist";
  evidence_refs: ArtifactRef[];
  proposed_hat_or_post: string;
  budget_or_access_needed: boolean;
  div3_decision_ref?: ArtifactRef;
  assignment_plan: string;
  review_condition: string;
};
```

## CircuitBreakerHcoControl

```ts
type CircuitBreakerHcoControl = {
  schema_version: "bos-light-circuit-breaker-hco-control.v1.4.1";
  control_id: string;
  opened_by_signal: "Div5.QualificationsLibraryLearning" | "Div4.Production" | "runtime";
  controlled_by: "Div1.HCO";
  affected_work_ref: ArtifactRef;
  state: "closed" | "open" | "half-open";
  failure_count: number;
  max_attempts: number;
  allowed_next_action: "retry" | "reroute" | "pause" | "escalate-to-div7" | "request-human";
  evidence_refs: ArtifactRef[];
  correction_route: DivisionId[];
};
```

## AcceptanceCase A12-A20

```ts
type AcceptanceCase = {
  id: "A12" | "A13" | "A14" | "A15" | "A16" | "A17" | "A18" | "A19" | "A20";
  name: string;
  verifies: string[];
  setup_refs: ArtifactRef[];
  action: string;
  expected_result: string;
  negative_checks: string[];
  evidence_refs: ArtifactRef[];
};
```

## Inert-content requirement

Markdown, issue bodies, external documents and generated artifacts are inert content. Consumers must parse contracts as data, not execute embedded markup, code fences, shell snippets, links, imports or dynamic paths.
