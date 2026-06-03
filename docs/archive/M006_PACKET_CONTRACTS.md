# M006 — Packet Contracts

> **Status:** v1.4.1 doctrine + M006 autonomy extensions  
> **Scope:** Structured packets for autonomous 7-division mission loop  
> **Rule:** All packets are inert content. Consumers parse as data, never execute embedded markup, code, or dynamic paths.

---

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

---

## P01 — MissionDirective

**Owner:** Div7.MissionControl  
**Producer:** Div7.MissionControl  
**Consumer:** Div1.HCO (internal), Human Owner (final report)  
**Allowed next step:** Div1.HCO receives for routing  
**Trust level:** `raw-untrusted` until Div2 shapes, then `sanitized`

```ts
type MissionDirective = {
  schema_version: "bos-light-mission-directive.v1.4.1";
  directive_id: string;
  issued_by: "Div7.MissionControl";
  received_by: "Div1.HCO";
  title: string;
  description: string;
  goal: string;
  business_value: string;
  risk_level: "low" | "medium" | "high" | "policy-sensitive";
  requested_divisions: DivisionId[];
  constraints: string[];
  approval_gates: string[];
  owner_contact: "human-only-through-Div7";
  created_at: string;
  artifact_ref: ArtifactRef;
};
```

**Validation notes:**
- `owner_contact` must always route through Div7. No division may use this field to contact human directly.
- If `risk_level` is `policy-sensitive`, Div7 must hold until human confirms.

---

## P02 — OwnerQuestionPacket

**Owner:** Div7.MissionControl  
**Producer:** Any division (via Div1.HCO)  
**Consumer:** Div7.MissionControl → Human Owner  
**Allowed next step:** Human Owner responds; Div7 synthesizes answer into mission context  
**Trust level:** `raw-untrusted` (human input)

```ts
type OwnerQuestionPacket = {
  schema_version: "bos-light-owner-question.v1.4.1";
  question_id: string;
  raised_by: DivisionId;
  routed_through: "Div1.HCO";
  question: string;
  context: string;
  urgency: "blocking" | "informational";
  suggested_responses?: string[];
  created_at: string;
  artifact_ref: ArtifactRef;
};
```

**Validation notes:**
- Must be routed through Div1.HCO. Direct question to human from Div2/Div4/Div5/Div6 is prohibited.
- Div7 frames the question; human answers Div7 only.

---

## P03 — ApprovalRequestPacket

**Owner:** Div7.MissionControl (for human gates) / Div3.Treasury (for budget gates)  
**Producer:** Div1.HCO or Div3.Treasury  
**Consumer:** Human Owner (via Div7) or Div3.Treasury  
**Allowed next step:** Human approves/denies; Div7 reports decision to Div1  
**Trust level:** `approved-internal-use` after approval

```ts
type ApprovalRequestPacket = {
  schema_version: "bos-light-approval-request.v1.4.1";
  request_id: string;
  requested_by: DivisionId;
  routed_by: "Div1.HCO";
  gate_type: "budget" | "access" | "external-io" | "production-deploy" | "merge-to-main" | "policy-exception";
  scope: string;
  rationale: string;
  budget_limit?: number;
  secret_scope?: string;
  expiration?: string;
  evidence_refs: ArtifactRef[];
  created_at: string;
  artifact_ref: ArtifactRef;
};
```

**Validation notes:**
- `production-deploy` and `merge-to-main` always require human approval.
- `budget` and `access` may be autonomous within policy if Div3 grants.

---

## P04 — ExecutiveStatusPacket

**Owner:** Div7.MissionControl  
**Producer:** Div1.HCO  
**Consumer:** Div7.MissionControl  
**Allowed next step:** Div7 produces FinalExecutiveReport  
**Trust level:** `approved-internal-use`

```ts
type ExecutiveStatusPacket = {
  schema_version: "bos-light-executive-status.v1.4.1";
  status_id: string;
  compiled_by: "Div1.HCO";
  mission_id: string;
  overall_status: "green" | "amber" | "red" | "blocked";
  division_statuses: Array<{
    division: DivisionId;
    status: "complete" | "in-progress" | "blocked" | "not-started";
    artifact_refs: ArtifactRef[];
  }>;
  blockers?: string[];
  escalations?: string[];
  next_actions: string[];
  created_at: string;
  artifact_ref: ArtifactRef;
};
```

---

## P05 — RoutingDecisionPacket

**Owner:** Div1.HCO  
**Producer:** Div1.HCO  
**Consumer:** Target division(s)  
**Allowed next step:** Target division begins work  
**Trust level:** `approved-internal-use`

```ts
type RoutingDecisionPacket = {
  schema_version: "bos-light-routing-decision.v1.4.1";
  decision_id: string;
  routed_by: "Div1.HCO";
  mission_id: string;
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
  target_division: DivisionId;
  summary: string;
  inputs: ArtifactRef[];
  required_grants?: ArtifactRef[];
  required_quarantine?: boolean;
  forbidden_routes: DivisionId[];
  created_at: string;
  artifact_ref: ArtifactRef;
};
```

