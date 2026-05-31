import { decide } from "./decision";
import { persistDecisionArtifact, type PersistDecisionArtifactOptions } from "./decisionArtifact";
import type { CircuitBreakerEvidenceEnvelope } from "./circuitBreakerFlow";
import type {
  CircuitBreakerRecord,
  DecisionMetadata,
  DecisionResult,
  EvalGateResult,
  MajorFlowBatchApprovalDecisionInput,
  MajorFlowBudgetExceptionDecisionInput,
  MajorFlowCircuitBreakerOpenDecisionInput,
  MajorFlowDecisionInput as ContractMajorFlowDecisionInput,
  MajorFlowEvalGateFailureDecisionInput,
  MajorFlowPolicyExceptionDecisionInput,
  MajorFlowStrategicChoiceDecisionInput
} from "./contracts";
import type { EvalGateEvidenceEnvelope } from "./evalGateEvidence";

export type MajorFlowDecisionArtifactOptions = PersistDecisionArtifactOptions;

export type MajorFlowDecisionArtifactInput =
  | ContractMajorFlowDecisionInput
  | {
    kind: "eval_gate_failure";
    evidence: EvalGateEvidenceEnvelope;
    guidance?: string | null;
    confidence?: number;
  }
  | {
    kind: "circuit_breaker_open";
    evidence: CircuitBreakerEvidenceEnvelope;
    guidance?: string | null;
    confidence?: number;
  };

