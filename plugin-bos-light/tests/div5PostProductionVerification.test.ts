import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  verifyProductionWork,
  type PostProductionVerificationResult,
} from "../src/div5PostProductionVerification";
import {
  emitDivisionPacket,
  getDivisionInbox,
  clearPacketRouter,
} from "../src/divisionPacketRouter";
import type { Division, PostProductionCheck } from "../src/contracts";
import type { GitOperations } from "../src/gitOperations";

vi.mock("child_process", () => ({
  execSync: vi.fn(),
  spawn: vi.fn(),
}));

vi.mock("fs", () => ({
  existsSync: vi.fn(),
  statSync: vi.fn(),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  readdirSync: vi.fn(),
}));

import { execSync } from "child_process";
import { existsSync } from "fs";

const ALL_DIVISIONS: Division[] = [
  "Div7.MissionControl",
  "Div1.HCO",
  "Div2.MasterPlanner",
  "Div3.Treasury",
  "Div4.Production",
  "Div5.QualificationsLibraryLearning",
  "Div6.External",
];

function makeStatusUpdatePayload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    mission_id: "mission_001",
    snapshot_id: "snapshot_12345_abc123",
    commit_sha: "deadbeefdeadbeefdeadbeefdeadbeefdeadbeef",
    branch_created: "bos-smoke-test/1717200000000",
    local_path: "/tmp/test-repo",
    pushed: false,
    status: "COMPLETED",
    ...overrides,
  };
}

function seedStatusUpdate(payload: Record<string, unknown>): void {
  emitDivisionPacket(
    "Div4.Production",
    "Div5.QualificationsLibraryLearning",
    "status_update",
    payload
  );
}

function mockExecSync(behavior: Record<string, string | Error>): void {
  vi.mocked(execSync).mockImplementation((cmd: string) => {
    const key = cmd.replace(/^git\s+/, "");
    for (const [pattern, result] of Object.entries(behavior)) {
      if (key.startsWith(pattern) || key === pattern) {
        if (result instanceof Error) throw result;
        return result;
      }
    }
    throw new Error(`Unexpected git command: ${cmd}`);
  });
}

function setupAllChecksPass(): void {
  mockExecSync({
    "branch": "  main\n* bos-smoke-test/1717200000000",
    "rev-parse bos-smoke-test/1717200000000": "deadbeefdeadbeefdeadbeefdeadbeefdeadbeef",
    "diff-tree": ".bos-smoke-test.md",
    "remote": "",
    "rev-parse main": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    "rev-parse --abbrev-ref HEAD": "bos-smoke-test/1717200000000",
  });
  vi.mocked(existsSync).mockReturnValue(true);
}

function getVerdict(result: PostProductionVerificationResult) {
  if (!("authorized" in result) || !result.authorized) {
    throw new Error("Expected authorized result");
  }
  return result.verdict;
}

function getCheck(verdict: { checks: PostProductionCheck[] }, checkId: string): PostProductionCheck {
  const check = verdict.checks.find((c) => c.check_id === checkId);
  if (!check) throw new Error(`Check '${checkId}' not found`);
  return check;
}

