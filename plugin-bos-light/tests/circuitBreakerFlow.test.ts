import { describe, expect, it, vi } from "vitest";
import { circuitBreakerFlow } from "../src/circuitBreakerFlow";
import { createCircuitBreakerRecord, recordFailure } from "../src/circuitBreaker";
import { InMemoryBOSPersistence } from "../src/persistence";
import { InMemoryPaperclipAdapter } from "../src/paperclipAdapter";
import type { CircuitBreakerRecord } from "../src/contracts";

const NOW = "2026-05-28T00:00:00.000Z";
const T1 = "2026-05-28T00:01:00.000Z";
const T2 = "2026-05-28T00:02:00.000Z";
const T3 = "2026-05-28T00:03:00.000Z";

async function twoFailureRecord(issueId = "issue_1"): Promise<InMemoryBOSPersistence> {
  const persistence = new InMemoryBOSPersistence();
  let record = createCircuitBreakerRecord(issueId, NOW);
  record = recordFailure(record, "first", T1);
  record = recordFailure(record, "second", T2);
  await persistence.saveCircuitBreaker(record);
  return persistence;
}

function openRecord(issueId = "issue_1", escalationIssueId: string | null = null): CircuitBreakerRecord {
  return {
    ...createCircuitBreakerRecord(issueId, NOW),
    state: "OPEN",
    attempt_count: 3,
    last_failure_at: T3,
    last_failure_reason: "third",
    opened_at: T3,
    escalation_issue_id: escalationIssueId,
    updated_at: T3
  };
}

