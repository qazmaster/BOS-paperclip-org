import type { CircuitBreakerRecord } from "./contracts";
import {
  attachEscalationIssue,
  createCircuitBreakerRecord,
  moveToHalfOpen,
  POLLING_CONFIG,
  recordFailure,
  recordSuccess
} from "./circuitBreaker";
import type { BOSPersistence, PaperclipAdapter } from "./paperclipAdapter";

export type CircuitBreakerObservationKind = "failure" | "success" | "half_open";
export type CircuitBreakerEvidenceSurface = "issues.native" | "comments.native" | "cache-overlay" | "markdown-only";
export type CircuitBreakerPersistenceAvailability = "missing" | "provided";
export type CircuitBreakerCacheGetStatus = "loaded" | "missing" | "failed" | "malformed" | "not_attempted";
export type CircuitBreakerCacheSaveStatus = "saved" | "failed" | "not_attempted";
export type CircuitBreakerActivityLogStatus = "logged" | "failed" | "not_attempted";

export interface CircuitBreakerCacheOverlayDiagnostics {
  durability: "cache-overlay-only";
  persistence: CircuitBreakerPersistenceAvailability;
  get: CircuitBreakerCacheGetStatus;
  save: CircuitBreakerCacheSaveStatus;
  get_error: string | null;
  save_error: string | null;
  timestamp: string;
}

export interface CircuitBreakerFallbackDiagnostics {
  reason: string | null;
  validation_error?: string;
  escalation_create_error?: string;
  comment_error?: string;
  activity_error?: string;
}

export interface CircuitBreakerActivityDiagnostics {
  status: CircuitBreakerActivityLogStatus;
  error: string | null;
}

export interface CircuitBreakerPollingConfigPosture {
  poll_scope: typeof POLLING_CONFIG.poll_scope;
  interval_ms: typeof POLLING_CONFIG.interval_ms;
  jitter_ms: typeof POLLING_CONFIG.jitter_ms;
  backoff_after_attempts: typeof POLLING_CONFIG.backoff_after_attempts;
  max_retries: typeof POLLING_CONFIG.max_retries;
  fallback_source: typeof POLLING_CONFIG.fallback_source;
}

export interface CircuitBreakerEvidenceEnvelope {
  schema_version: "1.0";
  issue_id: string;
  run_id: string | null;
  observation: CircuitBreakerObservationKind;
  previous_state: CircuitBreakerRecord["state"];
  next_state: CircuitBreakerRecord["state"];
  attempt_count: number;
  max_attempts: number;
  half_open_threshold: number;
  transition_reason: string;
  failure_reason: string | null;
  opened_at: string | null;
  observed_at: string;
  selected_surface: CircuitBreakerEvidenceSurface;
  escalation_issue_id: string | null;
  escalation_ref: string | null;
  artifact_ref: string;
  record: CircuitBreakerRecord;
  polling_config: CircuitBreakerPollingConfigPosture;
  cache_overlay: CircuitBreakerCacheOverlayDiagnostics;
  activity: CircuitBreakerActivityDiagnostics;
  fallback: CircuitBreakerFallbackDiagnostics;
  markdown: string;
}

export type CircuitBreakerFlowPersistence = Partial<Pick<BOSPersistence, "getCircuitBreaker" | "saveCircuitBreaker">>;
export type CircuitBreakerFlowAdapter = Partial<Pick<PaperclipAdapter, "createEscalationIssue" | "addIssueComment" | "logActivity">>;

export interface CircuitBreakerFlowInput {
  issue_id: string;
  run_id?: string | null;
  observation: CircuitBreakerObservationKind;
  failure_reason?: string | null;
  now?: string;
  persistence?: CircuitBreakerFlowPersistence | null;
  adapter?: CircuitBreakerFlowAdapter | null;
}

interface LoadedRecordResult {
  record: CircuitBreakerRecord;
  diagnostics: Pick<CircuitBreakerCacheOverlayDiagnostics, "persistence" | "get" | "get_error">;
}