describe("verifyProductionWork", () => {
  beforeEach(() => {
    clearPacketRouter();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ── Authorization tests ──

  it("rejects non-Div5 callers with Div5PostProductionUnauthorized", () => {
    const nonDiv5 = ALL_DIVISIONS.filter((d) => d !== "Div5.QualificationsLibraryLearning");

    for (const caller of nonDiv5) {
      clearPacketRouter();
      const result = verifyProductionWork(caller, "snapshot_12345_abc123");

      expect("authorized" in result).toBe(true);
      const unauthorized = result as Extract<PostProductionVerificationResult, { authorized: false }>;
      expect(unauthorized.authorized).toBe(false);
      expect(unauthorized.caller).toBe(caller);
      expect(unauthorized.required_role).toBe("Div5.QualificationsLibraryLearning");
      expect(unauthorized.reason).toContain("Div5.QualificationsLibraryLearning");
      expect(unauthorized.schema_version).toBe("1.0");
      expect(unauthorized.rejected_at).toBeDefined();
    }
  });

  it("rejects empty snapshotId", () => {
    const result = verifyProductionWork("Div5.QualificationsLibraryLearning", "");
    expect("authorized" in result).toBe(true);
    const unauthorized = result as Extract<PostProductionVerificationResult, { authorized: false }>;
    expect(unauthorized.authorized).toBe(false);
    expect(unauthorized.reason).toContain("snapshotId");
  });

  it("rejects whitespace-only snapshotId", () => {
    const result = verifyProductionWork("Div5.QualificationsLibraryLearning", "   ");
    const unauthorized = result as Extract<PostProductionVerificationResult, { authorized: false }>;
    expect(unauthorized.authorized).toBe(false);
    expect(unauthorized.reason).toContain("snapshotId");
  });

  it("rejects when no status_update is found in Div5 inbox", () => {
    const result = verifyProductionWork(
      "Div5.QualificationsLibraryLearning",
      "snapshot_12345_abc123"
    );

    const unauthorized = result as Extract<PostProductionVerificationResult, { authorized: false }>;
    expect(unauthorized.authorized).toBe(false);
    expect(unauthorized.reason).toContain("status_update");
    expect(unauthorized.reason).toContain("snapshot_12345_abc123");
  });

  it("rejects when local_path is missing from status_update", () => {
    const payload = makeStatusUpdatePayload();
    delete payload.local_path;
    seedStatusUpdate(payload);

    const result = verifyProductionWork(
      "Div5.QualificationsLibraryLearning",
      "snapshot_12345_abc123"
    );

    const unauthorized = result as Extract<PostProductionVerificationResult, { authorized: false }>;
    expect(unauthorized.authorized).toBe(false);
    expect(unauthorized.reason).toContain("local_path");
  });

  it("rejects when local_path is empty string", () => {
    seedStatusUpdate(makeStatusUpdatePayload({ local_path: "" }));

    const result = verifyProductionWork(
      "Div5.QualificationsLibraryLearning",
      "snapshot_12345_abc123"
    );

    const unauthorized = result as Extract<PostProductionVerificationResult, { authorized: false }>;
    expect(unauthorized.authorized).toBe(false);
    expect(unauthorized.reason).toContain("local_path");
  });

  it("rejects when local_path is whitespace-only", () => {
    seedStatusUpdate(makeStatusUpdatePayload({ local_path: "   " }));

    const result = verifyProductionWork(
      "Div5.QualificationsLibraryLearning",
      "snapshot_12345_abc123"
    );

    const unauthorized = result as Extract<PostProductionVerificationResult, { authorized: false }>;
    expect(unauthorized.authorized).toBe(false);
    expect(unauthorized.reason).toContain("local_path");
  });

  // ── Individual check tests ──

  it("branch_exists: passes when branch is in git branch output", () => {
    seedStatusUpdate(makeStatusUpdatePayload());
    setupAllChecksPass();

    const result = verifyProductionWork(
      "Div5.QualificationsLibraryLearning",
      "snapshot_12345_abc123"
    );

    const verdict = getVerdict(result);
    const check = getCheck(verdict, "branch_exists");
    expect(check.passed).toBe(true);
    expect(check.detail).toContain("found");
  });

  it("branch_exists: fails when branch is not in git branch output", () => {
    seedStatusUpdate(makeStatusUpdatePayload());
    setupAllChecksPass();
    mockExecSync({
      "branch": "  main\n  other-branch",
      "rev-parse bos-smoke-test/1717200000000": "deadbeefdeadbeefdeadbeefdeadbeefdeadbeef",
      "diff-tree": ".bos-smoke-test.md",
      "remote": "",
      "rev-parse main": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      "rev-parse --abbrev-ref HEAD": "bos-smoke-test/1717200000000",
    });

    const result = verifyProductionWork(
      "Div5.QualificationsLibraryLearning",
      "snapshot_12345_abc123"
    );

    const verdict = getVerdict(result);
    const check = getCheck(verdict, "branch_exists");
    expect(check.passed).toBe(false);
    expect(check.detail).toContain("not found");
  });

  it("commit_sha_matches_head: passes when SHA matches", () => {
    seedStatusUpdate(makeStatusUpdatePayload());
    setupAllChecksPass();

    const result = verifyProductionWork(
      "Div5.QualificationsLibraryLearning",
      "snapshot_12345_abc123"
    );

    const verdict = getVerdict(result);
    const check = getCheck(verdict, "commit_sha_matches_head");
    expect(check.passed).toBe(true);
  });

  it("commit_sha_matches_head: fails when SHA does not match", () => {
    seedStatusUpdate(makeStatusUpdatePayload());
    mockExecSync({
      "branch": "  main\n* bos-smoke-test/1717200000000",
      "rev-parse bos-smoke-test/1717200000000": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      "diff-tree": ".bos-smoke-test.md",
      "remote": "",
      "rev-parse main": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      "rev-parse --abbrev-ref HEAD": "bos-smoke-test/1717200000000",
    });
    vi.mocked(existsSync).mockReturnValue(true);

    const result = verifyProductionWork(
      "Div5.QualificationsLibraryLearning",
      "snapshot_12345_abc123"
    );

    const verdict = getVerdict(result);
    const check = getCheck(verdict, "commit_sha_matches_head");
    expect(check.passed).toBe(false);
    expect(check.detail).toContain("Expected");
    expect(check.detail).toContain("got");
  });

  it("smoke_file_exists: passes when file exists", () => {
    seedStatusUpdate(makeStatusUpdatePayload());
    setupAllChecksPass();
    vi.mocked(existsSync).mockReturnValue(true);

    const result = verifyProductionWork(
      "Div5.QualificationsLibraryLearning",
      "snapshot_12345_abc123"
    );

    const verdict = getVerdict(result);
    const check = getCheck(verdict, "smoke_file_exists");
    expect(check.passed).toBe(true);
    expect(check.detail).toContain("found");
  });

  it("smoke_file_exists: fails when file does not exist", () => {
    seedStatusUpdate(makeStatusUpdatePayload());
    setupAllChecksPass();
    vi.mocked(existsSync).mockReturnValue(false);

    const result = verifyProductionWork(
      "Div5.QualificationsLibraryLearning",
      "snapshot_12345_abc123"
    );

    const verdict = getVerdict(result);
    const check = getCheck(verdict, "smoke_file_exists");
    expect(check.passed).toBe(false);
    expect(check.detail).toContain("not found");
  });

  it("files_changed_present: passes when all files exist on disk", () => {
    seedStatusUpdate(makeStatusUpdatePayload());
    setupAllChecksPass();
    vi.mocked(existsSync).mockReturnValue(true);

    const result = verifyProductionWork(
      "Div5.QualificationsLibraryLearning",
      "snapshot_12345_abc123"
    );

    const verdict = getVerdict(result);
    const check = getCheck(verdict, "files_changed_present");
    expect(check.passed).toBe(true);
    expect(check.detail).toContain("All");
  });

  it("files_changed_present: fails when some files are missing", () => {
    seedStatusUpdate(makeStatusUpdatePayload());
    mockExecSync({
      "branch": "  main\n* bos-smoke-test/1717200000000",
      "rev-parse bos-smoke-test/1717200000000": "deadbeefdeadbeefdeadbeefdeadbeefdeadbeef",
      "diff-tree": ".bos-smoke-test.md\nmissing-file.txt",
      "remote": "",
      "rev-parse main": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      "rev-parse --abbrev-ref HEAD": "bos-smoke-test/1717200000000",
    });
    // First call for smoke_file_exists returns true, then alternates
    let callCount = 0;
    vi.mocked(existsSync).mockImplementation(() => {
      callCount++;
      // First call: smoke file exists
      if (callCount === 1) return true;
      // Second call: .bos-smoke-test.md in files_changed check
      if (callCount === 2) return true;
      // Third call: missing-file.txt in files_changed check
      return false;
    });

    const result = verifyProductionWork(
      "Div5.QualificationsLibraryLearning",
      "snapshot_12345_abc123"
    );

    const verdict = getVerdict(result);
    const check = getCheck(verdict, "files_changed_present");
    expect(check.passed).toBe(false);
    expect(check.detail).toContain("Missing");
    expect(check.detail).toContain("missing-file.txt");
  });

  it("not_pushed: passes when no remotes configured", () => {
    seedStatusUpdate(makeStatusUpdatePayload());
    setupAllChecksPass();

    const result = verifyProductionWork(
      "Div5.QualificationsLibraryLearning",
      "snapshot_12345_abc123"
    );

    const verdict = getVerdict(result);
    const check = getCheck(verdict, "not_pushed");
    expect(check.passed).toBe(true);
    expect(check.detail).toContain("No remotes");
  });

  it("not_pushed: fails when remotes are configured", () => {
    seedStatusUpdate(makeStatusUpdatePayload());
    mockExecSync({
      "branch": "  main\n* bos-smoke-test/1717200000000",
      "rev-parse bos-smoke-test/1717200000000": "deadbeefdeadbeefdeadbeefdeadbeefdeadbeef",
      "diff-tree": ".bos-smoke-test.md",
      "remote": "origin",
      "rev-parse main": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      "rev-parse --abbrev-ref HEAD": "bos-smoke-test/1717200000000",
    });
    vi.mocked(existsSync).mockReturnValue(true);

    const result = verifyProductionWork(
      "Div5.QualificationsLibraryLearning",
      "snapshot_12345_abc123"
    );

    const verdict = getVerdict(result);
    const check = getCheck(verdict, "not_pushed");
    expect(check.passed).toBe(false);
    expect(check.detail).toContain("origin");
  });

  it("main_branch_unchanged: passes when main HEAD differs from test branch HEAD", () => {
    seedStatusUpdate(makeStatusUpdatePayload());
    setupAllChecksPass();

    const result = verifyProductionWork(
      "Div5.QualificationsLibraryLearning",
      "snapshot_12345_abc123"
    );

    const verdict = getVerdict(result);
    const check = getCheck(verdict, "main_branch_unchanged");
    expect(check.passed).toBe(true);
    expect(check.detail).toContain("distinct");
  });

  it("main_branch_unchanged: fails when main HEAD matches test branch HEAD", () => {
    seedStatusUpdate(makeStatusUpdatePayload());
    mockExecSync({
      "branch": "  main\n* bos-smoke-test/1717200000000",
      "rev-parse bos-smoke-test/1717200000000": "deadbeefdeadbeefdeadbeefdeadbeefdeadbeef",
      "diff-tree": ".bos-smoke-test.md",
      "remote": "",
      "rev-parse main": "deadbeefdeadbeefdeadbeefdeadbeefdeadbeef",
      "rev-parse --abbrev-ref HEAD": "bos-smoke-test/1717200000000",
    });
    vi.mocked(existsSync).mockReturnValue(true);

    const result = verifyProductionWork(
      "Div5.QualificationsLibraryLearning",
      "snapshot_12345_abc123"
    );

    const verdict = getVerdict(result);
    const check = getCheck(verdict, "main_branch_unchanged");
    expect(check.passed).toBe(false);
    expect(check.detail).toContain("matches");
  });

  it("on_test_branch: passes when HEAD is on test branch", () => {
    seedStatusUpdate(makeStatusUpdatePayload());
    setupAllChecksPass();

    const result = verifyProductionWork(
      "Div5.QualificationsLibraryLearning",
      "snapshot_12345_abc123"
    );

    const verdict = getVerdict(result);
    const check = getCheck(verdict, "on_test_branch");
    expect(check.passed).toBe(true);
    expect(check.detail).toContain("bos-smoke-test/1717200000000");
  });

  it("on_test_branch: fails when HEAD is not on test branch", () => {
    seedStatusUpdate(makeStatusUpdatePayload());
    mockExecSync({
      "branch": "  main\n* bos-smoke-test/1717200000000",
      "rev-parse bos-smoke-test/1717200000000": "deadbeefdeadbeefdeadbeefdeadbeefdeadbeef",
      "diff-tree": ".bos-smoke-test.md",
      "remote": "",
      "rev-parse main": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      "rev-parse --abbrev-ref HEAD": "main",
    });
    vi.mocked(existsSync).mockReturnValue(true);

    const result = verifyProductionWork(
      "Div5.QualificationsLibraryLearning",
      "snapshot_12345_abc123"
    );

    const verdict = getVerdict(result);
    const check = getCheck(verdict, "on_test_branch");
    expect(check.passed).toBe(false);
    expect(check.detail).toContain("Expected");
    expect(check.detail).toContain("main");
  });

  // ── Overall verdict tests ──

  it("overall PASS when all 7 checks pass", () => {
    seedStatusUpdate(makeStatusUpdatePayload());
    setupAllChecksPass();

    const result = verifyProductionWork(
      "Div5.QualificationsLibraryLearning",
      "snapshot_12345_abc123"
    );

    const verdict = getVerdict(result);
    expect(verdict.overall).toBe("PASS");
    expect(verdict.checks).toHaveLength(7);
    expect(verdict.checks.every((c) => c.passed)).toBe(true);
  });

  it("overall FAIL when any check fails", () => {
    seedStatusUpdate(makeStatusUpdatePayload());
    // All checks pass except not_pushed
    mockExecSync({
      "branch": "  main\n* bos-smoke-test/1717200000000",
      "rev-parse bos-smoke-test/1717200000000": "deadbeefdeadbeefdeadbeefdeadbeefdeadbeef",
      "diff-tree": ".bos-smoke-test.md",
      "remote": "origin",
      "rev-parse main": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      "rev-parse --abbrev-ref HEAD": "bos-smoke-test/1717200000000",
    });
    vi.mocked(existsSync).mockReturnValue(true);

    const result = verifyProductionWork(
      "Div5.QualificationsLibraryLearning",
      "snapshot_12345_abc123"
    );

    const verdict = getVerdict(result);
    expect(verdict.overall).toBe("FAIL");
    expect(verdict.checks.filter((c) => !c.passed)).toHaveLength(1);
  });

  // ── PostProductionVerdict structure tests ──

  it("produces valid PostProductionVerdict structure", () => {
    seedStatusUpdate(makeStatusUpdatePayload());
    setupAllChecksPass();

    const result = verifyProductionWork(
      "Div5.QualificationsLibraryLearning",
      "snapshot_12345_abc123"
    );

    const verdict = getVerdict(result);
    expect(verdict.schema_version).toBe("1.0");
    expect(verdict.mission_id).toBe("mission_001");
    expect(verdict.snapshot_id).toBe("snapshot_12345_abc123");
    expect(verdict.branch_created).toBe("bos-smoke-test/1717200000000");
    expect(verdict.commit_sha).toBe("deadbeefdeadbeefdeadbeefdeadbeefdeadbeef");
    expect(verdict.checks).toHaveLength(7);
    expect(verdict.overall).toMatch(/^(PASS|FAIL)$/);
    expect(verdict.evaluated_at).toBeDefined();
    expect(verdict.evaluated_by).toBe("Div5.QualificationsLibraryLearning");
  });

  it("each check has check_id, passed, and detail", () => {
    seedStatusUpdate(makeStatusUpdatePayload());
    setupAllChecksPass();

    const result = verifyProductionWork(
      "Div5.QualificationsLibraryLearning",
      "snapshot_12345_abc123"
    );

    const verdict = getVerdict(result);
    const expectedCheckIds = [
      "branch_exists",
      "commit_sha_matches_head",
      "smoke_file_exists",
      "files_changed_present",
      "not_pushed",
      "main_branch_unchanged",
      "on_test_branch",
    ];

    for (const checkId of expectedCheckIds) {
      const check = getCheck(verdict, checkId);
      expect(typeof check.check_id).toBe("string");
      expect(typeof check.passed).toBe("boolean");
      expect(typeof check.detail).toBe("string");
    }
  });

  it("failed checks produce actionable diagnostics with expected vs actual", () => {
    seedStatusUpdate(makeStatusUpdatePayload());
    mockExecSync({
      "branch": "  main\n  other-branch",
      "rev-parse bos-smoke-test/1717200000000": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      "diff-tree": ".bos-smoke-test.md",
      "remote": "origin",
      "rev-parse main": "deadbeefdeadbeefdeadbeefdeadbeefdeadbeef",
      "rev-parse --abbrev-ref HEAD": "main",
    });
    vi.mocked(existsSync).mockReturnValue(false);

    const result = verifyProductionWork(
      "Div5.QualificationsLibraryLearning",
      "snapshot_12345_abc123"
    );

    const verdict = getVerdict(result);
    const failedChecks = verdict.checks.filter((c) => !c.passed);
    expect(failedChecks.length).toBeGreaterThan(0);

    // Each failed check should have a non-empty detail string
    for (const check of failedChecks) {
      expect(check.detail.length).toBeGreaterThan(0);
    }
  });

  // ── Emission tests ──

  it("emits status_update to Div1.HCO on verification complete", () => {
    seedStatusUpdate(makeStatusUpdatePayload());
    setupAllChecksPass();

    const result = verifyProductionWork(
      "Div5.QualificationsLibraryLearning",
      "snapshot_12345_abc123"
    );

    expect("authorized" in result && result.authorized).toBe(true);

    const div1Inbox = getDivisionInbox("Div1.HCO");
    expect(div1Inbox.length).toBe(1);
    expect(div1Inbox[0].packet_type).toBe("status_update");
    expect(div1Inbox[0].from_division).toBe("Div5.QualificationsLibraryLearning");
    expect(div1Inbox[0].to_division).toBe("Div1.HCO");

    const payload = div1Inbox[0].payload as Record<string, unknown>;
    expect(payload.mission_id).toBe("mission_001");
    expect(payload.snapshot_id).toBe("snapshot_12345_abc123");
    expect(payload.verdict).toBe("PASS");
    expect(payload.check_count).toBe(7);
    expect(payload.passed_count).toBe(7);
    expect(payload.failed_count).toBe(0);
    expect(payload.evaluated_at).toBeDefined();
  });

  it("emits status_update to Div7.MissionControl on verification complete", () => {
    seedStatusUpdate(makeStatusUpdatePayload());
    setupAllChecksPass();

    const result = verifyProductionWork(
      "Div5.QualificationsLibraryLearning",
      "snapshot_12345_abc123"
    );

    expect("authorized" in result && result.authorized).toBe(true);

    const div7Inbox = getDivisionInbox("Div7.MissionControl");
    expect(div7Inbox.length).toBe(1);
    expect(div7Inbox[0].packet_type).toBe("status_update");
    expect(div7Inbox[0].from_division).toBe("Div5.QualificationsLibraryLearning");
    expect(div7Inbox[0].to_division).toBe("Div7.MissionControl");

    const payload = div7Inbox[0].payload as Record<string, unknown>;
    expect(payload.verdict).toBe("PASS");
    expect(payload.check_count).toBe(7);
  });

  it("includes failed_checks details in Div1.HCO status_update on failure", () => {
    seedStatusUpdate(makeStatusUpdatePayload());
    mockExecSync({
      "branch": "  main\n* bos-smoke-test/1717200000000",
      "rev-parse bos-smoke-test/1717200000000": "deadbeefdeadbeefdeadbeefdeadbeefdeadbeef",
      "diff-tree": ".bos-smoke-test.md",
      "remote": "origin",
      "rev-parse main": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      "rev-parse --abbrev-ref HEAD": "bos-smoke-test/1717200000000",
    });
    vi.mocked(existsSync).mockReturnValue(true);

    const result = verifyProductionWork(
      "Div5.QualificationsLibraryLearning",
      "snapshot_12345_abc123"
    );

    expect("authorized" in result && result.authorized).toBe(true);

    const div1Inbox = getDivisionInbox("Div1.HCO");
    const payload = div1Inbox[0].payload as Record<string, unknown>;
    expect(payload.verdict).toBe("FAIL");
    expect(payload.failed_count).toBe(1);
    expect(Array.isArray(payload.failed_checks)).toBe(true);
    const failedChecks = payload.failed_checks as Array<{ check_id: string; detail: string }>;
    expect(failedChecks[0].check_id).toBe("not_pushed");
    expect(failedChecks[0].detail).toContain("origin");
  });

  // ── Inbox selection tests ──

  it("selects correct status_update when multiple are in inbox", () => {
    seedStatusUpdate(makeStatusUpdatePayload({ snapshot_id: "snapshot_111_aaa", mission_id: "mission_111" }));
    seedStatusUpdate(makeStatusUpdatePayload({ snapshot_id: "snapshot_222_bbb", mission_id: "mission_222" }));
    setupAllChecksPass();

    const result = verifyProductionWork(
      "Div5.QualificationsLibraryLearning",
      "snapshot_222_bbb"
    );

    const verdict = getVerdict(result);
    expect(verdict.mission_id).toBe("mission_222");
    expect(verdict.snapshot_id).toBe("snapshot_222_bbb");
  });

  it("uses 'unknown' when mission_id is missing from payload", () => {
    const payload = makeStatusUpdatePayload();
    delete payload.mission_id;
    seedStatusUpdate(payload);
    setupAllChecksPass();

    const result = verifyProductionWork(
      "Div5.QualificationsLibraryLearning",
      "snapshot_12345_abc123"
    );

    const verdict = getVerdict(result);
    expect(verdict.mission_id).toBe("unknown");
  });

  it("ignores non-matching packet types in inbox", () => {
    // Seed a gate_decision with same snapshot_id (should not match)
    emitDivisionPacket(
      "Div5.QualificationsLibraryLearning",
      "Div4.Production",
      "gate_decision",
      { snapshot_id: "snapshot_12345_abc123" }
    );

    const result = verifyProductionWork(
      "Div5.QualificationsLibraryLearning",
      "snapshot_12345_abc123"
    );

    // Should fail because no status_update found, only gate_decision
    const unauthorized = result as Extract<PostProductionVerificationResult, { authorized: false }>;
    expect(unauthorized.authorized).toBe(false);
    expect(unauthorized.reason).toContain("status_update");
  });

  // ── Error handling tests ──

  it("handles git branch command failure gracefully", () => {
    seedStatusUpdate(makeStatusUpdatePayload());
    mockExecSync({
      "branch": new Error("fatal: not a git repository") as unknown as string,
      "rev-parse bos-smoke-test/1717200000000": "deadbeefdeadbeefdeadbeefdeadbeefdeadbeef",
      "diff-tree": ".bos-smoke-test.md",
      "remote": "",
      "rev-parse main": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      "rev-parse --abbrev-ref HEAD": "bos-smoke-test/1717200000000",
    });
    vi.mocked(existsSync).mockReturnValue(true);

    const result = verifyProductionWork(
      "Div5.QualificationsLibraryLearning",
      "snapshot_12345_abc123"
    );

    const verdict = getVerdict(result);
    const check = getCheck(verdict, "branch_exists");
    expect(check.passed).toBe(false);
    expect(check.detail).toContain("git branch failed");
    expect(verdict.overall).toBe("FAIL");
  });

  it("handles git rev-parse failure gracefully", () => {
    seedStatusUpdate(makeStatusUpdatePayload());
    mockExecSync({
      "branch": "  main\n* bos-smoke-test/1717200000000",
      "rev-parse bos-smoke-test/1717200000000": new Error("fatal: bad object") as unknown as string,
      "diff-tree": ".bos-smoke-test.md",
      "remote": "",
      "rev-parse main": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      "rev-parse --abbrev-ref HEAD": "bos-smoke-test/1717200000000",
    });
    vi.mocked(existsSync).mockReturnValue(true);

    const result = verifyProductionWork(
      "Div5.QualificationsLibraryLearning",
      "snapshot_12345_abc123"
    );

    const verdict = getVerdict(result);
    const check = getCheck(verdict, "commit_sha_matches_head");
    expect(check.passed).toBe(false);
    expect(check.detail).toContain("failed");
  });

  // ── Packet isolation test ──

  it("isolates packet state between tests", () => {
    seedStatusUpdate(makeStatusUpdatePayload());
    setupAllChecksPass();

    verifyProductionWork(
      "Div5.QualificationsLibraryLearning",
      "snapshot_12345_abc123"
    );

    // Div1 and Div7 should each have 1 status_update
    expect(getDivisionInbox("Div1.HCO").length).toBe(1);
    expect(getDivisionInbox("Div7.MissionControl").length).toBe(1);

    clearPacketRouter();
    expect(getDivisionInbox("Div1.HCO").length).toBe(0);
    expect(getDivisionInbox("Div7.MissionControl").length).toBe(0);
  });

  // ── Return structure tests ──

  it("returns emitted diagnostics on success", () => {
    seedStatusUpdate(makeStatusUpdatePayload());
    setupAllChecksPass();

    const result = verifyProductionWork(
      "Div5.QualificationsLibraryLearning",
      "snapshot_12345_abc123"
    );

    expect("authorized" in result && result.authorized).toBe(true);
    const success = result as Extract<PostProductionVerificationResult, { authorized: true }>;
    expect(success.emitted.status_update_hco.emitted).toBe(true);
    expect(success.emitted.status_update_hco.packet_id).toBeDefined();
    expect(success.emitted.status_update_hco.routed_to).toBe("Div1.HCO");
    expect(success.emitted.status_update_mission_control.emitted).toBe(true);
    expect(success.emitted.status_update_mission_control.routed_to).toBe("Div7.MissionControl");
  });

  it("does not accept Div5PostProductionUnauthorized for Div5 callers", () => {
    // Ensure Div5QualLib (the allowed caller) gets authorized
    seedStatusUpdate(makeStatusUpdatePayload());
    setupAllChecksPass();

    const result = verifyProductionWork(
      "Div5.QualificationsLibraryLearning",
      "snapshot_12345_abc123"
    );

    expect("authorized" in result && result.authorized).toBe(true);
  });
});