const DEFAULT_BATCH_CONFIDENCE = 0.92;
const DEFAULT_EVAL_GATE_CONFIDENCE = 0.76;
const DEFAULT_CIRCUIT_BREAKER_CONFIDENCE = 0.9;
const DEFAULT_EXCEPTION_CONFIDENCE = 0.72;
const DEFAULT_STRATEGIC_CHOICE_CONFIDENCE = 0.7;
const MAX_CONTEXT_VALUE_LENGTH = 240;
const MAX_VALIDATION_ERROR_LENGTH = 180;
const MAX_PUBLIC_ISSUE_ID_LENGTH = 80;
const PUBLIC_ISSUE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,79}$/;
const SENSITIVE_IDENTIFIER_PATTERN = /\b(?:bearer|authorization|cookie|password|secret|access[_-]?token|refresh[_-]?token|session[_-]?token|api[_-]?key|apikey|token)\b/i;
const JWT_PATTERN = /\b[A-Za-z0-9_-]{24,}\.[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{20,}\b/;
const STRIPE_LIKE_KEY_PATTERN = /\b(?:sk|pk)_(?:live|test)_[A-Za-z0-9]{12,}\b/;
const EVAL_GATE_IDS = new Set(["LARS.Deterministic", "LARS.SecurityPolicy", "LARS.ArtifactIntegrity", "LARS.Budget"]);
const EVAL_GATE_STATUSES = new Set(["PASSED", "FAILED", "NOT_RUN"]);
const EVAL_GATE_OVERALLS = new Set(["PASSED", "PASSED_WITH_WARNINGS", "FAILED_BLOCKING", "INCOMPLETE"]);
const CIRCUIT_STATES = new Set(["CLOSED", "HALF_OPEN", "OPEN"]);

function escapeMarkdownAndHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/([`*[\]()#!])/g, "\\$1")
    .replace(/[\u0000-\u001F\u007F-\u009F]/g, " ");
}

function compactText(value: unknown, maxLength = MAX_CONTEXT_VALUE_LENGTH): string {
  return escapeMarkdownAndHtml(redactSensitiveText(value))
    .replace(/\|/g, "\\|")
    .slice(0, maxLength) || "none";
}

function normalizeOneLine(value: unknown): string {
  const raw = value instanceof Error && value.message ? value.message : String(value ?? "");
  return raw
    .replace(/[\r\n\t]+/g, " ")
    .replace(/[\u0000-\u001F\u007F-\u009F]/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function redactSensitiveText(value: unknown): string {
  return normalizeOneLine(value)
    .replace(/\bBearer\s+[A-Za-z0-9._~+\/-]+=*/gi, "Bearer [REDACTED]")
    .replace(/\b(access[_-]?token|refresh[_-]?token|session[_-]?token|api[_\s-]?key|token|secret|authorization|cookie|password)\s*[:=]\s*("[^"]+"|'[^']+'|[^\s,;]+)/gi, "$1=[REDACTED]")
    .replace(/\b(access[_-]?token|refresh[_-]?token|session[_-]?token|token|secret|password|authorization|cookie)\s+(?:is\s+)?[A-Za-z0-9._~+\/-]{8,}\b/gi, "$1 [REDACTED]")
    .replace(/\b(sk|pk)_(live|test)_[A-Za-z0-9]{12,}\b/g, "[REDACTED]")
    .replace(/\b(?:ghp|github_pat|xox[baprs])_[A-Za-z0-9_=-]{12,}\b/gi, "[REDACTED]")
    .replace(/\b[A-Za-z0-9_-]{24,}\.[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{20,}\b/g, "[REDACTED]")
    .replace(/\s+at\s+[A-Za-z0-9_$.[\]<>]+[^\s]*(?:\s+\([^)]*\))?/g, " [STACK_REDACTED]");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function hasSensitiveIdentifierMaterial(value: string): boolean {
  const identifierParts = value.toLowerCase().split(/[_.:-]+/).filter(Boolean);
  const sensitiveParts = new Set([
    "bearer",
    "authorization",
    "cookie",
    "password",
    "secret",
    "token",
    "accesstoken",
    "access-token",
    "access_token",
    "refreshtoken",
    "refresh-token",
    "refresh_token",
    "sessiontoken",
    "session-token",
    "session_token",
    "apikey",
    "api-key",
    "api_key"
  ]);
  return identifierParts.some((part) => sensitiveParts.has(part))
    || SENSITIVE_IDENTIFIER_PATTERN.test(value)
    || JWT_PATTERN.test(value)
    || STRIPE_LIKE_KEY_PATTERN.test(value)
    || redactSensitiveText(value) !== normalizeOneLine(value);
}

function peekPublicIssueId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = normalizeOneLine(value);
  if (!normalized || normalized.length > MAX_PUBLIC_ISSUE_ID_LENGTH) return null;
  if (!PUBLIC_ISSUE_ID_PATTERN.test(normalized)) return null;
  if (hasSensitiveIdentifierMaterial(normalized)) return null;
  return normalized;
}

function normalizePublicIssueId(value: unknown, path: string, errors: string[]): string | null {
  if (typeof value !== "string") {
    errors.push(`${path} must be a string public issue id`);
    return null;
  }

  const normalized = normalizeOneLine(value);
  if (!normalized) {
    errors.push(`${path} is required`);
    return null;
  }

  if (normalized.length > MAX_PUBLIC_ISSUE_ID_LENGTH) {
    errors.push(`${path} must be at most ${MAX_PUBLIC_ISSUE_ID_LENGTH} characters`);
    return null;
  }

  if (!PUBLIC_ISSUE_ID_PATTERN.test(normalized)) {
    errors.push(`${path} must contain only public issue id characters`);
    return null;
  }

  if (hasSensitiveIdentifierMaterial(normalized)) {
    errors.push(`${path} must not contain auth, token, cookie, api key, or secret material`);
    return null;
  }

  return normalized;
}

function requiredDisplayText(value: unknown, path: string, errors: string[]): string {
  if (typeof value !== "string") {
    errors.push(`${path} must be a string`);
    return "";
  }

  const sanitized = redactSensitiveText(value).slice(0, MAX_CONTEXT_VALUE_LENGTH);
  if (!sanitized) {
    errors.push(`${path} is required`);
    return "";
  }

  return sanitized;
}

function optionalDisplayText(value: unknown, path: string, errors: string[]): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== "string") {
    errors.push(`${path} must be a string when provided`);
    return null;
  }
  return redactSensitiveText(value).slice(0, MAX_CONTEXT_VALUE_LENGTH) || "none";
}

function optionalConfidence(value: unknown, errors: string[]): number | undefined {
  if (value === undefined) return undefined;
  if (!isFiniteNumber(value)) {
    errors.push("confidence must be a finite number when provided");
    return undefined;
  }
  return value;
}

function optionalNonNegativeNumber(value: unknown, path: string, errors: string[], fallback = 0): number {
  if (!isFiniteNumber(value) || value < 0) {
    errors.push(`${path} must be a non-negative finite number`);
    return fallback;
  }
  return value;
}

function validationFailure(errors: string[], issueId: string | null, now?: string): DecisionResult {
  return {
    schema_version: "1.0",
    accepted: false,
    error: "invalid_decision_input",
    issue_id: issueId,
    decided_by: "Div7.MissionControl",
    decided_at: typeof now === "string" ? now : new Date().toISOString(),
    diagnostics: {
      validation_errors: errors.map((error) => compactText(error, MAX_VALIDATION_ERROR_LENGTH)).slice(0, 8),
      sanitized: true
    }
  };
}

function firstSelectedIssueId(input: MajorFlowBatchApprovalDecisionInput): string {
  return input.selected_issue_ids.map((issueId) => issueId.trim()).find(Boolean) ?? "";
}

function batchSignals(input: MajorFlowBatchApprovalDecisionInput): string[] {
  return [
    "routine batch approve approval known playbook",
    `batch approval cycle ${input.cycle_id}`,
    `selected issues ${input.selected_issue_ids.join(" ")}`,
    input.reason,
    input.bpi_ref ? `BPI reference ${input.bpi_ref}` : "BPI reference not provided",
    input.approval_request_ref ? `approval request reference ${input.approval_request_ref}` : "approval request reference not provided"
  ];
}

function normalizeEvalGateResult(value: unknown, errors: string[], path: string): EvalGateResult | null {
  if (!isRecord(value)) {
    errors.push(`${path} must be an EvalGateResult object`);
    return null;
  }

  const issueId = normalizePublicIssueId(value.issue_id, `${path}.issue_id`, errors);
  const runId = optionalDisplayText(value.run_id, `${path}.run_id`, errors) ?? null;
  const gates: EvalGateResult["gates"] = [];

  if (!Array.isArray(value.gates) || value.gates.length === 0) {
    errors.push(`${path}.gates must contain at least one gate`);
  } else {
    value.gates.forEach((gate, index) => {
      if (!isRecord(gate)) {
        errors.push(`${path}.gates[${index}] must be an object`);
        return;
      }
      if (typeof gate.gate_id !== "string" || !EVAL_GATE_IDS.has(gate.gate_id)) {
        errors.push(`${path}.gates[${index}].gate_id is invalid`);
      }
      if (typeof gate.status !== "string" || !EVAL_GATE_STATUSES.has(gate.status)) {
        errors.push(`${path}.gates[${index}].status is invalid`);
      }
      if (typeof gate.is_blocking !== "boolean") {
        errors.push(`${path}.gates[${index}].is_blocking must be boolean`);
      }
      if (typeof gate.gate_id === "string" && EVAL_GATE_IDS.has(gate.gate_id)
        && typeof gate.status === "string" && EVAL_GATE_STATUSES.has(gate.status)
        && typeof gate.is_blocking === "boolean") {
        gates.push({
          gate_id: gate.gate_id as EvalGateResult["gates"][number]["gate_id"],
          status: gate.status as EvalGateResult["gates"][number]["status"],
          evidence: null,
          is_blocking: gate.is_blocking
        });
      }
    });
  }

  if (typeof value.overall !== "string" || !EVAL_GATE_OVERALLS.has(value.overall)) {
    errors.push(`${path}.overall is invalid`);
  }

  const blockingFailureCount = optionalNonNegativeNumber(value.blocking_failure_count, `${path}.blocking_failure_count`, errors);
  const warningCount = optionalNonNegativeNumber(value.warning_count, `${path}.warning_count`, errors);
  const notRunCount = optionalNonNegativeNumber(value.not_run_count, `${path}.not_run_count`, errors);
  const evaluatedAt = typeof value.evaluated_at === "string" && normalizeOneLine(value.evaluated_at) ? compactText(value.evaluated_at) : "";
  if (!evaluatedAt) errors.push(`${path}.evaluated_at is required`);
  if (value.evaluated_by !== "Div5.QualificationsLibraryLearning") {
    errors.push(`${path}.evaluated_by must be Div5.QualificationsLibraryLearning`);
  }

  if (!issueId || errors.some((error) => error.startsWith(`${path}.`))) return null;

  return {
    schema_version: "1.0",
    issue_id: issueId,
    run_id: runId,
    gates,
    overall: value.overall as EvalGateResult["overall"],
    blocking_failure_count: blockingFailureCount,
    warning_count: warningCount,
    not_run_count: notRunCount,
    evaluated_at: evaluatedAt,
    evaluated_by: "Div5.QualificationsLibraryLearning"
  };
}

function normalizeEvalGateInput(input: MajorFlowDecisionArtifactInput): MajorFlowEvalGateFailureDecisionInput {
  if (input.kind !== "eval_gate_failure") {
    throw new Error("expected eval_gate_failure input");
  }

  if ("evidence" in input) {
    return {
      kind: "eval_gate_failure",
      result: input.evidence.result,
      guidance: input.guidance ?? input.evidence.guidance,
      confidence: input.confidence
    };
  }

  return input;
}

function normalizeCircuitRecord(value: unknown, issueId: string, errors: string[], path: string): CircuitBreakerRecord | null {
  if (!isRecord(value)) {
    errors.push(`${path} must be an OPEN CircuitBreakerRecord object`);
    return null;
  }

  const recordIssueId = normalizePublicIssueId(value.issue_id, `${path}.issue_id`, errors);
  if (recordIssueId && recordIssueId !== issueId) {
    errors.push(`${path}.issue_id must match circuit issue_id`);
  }
  if (typeof value.state !== "string" || !CIRCUIT_STATES.has(value.state)) {
    errors.push(`${path}.state is invalid`);
  } else if (value.state !== "OPEN") {
    errors.push(`${path}.state must be OPEN for circuit_breaker_open decisions`);
  }

  const attemptCount = optionalNonNegativeNumber(value.attempt_count, `${path}.attempt_count`, errors, 1);
  const maxAttempts = optionalNonNegativeNumber(value.max_attempts, `${path}.max_attempts`, errors, 1);
  const halfOpenThreshold = optionalNonNegativeNumber(value.half_open_threshold, `${path}.half_open_threshold`, errors, 1);
  const lastFailureAt = optionalDisplayText(value.last_failure_at, `${path}.last_failure_at`, errors) ?? null;
  const lastFailureReason = optionalDisplayText(value.last_failure_reason, `${path}.last_failure_reason`, errors) ?? null;
  const openedAt = optionalDisplayText(value.opened_at, `${path}.opened_at`, errors) ?? null;
  const escalationIssueId = value.escalation_issue_id === null || value.escalation_issue_id === undefined
    ? null
    : normalizePublicIssueId(value.escalation_issue_id, `${path}.escalation_issue_id`, errors);
  const updatedAt = typeof value.updated_at === "string" && normalizeOneLine(value.updated_at) ? compactText(value.updated_at) : "";
  if (!updatedAt) errors.push(`${path}.updated_at is required`);

  if (!recordIssueId || errors.some((error) => error.startsWith(`${path}.`))) return null;

  return {
    schema_version: "1.0",
    issue_id: recordIssueId,
    state: value.state as CircuitBreakerRecord["state"],
    attempt_count: attemptCount,
    max_attempts: maxAttempts,
    half_open_threshold: halfOpenThreshold,
    last_failure_at: lastFailureAt,
    last_failure_reason: lastFailureReason,
    opened_at: openedAt,
    escalation_issue_id: escalationIssueId,
    updated_at: updatedAt
  };
}

function normalizeCircuitBreakerInput(input: MajorFlowDecisionArtifactInput, now?: string): MajorFlowCircuitBreakerOpenDecisionInput {
  if (input.kind !== "circuit_breaker_open") {
    throw new Error("expected circuit_breaker_open input");
  }

  if ("evidence" in input) {
    const evidence = input.evidence;
    return {
      kind: "circuit_breaker_open",
      issue_id: evidence.issue_id,
      run_id: evidence.run_id,
      record: evidence.record,
      transition_reason: evidence.transition_reason,
      failure_reason: evidence.failure_reason,
      evidence_artifact_ref: evidence.artifact_ref,
      escalation_ref: evidence.escalation_ref,
      operational_owner: "Div1.HCO",
      confidence: input.confidence
    };
  }

  return {
    ...input,
    record: input.record,
    operational_owner: input.operational_owner ?? "Div1.HCO"
  };
}

type NormalizeResult =
  | { ok: true; input: MajorFlowDecisionArtifactInput }
  | { ok: false; decision: DecisionResult };

function normalizeMajorFlowInput(input: unknown, now?: string): NormalizeResult {
  const errors: string[] = [];

  if (!isRecord(input)) {
    return { ok: false, decision: validationFailure(["input must be an object"], null, now) };
  }

  if (typeof input.kind !== "string") {
    return { ok: false, decision: validationFailure(["kind is required"], null, now) };
  }

  switch (input.kind) {
    case "batch_approval": {
      const cycleId = requiredDisplayText(input.cycle_id, "cycle_id", errors);
      const selectedIssueIds: string[] = [];
      if (!Array.isArray(input.selected_issue_ids) || input.selected_issue_ids.length === 0) {
        errors.push("selected_issue_ids must contain at least one issue id");
      } else {
        input.selected_issue_ids.forEach((issueId, index) => {
          const normalized = normalizePublicIssueId(issueId, `selected_issue_ids[${index}]`, errors);
          if (normalized) selectedIssueIds.push(normalized);
        });
      }
      const reason = requiredDisplayText(input.reason, "reason", errors);
      const bpiRef = optionalDisplayText(input.bpi_ref, "bpi_ref", errors);
      const approvalRequestRef = optionalDisplayText(input.approval_request_ref, "approval_request_ref", errors);
      const confidence = optionalConfidence(input.confidence, errors);
      const issueId = selectedIssueIds[0] ?? null;

      if (errors.length > 0) return { ok: false, decision: validationFailure(errors, issueId, now) };
      return {
        ok: true,
        input: {
          kind: "batch_approval",
          cycle_id: cycleId,
          selected_issue_ids: selectedIssueIds,
          reason,
          bpi_ref: bpiRef,
          approval_request_ref: approvalRequestRef,
          confidence
        }
      };
    }

    case "eval_gate_failure": {
      const evidence = input.evidence;
      const evidenceRecord = isRecord(evidence) ? evidence : null;
      const resultSource = evidenceRecord ? evidenceRecord.result : input.result;
      const result = normalizeEvalGateResult(resultSource, errors, evidenceRecord ? "evidence.result" : "result");
      const guidanceSource = input.guidance !== undefined ? input.guidance : evidenceRecord?.guidance;
      const guidance = optionalDisplayText(guidanceSource, "guidance", errors);
      const confidence = optionalConfidence(input.confidence, errors);
      const issueId = result?.issue_id ?? (isRecord(resultSource) ? peekPublicIssueId(resultSource.issue_id) : null);

      if (errors.length > 0 || !result) return { ok: false, decision: validationFailure(errors, issueId, now) };
      return {
        ok: true,
        input: {
          kind: "eval_gate_failure",
          result,
          guidance,
          confidence
        }
      };
    }

    case "circuit_breaker_open": {
      const evidence = input.evidence;
      const evidenceRecord = isRecord(evidence) ? evidence : null;
      const source = evidenceRecord ?? input;
      const issueId = normalizePublicIssueId(source.issue_id, evidenceRecord ? "evidence.issue_id" : "issue_id", errors);
      const record = issueId
        ? normalizeCircuitRecord(source.record, issueId, errors, evidenceRecord ? "evidence.record" : "record")
        : null;
      const runId = optionalDisplayText(source.run_id, evidenceRecord ? "evidence.run_id" : "run_id", errors) ?? null;
      const transitionReason = optionalDisplayText(source.transition_reason, evidenceRecord ? "evidence.transition_reason" : "transition_reason", errors) ?? null;
      const failureReason = optionalDisplayText(source.failure_reason, evidenceRecord ? "evidence.failure_reason" : "failure_reason", errors) ?? null;
      const evidenceArtifactRef = optionalDisplayText(source.artifact_ref ?? source.evidence_artifact_ref, evidenceRecord ? "evidence.artifact_ref" : "evidence_artifact_ref", errors) ?? null;
      const escalationRef = optionalDisplayText(source.escalation_ref, evidenceRecord ? "evidence.escalation_ref" : "escalation_ref", errors) ?? null;
      const confidence = optionalConfidence(input.confidence, errors);
      if (input.operational_owner !== undefined && input.operational_owner !== "Div1.HCO") {
        errors.push("operational_owner must be Div1.HCO when provided");
      }

      if (errors.length > 0 || !issueId || !record) return { ok: false, decision: validationFailure(errors, issueId, now) };
      return {
        ok: true,
        input: {
          kind: "circuit_breaker_open",
          issue_id: issueId,
          run_id: runId,
          record,
          transition_reason: transitionReason,
          failure_reason: failureReason,
          evidence_artifact_ref: evidenceArtifactRef,
          escalation_ref: escalationRef,
          operational_owner: "Div1.HCO",
          confidence
        }
      };
    }

    case "policy_exception": {
      const issueId = normalizePublicIssueId(input.issue_id, "issue_id", errors);
      const policyOwner = requiredDisplayText(input.policy_owner, "policy_owner", errors);
      const exception = requiredDisplayText(input.exception, "exception", errors);
      const policyRef = optionalDisplayText(input.policy_ref, "policy_ref", errors);
      const constraintContext = optionalDisplayText(input.constraint_context, "constraint_context", errors);
      const reversibleNextStep = requiredDisplayText(input.reversible_next_step, "reversible_next_step", errors);
      const diagnostics = optionalDisplayText(input.diagnostics, "diagnostics", errors);
      const confidence = optionalConfidence(input.confidence, errors);

      if (errors.length > 0 || !issueId) return { ok: false, decision: validationFailure(errors, issueId, now) };
      return {
        ok: true,
        input: {
          kind: "policy_exception",
          issue_id: issueId,
          policy_owner: policyOwner,
          exception,
          policy_ref: policyRef,
          constraint_context: constraintContext,
          reversible_next_step: reversibleNextStep,
          diagnostics,
          confidence
        }
      };
    }

    case "budget_exception": {
      const issueId = normalizePublicIssueId(input.issue_id, "issue_id", errors);
      const budgetOwner = optionalDisplayText(input.budget_owner, "budget_owner", errors);
      const budgetConstraint = requiredDisplayText(input.budget_constraint, "budget_constraint", errors);
      const requestedException = requiredDisplayText(input.requested_exception, "requested_exception", errors);
      const budgetRef = optionalDisplayText(input.budget_ref, "budget_ref", errors);
      const reversibleNextStep = requiredDisplayText(input.reversible_next_step, "reversible_next_step", errors);
      const diagnostics = optionalDisplayText(input.diagnostics, "diagnostics", errors);
      const confidence = optionalConfidence(input.confidence, errors);

      if (errors.length > 0 || !issueId) return { ok: false, decision: validationFailure(errors, issueId, now) };
      return {
        ok: true,
        input: {
          kind: "budget_exception",
          issue_id: issueId,
          budget_owner: budgetOwner,
          budget_constraint: budgetConstraint,
          requested_exception: requestedException,
          budget_ref: budgetRef,
          reversible_next_step: reversibleNextStep,
          diagnostics,
          confidence
        }
      };
    }

    case "strategic_choice": {
      const issueId = normalizePublicIssueId(input.issue_id, "issue_id", errors);
      const strategicQuestion = requiredDisplayText(input.strategic_question, "strategic_question", errors);
      const choice = requiredDisplayText(input.choice, "choice", errors);
      const hypothesis = requiredDisplayText(input.hypothesis, "hypothesis", errors);
      const safeToFailProbe = requiredDisplayText(input.safe_to_fail_probe, "safe_to_fail_probe", errors);
      const rollback = requiredDisplayText(input.rollback, "rollback", errors);
      const owner = optionalDisplayText(input.owner, "owner", errors);
      const diagnostics = optionalDisplayText(input.diagnostics, "diagnostics", errors);
      const confidence = optionalConfidence(input.confidence, errors);

      if (errors.length > 0 || !issueId) return { ok: false, decision: validationFailure(errors, issueId, now) };
      return {
        ok: true,
        input: {
          kind: "strategic_choice",
          issue_id: issueId,
          strategic_question: strategicQuestion,
          choice,
          hypothesis,
          safe_to_fail_probe: safeToFailProbe,
          rollback,
          owner,
          diagnostics,
          confidence
        }
      };
    }

    default:
      return { ok: false, decision: validationFailure(["kind is not a supported major-flow decision variant"], null, now) };
  }
}

function failedOrIncompleteGates(result: EvalGateResult): EvalGateResult["gates"] {
  return result.gates.filter((gate) => gate.status === "FAILED" || gate.status === "NOT_RUN");
}

function evalGateSignals(input: MajorFlowEvalGateFailureDecisionInput): string[] {
  const failedGateIds = failedOrIncompleteGates(input.result).map((gate) => gate.gate_id);
  const blockingGateIds = input.result.gates
    .filter((gate) => gate.is_blocking && gate.status === "FAILED")
    .map((gate) => gate.gate_id);

  return [
    "policy rule review constraint eval gate failure",
    input.result.overall === "INCOMPLETE"
      ? "eval gate incomplete review constraint not run"
      : "blocking eval gate failure policy review constraint",
    `overall ${input.result.overall}`,
    `run ${input.result.run_id ?? "none"}`,
    `failed incomplete gates ${failedGateIds.join(" ") || "none"}`,
    `blocking gates ${blockingGateIds.join(" ") || "none"}`
  ];
}

function evalGateGuidance(input: MajorFlowEvalGateFailureDecisionInput): string {
  if (input.result.overall === "INCOMPLETE") {
    return "Eval Gate incomplete. Keep the run blocked, inspect missing gate inputs, and rerun before acceptance.";
  }

  const blockingGateIds = input.result.gates
    .filter((gate) => gate.is_blocking && gate.status === "FAILED")
    .map((gate) => gate.gate_id);

  if (blockingGateIds.length > 0) {
    return `Blocking Eval Gate failure. Keep the run blocked until ${blockingGateIds.join(", ")} passes.`;
  }

  const sanitizedProvided = input.guidance ? compactText(input.guidance) : "Review Eval Gate status before acceptance.";
  return sanitizedProvided || "Review Eval Gate status before acceptance.";
}

function gateSummaryLines(result: EvalGateResult): string[] {
  return result.gates.map((gate) => (
    `- ${compactText(gate.gate_id)}: ${gate.status} (${gate.is_blocking ? "blocking" : "non-blocking"})`
  ));
}

function circuitBreakerSignals(input: MajorFlowCircuitBreakerOpenDecisionInput): string[] {
  return [
    "circuit breaker incident critical stop self-healing outage emergency",
    "breaker circuit open critical incident stop runaway work before retry self-healing",
    `state ${input.record.state}`,
    `attempts ${input.record.attempt_count} of ${input.record.max_attempts}`,
    `transition ${input.transition_reason ?? "open circuit breaker"}`,
    `failure ${input.failure_reason ?? input.record.last_failure_reason ?? "none"}`,
    "Div1.HCO operational control owns containment while Div7.MissionControl records the decision"
  ];
}

function policyExceptionSignals(input: MajorFlowPolicyExceptionDecisionInput): string[] {
  return [
    "policy rule compliance exception constraint expert review",
    `policy owner ${input.policy_owner}`,
    `exception ${input.exception}`,
    `policy ref ${input.policy_ref ?? "none"}`,
    `constraint ${input.constraint_context ?? "none"}`,
    `reversible next step ${input.reversible_next_step}`,
    input.diagnostics ? "sanitized diagnostics available" : "diagnostics none"
  ];
}

function budgetExceptionSignals(input: MajorFlowBudgetExceptionDecisionInput): string[] {
  return [
    "budget policy exception constraint expert review",
    `budget owner ${input.budget_owner ?? "Div3.Treasury"}`,
    `budget constraint ${input.budget_constraint}`,
    `requested exception ${input.requested_exception}`,
    `budget ref ${input.budget_ref ?? "none"}`,
    `reversible next step ${input.reversible_next_step}`,
    input.diagnostics ? "sanitized diagnostics available" : "diagnostics none"
  ];
}

function strategicChoiceSignals(input: MajorFlowStrategicChoiceDecisionInput): string[] {
  return [
    "strategy hypothesis experiment uncertain emerging ambiguous probe",
    `strategic question ${input.strategic_question}`,
    `choice ${input.choice}`,
    `hypothesis ${input.hypothesis}`,
    `safe to fail probe ${input.safe_to_fail_probe}`,
    `rollback ${input.rollback}`,
    input.diagnostics ? "sanitized diagnostics available" : "diagnostics none"
  ];
}

function appendMajorFlowContext(decision: DecisionResult, section: string): DecisionResult {
  if (!decision.accepted) return decision;

  const accepted: DecisionMetadata = {
    ...decision,
    record_markdown: `${decision.record_markdown}\n\n${section}`
  };
  return accepted;
}

function batchContextMarkdown(input: MajorFlowBatchApprovalDecisionInput): string {
  return [
    "## Major Flow Context",
    "- Flow: BATCH_APPROVAL",
    `- Cycle: ${compactText(input.cycle_id)}`,
    `- Selected issues: ${input.selected_issue_ids.length > 0 ? input.selected_issue_ids.map((issueId) => compactText(issueId)).join(", ") : "none"}`,
    `- Reason: ${compactText(input.reason)}`,
    `- BPI ref: ${compactText(input.bpi_ref ?? "none")}`,
    `- Approval request ref: ${compactText(input.approval_request_ref ?? "none")}`,
    "- Native approval mutated: false"
  ].join("\n");
}

function evalGateContextMarkdown(input: MajorFlowEvalGateFailureDecisionInput): string {
  const result = input.result;
  return [
    "## Major Flow Context",
    "- Flow: EVAL_GATE_FAILURE",
    `- Run: ${compactText(result.run_id ?? "none")}`,
    `- Overall: ${result.overall}`,
    `- Blocking failures: ${result.blocking_failure_count}`,
    `- Warnings: ${result.warning_count}`,
    `- Not run: ${result.not_run_count}`,
    `- Guidance: ${compactText(evalGateGuidance(input))}`,
    "",
    "### Eval Gate Status",
    ...gateSummaryLines(result),
    "",
    "Raw gate evidence is intentionally omitted from this decision artifact."
  ].join("\n");
}

function circuitBreakerContextMarkdown(input: MajorFlowCircuitBreakerOpenDecisionInput): string {
  return [
    "## Major Flow Context",
    "- Flow: CIRCUIT_BREAKER_OPEN",
    `- Run: ${compactText(input.run_id ?? "none")}`,
    `- Circuit issue: ${compactText(input.issue_id)}`,
    `- State: ${input.record.state}`,
    `- Attempts: ${input.record.attempt_count}/${input.record.max_attempts}`,
    `- Transition reason: ${compactText(input.transition_reason ?? "open circuit breaker")}`,
    `- Failure reason: ${compactText(input.failure_reason ?? input.record.last_failure_reason ?? "none")}`,
    `- Opened at: ${compactText(input.record.opened_at ?? "none")}`,
    `- Evidence artifact ref: ${compactText(input.evidence_artifact_ref ?? "none")}`,
    `- Escalation ref: ${compactText(input.escalation_ref ?? "none")}`,
    "- Operational owner: Div1.HCO retains circuit-breaker containment, retry, and recovery ownership.",
    "- Decision owner: Div7.MissionControl records this artifact-only decision.",
    "- Runtime support claim: no polling, subscriptions, activity-log dependence, or new escalation automation is added here.",
    "- Raw circuit evidence markdown is intentionally omitted from this decision artifact.",
    "- Native approval mutated: false"
  ].join("\n");
}

function policyExceptionContextMarkdown(input: MajorFlowPolicyExceptionDecisionInput): string {
  return [
    "## Major Flow Context",
    "- Flow: POLICY_EXCEPTION",
    `- Policy owner: ${compactText(input.policy_owner)}`,
    `- Policy ref: ${compactText(input.policy_ref ?? "none")}`,
    `- Exception: ${compactText(input.exception)}`,
    `- Constraint context: ${compactText(input.constraint_context ?? "none")}`,
    `- Reversible next step: ${compactText(input.reversible_next_step)}`,
    `- Sanitized diagnostics: ${compactText(input.diagnostics ?? "none")}`,
    "- External mutation: none; artifact-only policy exception record.",
    "- Native approval mutated: false"
  ].join("\n");
}

function budgetExceptionContextMarkdown(input: MajorFlowBudgetExceptionDecisionInput): string {
  return [
    "## Major Flow Context",
    "- Flow: BUDGET_EXCEPTION",
    `- Budget owner: ${compactText(input.budget_owner ?? "Div3.Treasury")}`,
    `- Budget ref: ${compactText(input.budget_ref ?? "none")}`,
    `- Budget constraint: ${compactText(input.budget_constraint)}`,
    `- Requested exception: ${compactText(input.requested_exception)}`,
    `- Reversible next step: ${compactText(input.reversible_next_step)}`,
    `- Sanitized diagnostics: ${compactText(input.diagnostics ?? "none")}`,
    "- External mutation: none; artifact-only budget exception record.",
    "- Native approval mutated: false"
  ].join("\n");
}

function strategicChoiceContextMarkdown(input: MajorFlowStrategicChoiceDecisionInput): string {
  return [
    "## Major Flow Context",
    "- Flow: STRATEGIC_CHOICE",
    `- Strategic question: ${compactText(input.strategic_question)}`,
    `- Choice: ${compactText(input.choice)}`,
    `- Hypothesis: ${compactText(input.hypothesis)}`,
    `- Owner: ${compactText(input.owner ?? "Div7.MissionControl")}`,
    `- Safe-to-fail probe: ${compactText(input.safe_to_fail_probe)}`,
    `- Rollback: ${compactText(input.rollback)}`,
    `- Sanitized diagnostics: ${compactText(input.diagnostics ?? "none")}`,
    "- OODA observe: inspect current weak signals and constraints before scaling.",
    "- OODA orient: treat the choice as complex until probe evidence stabilizes.",
    "- OODA decide: run only the bounded safe-to-fail probe.",
    "- OODA act: rollback on failed probe criteria and keep artifacts inspectable.",
    "- Native approval mutated: false"
  ].join("\n");
}

function decisionForMajorFlow(input: MajorFlowDecisionArtifactInput, now?: string): DecisionResult {
  const normalized = normalizeMajorFlowInput(input, now);
  if (!normalized.ok) return normalized.decision;

  const normalizedInput = normalized.input;
  if (normalizedInput.kind === "batch_approval") {
    const decision = decide({
      issue_id: firstSelectedIssueId(normalizedInput),
      signals: batchSignals(normalizedInput),
      confidence: normalizedInput.confidence ?? DEFAULT_BATCH_CONFIDENCE,
      now
    });
    return appendMajorFlowContext(decision, batchContextMarkdown(normalizedInput));
  }

  if (normalizedInput.kind === "eval_gate_failure") {
    const evalInput = normalizeEvalGateInput(normalizedInput);
    const decision = decide({
      issue_id: evalInput.result.issue_id,
      signals: evalGateSignals(evalInput),
      confidence: evalInput.confidence ?? DEFAULT_EVAL_GATE_CONFIDENCE,
      now
    });
    return appendMajorFlowContext(decision, evalGateContextMarkdown(evalInput));
  }

  if (normalizedInput.kind === "circuit_breaker_open") {
    const circuitInput = normalizeCircuitBreakerInput(normalizedInput, now);
    const decision = decide({
      issue_id: circuitInput.issue_id,
      signals: circuitBreakerSignals(circuitInput),
      confidence: circuitInput.confidence ?? DEFAULT_CIRCUIT_BREAKER_CONFIDENCE,
      now
    });
    return appendMajorFlowContext(decision, circuitBreakerContextMarkdown(circuitInput));
  }

  if (normalizedInput.kind === "policy_exception") {
    const decision = decide({
      issue_id: normalizedInput.issue_id,
      signals: policyExceptionSignals(normalizedInput),
      confidence: normalizedInput.confidence ?? DEFAULT_EXCEPTION_CONFIDENCE,
      now
    });
    return appendMajorFlowContext(decision, policyExceptionContextMarkdown(normalizedInput));
  }

  if (normalizedInput.kind === "budget_exception") {
    const decision = decide({
      issue_id: normalizedInput.issue_id,
      signals: budgetExceptionSignals(normalizedInput),
      confidence: normalizedInput.confidence ?? DEFAULT_EXCEPTION_CONFIDENCE,
      now
    });
    return appendMajorFlowContext(decision, budgetExceptionContextMarkdown(normalizedInput));
  }

  const decision = decide({
    issue_id: normalizedInput.issue_id,
    signals: strategicChoiceSignals(normalizedInput),
    confidence: normalizedInput.confidence ?? DEFAULT_STRATEGIC_CHOICE_CONFIDENCE,
    now
  });
  return appendMajorFlowContext(decision, strategicChoiceContextMarkdown(normalizedInput));
}

export async function persistMajorFlowDecisionArtifact(
  input: MajorFlowDecisionArtifactInput,
  options: MajorFlowDecisionArtifactOptions = {}
) {
  const decision = decisionForMajorFlow(input, options.now);
  return persistDecisionArtifact(decision, options);
}