**Validation notes:**
- `external-io` must route through Div5 → Div3 → Div6 → Div5.
- `budget-access` must include Div3.Treasury.
- `strategic-escalation` must include Div7.MissionControl.

---

## P06 — AccessGrantPacket

**Owner:** Div3.Treasury  
**Producer:** Div3.Treasury  
**Consumer:** Div1.HCO (for dispatch), target division (runtime use)  
**Allowed next step:** Div1 dispatches work using grant  
**Trust level:** `approved-internal-use`

```ts
type AccessGrantPacket = {
  schema_version: "bos-light-access-grant.v1.4.1";
  grant_id: string;
  granted_by: "Div3.Treasury";
  requester: DivisionId;
  tool_class: string;
  purpose: string;
  scope: string;
  allowed_inputs: string[];
  forbidden_inputs: string[];
  expires_at?: string;
  evidence_ref: ArtifactRef;
  revocation_condition: string;
  plaintext_secret_exposed: false;
  created_at: string;
  artifact_ref: ArtifactRef;
};
```

**Validation notes:**
- `plaintext_secret_exposed` must always be `false`. If true, grant is invalid.
- Secret references are by name only (e.g., `GITHUB_TOKEN_AIPAY`). Values never appear.

---

## P07 — ExternalIORequest

**Owner:** Div1.HCO  
**Producer:** Div1.HCO (after Div5 local miss check)  
**Consumer:** Div6.External  
**Allowed next step:** Div6 performs external IO  
**Trust level:** `raw-untrusted` until Div5 quarantine

```ts
type ExternalIORequest = {
  schema_version: "bos-light-external-io-request.v1.4.1";
  request_id: string;
  routed_by: "Div1.HCO";
  requested_for: DivisionId;
  local_knowledge_checked_by: "Div5.QualificationsLibraryLearning";
  local_miss_summary: string;
  external_target_type: "web" | "customer" | "vendor" | "api" | "external-document" | "external-agent" | "git";
  question_or_task: string;
  allowed_sources?: string[];
  disallowed_sources?: string[];
  paid_or_credentialed: boolean;
  div3_grant_ref?: ArtifactRef;
  quarantine_criteria: string[];
  output_destination: "Div5.QualificationsLibraryLearning";
  created_at: string;
  artifact_ref: ArtifactRef;
};
```

**Validation notes:**
- `output_destination` must be Div5. Any other value is invalid.
- `git` is added as `external_target_type` for M006.
- If `paid_or_credentialed` is true, `div3_grant_ref` is required.

---

## P08 — ExternalEvidencePacket

**Owner:** Div6.External  
**Producer:** Div6.External  
**Consumer:** Div5.QualificationsLibraryLearning ONLY  
**Allowed next step:** Div5 quarantine  
**Trust level:** `raw-untrusted`

```ts
type ExternalEvidencePacket = {
  schema_version: "bos-light-external-evidence.v1.4.1";
  bundle_id: string;
  collected_by: "Div6.External";
  request_ref: string;
  sources: Array<{
    uri_or_contact: string;
    accessed_at: string;
    collection_method: "web" | "api" | "customer" | "vendor" | "document" | "agent" | "git-cli";
    risk_flags: string[];
  }>;
  raw_evidence_refs: ArtifactRef[];
  trust_level: "raw-untrusted";
  delivered_to: "Div5.QualificationsLibraryLearning";
  created_at: string;
  artifact_ref: ArtifactRef;
};
```

**Validation notes:**
- Div6 must reject requests that bypass Div5.
- Raw evidence must not route directly to Div2, Div4, or Div7.

---

## P09 — QuarantineVerdict

**Owner:** Div5.QualificationsLibraryLearning  
**Producer:** Div5.QualificationsLibraryLearning  
**Consumer:** Div1.HCO (for routing to internal consumers)  
**Allowed next step:** Div1 routes sanitized packet or rejection  
**Trust level:** `quarantined` | `sanitized` | `approved-internal-use`

```ts
type QuarantineVerdict = {
  schema_version: "bos-light-quarantine-verdict.v1.4.1";
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
  created_at: string;
  artifact_ref: ArtifactRef;
};
```

**Validation notes:**
- `credential-leak` check must scan for secrets, tokens, private keys.
- `approved_consumers` must not include divisions prohibited by trust level.

---

## P10 — ProductionTaskPacket

**Owner:** Div4.Production  
**Producer:** Div1.HCO (dispatch)  
**Consumer:** Div4.Production  
**Allowed next step:** Div4 produces output artifact  
**Trust level:** `approved-internal-use`