function sanitizeDiagnosticError(error: unknown): string {
  const raw = error instanceof Error && error.message ? error.message : String(error);
  return raw.replace(/[\r\n\t]+/g, " ").replace(/\s{2,}/g, " ").trim().slice(0, 500) || "unknown error";
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isValidCircuitBreakerRecord(value: unknown, issueId: string): value is CircuitBreakerRecord {
  const record = value as CircuitBreakerRecord;
  return Boolean(
    record &&
    record.schema_version === "1.0" &&
    record.issue_id === issueId &&
    (record.state === "CLOSED" || record.state === "HALF_OPEN" || record.state === "OPEN") &&
    Number.isFinite(record.attempt_count) &&
    Number.isFinite(record.max_attempts) &&
    Number.isFinite(record.half_open_threshold) &&
    (record.last_failure_at === null || typeof record.last_failure_at === "string") &&
    (record.last_failure_reason === null || typeof record.last_failure_reason === "string") &&
    (record.opened_at === null || typeof record.opened_at === "string") &&
    (record.escalation_issue_id === null || typeof record.escalation_issue_id === "string") &&
    typeof record.updated_at === "string"
  );
}

function validateInput(input: CircuitBreakerFlowInput): string | null {
  if (!isNonEmptyString(input.issue_id)) return "issue_id is required";
  if (input.observation !== "failure" && input.observation !== "success" && input.observation !== "half_open") {
    return "observation must be failure, success, or half_open";
  }
  if (input.observation === "failure" && !isNonEmptyString(input.failure_reason)) {
    return "failure_reason is required for failure observations";
  }
  return null;
}

function buildCacheOverlayDiagnostics(input: {
  persistence: CircuitBreakerPersistenceAvailability;
  get: CircuitBreakerCacheGetStatus;
  save: CircuitBreakerCacheSaveStatus;
  get_error?: string | null;
  save_error?: string | null;
  timestamp: string;
}): CircuitBreakerCacheOverlayDiagnostics {
  return {
    durability: "cache-overlay-only",
    persistence: input.persistence,
    get: input.get,
    save: input.save,
    get_error: input.get_error ?? null,
    save_error: input.save_error ?? null,
    timestamp: input.timestamp
  };
}

async function loadRecord(input: {
  issueId: string;
  timestamp: string;
  persistence?: CircuitBreakerFlowPersistence | null;
}): Promise<LoadedRecordResult> {
  if (!input.persistence) {
    return {
      record: createCircuitBreakerRecord(input.issueId, input.timestamp),
      diagnostics: { persistence: "missing", get: "not_attempted", get_error: null }
    };
  }

  if (typeof input.persistence.getCircuitBreaker !== "function") {
    return {
      record: createCircuitBreakerRecord(input.issueId, input.timestamp),
      diagnostics: { persistence: "provided", get: "not_attempted", get_error: null }
    };
  }

  try {
    const loaded = await input.persistence.getCircuitBreaker(input.issueId);
    if (loaded === null || loaded === undefined) {
      return {
        record: createCircuitBreakerRecord(input.issueId, input.timestamp),
        diagnostics: { persistence: "provided", get: "missing", get_error: null }
      };
    }

    if (!isValidCircuitBreakerRecord(loaded, input.issueId)) {
      return {
        record: createCircuitBreakerRecord(input.issueId, input.timestamp),
        diagnostics: {
          persistence: "provided",
          get: "malformed",
          get_error: "getCircuitBreaker returned malformed record"
        }
      };
    }

    return {
      record: loaded,
      diagnostics: { persistence: "provided", get: "loaded", get_error: null }
    };
  } catch (error) {
    return {
      record: createCircuitBreakerRecord(input.issueId, input.timestamp),
      diagnostics: { persistence: "provided", get: "failed", get_error: sanitizeDiagnosticError(error) }
    };
  }
}

function applyObservation(input: {
  record: CircuitBreakerRecord;
  observation: CircuitBreakerObservationKind;
  failureReason: string | null;
  timestamp: string;
}): { record: CircuitBreakerRecord; transitionReason: string } {
  if (input.observation === "failure") {
    const next = recordFailure(input.record, input.failureReason ?? "unknown failure", input.timestamp);
    return {
      record: next,
      transitionReason: next.state === "OPEN" && input.record.state !== "OPEN"
        ? "failure_threshold_reached"
        : "failure_recorded"
    };
  }

  if (input.observation === "success") {
    const next = recordSuccess(input.record, input.timestamp);
    return {
      record: next,
      transitionReason: input.record.state === "HALF_OPEN" ? "half_open_probe_succeeded" : "success_recorded"
    };
  }

  const next = moveToHalfOpen(input.record, input.timestamp);
  return {
    record: next,
    transitionReason: input.record.state === "OPEN" ? "half_open_probe_started" : "half_open_ignored_non_open_record"
  };
}

function escalationTitle(record: CircuitBreakerRecord): string {
  return `BOS Circuit Breaker OPEN: ${record.issue_id}`;
}

function escalationBody(record: CircuitBreakerRecord, runId: string | null): string {
  return [
    "# BOS Circuit Breaker Escalation",
    "",
    `- Issue: ${record.issue_id}`,
    `- Run: ${runId ?? "none"}`,
    `- State: ${record.state}`,
    `- Attempt count: ${record.attempt_count}/${record.max_attempts}`,
    `- Last failure: ${record.last_failure_reason ?? "none"}`,
    `- Last failure at: ${record.last_failure_at ?? "none"}`,
    `- Opened at: ${record.opened_at ?? "none"}`,
    `- Poll scope: ${POLLING_CONFIG.poll_scope}`,
    `- Poll fallback source: ${POLLING_CONFIG.fallback_source}`,
    "",
    "## Operator action",
    "Investigate the failing run/issue, decide whether to keep the circuit open, and use a HALF_OPEN observation only when a retry/probe is safe."
  ].join("\n");
}

function markdownArtifactRef(issueId: string, runId: string | null): string {
  return `markdown-only://issues/${issueId}/circuit-breaker/${runId ?? "latest"}`;
}

function commentArtifactRef(issueId: string, commentId: string): string {
  return `paperclip://issues/${issueId}/comments/${commentId}`;
}

function issueArtifactRef(issueId: string): string {
  return `paperclip://issues/${issueId}`;
}

function buildMarkdown(input: {
  record: CircuitBreakerRecord;
  previousState: CircuitBreakerRecord["state"];
  observation: CircuitBreakerObservationKind;
  runId: string | null;
  observedAt: string;
  transitionReason: string;
  cacheOverlay: CircuitBreakerCacheOverlayDiagnostics;
  activity: CircuitBreakerActivityDiagnostics;
  fallback: CircuitBreakerFallbackDiagnostics;
  escalationRef: string | null;
}): string {
  return [
    "# BOS Circuit Breaker Observation",
    "",
    `- Issue: ${input.record.issue_id || "missing"}`,
    `- Run: ${input.runId ?? "none"}`,
    `- Observation: ${input.observation}`,
    `- Previous state: ${input.previousState}`,
    `- Next state: ${input.record.state}`,
    `- Transition reason: ${input.transitionReason}`,
    `- Attempt count: ${input.record.attempt_count}/${input.record.max_attempts}`,
    `- Failure reason: ${input.record.last_failure_reason ?? "none"}`,
    `- Opened at: ${input.record.opened_at ?? "none"}`,
    `- Escalation issue: ${input.record.escalation_issue_id ?? "none"}`,
    `- Escalation ref: ${input.escalationRef ?? "none"}`,
    `- Observed at: ${input.observedAt}`,
    `- Cache overlay get: ${input.cacheOverlay.get}`,
    `- Cache overlay save: ${input.cacheOverlay.save}`,
    ...(input.cacheOverlay.get_error ? [`- Cache overlay get error: ${input.cacheOverlay.get_error}`] : []),
    ...(input.cacheOverlay.save_error ? [`- Cache overlay save error: ${input.cacheOverlay.save_error}`] : []),
    `- Activity log: ${input.activity.status}`,
    ...(input.activity.error ? [`- Activity log error: ${input.activity.error}`] : []),
    `- Fallback reason: ${input.fallback.reason ?? "none"}`,
    ...(input.fallback.validation_error ? [`- Validation error: ${input.fallback.validation_error}`] : []),
    ...(input.fallback.escalation_create_error ? [`- Escalation create error: ${input.fallback.escalation_create_error}`] : []),
    ...(input.fallback.comment_error ? [`- Comment error: ${input.fallback.comment_error}`] : []),
    "",
    "## Polling posture",
    `- Scope: ${POLLING_CONFIG.poll_scope}`,
    `- Interval: ${POLLING_CONFIG.interval_ms}ms (+/- ${POLLING_CONFIG.jitter_ms}ms jitter)`,
    `- Backoff after attempts: ${POLLING_CONFIG.backoff_after_attempts}`,
    `- Max retries: ${POLLING_CONFIG.max_retries}`,
    `- Fallback source: ${POLLING_CONFIG.fallback_source}`,
    "",
    "## Markdown-only escalation instructions",
    input.record.state === "OPEN"
      ? "Create or update a visible Paperclip issue/comment with this observation before retrying. Activity logs are diagnostic only and are not sufficient durable evidence."
      : "No escalation required unless the circuit transitions to OPEN."
  ].join("\n");
}

async function saveRecord(input: {
  record: CircuitBreakerRecord;
  persistence?: CircuitBreakerFlowPersistence | null;
}): Promise<Pick<CircuitBreakerCacheOverlayDiagnostics, "save" | "save_error">> {
  if (!input.persistence || typeof input.persistence.saveCircuitBreaker !== "function") {
    return { save: "not_attempted", save_error: null };
  }

  try {
    await input.persistence.saveCircuitBreaker(input.record);
    return { save: "saved", save_error: null };
  } catch (error) {
    return { save: "failed", save_error: sanitizeDiagnosticError(error) };
  }
}

async function logActivity(input: {
  adapter?: CircuitBreakerFlowAdapter | null;
  record: CircuitBreakerRecord;
  previousState: CircuitBreakerRecord["state"];
  observation: CircuitBreakerObservationKind;
  transitionReason: string;
}): Promise<CircuitBreakerActivityDiagnostics> {
  if (typeof input.adapter?.logActivity !== "function") {
    return { status: "not_attempted", error: null };
  }

  try {
    await input.adapter.logActivity("BOS Circuit Breaker Observation", {
      issue_id: input.record.issue_id,
      previous_state: input.previousState,
      next_state: input.record.state,
      observation: input.observation,
      transition_reason: input.transitionReason,
      attempt_count: input.record.attempt_count,
      opened_at: input.record.opened_at,
      escalation_issue_id: input.record.escalation_issue_id
    });
    return { status: "logged", error: null };
  } catch (error) {
    return { status: "failed", error: sanitizeDiagnosticError(error) };
  }
}

async function createEscalationEvidence(input: {
  adapter?: CircuitBreakerFlowAdapter | null;
  record: CircuitBreakerRecord;
  runId: string | null;
  timestamp: string;
}): Promise<{
  record: CircuitBreakerRecord;
  selectedSurface: CircuitBreakerEvidenceSurface;
  escalationRef: string | null;
  artifactRef: string;
  fallback: CircuitBreakerFallbackDiagnostics;
}> {
  if (input.record.state !== "OPEN") {
    return {
      record: input.record,
      selectedSurface: "cache-overlay",
      escalationRef: null,
      artifactRef: `cache-overlay://issues/${input.record.issue_id}/circuit-breaker`,
      fallback: { reason: null }
    };
  }

  if (isNonEmptyString(input.record.escalation_issue_id)) {
    const issueId = input.record.escalation_issue_id.trim();
    return {
      record: input.record,
      selectedSurface: "issues.native",
      escalationRef: issueArtifactRef(issueId),
      artifactRef: issueArtifactRef(issueId),
      fallback: { reason: null }
    };
  }

  const body = escalationBody(input.record, input.runId);

  if (typeof input.adapter?.createEscalationIssue === "function") {
    try {
      const issue = await input.adapter.createEscalationIssue({
        title: escalationTitle(input.record),
        body,
        related_issue_id: input.record.issue_id
      });
      if (isNonEmptyString(issue?.issue_id)) {
        const escalationIssueId = issue.issue_id.trim();
        const record = attachEscalationIssue(input.record, escalationIssueId, input.timestamp);
        return {
          record,
          selectedSurface: "issues.native",
          escalationRef: issueArtifactRef(escalationIssueId),
          artifactRef: issueArtifactRef(escalationIssueId),
          fallback: { reason: null }
        };
      }
    } catch (error) {
      const escalationError = sanitizeDiagnosticError(error);
      return createCommentEscalationEvidence({
        adapter: input.adapter,
        record: input.record,
        runId: input.runId,
        escalationCreateError: escalationError
      });
    }

    return createCommentEscalationEvidence({
      adapter: input.adapter,
      record: input.record,
      runId: input.runId,
      escalationCreateError: "createEscalationIssue returned missing issue_id"
    });
  }

  return createCommentEscalationEvidence({
    adapter: input.adapter,
    record: input.record,
    runId: input.runId,
    escalationCreateError: "issues.native:unavailable"
  });
}

async function createCommentEscalationEvidence(input: {
  adapter?: CircuitBreakerFlowAdapter | null;
  record: CircuitBreakerRecord;
  runId: string | null;
  escalationCreateError: string;
}): Promise<{
  record: CircuitBreakerRecord;
  selectedSurface: CircuitBreakerEvidenceSurface;
  escalationRef: string | null;
  artifactRef: string;
  fallback: CircuitBreakerFallbackDiagnostics;
}> {
  const body = escalationBody(input.record, input.runId);

  if (typeof input.adapter?.addIssueComment !== "function") {
    return {
      record: input.record,
      selectedSurface: "markdown-only",
      escalationRef: markdownArtifactRef(input.record.issue_id, input.runId),
      artifactRef: markdownArtifactRef(input.record.issue_id, input.runId),
      fallback: {
        reason: "markdown_only_escalation_required",
        escalation_create_error: input.escalationCreateError,
        comment_error: "comments.native:unavailable"
      }
    };
  }

  try {
    const comment = await input.adapter.addIssueComment(input.record.issue_id, body);
    if (isNonEmptyString(comment?.comment_id)) {
      const commentId = comment.comment_id.trim();
      return {
        record: input.record,
        selectedSurface: "comments.native",
        escalationRef: commentArtifactRef(input.record.issue_id, commentId),
        artifactRef: commentArtifactRef(input.record.issue_id, commentId),
        fallback: {
          reason: "issue_create_failed_comment_escalation_used",
          escalation_create_error: input.escalationCreateError
        }
      };
    }

    return {
      record: input.record,
      selectedSurface: "markdown-only",
      escalationRef: markdownArtifactRef(input.record.issue_id, input.runId),
      artifactRef: markdownArtifactRef(input.record.issue_id, input.runId),
      fallback: {
        reason: "markdown_only_escalation_required",
        escalation_create_error: input.escalationCreateError,
        comment_error: "addIssueComment returned missing comment_id"
      }
    };
  } catch (error) {
    return {
      record: input.record,
      selectedSurface: "markdown-only",
      escalationRef: markdownArtifactRef(input.record.issue_id, input.runId),
      artifactRef: markdownArtifactRef(input.record.issue_id, input.runId),
      fallback: {
        reason: "markdown_only_escalation_required",
        escalation_create_error: input.escalationCreateError,
        comment_error: sanitizeDiagnosticError(error)
      }
    };
  }
}

function validationEnvelope(input: {
  issueId: string;
  runId: string | null;
  observation: CircuitBreakerObservationKind;
  timestamp: string;
  validationError: string;
}): CircuitBreakerEvidenceEnvelope {
  const record = createCircuitBreakerRecord(input.issueId || "", input.timestamp);
  const cacheOverlay = buildCacheOverlayDiagnostics({
    persistence: "missing",
    get: "not_attempted",
    save: "not_attempted",
    timestamp: input.timestamp
  });
  const activity: CircuitBreakerActivityDiagnostics = { status: "not_attempted", error: null };
  const fallback: CircuitBreakerFallbackDiagnostics = {
    reason: "invalid_input",
    validation_error: input.validationError
  };
  const markdown = buildMarkdown({
    record,
    previousState: record.state,
    observation: input.observation,
    runId: input.runId,
    observedAt: input.timestamp,
    transitionReason: "invalid_input",
    cacheOverlay,
    activity,
    fallback,
    escalationRef: markdownArtifactRef(input.issueId || "missing", input.runId)
  });

  return {
    schema_version: "1.0",
    issue_id: record.issue_id,
    run_id: input.runId,
    observation: input.observation,
    previous_state: record.state,
    next_state: record.state,
    attempt_count: record.attempt_count,
    max_attempts: record.max_attempts,
    half_open_threshold: record.half_open_threshold,
    transition_reason: "invalid_input",
    failure_reason: null,
    opened_at: record.opened_at,
    observed_at: input.timestamp,
    selected_surface: "markdown-only",
    escalation_issue_id: null,
    escalation_ref: markdownArtifactRef(input.issueId || "missing", input.runId),
    artifact_ref: markdownArtifactRef(input.issueId || "missing", input.runId),
    record,
    polling_config: { ...POLLING_CONFIG },
    cache_overlay: cacheOverlay,
    activity,
    fallback,
    markdown
  };
}

export async function circuitBreakerFlow(input: CircuitBreakerFlowInput): Promise<CircuitBreakerEvidenceEnvelope> {
  const timestamp = input.now ?? new Date().toISOString();
  const runId = input.run_id ?? null;
  const issueId = typeof input.issue_id === "string" ? input.issue_id.trim() : "";
  const validationError = validateInput({ ...input, issue_id: issueId });

  if (validationError) {
    return validationEnvelope({
      issueId,
      runId,
      observation: input.observation,
      timestamp,
      validationError
    });
  }

  const loaded = await loadRecord({ issueId, timestamp, persistence: input.persistence });
  const previousState = loaded.record.state;
  const failureReason = input.observation === "failure" ? input.failure_reason?.trim() ?? null : null;
  const transition = applyObservation({
    record: loaded.record,
    observation: input.observation,
    failureReason,
    timestamp
  });

  const escalationEvidence = await createEscalationEvidence({
    adapter: input.adapter,
    record: transition.record,
    runId,
    timestamp
  });

  const activity = await logActivity({
    adapter: input.adapter,
    record: escalationEvidence.record,
    previousState,
    observation: input.observation,
    transitionReason: transition.transitionReason
  });

  const save = await saveRecord({ record: escalationEvidence.record, persistence: input.persistence });
  const cacheOverlay = buildCacheOverlayDiagnostics({
    ...loaded.diagnostics,
    save: save.save,
    save_error: save.save_error,
    timestamp
  });

  const fallback: CircuitBreakerFallbackDiagnostics = {
    ...escalationEvidence.fallback,
    ...(activity.error ? { activity_error: activity.error } : {})
  };

  const markdown = buildMarkdown({
    record: escalationEvidence.record,
    previousState,
    observation: input.observation,
    runId,
    observedAt: timestamp,
    transitionReason: transition.transitionReason,
    cacheOverlay,
    activity,
    fallback,
    escalationRef: escalationEvidence.escalationRef
  });

  return {
    schema_version: "1.0",
    issue_id: escalationEvidence.record.issue_id,
    run_id: runId,
    observation: input.observation,
    previous_state: previousState,
    next_state: escalationEvidence.record.state,
    attempt_count: escalationEvidence.record.attempt_count,
    max_attempts: escalationEvidence.record.max_attempts,
    half_open_threshold: escalationEvidence.record.half_open_threshold,
    transition_reason: transition.transitionReason,
    failure_reason: escalationEvidence.record.last_failure_reason,
    opened_at: escalationEvidence.record.opened_at,
    observed_at: timestamp,
    selected_surface: escalationEvidence.selectedSurface,
    escalation_issue_id: escalationEvidence.record.escalation_issue_id,
    escalation_ref: escalationEvidence.escalationRef,
    artifact_ref: escalationEvidence.artifactRef,
    record: escalationEvidence.record,
    polling_config: { ...POLLING_CONFIG },
    cache_overlay: cacheOverlay,
    activity,
    fallback,
    markdown
  };
}
