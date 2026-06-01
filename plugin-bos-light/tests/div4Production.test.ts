import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  executeProductionWork,
  type ExecuteProductionWorkResult,
} from "../src/div4Production";
import {
  emitDivisionPacket,
  getDivisionInbox,
  clearPacketRouter,
} from "../src/divisionPacketRouter";
import type { Division, ProductionWorkEvidence } from "../src/contracts";
import type { GitCommandEvidence, GitOperations } from "../src/gitOperations";
import { spawn, type ChildProcess } from "child_process";
import { EventEmitter } from "events";

vi.mock("child_process", () => ({
  spawn: vi.fn(),
}));

vi.mock("fs", () => ({
  writeFileSync: vi.fn(),
}));

import * as fs from "fs";

const ALL_DIVISIONS: Division[] = [
  "Div7.MissionControl",
  "Div1.HCO",
  "Div2.MasterPlanner",
  "Div3.Treasury",
  "Div4.Production",
  "Div5.QualificationsLibraryLearning",
  "Div6.External",
];

function makeGateDecisionPayload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    quarantine_ref: "quarantine_12345_abc123",
    mission_id: "mission_001",
    grant_id: "grant_001",
    secret_scan_passed: true,
    snapshot_id: "snapshot_12345_abc123",
    approved_for_division: "Div4.Production",
    approved_at: new Date().toISOString(),
    branch_inventory: ["main"],
    ref_inventory: ["refs/heads/main"],
    commit_shas: ["abc123def456789012345678901234567890abcd"],
    local_path: "/tmp/test-repo",
    ...overrides,
  };
}

function seedGateDecision(payload: Record<string, unknown>): void {
  emitDivisionPacket("Div5.QualificationsLibraryLearning", "Div4.Production", "gate_decision", payload);
}

function createMockGitOps(options: {
  checkoutSuccess?: boolean;
  addSuccess?: boolean;
  commitSuccess?: boolean;
} = {}): GitOperations {
  const {
    checkoutSuccess = true,
    addSuccess = true,
    commitSuccess = true,
  } = options;

  return {
    clone: vi.fn(),
    checkoutBranch: vi.fn().mockResolvedValue({
      command: "git",
      args: ["checkout", "-b", "bos-smoke-test/12345"],
      cwd: "/tmp/test-repo",
      env_keys: [],
      exit_code: checkoutSuccess ? 0 : 1,
      stdout_hash: "abc",
      stderr_hash: "def",
      duration_ms: 50,
      success: checkoutSuccess,
      error_category: checkoutSuccess ? "none" : "generic",
      redacted_diagnostics: checkoutSuccess ? "OK" : "checkout failed",
    } as GitCommandEvidence),
    add: vi.fn().mockResolvedValue({
      command: "git",
      args: ["add", ".bos-smoke-test.md"],
      cwd: "/tmp/test-repo",
      env_keys: [],
      exit_code: addSuccess ? 0 : 1,
      stdout_hash: "abc",
      stderr_hash: "def",
      duration_ms: 30,
      success: addSuccess,
      error_category: addSuccess ? "none" : "generic",
      redacted_diagnostics: addSuccess ? "OK" : "add failed",
    } as GitCommandEvidence),
    commit: vi.fn().mockResolvedValue({
      command: "git",
      args: ["commit", "-m", "chore(bos): smoke test"],
      cwd: "/tmp/test-repo",
      env_keys: [],
      exit_code: commitSuccess ? 0 : 1,
      stdout_hash: "abc",
      stderr_hash: "def",
      duration_ms: 40,
      success: commitSuccess,
      error_category: commitSuccess ? "none" : "generic",
      redacted_diagnostics: commitSuccess ? "OK" : "commit failed",
    } as GitCommandEvidence),
    push: vi.fn(),
    lsRemote: vi.fn(),
    fetch: vi.fn(),
  };
}

