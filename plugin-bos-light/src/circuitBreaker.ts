import type { CircuitBreakerRecord } from "./contracts";

export const DEFAULT_MAX_ATTEMPTS = 3;
export const DEFAULT_HALF_OPEN_THRESHOLD = 2;

export const POLLING_CONFIG = {
  poll_scope: "ACTIVE_RUNS_ONLY" as const,
  interval_ms: 30000,
  jitter_ms: 5000,
  backoff_after_attempts: 10,
  max_retries: 60,
  fallback_source: "activity_log" as const
};

export function createCircuitBreakerRecord(issueId: string, now = new Date().toISOString()): CircuitBreakerRecord {
  return {
    schema_version: "1.0",
    issue_id: issueId,
    state: "CLOSED",
    attempt_count: 0,
    max_attempts: DEFAULT_MAX_ATTEMPTS,
    half_open_threshold: DEFAULT_HALF_OPEN_THRESHOLD,
    last_failure_at: null,
    last_failure_reason: null,
    opened_at: null,
    escalation_issue_id: null,
    updated_at: now
  };
}

export function recordFailure(
  record: CircuitBreakerRecord,
  reason: string,
  now = new Date().toISOString()
): CircuitBreakerRecord {
  const attemptCount = record.attempt_count + 1;
  const shouldOpen = attemptCount >= record.max_attempts;
  return {
    ...record,
    state: shouldOpen ? "OPEN" : record.state,
    attempt_count: attemptCount,
    last_failure_at: now,
    last_failure_reason: reason,
    opened_at: shouldOpen ? record.opened_at ?? now : record.opened_at,
    updated_at: now
  };
}

export function recordSuccess(record: CircuitBreakerRecord, now = new Date().toISOString()): CircuitBreakerRecord {
  return {
    ...record,
    state: "CLOSED",
    attempt_count: 0,
    last_failure_at: null,
    last_failure_reason: null,
    opened_at: null,
    updated_at: now
  };
}

export function moveToHalfOpen(record: CircuitBreakerRecord, now = new Date().toISOString()): CircuitBreakerRecord {
  if (record.state !== "OPEN") return record;
  return {
    ...record,
    state: "HALF_OPEN",
    updated_at: now
  };
}

export function attachEscalationIssue(
  record: CircuitBreakerRecord,
  escalationIssueId: string,
  now = new Date().toISOString()
): CircuitBreakerRecord {
  return {
    ...record,
    escalation_issue_id: escalationIssueId,
    updated_at: now
  };
}
