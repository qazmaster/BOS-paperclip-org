import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  executeProductionWork,
} from "../src/div4Production";
import {
  verifyProductionWork,
  type PostProductionVerificationResult,
} from "../src/div5PostProductionVerification";
import { circuitBreakerFlow } from "../src/circuitBreakerFlow";
import type { CircuitBreakerEvidenceEnvelope } from "../src/circuitBreakerFlow";
import { InMemoryBOSPersistence } from "../src/persistence";
import {
  emitDivisionPacket,
  getDivisionInbox,
  clearPacketRouter,
} from "../src/divisionPacketRouter";
import { DefaultGitOperations } from "../src/gitOperations";
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { execSync } from "child_process";

describe("circuit breaker with post-production verification failures", () => {
  let tempDir: string;
  let persistence: InMemoryBOSPersistence;
  const realGitOps = new DefaultGitOperations();

  function initTempRepo(): string {
    const dir = mkdtempSync(join(tmpdir(), "cb-ppv-test-"));
    execSync("git init -b main", { cwd: dir, stdio: "pipe" });
    execSync("git config user.email test@test.com", { cwd: dir, stdio: "pipe" });
    execSync("git config user.name Test", { cwd: dir, stdio: "pipe" });
    writeFileSync(join(dir, "README.md"), "# Test Repo\n");
    execSync("git add README.md", { cwd: dir, stdio: "pipe" });
    execSync('git commit -m "initial commit"', { cwd: dir, stdio: "pipe" });
    return dir;
  }

  async function runDiv4Pipeline(
    snapshotId: string,
    missionId: string
  ): Promise<Record<string, unknown>> {
    const payload = {
      quarantine_ref: `quarantine_${snapshotId}`,
      mission_id: missionId,
      grant_id: `grant_${snapshotId}`,
      secret_scan_passed: true,
      snapshot_id: snapshotId,
      approved_for_division: "Div4.Production" as const,
      approved_at: new Date().toISOString(),
      branch_inventory: ["main"],
      ref_inventory: ["refs/heads/main"],
      commit_shas: ["abc123"],
      local_path: tempDir,
    };
    emitDivisionPacket(
      "Div5.QualificationsLibraryLearning",
      "Div4.Production",
      "gate_decision",
      payload
    );

    const result = await executeProductionWork("Div4.Production", snapshotId, realGitOps);
    expect(result.authorized).toBe(true);

    const div5Inbox = getDivisionInbox("Div5.QualificationsLibraryLearning");
    const statusPacket = div5Inbox.find((p) => p.packet_type === "status_update");
    expect(statusPacket).toBeDefined();

    return statusPacket!.payload as Record<string, unknown>;
  }

  function runDiv5Verification(
    snapshotId: string,
    statusPayload: Record<string, unknown>
  ): PostProductionVerificationResult {
    emitDivisionPacket(
      "Div4.Production",
      "Div5.QualificationsLibraryLearning",
      "status_update",
      statusPayload
    );

    return verifyProductionWork(
      "Div5.QualificationsLibraryLearning",
      snapshotId
    );
  }

  function extractFailureReasons(result: PostProductionVerificationResult): string {
    if (!("authorized" in result) || !result.authorized) {
      return "unauthorized";
    }
    const failed = result.verdict.checks.filter((c) => !c.passed);
    return failed.map((c) => `${c.check_id}: ${c.detail}`).join("; ");
  }

  beforeEach(() => {
    clearPacketRouter();
    tempDir = initTempRepo();
    persistence = new InMemoryBOSPersistence();
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("3 verification failures → circuit transitions to OPEN", async () => {
    const issueId = "issue_cb_001";
    const snapshotId = "snapshot_cb_001";
    const missionId = "mission_cb_001";

    const statusPayload = await runDiv4Pipeline(snapshotId, missionId);

    let lastEnvelope: CircuitBreakerEvidenceEnvelope | undefined;

    for (let i = 0; i < 3; i++) {
      const smokePath = join(tempDir, ".bos-smoke-test.md");
      try { rmSync(smokePath); } catch { /* may already be deleted */ }

      clearPacketRouter();
      const result = runDiv5Verification(snapshotId, statusPayload);
      const failureReason = extractFailureReasons(result);

      lastEnvelope = await circuitBreakerFlow({
        issue_id: issueId,
        observation: "failure",
        failure_reason: failureReason,
        persistence,
      });
    }

    expect(lastEnvelope).toBeDefined();
    expect(lastEnvelope!.record.state).toBe("OPEN");
    expect(lastEnvelope!.record.attempt_count).toBe(3);
    expect(lastEnvelope!.record.opened_at).toBeDefined();
    expect(lastEnvelope!.transition_reason).toBe("failure_threshold_reached");
  });

  it("circuit state transitions: CLOSED → CLOSED → OPEN", async () => {
    const issueId = "issue_cb_002";
    const snapshotId = "snapshot_cb_002";
    const missionId = "mission_cb_002";

    const statusPayload = await runDiv4Pipeline(snapshotId, missionId);
    const states: string[] = [];

    for (let i = 0; i < 3; i++) {
      const smokePath = join(tempDir, ".bos-smoke-test.md");
      try { rmSync(smokePath); } catch { /* may already be deleted */ }

      clearPacketRouter();
      const result = runDiv5Verification(snapshotId, statusPayload);
      const failureReason = extractFailureReasons(result);

      const envelope = await circuitBreakerFlow({
        issue_id: issueId,
        observation: "failure",
        failure_reason: failureReason,
        persistence,
      });

      states.push(envelope.record.state);
    }

    expect(states[0]).toBe("CLOSED");
    expect(states[1]).toBe("CLOSED");
    expect(states[2]).toBe("OPEN");
  });

  it("CircuitBreakerIncident has correct structure when circuit opens", async () => {
    const issueId = "issue_cb_003";
    const snapshotId = "snapshot_cb_003";
    const missionId = "mission_cb_003";

    const statusPayload = await runDiv4Pipeline(snapshotId, missionId);

    let envelope: CircuitBreakerEvidenceEnvelope | undefined;

    for (let i = 0; i < 3; i++) {
      const smokePath = join(tempDir, ".bos-smoke-test.md");
      try { rmSync(smokePath); } catch { /* may already be deleted */ }

      clearPacketRouter();
      const result = runDiv5Verification(snapshotId, statusPayload);
      const failureReason = extractFailureReasons(result);

      envelope = await circuitBreakerFlow({
        issue_id: issueId,
        observation: "failure",
        failure_reason: failureReason,
        persistence,
      });
    }

    expect(envelope).toBeDefined();
    const record = envelope!.record;

    expect(record.schema_version).toBe("1.0");
    expect(record.issue_id).toBe(issueId);
    expect(record.state).toBe("OPEN");
    expect(record.attempt_count).toBe(3);
    expect(record.max_attempts).toBe(3);
    expect(record.half_open_threshold).toBe(2);
    expect(record.last_failure_at).toBeDefined();
    expect(record.last_failure_reason).toBeDefined();
    expect(record.last_failure_reason).toContain("smoke_file_exists");
    expect(record.opened_at).toBeDefined();
    expect(record.updated_at).toBeDefined();

    expect(envelope!.schema_version).toBe("1.0");
    expect(envelope!.issue_id).toBe(issueId);
    expect(envelope!.observation).toBe("failure");
    expect(envelope!.previous_state).toBe("CLOSED");
    expect(envelope!.next_state).toBe("OPEN");
    expect(envelope!.transition_reason).toBe("failure_threshold_reached");
    expect(envelope!.failure_reason).toContain("smoke_file_exists");
    expect(envelope!.opened_at).toBeDefined();
    expect(envelope!.observed_at).toBeDefined();
    expect(envelope!.artifact_ref).toBeDefined();
    expect(envelope!.record).toBe(record);
  });

  it("bounded retries: circuit stays OPEN after additional failures", async () => {
    const issueId = "issue_cb_004";
    const snapshotId = "snapshot_cb_004";
    const missionId = "mission_cb_004";

    const statusPayload = await runDiv4Pipeline(snapshotId, missionId);

    // Open the circuit
    for (let i = 0; i < 3; i++) {
      const smokePath = join(tempDir, ".bos-smoke-test.md");
      try { rmSync(smokePath); } catch { /* may already be deleted */ }

      clearPacketRouter();
      const result = runDiv5Verification(snapshotId, statusPayload);
      const failureReason = extractFailureReasons(result);

      await circuitBreakerFlow({
        issue_id: issueId,
        observation: "failure",
        failure_reason: failureReason,
        persistence,
      });
    }

    // Feed 2 more failures after OPEN
    for (let i = 0; i < 2; i++) {
      const smokePath = join(tempDir, ".bos-smoke-test.md");
      try { rmSync(smokePath); } catch { /* may already be deleted */ }

      clearPacketRouter();
      const result = runDiv5Verification(snapshotId, statusPayload);
      const failureReason = extractFailureReasons(result);

      const envelope = await circuitBreakerFlow({
        issue_id: issueId,
        observation: "failure",
        failure_reason: failureReason,
        persistence,
      });

      expect(envelope.record.state).toBe("OPEN");
      expect(envelope.record.attempt_count).toBe(3 + i + 1);
    }
  });

  it("half-open probe: OPEN → HALF_OPEN → success → CLOSED", async () => {
    const issueId = "issue_cb_005";
    const snapshotId = "snapshot_cb_005";
    const missionId = "mission_cb_005";

    const statusPayload = await runDiv4Pipeline(snapshotId, missionId);

    // Open the circuit
    for (let i = 0; i < 3; i++) {
      const smokePath = join(tempDir, ".bos-smoke-test.md");
      try { rmSync(smokePath); } catch { /* may already be deleted */ }

      clearPacketRouter();
      const result = runDiv5Verification(snapshotId, statusPayload);
      const failureReason = extractFailureReasons(result);

      await circuitBreakerFlow({
        issue_id: issueId,
        observation: "failure",
        failure_reason: failureReason,
        persistence,
      });
    }

    // Half-open probe
    const halfOpenEnvelope = await circuitBreakerFlow({
      issue_id: issueId,
      observation: "half_open",
      persistence,
    });

    expect(halfOpenEnvelope.record.state).toBe("HALF_OPEN");
    expect(halfOpenEnvelope.transition_reason).toBe("half_open_probe_started");
    expect(halfOpenEnvelope.previous_state).toBe("OPEN");

    // Success after half-open → CLOSED
    const successEnvelope = await circuitBreakerFlow({
      issue_id: issueId,
      observation: "success",
      persistence,
    });

    expect(successEnvelope.record.state).toBe("CLOSED");
    expect(successEnvelope.transition_reason).toBe("half_open_probe_succeeded");
    expect(successEnvelope.previous_state).toBe("HALF_OPEN");
    expect(successEnvelope.record.attempt_count).toBe(0);
    expect(successEnvelope.record.last_failure_at).toBeNull();
    expect(successEnvelope.record.last_failure_reason).toBeNull();
    expect(successEnvelope.record.opened_at).toBeNull();
  });

  it("failure_reason contains actionable diagnostics from verification checks", async () => {
    const issueId = "issue_cb_006";
    const snapshotId = "snapshot_cb_006";
    const missionId = "mission_cb_006";

    const statusPayload = await runDiv4Pipeline(snapshotId, missionId);

    // Tamper: delete smoke file
    const smokePath = join(tempDir, ".bos-smoke-test.md");
    rmSync(smokePath);

    clearPacketRouter();
    const result = runDiv5Verification(snapshotId, statusPayload);
    const failureReason = extractFailureReasons(result);

    expect(failureReason).toContain("smoke_file_exists");
    expect(failureReason).toContain("not found");

    const envelope = await circuitBreakerFlow({
      issue_id: issueId,
      observation: "failure",
      failure_reason: failureReason,
      persistence,
    });

    expect(envelope.record.last_failure_reason).toBe(failureReason);
    expect(envelope.failure_reason).toBe(failureReason);
  });

  it("multiple issues maintain independent circuit breaker state", async () => {
    const issue1 = "issue_cb_007a";
    const issue2 = "issue_cb_007b";
    const snapshotId = "snapshot_cb_007";
    const missionId = "mission_cb_007";

    const statusPayload = await runDiv4Pipeline(snapshotId, missionId);

    // Feed 2 failures to issue1 (not enough to open)
    for (let i = 0; i < 2; i++) {
      const smokePath = join(tempDir, ".bos-smoke-test.md");
      try { rmSync(smokePath); } catch { /* may already be deleted */ }

      clearPacketRouter();
      const result = runDiv5Verification(snapshotId, statusPayload);
      const failureReason = extractFailureReasons(result);

      await circuitBreakerFlow({
        issue_id: issue1,
        observation: "failure",
        failure_reason: failureReason,
        persistence,
      });
    }

    // Feed 3 failures to issue2 (opens circuit)
    for (let i = 0; i < 3; i++) {
      const smokePath = join(tempDir, ".bos-smoke-test.md");
      try { rmSync(smokePath); } catch { /* may already be deleted */ }

      clearPacketRouter();
      const result = runDiv5Verification(snapshotId, statusPayload);
      const failureReason = extractFailureReasons(result);

      await circuitBreakerFlow({
        issue_id: issue2,
        observation: "failure",
        failure_reason: failureReason,
        persistence,
      });
    }

    // Check issue1 state via a success observation
    const issue1Success = await circuitBreakerFlow({
      issue_id: issue1,
      observation: "success",
      persistence,
    });
    expect(issue1Success.record.state).toBe("CLOSED");

    // Check issue2 state — should still be OPEN
    const issue2Check = await circuitBreakerFlow({
      issue_id: issue2,
      observation: "failure",
      failure_reason: "test additional failure",
      persistence,
    });
    expect(issue2Check.record.state).toBe("OPEN");
  });

  it("circuit breaker envelope includes polling config", async () => {
    const issueId = "issue_cb_008";

    const envelope = await circuitBreakerFlow({
      issue_id: issueId,
      observation: "failure",
      failure_reason: "test failure",
      persistence,
    });

    expect(envelope.polling_config).toBeDefined();
    expect(envelope.polling_config.poll_scope).toBe("ACTIVE_RUNS_ONLY");
    expect(envelope.polling_config.interval_ms).toBe(30000);
    expect(envelope.polling_config.jitter_ms).toBe(5000);
    expect(envelope.polling_config.max_retries).toBe(60);
    expect(envelope.polling_config.fallback_source).toBe("activity_log");
  });

  it("circuit breaker envelope includes markdown artifact", async () => {
    const issueId = "issue_cb_009";

    const envelope = await circuitBreakerFlow({
      issue_id: issueId,
      observation: "failure",
      failure_reason: "test failure for markdown",
      persistence,
    });

    expect(envelope.markdown).toBeDefined();
    expect(typeof envelope.markdown).toBe("string");
    expect(envelope.markdown).toContain("BOS Circuit Breaker Observation");
    expect(envelope.markdown).toContain(issueId);
    expect(envelope.markdown).toContain("failure");
  });

  it("invalid input produces validation envelope", async () => {
    const envelope = await circuitBreakerFlow({
      issue_id: "",
      observation: "failure",
      failure_reason: "test",
      persistence,
    });

    expect(envelope.transition_reason).toBe("invalid_input");
    expect(envelope.fallback.reason).toBe("invalid_input");
    expect(envelope.fallback.validation_error).toBeDefined();
  });
});