describe("Circuit Breaker flow", () => {
  it("records a CLOSED failure below threshold as cache-overlay evidence with active-runs-only polling config", async () => {
    const persistence = new InMemoryBOSPersistence();
    const adapter = new InMemoryPaperclipAdapter();

    const evidence = await circuitBreakerFlow({
      issue_id: "issue_1",
      run_id: "run_1",
      observation: "failure",
      failure_reason: "worker failed",
      persistence,
      adapter,
      now: NOW
    });

    expect(evidence.previous_state).toBe("CLOSED");
    expect(evidence.next_state).toBe("CLOSED");
    expect(evidence.attempt_count).toBe(1);
    expect(evidence.selected_surface).toBe("cache-overlay");
    expect(evidence.cache_overlay.get).toBe("missing");
    expect(evidence.cache_overlay.save).toBe("saved");
    expect(evidence.polling_config.poll_scope).toBe("ACTIVE_RUNS_ONLY");
    expect(evidence.polling_config.fallback_source).toBe("activity_log");
    expect(persistence.circuits.get("issue_1")?.attempt_count).toBe(1);
    expect(adapter.issues).toHaveLength(0);
    expect(adapter.comments).toHaveLength(0);
  });

  it("opens exactly at the failure threshold and attaches a native escalation issue before saving", async () => {
    const persistence = await twoFailureRecord();
    const adapter = new InMemoryPaperclipAdapter();

    const evidence = await circuitBreakerFlow({
      issue_id: "issue_1",
      run_id: "run_3",
      observation: "failure",
      failure_reason: "third",
      persistence,
      adapter,
      now: T3
    });

    expect(evidence.previous_state).toBe("CLOSED");
    expect(evidence.next_state).toBe("OPEN");
    expect(evidence.transition_reason).toBe("failure_threshold_reached");
    expect(evidence.attempt_count).toBe(3);
    expect(evidence.opened_at).toBe(T3);
    expect(evidence.selected_surface).toBe("issues.native");
    expect(evidence.escalation_issue_id).toBe("escalation_1");
    expect(evidence.escalation_ref).toBe("paperclip://issues/escalation_1");
    expect(adapter.issues).toHaveLength(1);
    expect(adapter.issues[0].body).toContain("Attempt count: 3/3");
    expect(persistence.circuits.get("issue_1")?.escalation_issue_id).toBe("escalation_1");
  });

  it("does not create duplicate escalations when an OPEN record already has an escalation issue", async () => {
    const persistence = new InMemoryBOSPersistence();
    const adapter = new InMemoryPaperclipAdapter();
    await persistence.saveCircuitBreaker(openRecord("issue_1", "existing_escalation"));

    const evidence = await circuitBreakerFlow({
      issue_id: "issue_1",
      observation: "failure",
      failure_reason: "still failing",
      persistence,
      adapter,
      now: "2026-05-28T00:04:00.000Z"
    });

    expect(evidence.previous_state).toBe("OPEN");
    expect(evidence.next_state).toBe("OPEN");
    expect(evidence.escalation_issue_id).toBe("existing_escalation");
    expect(evidence.selected_surface).toBe("issues.native");
    expect(adapter.issues).toHaveLength(0);
    expect(adapter.comments).toHaveLength(0);
  });

  it("falls back to comment escalation when escalation issue creation fails", async () => {
    const persistence = await twoFailureRecord();
    const adapter = new InMemoryPaperclipAdapter();
    vi.spyOn(adapter, "createEscalationIssue").mockRejectedValue(new Error("issue api down"));

    const evidence = await circuitBreakerFlow({
      issue_id: "issue_1",
      observation: "failure",
      failure_reason: "third",
      persistence,
      adapter,
      now: T3
    });

    expect(evidence.next_state).toBe("OPEN");
    expect(evidence.selected_surface).toBe("comments.native");
    expect(evidence.escalation_issue_id).toBeNull();
    expect(evidence.escalation_ref).toBe("paperclip://issues/issue_1/comments/comment_1");
    expect(evidence.fallback.reason).toBe("issue_create_failed_comment_escalation_used");
    expect(evidence.fallback.escalation_create_error).toBe("issue api down");
    expect(adapter.comments).toHaveLength(1);
  });

  it("returns markdown-only escalation instructions when all adapter evidence paths fail", async () => {
    const persistence = await twoFailureRecord();
    const adapter = new InMemoryPaperclipAdapter();
    vi.spyOn(adapter, "createEscalationIssue").mockRejectedValue(new Error("issue api down"));
    vi.spyOn(adapter, "addIssueComment").mockRejectedValue(new Error("comment api down"));

    const evidence = await circuitBreakerFlow({
      issue_id: "issue_1",
      observation: "failure",
      failure_reason: "third",
      persistence,
      adapter,
      now: T3
    });

    expect(evidence.next_state).toBe("OPEN");
    expect(evidence.selected_surface).toBe("markdown-only");
    expect(evidence.artifact_ref).toBe("markdown-only://issues/issue_1/circuit-breaker/latest");
    expect(evidence.fallback.reason).toBe("markdown_only_escalation_required");
    expect(evidence.fallback.escalation_create_error).toBe("issue api down");
    expect(evidence.fallback.comment_error).toBe("comment api down");
    expect(evidence.markdown).toContain("Markdown-only escalation instructions");
  });

  it("moves OPEN records to HALF_OPEN for retry probes without creating new escalation evidence", async () => {
    const persistence = new InMemoryBOSPersistence();
    const adapter = new InMemoryPaperclipAdapter();
    await persistence.saveCircuitBreaker(openRecord("issue_1", "existing_escalation"));

    const evidence = await circuitBreakerFlow({
      issue_id: "issue_1",
      observation: "half_open",
      persistence,
      adapter,
      now: "2026-05-28T00:05:00.000Z"
    });

    expect(evidence.previous_state).toBe("OPEN");
    expect(evidence.next_state).toBe("HALF_OPEN");
    expect(evidence.transition_reason).toBe("half_open_probe_started");
    expect(evidence.selected_surface).toBe("cache-overlay");
    expect(adapter.issues).toHaveLength(0);
    expect(adapter.comments).toHaveLength(0);
  });

  it("closes HALF_OPEN records after successful retry and clears failure counters", async () => {
    const persistence = new InMemoryBOSPersistence();
    const halfOpen = { ...openRecord("issue_1", "existing_escalation"), state: "HALF_OPEN" as const };
    await persistence.saveCircuitBreaker(halfOpen);

    const evidence = await circuitBreakerFlow({
      issue_id: "issue_1",
      observation: "success",
      persistence,
      now: "2026-05-28T00:06:00.000Z"
    });

    expect(evidence.previous_state).toBe("HALF_OPEN");
    expect(evidence.next_state).toBe("CLOSED");
    expect(evidence.transition_reason).toBe("half_open_probe_succeeded");
    expect(evidence.attempt_count).toBe(0);
    expect(evidence.failure_reason).toBeNull();
    expect(evidence.opened_at).toBeNull();
    expect(evidence.escalation_issue_id).toBe("existing_escalation");
  });

  it("keeps CLOSED records closed on success", async () => {
    const persistence = new InMemoryBOSPersistence();

    const evidence = await circuitBreakerFlow({
      issue_id: "issue_1",
      observation: "success",
      persistence,
      now: NOW
    });

    expect(evidence.previous_state).toBe("CLOSED");
    expect(evidence.next_state).toBe("CLOSED");
    expect(evidence.attempt_count).toBe(0);
    expect(evidence.selected_surface).toBe("cache-overlay");
  });

  it("rejects empty issue ids without persistence or adapter writes", async () => {
    const persistence = new InMemoryBOSPersistence();
    const adapter = new InMemoryPaperclipAdapter();

    const evidence = await circuitBreakerFlow({
      issue_id: "   ",
      observation: "failure",
      failure_reason: "bad input",
      persistence,
      adapter,
      now: NOW
    });

    expect(evidence.selected_surface).toBe("markdown-only");
    expect(evidence.fallback.reason).toBe("invalid_input");
    expect(evidence.fallback.validation_error).toBe("issue_id is required");
    expect(evidence.cache_overlay.save).toBe("not_attempted");
    expect(persistence.circuits.size).toBe(0);
    expect(adapter.issues).toHaveLength(0);
    expect(adapter.comments).toHaveLength(0);
  });

  it("continues from a new record when cache overlay get fails and reports save failure safely", async () => {
    const persistence = new InMemoryBOSPersistence();
    vi.spyOn(persistence, "getCircuitBreaker").mockRejectedValue(new Error("cache read down"));
    vi.spyOn(persistence, "saveCircuitBreaker").mockRejectedValue(new Error("cache write down"));

    const evidence = await circuitBreakerFlow({
      issue_id: "issue_1",
      observation: "failure",
      failure_reason: "worker failed",
      persistence,
      now: NOW
    });

    expect(evidence.next_state).toBe("CLOSED");
    expect(evidence.attempt_count).toBe(1);
    expect(evidence.cache_overlay.get).toBe("failed");
    expect(evidence.cache_overlay.get_error).toBe("cache read down");
    expect(evidence.cache_overlay.save).toBe("failed");
    expect(evidence.cache_overlay.save_error).toBe("cache write down");
  });

  it("treats malformed cache overlay get records as missing overlay", async () => {
    const persistence = {
      getCircuitBreaker: vi.fn().mockResolvedValue({ issue_id: "issue_1", state: "BROKEN" }),
      saveCircuitBreaker: vi.fn().mockResolvedValue(undefined)
    };

    const evidence = await circuitBreakerFlow({
      issue_id: "issue_1",
      observation: "success",
      persistence,
      now: NOW
    });

    expect(evidence.cache_overlay.get).toBe("malformed");
    expect(evidence.cache_overlay.get_error).toBe("getCircuitBreaker returned malformed record");
    expect(evidence.previous_state).toBe("CLOSED");
    expect(evidence.next_state).toBe("CLOSED");
  });

  it("records activity logging failures without using activity as the durable evidence path", async () => {
    const persistence = await twoFailureRecord();
    const adapter = new InMemoryPaperclipAdapter();
    vi.spyOn(adapter, "logActivity").mockRejectedValue(new Error("activity timeout"));

    const evidence = await circuitBreakerFlow({
      issue_id: "issue_1",
      observation: "failure",
      failure_reason: "third",
      persistence,
      adapter,
      now: T3
    });

    expect(evidence.next_state).toBe("OPEN");
    expect(evidence.selected_surface).toBe("issues.native");
    expect(evidence.activity.status).toBe("failed");
    expect(evidence.activity.error).toBe("activity timeout");
    expect(evidence.fallback.activity_error).toBe("activity timeout");
    expect(evidence.markdown).toContain("Activity log error: activity timeout");
  });
});