```ts
type ProductionTaskPacket = {
  schema_version: "bos-light-production-task.v1.4.1";
  task_id: string;
  dispatched_by: "Div1.HCO";
  mission_id: string;
  work_type: "implementation" | "build" | "test" | "smoke-test" | "uat-check";
  inputs: ArtifactRef[];
  sanitized_knowledge_refs: ArtifactRef[];
  tool_grants: ArtifactRef[];
  acceptance_criteria: string[];
  forbidden_actions: string[];
  target_branch?: string;
  created_at: string;
  artifact_ref: ArtifactRef;
};
```

**Validation notes:**
- `forbidden_actions` must include: direct external IO, main branch push, production deploy.
- `sanitized_knowledge_refs` must be from Div5 quarantine.

---

## P11 — EvalGateVerdict

**Owner:** Div5.QualificationsLibraryLearning  
**Producer:** Div5.QualificationsLibraryLearning  
**Consumer:** Div1.HCO (for closure/dispatch)  
**Allowed next step:** Div1 routes to Div7 (pass) or Div4 (fail, correction)  
**Trust level:** `approved-internal-use`

```ts
type EvalGateVerdict = {
  schema_version: "bos-light-eval-gate-verdict.v1.4.1";
  verdict_id: string;
  gate_id: "Q1" | "Q2" | "Q3" | "Q4" | "Q5" | "Q6" | "Q7" | "Q8" | "MV01" | "MV02" | "MV03" | "MV04";
  evaluated_by: "Div5.QualificationsLibraryLearning";
  mission_id: string;
  verdict: "pass" | "flag" | "fail" | "omitted";
  rationale: string;
  evidence_refs: ArtifactRef[];
  findings?: string;
  created_at: string;
  artifact_ref: ArtifactRef;
};
```

**Validation notes:**
- `fail` verdict triggers circuit breaker or correction route.
- `flag` verdict allows continuation with monitoring.

---

## P12 — CircuitBreakerIncident

**Owner:** Div1.HCO  
**Producer:** Div1.HCO (after Div5/Div4/runtime signal)  
**Consumer:** Div7.MissionControl (escalation), affected divisions  
**Allowed next step:** Div7 decides; or Div1 retries with new hypothesis  
**Trust level:** `approved-internal-use`

```ts
type CircuitBreakerIncident = {
  schema_version: "bos-light-circuit-breaker-incident.v1.4.1";
  incident_id: string;
  opened_by_signal: "Div5.QualificationsLibraryLearning" | "Div4.Production" | "runtime";
  controlled_by: "Div1.HCO";
  affected_work_ref: ArtifactRef;
  state: "closed" | "open" | "half-open";
  failure_count: number;
  max_attempts: number;
  allowed_next_action: "retry" | "reroute" | "pause" | "escalate-to-div7" | "request-human";
  evidence_refs: ArtifactRef[];
  correction_route: DivisionId[];
  created_at: string;
  artifact_ref: ArtifactRef;
};
```

**Validation notes:**
- `allowed_next_action` must be exactly one value.
- Retrying without changed hypothesis is prohibited.

---

## P13 — FinalExecutiveReport

**Owner:** Div7.MissionControl  
**Producer:** Div7.MissionControl  
**Consumer:** Human Owner  
**Allowed next step:** Human Owner accepts, rejects, or reissues mission  
**Trust level:** `approved-internal-use`

```ts
type FinalExecutiveReport = {
  schema_version: "bos-light-executive-report.v1.4.1";
  report_id: string;
  issued_by: "Div7.MissionControl";
  mission_id: string;
  mission_directive_ref: ArtifactRef;
  overall_verdict: "success" | "partial" | "failure" | "blocked";
  summary: string;
  division_contributions: Array<{
    division: DivisionId;
    contribution: string;
    artifact_refs: ArtifactRef[];
  }>;
  blockers_encountered?: string[];
  lessons_learned?: string[];
  recommendations?: string[];
  created_at: string;
  artifact_ref: ArtifactRef;
};
```

**Validation notes:**
- This is the ONLY packet that reaches the Human Owner directly.
- All other division-to-owner communication must route through Div7.

---

## Packet flow diagram

```
P01 MissionDirective
    ↓
P05 RoutingDecisionPacket (multiple)
    ↓
P06 AccessGrantPacket (if budget/access needed)
    ↓
P07 ExternalIORequest (if external data needed)
    ↓
P08 ExternalEvidencePacket → P09 QuarantineVerdict
    ↓
P10 ProductionTaskPacket
    ↓
P11 EvalGateVerdict
    ↓
P12 CircuitBreakerIncident (if failures)
    ↓
P04 ExecutiveStatusPacket
    ↓
P13 FinalExecutiveReport
    ↓
P02 OwnerQuestionPacket (if clarification needed, loops back)
P03 ApprovalRequestPacket (if gate blocks, loops back)
```

---

*Contracts produced: 2026-06-01*  
*Canonical base: docs/BOS_Light_v1_4_1_Data_Contracts.md*  
*Status: planning complete*