describe("executeProductionWork", () => {
  let mockChild: EventEmitter & { stdout: EventEmitter; stderr: EventEmitter };

  beforeEach(() => {
    clearPacketRouter();
    mockChild = Object.assign(new EventEmitter(), {
      stdout: new EventEmitter(),
      stderr: new EventEmitter(),
    });
    vi.mocked(spawn).mockReturnValue(mockChild as unknown as ChildProcess);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  function emitRevParseSuccess(sha: string) {
    process.nextTick(() => {
      mockChild.stdout.emit("data", `${sha}\n`);
      mockChild.emit("close", 0);
    });
  }

  function emitRevParseFailure(exitCode: number) {
    process.nextTick(() => {
      mockChild.stderr.emit("data", "fatal: not a git repository\n");
      mockChild.emit("close", exitCode);
    });
  }

  it("rejects non-Div4 callers with Div4ProductionUnauthorized", async () => {
    const nonDiv4 = ALL_DIVISIONS.filter((d) => d !== "Div4.Production");

    for (const caller of nonDiv4) {
      clearPacketRouter();
      const result = await executeProductionWork(
        caller,
        "snapshot_12345_abc123"
      );

      expect("authorized" in result).toBe(true);
      const unauthorized = result as Extract<ExecuteProductionWorkResult, { authorized: false }>;
      expect(unauthorized.authorized).toBe(false);
      expect(unauthorized.caller).toBe(caller);
      expect(unauthorized.required_role).toBe("Div4.Production");
      expect(unauthorized.reason).toContain("Div4.Production");
      expect(unauthorized.rejected_at).toBeDefined();
    }
  });

  it("rejects empty snapshotId", async () => {
    const result = await executeProductionWork("Div4.Production", "");
    expect("authorized" in result).toBe(true);
    const unauthorized = result as Extract<ExecuteProductionWorkResult, { authorized: false }>;
    expect(unauthorized.reason).toContain("snapshotId");
  });

  it("rejects when no gate_decision is found in Div4 inbox", async () => {
    const result = await executeProductionWork(
      "Div4.Production",
      "snapshot_12345_abc123"
    );

    expect("authorized" in result).toBe(true);
    const unauthorized = result as Extract<ExecuteProductionWorkResult, { authorized: false }>;
    expect(unauthorized.reason).toContain("gate_decision");
    expect(unauthorized.reason).toContain("snapshot_12345_abc123");
  });

  it("rejects when approved_for_division is not Div4.Production", async () => {
    const payload = makeGateDecisionPayload({ approved_for_division: "Div6.External" });
    seedGateDecision(payload);

    const result = await executeProductionWork(
      "Div4.Production",
      payload.snapshot_id as string
    );

    expect("authorized" in result).toBe(true);
    const unauthorized = result as Extract<ExecuteProductionWorkResult, { authorized: false }>;
    expect(unauthorized.reason).toContain("approved_for_division");
  });

  it("rejects when secret_scan_passed is false", async () => {
    const payload = makeGateDecisionPayload({ secret_scan_passed: false });
    seedGateDecision(payload);

    const result = await executeProductionWork(
      "Div4.Production",
      payload.snapshot_id as string
    );

    expect("authorized" in result).toBe(true);
    const unauthorized = result as Extract<ExecuteProductionWorkResult, { authorized: false }>;
    expect(unauthorized.reason).toContain("secret_scan_passed");
  });

  it("rejects when local_path is missing", async () => {
    const payload = makeGateDecisionPayload();
    delete payload.local_path;
    seedGateDecision(payload);

    const result = await executeProductionWork(
      "Div4.Production",
      payload.snapshot_id as string
    );

    expect("authorized" in result).toBe(true);
    const unauthorized = result as Extract<ExecuteProductionWorkResult, { authorized: false }>;
    expect(unauthorized.reason).toContain("local_path");
  });

  it("rejects when local_path is empty string", async () => {
    const payload = makeGateDecisionPayload({ local_path: "" });
    seedGateDecision(payload);

    const result = await executeProductionWork(
      "Div4.Production",
      payload.snapshot_id as string
    );

    expect("authorized" in result).toBe(true);
    const unauthorized = result as Extract<ExecuteProductionWorkResult, { authorized: false }>;
    expect(unauthorized.reason).toContain("local_path");
  });

  it("rejects when checkoutBranch fails", async () => {
    const payload = makeGateDecisionPayload();
    seedGateDecision(payload);

    const mockGitOps = createMockGitOps({ checkoutSuccess: false });

    const result = await executeProductionWork(
      "Div4.Production",
      payload.snapshot_id as string,
      mockGitOps
    );

    expect("authorized" in result).toBe(true);
    const unauthorized = result as Extract<ExecuteProductionWorkResult, { authorized: false }>;
    expect(unauthorized.reason).toContain("Failed to create test branch");
  });

  it("rejects when add fails", async () => {
    const payload = makeGateDecisionPayload();
    seedGateDecision(payload);

    const mockGitOps = createMockGitOps({ addSuccess: false });

    const result = await executeProductionWork(
      "Div4.Production",
      payload.snapshot_id as string,
      mockGitOps
    );

    expect("authorized" in result).toBe(true);
    const unauthorized = result as Extract<ExecuteProductionWorkResult, { authorized: false }>;
    expect(unauthorized.reason).toContain("Failed to add smoke test file");
  });

  it("rejects when commit fails", async () => {
    const payload = makeGateDecisionPayload();
    seedGateDecision(payload);

    const mockGitOps = createMockGitOps({ commitSuccess: false });

    const result = await executeProductionWork(
      "Div4.Production",
      payload.snapshot_id as string,
      mockGitOps
    );

    expect("authorized" in result).toBe(true);
    const unauthorized = result as Extract<ExecuteProductionWorkResult, { authorized: false }>;
    expect(unauthorized.reason).toContain("Failed to commit smoke test file");
  });

  it("rejects when rev-parse fails", async () => {
    const payload = makeGateDecisionPayload();
    seedGateDecision(payload);

    const mockGitOps = createMockGitOps();
    emitRevParseFailure(128);

    const result = await executeProductionWork(
      "Div4.Production",
      payload.snapshot_id as string,
      mockGitOps
    );

    expect("authorized" in result).toBe(true);
    const unauthorized = result as Extract<ExecuteProductionWorkResult, { authorized: false }>;
    expect(unauthorized.reason).toContain("HEAD commit SHA");
  });

  it("succeeds and produces ProductionWorkEvidence when all validations pass", async () => {
    const payload = makeGateDecisionPayload();
    seedGateDecision(payload);

    const mockGitOps = createMockGitOps();
    emitRevParseSuccess("deadbeefdeadbeefdeadbeefdeadbeefdeadbeef");

    const result = await executeProductionWork(
      "Div4.Production",
      payload.snapshot_id as string,
      mockGitOps
    );

    expect("authorized" in result).toBe(true);
    const success = result as Extract<ExecuteProductionWorkResult, { authorized: true }>;
    expect(success.authorized).toBe(true);
    expect(success.evidence).toBeDefined();
    expect(success.evidence.schema_version).toBe("1.0");
    expect(success.evidence.mission_id).toBe("mission_001");
    expect(success.evidence.snapshot_id).toBe(payload.snapshot_id);
    expect(success.evidence.commit_sha).toBe("deadbeefdeadbeefdeadbeefdeadbeefdeadbeef");
    expect(success.evidence.diff_hash).toBeDefined();
    expect(success.evidence.diff_hash).toHaveLength(64);
    expect(success.evidence.branch_created).toMatch(/^bos-smoke-test\/\d+$/);
    expect(success.evidence.files_changed).toEqual([".bos-smoke-test.md"]);
    expect(success.evidence.pushed).toBe(false);
    expect(success.evidence.produced_by).toBe("Div4.Production");
    expect(success.evidence.produced_at).toBeDefined();
  });

  it("writes smoke test file to local_path", async () => {
    const payload = makeGateDecisionPayload();
    seedGateDecision(payload);

    const mockGitOps = createMockGitOps();
    emitRevParseSuccess("abc123");

    await executeProductionWork(
      "Div4.Production",
      payload.snapshot_id as string,
      mockGitOps
    );

    expect(fs.writeFileSync).toHaveBeenCalled();
    const writeCall = vi.mocked(fs.writeFileSync).mock.calls[0];
    expect(writeCall[0]).toBe("/tmp/test-repo/.bos-smoke-test.md");
    expect(typeof writeCall[1]).toBe("string");
    expect(writeCall[2]).toBe("utf-8");
  });

  it("emits completion_report to Div1.HCO on success", async () => {
    const payload = makeGateDecisionPayload();
    seedGateDecision(payload);

    const mockGitOps = createMockGitOps();
    emitRevParseSuccess("abc123");

    await executeProductionWork(
      "Div4.Production",
      payload.snapshot_id as string,
      mockGitOps
    );

    const div1Inbox = getDivisionInbox("Div1.HCO");
    expect(div1Inbox.length).toBe(1);
    expect(div1Inbox[0].packet_type).toBe("completion_report");
    expect(div1Inbox[0].from_division).toBe("Div4.Production");
    expect(div1Inbox[0].to_division).toBe("Div1.HCO");

    const reportPayload = div1Inbox[0].payload as Record<string, unknown>;
    expect(reportPayload.mission_id).toBe("mission_001");
    expect(reportPayload.snapshot_id).toBe(payload.snapshot_id);
    expect(reportPayload.commit_sha).toBe("abc123");
    expect(reportPayload.pushed).toBe(false);
    expect(reportPayload.status).toBe("COMPLETED");
  });

  it("emits status_update to Div5.QualificationsLibraryLearning on success", async () => {
    const payload = makeGateDecisionPayload();
    seedGateDecision(payload);

    const mockGitOps = createMockGitOps();
    emitRevParseSuccess("abc123");

    await executeProductionWork(
      "Div4.Production",
      payload.snapshot_id as string,
      mockGitOps
    );

    const div5Inbox = getDivisionInbox("Div5.QualificationsLibraryLearning");
    expect(div5Inbox.length).toBe(1);
    expect(div5Inbox[0].packet_type).toBe("status_update");
    expect(div5Inbox[0].from_division).toBe("Div4.Production");
    expect(div5Inbox[0].to_division).toBe("Div5.QualificationsLibraryLearning");

    const statusPayload = div5Inbox[0].payload as Record<string, unknown>;
    expect(statusPayload.mission_id).toBe("mission_001");
    expect(statusPayload.snapshot_id).toBe(payload.snapshot_id);
    expect(statusPayload.pushed).toBe(false);
    expect(statusPayload.status).toBe("COMPLETED");
  });

  it("does not emit packets on validation failure", async () => {
    const payload = makeGateDecisionPayload({ secret_scan_passed: false });
    seedGateDecision(payload);

    await executeProductionWork(
      "Div4.Production",
      payload.snapshot_id as string
    );

    expect(getDivisionInbox("Div1.HCO").length).toBe(0);
    expect(getDivisionInbox("Div5.QualificationsLibraryLearning").length).toBe(0);
  });

  it("does not call push at any point", async () => {
    const payload = makeGateDecisionPayload();
    seedGateDecision(payload);

    const mockGitOps = createMockGitOps();
    emitRevParseSuccess("abc123");

    await executeProductionWork(
      "Div4.Production",
      payload.snapshot_id as string,
      mockGitOps
    );

    expect(mockGitOps.push).not.toHaveBeenCalled();
  });

  it("uses injected GitOperations when provided", async () => {
    const payload = makeGateDecisionPayload();
    seedGateDecision(payload);

    const mockGitOps = createMockGitOps();
    emitRevParseSuccess("abc123");

    await executeProductionWork(
      "Div4.Production",
      payload.snapshot_id as string,
      mockGitOps
    );

    expect(mockGitOps.checkoutBranch).toHaveBeenCalled();
    expect(mockGitOps.add).toHaveBeenCalled();
    expect(mockGitOps.commit).toHaveBeenCalled();
  });

  it("isolates packet state between tests", async () => {
    const payload = makeGateDecisionPayload();
    seedGateDecision(payload);

    const mockGitOps = createMockGitOps();
    emitRevParseSuccess("abc123");

    await executeProductionWork(
      "Div4.Production",
      payload.snapshot_id as string,
      mockGitOps
    );

    expect(getDivisionInbox("Div1.HCO").length).toBe(1);
    expect(getDivisionInbox("Div5.QualificationsLibraryLearning").length).toBe(1);

    clearPacketRouter();
    expect(getDivisionInbox("Div1.HCO").length).toBe(0);
    expect(getDivisionInbox("Div5.QualificationsLibraryLearning").length).toBe(0);
  });

  it("selects correct gate_decision when multiple are in inbox", async () => {
    const payload1 = makeGateDecisionPayload({ snapshot_id: "snapshot_111_aaa", mission_id: "mission_111" });
    const payload2 = makeGateDecisionPayload({ snapshot_id: "snapshot_222_bbb", mission_id: "mission_222" });
    seedGateDecision(payload1);
    seedGateDecision(payload2);

    const mockGitOps = createMockGitOps();
    emitRevParseSuccess("abc123");

    const result = await executeProductionWork(
      "Div4.Production",
      "snapshot_222_bbb",
      mockGitOps
    );

    expect("authorized" in result).toBe(true);
    const success = result as Extract<ExecuteProductionWorkResult, { authorized: true }>;
    expect(success.evidence.mission_id).toBe("mission_222");
  });

  it("defaults mission_id to 'unknown' when missing from payload", async () => {
    const payload = makeGateDecisionPayload();
    delete payload.mission_id;
    seedGateDecision(payload);

    const mockGitOps = createMockGitOps();
    emitRevParseSuccess("abc123");

    const result = await executeProductionWork(
      "Div4.Production",
      payload.snapshot_id as string,
      mockGitOps
    );

    expect("authorized" in result).toBe(true);
    const success = result as Extract<ExecuteProductionWorkResult, { authorized: true }>;
    expect(success.evidence.mission_id).toBe("unknown");
  });

  it("computes deterministic diff_hash from smoke test content", async () => {
    const payload = makeGateDecisionPayload();
    seedGateDecision(payload);

    const mockGitOps = createMockGitOps();
    emitRevParseSuccess("abc123");

    const result = await executeProductionWork(
      "Div4.Production",
      payload.snapshot_id as string,
      mockGitOps
    );

    expect("authorized" in result).toBe(true);
    const success = result as Extract<ExecuteProductionWorkResult, { authorized: true }>;

    // Verify diff_hash is a 64-char hex string (sha256)
    expect(success.evidence.diff_hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("rejects when secret_scan_passed is truthy but not boolean true", async () => {
    const payload = makeGateDecisionPayload({ secret_scan_passed: "yes" });
    seedGateDecision(payload);

    const result = await executeProductionWork(
      "Div4.Production",
      payload.snapshot_id as string
    );

    const unauthorized = result as Extract<ExecuteProductionWorkResult, { authorized: false }>;
    expect(unauthorized.authorized).toBe(false);
    expect(unauthorized.reason).toContain("secret_scan_passed");
  });

  it("rejects when snapshotId is whitespace-only", async () => {
    const result = await executeProductionWork("Div4.Production", "   ");
    const unauthorized = result as Extract<ExecuteProductionWorkResult, { authorized: false }>;
    expect(unauthorized.authorized).toBe(false);
    expect(unauthorized.reason).toContain("snapshotId");
  });

  it("rejects when local_path is whitespace-only", async () => {
    const payload = makeGateDecisionPayload({ local_path: "   " });
    seedGateDecision(payload);

    const result = await executeProductionWork(
      "Div4.Production",
      payload.snapshot_id as string
    );

    const unauthorized = result as Extract<ExecuteProductionWorkResult, { authorized: false }>;
    expect(unauthorized.authorized).toBe(false);
    expect(unauthorized.reason).toContain("local_path");
  });

  it("rejects when git rev-parse emits an error event", async () => {
    const payload = makeGateDecisionPayload();
    seedGateDecision(payload);

    const mockGitOps = createMockGitOps();

    process.nextTick(() => {
      mockChild.emit("error", new Error("ENOENT: no such file or directory"));
    });

    const result = await executeProductionWork(
      "Div4.Production",
      payload.snapshot_id as string,
      mockGitOps
    );

    const unauthorized = result as Extract<ExecuteProductionWorkResult, { authorized: false }>;
    expect(unauthorized.authorized).toBe(false);
    expect(unauthorized.reason).toContain("HEAD commit SHA");
  });

  it("emitted packets contain diff_hash in completion_report", async () => {
    const payload = makeGateDecisionPayload();
    seedGateDecision(payload);

    const mockGitOps = createMockGitOps();
    emitRevParseSuccess("abc123");

    await executeProductionWork(
      "Div4.Production",
      payload.snapshot_id as string,
      mockGitOps
    );

    const div1Inbox = getDivisionInbox("Div1.HCO");
    const reportPayload = div1Inbox[0].payload as Record<string, unknown>;
    expect(reportPayload.diff_hash).toBeDefined();
    expect(typeof reportPayload.diff_hash).toBe("string");
    expect(reportPayload.diff_hash).toHaveLength(64);
  });

  it("emitted packets contain branch_created", async () => {
    const payload = makeGateDecisionPayload();
    seedGateDecision(payload);

    const mockGitOps = createMockGitOps();
    emitRevParseSuccess("abc123");

    await executeProductionWork(
      "Div4.Production",
      payload.snapshot_id as string,
      mockGitOps
    );

    const div1Inbox = getDivisionInbox("Div1.HCO");
    const reportPayload = div1Inbox[0].payload as Record<string, unknown>;
    expect(reportPayload.branch_created).toMatch(/^bos-smoke-test\/\d+$/);

    const div5Inbox = getDivisionInbox("Div5.QualificationsLibraryLearning");
    const statusPayload = div5Inbox[0].payload as Record<string, unknown>;
    expect(statusPayload.branch_created).toMatch(/^bos-smoke-test\/\d+$/);
  });

  it("emitted completion_report contains files_changed", async () => {
    const payload = makeGateDecisionPayload();
    seedGateDecision(payload);

    const mockGitOps = createMockGitOps();
    emitRevParseSuccess("abc123");

    await executeProductionWork(
      "Div4.Production",
      payload.snapshot_id as string,
      mockGitOps
    );

    const div1Inbox = getDivisionInbox("Div1.HCO");
    const reportPayload = div1Inbox[0].payload as Record<string, unknown>;
    expect(reportPayload.files_changed).toEqual([".bos-smoke-test.md"]);
  });
});
