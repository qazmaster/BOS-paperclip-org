import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  executeProductionWork,
  type ExecuteProductionWorkResult,
} from "../src/div4Production";
import {
  verifyProductionWork,
  type PostProductionVerificationResult,
} from "../src/div5PostProductionVerification";
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

describe("verifyProductionWork (real git)", () => {
  let tempDir: string;
  const realGitOps = new DefaultGitOperations();

  function initTempRepo(): string {
    const dir = mkdtempSync(join(tmpdir(), "div5-ppv-test-"));
    execSync("git init -b main", { cwd: dir, stdio: "pipe" });
    execSync("git config user.email test@test.com", { cwd: dir, stdio: "pipe" });
    execSync("git config user.name Test", { cwd: dir, stdio: "pipe" });
    writeFileSync(join(dir, "README.md"), "# Test Repo\n");
    execSync("git add README.md", { cwd: dir, stdio: "pipe" });
    execSync('git commit -m "initial commit"', { cwd: dir, stdio: "pipe" });
    return dir;
  }

  /**
   * Run the full Div4 production pipeline.
   * Returns the status_update payload that Div5 will read.
   */
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

    // Capture the status_update from Div4 to Div5 before any clearPacketRouter
    const div5Inbox = getDivisionInbox("Div5.QualificationsLibraryLearning");
    const statusPacket = div5Inbox.find((p) => p.packet_type === "status_update");
    expect(statusPacket).toBeDefined();

    return statusPacket!.payload as Record<string, unknown>;
  }

  beforeEach(() => {
    clearPacketRouter();
    tempDir = initTempRepo();
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("full pipeline: Div4 production → Div5 eval gate → verdict PASS", async () => {
    const snapshotId = "snapshot_ppv_001";
    const missionId = "mission_ppv_001";

    const statusPayload = await runDiv4Pipeline(snapshotId, missionId);

    // Re-seed the status_update to Div5 (simulating fresh Div5 state)
    clearPacketRouter();
    emitDivisionPacket(
      "Div4.Production",
      "Div5.QualificationsLibraryLearning",
      "status_update",
      statusPayload
    );

    const result = verifyProductionWork(
      "Div5.QualificationsLibraryLearning",
      snapshotId
    );

    expect("authorized" in result && result.authorized).toBe(true);
    const success = result as Extract<PostProductionVerificationResult, { authorized: true }>;

    expect(success.verdict.schema_version).toBe("1.0");
    expect(success.verdict.mission_id).toBe(missionId);
    expect(success.verdict.snapshot_id).toBe(snapshotId);
    expect(success.verdict.overall).toBe("PASS");
    expect(success.verdict.checks).toHaveLength(7);
    expect(success.verdict.checks.every((c) => c.passed)).toBe(true);
    expect(success.verdict.evaluated_by).toBe("Div5.QualificationsLibraryLearning");
  });

  it("verdict PASS: all 7 checks pass with real git", async () => {
    const snapshotId = "snapshot_ppv_002";
    const missionId = "mission_ppv_002";

    const statusPayload = await runDiv4Pipeline(snapshotId, missionId);

    clearPacketRouter();
    emitDivisionPacket(
      "Div4.Production",
      "Div5.QualificationsLibraryLearning",
      "status_update",
      statusPayload
    );

    const result = verifyProductionWork(
      "Div5.QualificationsLibraryLearning",
      snapshotId
    );

    const success = result as Extract<PostProductionVerificationResult, { authorized: true }>;
    const checks = success.verdict.checks;

    // 1. branch_exists
    const branchCheck = checks.find((c) => c.check_id === "branch_exists")!;
    expect(branchCheck.passed).toBe(true);
    expect(branchCheck.detail).toContain("found");

    // 2. commit_sha_matches_head
    const shaCheck = checks.find((c) => c.check_id === "commit_sha_matches_head")!;
    expect(shaCheck.passed).toBe(true);

    // 3. smoke_file_exists
    const smokeCheck = checks.find((c) => c.check_id === "smoke_file_exists")!;
    expect(smokeCheck.passed).toBe(true);
    expect(smokeCheck.detail).toContain("found");

    // 4. files_changed_present
    const filesCheck = checks.find((c) => c.check_id === "files_changed_present")!;
    expect(filesCheck.passed).toBe(true);

    // 5. not_pushed
    const pushCheck = checks.find((c) => c.check_id === "not_pushed")!;
    expect(pushCheck.passed).toBe(true);
    expect(pushCheck.detail).toContain("No remotes");

    // 6. main_branch_unchanged
    const mainCheck = checks.find((c) => c.check_id === "main_branch_unchanged")!;
    expect(mainCheck.passed).toBe(true);
    expect(mainCheck.detail).toContain("distinct");

    // 7. on_test_branch
    const branchHeadCheck = checks.find((c) => c.check_id === "on_test_branch")!;
    expect(branchHeadCheck.passed).toBe(true);
  });

  it("tamper: deleting smoke file → verdict FAIL with smoke_file_exists failing", async () => {
    const snapshotId = "snapshot_ppv_003";
    const missionId = "mission_ppv_003";

    const statusPayload = await runDiv4Pipeline(snapshotId, missionId);

    // Tamper: delete the smoke test file
    const smokePath = join(tempDir, ".bos-smoke-test.md");
    expect(readFileSync(smokePath, "utf-8")).toContain("BOS Smoke Test");
    rmSync(smokePath);

    clearPacketRouter();
    emitDivisionPacket(
      "Div4.Production",
      "Div5.QualificationsLibraryLearning",
      "status_update",
      statusPayload
    );

    const result = verifyProductionWork(
      "Div5.QualificationsLibraryLearning",
      snapshotId
    );

    const success = result as Extract<PostProductionVerificationResult, { authorized: true }>;
    expect(success.verdict.overall).toBe("FAIL");

    const smokeCheck = success.verdict.checks.find((c) => c.check_id === "smoke_file_exists")!;
    expect(smokeCheck.passed).toBe(false);
    expect(smokeCheck.detail).toContain("not found");
  });

  it("tamper: adding remote → verdict FAIL with not_pushed failing", async () => {
    const snapshotId = "snapshot_ppv_004";
    const missionId = "mission_ppv_004";

    const statusPayload = await runDiv4Pipeline(snapshotId, missionId);

    // Tamper: add a remote
    execSync("git remote add origin https://example.com/repo.git", {
      cwd: tempDir,
      stdio: "pipe",
    });

    clearPacketRouter();
    emitDivisionPacket(
      "Div4.Production",
      "Div5.QualificationsLibraryLearning",
      "status_update",
      statusPayload
    );

    const result = verifyProductionWork(
      "Div5.QualificationsLibraryLearning",
      snapshotId
    );

    const success = result as Extract<PostProductionVerificationResult, { authorized: true }>;
    expect(success.verdict.overall).toBe("FAIL");

    const pushCheck = success.verdict.checks.find((c) => c.check_id === "not_pushed")!;
    expect(pushCheck.passed).toBe(false);
    expect(pushCheck.detail).toContain("origin");
  });

  it("packet emission: status_update to Div1.HCO contains verdict summary", async () => {
    const snapshotId = "snapshot_ppv_005";
    const missionId = "mission_ppv_005";

    const statusPayload = await runDiv4Pipeline(snapshotId, missionId);

    clearPacketRouter();
    emitDivisionPacket(
      "Div4.Production",
      "Div5.QualificationsLibraryLearning",
      "status_update",
      statusPayload
    );

    const result = verifyProductionWork(
      "Div5.QualificationsLibraryLearning",
      snapshotId
    );

    expect("authorized" in result && result.authorized).toBe(true);

    const div1Inbox = getDivisionInbox("Div1.HCO");
    expect(div1Inbox.length).toBe(1);
    expect(div1Inbox[0].packet_type).toBe("status_update");
    expect(div1Inbox[0].from_division).toBe("Div5.QualificationsLibraryLearning");
    expect(div1Inbox[0].to_division).toBe("Div1.HCO");

    const payload = div1Inbox[0].payload as Record<string, unknown>;
    expect(payload.mission_id).toBe(missionId);
    expect(payload.snapshot_id).toBe(snapshotId);
    expect(payload.verdict).toBe("PASS");
    expect(payload.check_count).toBe(7);
    expect(payload.passed_count).toBe(7);
    expect(payload.failed_count).toBe(0);
    expect(payload.evaluated_at).toBeDefined();
  });

  it("packet emission: status_update to Div7.MissionControl contains verdict summary", async () => {
    const snapshotId = "snapshot_ppv_006";
    const missionId = "mission_ppv_006";

    const statusPayload = await runDiv4Pipeline(snapshotId, missionId);

    clearPacketRouter();
    emitDivisionPacket(
      "Div4.Production",
      "Div5.QualificationsLibraryLearning",
      "status_update",
      statusPayload
    );

    const result = verifyProductionWork(
      "Div5.QualificationsLibraryLearning",
      snapshotId
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
    expect(payload.passed_count).toBe(7);
    expect(payload.failed_count).toBe(0);
    expect(payload.evaluated_at).toBeDefined();
  });

  it("main_branch_unchanged: main HEAD differs from test branch HEAD (no originalMainSha needed)", async () => {
    const snapshotId = "snapshot_ppv_007";
    const missionId = "mission_ppv_007";

    const statusPayload = await runDiv4Pipeline(snapshotId, missionId);

    clearPacketRouter();
    emitDivisionPacket(
      "Div4.Production",
      "Div5.QualificationsLibraryLearning",
      "status_update",
      statusPayload
    );

    const result = verifyProductionWork(
      "Div5.QualificationsLibraryLearning",
      snapshotId
    );

    const success = result as Extract<PostProductionVerificationResult, { authorized: true }>;
    const mainCheck = success.verdict.checks.find((c) => c.check_id === "main_branch_unchanged")!;
    expect(mainCheck.passed).toBe(true);

    // Verify independently: main HEAD and test branch HEAD are different
    const mainSha = execSync("git rev-parse main", {
      cwd: tempDir,
      encoding: "utf-8",
    }).trim();
    const testBranchSha = execSync(
      `git rev-parse ${statusPayload.branch_created}`,
      { cwd: tempDir, encoding: "utf-8" }
    ).trim();
    expect(mainSha).not.toBe(testBranchSha);
  });

  it("tamper: committing on main → on_test_branch fails", async () => {
    const snapshotId = "snapshot_ppv_008";
    const missionId = "mission_ppv_008";

    const statusPayload = await runDiv4Pipeline(snapshotId, missionId);

    // Tamper: checkout main and make a commit
    execSync("git checkout main", { cwd: tempDir, stdio: "pipe" });
    writeFileSync(join(tempDir, "tamper.txt"), "tampered\n");
    execSync("git add tamper.txt", { cwd: tempDir, stdio: "pipe" });
    execSync('git commit -m "tamper commit"', { cwd: tempDir, stdio: "pipe" });

    clearPacketRouter();
    emitDivisionPacket(
      "Div4.Production",
      "Div5.QualificationsLibraryLearning",
      "status_update",
      statusPayload
    );

    const result = verifyProductionWork(
      "Div5.QualificationsLibraryLearning",
      snapshotId
    );

    const success = result as Extract<PostProductionVerificationResult, { authorized: true }>;

    // on_test_branch should fail because we're now on main
    const branchHeadCheck = success.verdict.checks.find((c) => c.check_id === "on_test_branch")!;
    expect(branchHeadCheck.passed).toBe(false);
    expect(branchHeadCheck.detail).toContain("main");
  });

  it("commit_sha matches real HEAD of test branch", async () => {
    const snapshotId = "snapshot_ppv_009";
    const missionId = "mission_ppv_009";

    const statusPayload = await runDiv4Pipeline(snapshotId, missionId);

    clearPacketRouter();
    emitDivisionPacket(
      "Div4.Production",
      "Div5.QualificationsLibraryLearning",
      "status_update",
      statusPayload
    );

    const result = verifyProductionWork(
      "Div5.QualificationsLibraryLearning",
      snapshotId
    );

    const success = result as Extract<PostProductionVerificationResult, { authorized: true }>;

    // Verify the commit SHA in the verdict matches real git
    const realSha = execSync(
      `git rev-parse ${statusPayload.branch_created}`,
      { cwd: tempDir, encoding: "utf-8" }
    ).trim();
    expect(success.verdict.commit_sha).toBe(realSha);
  });

  it("multiple pipelines: distinct snapshots produce distinct verdicts", async () => {
    const pipelines = [
      { sid: "snapshot_multi_001", mid: "mission_multi_001" },
      { sid: "snapshot_multi_002", mid: "mission_multi_002" },
    ];

    for (const { sid, mid } of pipelines) {
      // Each iteration: clear, run Div4, capture status_update, re-seed, verify
      clearPacketRouter();
      const statusPayload = await runDiv4Pipeline(sid, mid);

      clearPacketRouter();
      emitDivisionPacket(
        "Div4.Production",
        "Div5.QualificationsLibraryLearning",
        "status_update",
        statusPayload
      );

      const result = verifyProductionWork(
        "Div5.QualificationsLibraryLearning",
        sid
      );

      const success = result as Extract<PostProductionVerificationResult, { authorized: true }>;
      expect(success.verdict.overall).toBe("PASS");
      expect(success.verdict.mission_id).toBe(mid);
    }
  });
});
