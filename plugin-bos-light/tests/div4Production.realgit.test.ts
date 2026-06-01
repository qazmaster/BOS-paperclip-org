import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  executeProductionWork,
  type ExecuteProductionWorkResult,
} from "../src/div4Production";
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

describe("executeProductionWork (real git)", () => {
  let tempDir: string;
  const realGitOps = new DefaultGitOperations();

  function initTempRepo(): string {
    const dir = mkdtempSync(join(tmpdir(), "div4-test-"));
    execSync("git init -b main", { cwd: dir, stdio: "pipe" });
    execSync("git config user.email test@test.com", { cwd: dir, stdio: "pipe" });
    execSync("git config user.name Test", { cwd: dir, stdio: "pipe" });
    writeFileSync(join(dir, "README.md"), "# Test Repo\n");
    execSync("git add README.md", { cwd: dir, stdio: "pipe" });
    execSync('git commit -m "initial commit"', { cwd: dir, stdio: "pipe" });
    return dir;
  }

  beforeEach(() => {
    clearPacketRouter();
    tempDir = initTempRepo();
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("creates test branch, writes smoke file, adds, and commits with real git", async () => {
    const snapshotId = "snapshot_real_001";
    const payload = {
      quarantine_ref: "quarantine_real",
      mission_id: "mission_real_001",
      grant_id: "grant_real_001",
      secret_scan_passed: true,
      snapshot_id: snapshotId,
      approved_for_division: "Div4.Production" as const,
      approved_at: new Date().toISOString(),
      branch_inventory: ["main"],
      ref_inventory: ["refs/heads/main"],
      commit_shas: ["abc123"],
      local_path: tempDir,
    };
    emitDivisionPacket("Div5.QualificationsLibraryLearning", "Div4.Production", "gate_decision", payload);

    const result = await executeProductionWork("Div4.Production", snapshotId, realGitOps);

    expect(result.authorized).toBe(true);
    const success = result as Extract<ExecuteProductionWorkResult, { authorized: true }>;

    // Evidence shape
    expect(success.evidence.schema_version).toBe("1.0");
    expect(success.evidence.mission_id).toBe("mission_real_001");
    expect(success.evidence.snapshot_id).toBe(snapshotId);
    expect(success.evidence.branch_created).toMatch(/^bos-smoke-test\/\d+$/);
    expect(success.evidence.files_changed).toEqual([".bos-smoke-test.md"]);
    expect(success.evidence.pushed).toBe(false);
    expect(success.evidence.produced_by).toBe("Div4.Production");
    expect(success.evidence.produced_at).toBeDefined();

    // Real commit SHA (40-char hex)
    expect(success.evidence.commit_sha).toMatch(/^[a-f0-9]{40}$/);

    // Real diff_hash (64-char hex sha256)
    expect(success.evidence.diff_hash).toMatch(/^[a-f0-9]{64}$/);

    // Verify the smoke file actually exists on disk
    const smokeFile = readFileSync(join(tempDir, ".bos-smoke-test.md"), "utf-8");
    expect(smokeFile).toContain("# BOS Smoke Test");
    expect(smokeFile).toContain(snapshotId);

    // Verify the branch was created
    const branches = execSync("git branch", { cwd: tempDir, encoding: "utf-8" });
    expect(branches).toContain(success.evidence.branch_created);

    // Verify we are on the test branch, not main
    const currentBranch = execSync("git rev-parse --abbrev-ref HEAD", { cwd: tempDir, encoding: "utf-8" }).trim();
    expect(currentBranch).toBe(success.evidence.branch_created);

    // Verify the commit exists and has the expected message
    const commitMsg = execSync("git log -1 --format=%s", { cwd: tempDir, encoding: "utf-8" }).trim();
    expect(commitMsg).toContain("chore(bos): smoke test");
  });

  it("emits completion_report and status_update packets with real git", async () => {
    const snapshotId = "snapshot_real_002";
    const payload = {
      quarantine_ref: "quarantine_real",
      mission_id: "mission_real_002",
      grant_id: "grant_real_002",
      secret_scan_passed: true,
      snapshot_id: snapshotId,
      approved_for_division: "Div4.Production" as const,
      approved_at: new Date().toISOString(),
      branch_inventory: ["main"],
      ref_inventory: ["refs/heads/main"],
      commit_shas: ["abc123"],
      local_path: tempDir,
    };
    emitDivisionPacket("Div5.QualificationsLibraryLearning", "Div4.Production", "gate_decision", payload);

    const result = await executeProductionWork("Div4.Production", snapshotId, realGitOps);
    expect(result.authorized).toBe(true);

    // Div1.HCO completion_report
    const div1Inbox = getDivisionInbox("Div1.HCO");
    expect(div1Inbox.length).toBe(1);
    expect(div1Inbox[0].packet_type).toBe("completion_report");
    expect(div1Inbox[0].from_division).toBe("Div4.Production");
    expect(div1Inbox[0].to_division).toBe("Div1.HCO");
    const reportPayload = div1Inbox[0].payload as Record<string, unknown>;
    expect(reportPayload.mission_id).toBe("mission_real_002");
    expect(reportPayload.snapshot_id).toBe(snapshotId);
    expect(reportPayload.pushed).toBe(false);
    expect(reportPayload.status).toBe("COMPLETED");
    expect(reportPayload.commit_sha).toMatch(/^[a-f0-9]{40}$/);

    // Div5 status_update
    const div5Inbox = getDivisionInbox("Div5.QualificationsLibraryLearning");
    expect(div5Inbox.length).toBe(1);
    expect(div5Inbox[0].packet_type).toBe("status_update");
    expect(div5Inbox[0].from_division).toBe("Div4.Production");
    const statusPayload = div5Inbox[0].payload as Record<string, unknown>;
    expect(statusPayload.mission_id).toBe("mission_real_002");
    expect(statusPayload.pushed).toBe(false);
    expect(statusPayload.status).toBe("COMPLETED");
  });

  it("pushed is always false (no remote push occurs)", async () => {
    const snapshotId = "snapshot_real_003";
    const payload = {
      quarantine_ref: "quarantine_real",
      mission_id: "mission_real_003",
      grant_id: "grant_real_003",
      secret_scan_passed: true,
      snapshot_id: snapshotId,
      approved_for_division: "Div4.Production" as const,
      approved_at: new Date().toISOString(),
      branch_inventory: ["main"],
      ref_inventory: ["refs/heads/main"],
      commit_shas: ["abc123"],
      local_path: tempDir,
    };
    emitDivisionPacket("Div5.QualificationsLibraryLearning", "Div4.Production", "gate_decision", payload);

    const result = await executeProductionWork("Div4.Production", snapshotId, realGitOps);
    expect(result.authorized).toBe(true);
    const success = result as Extract<ExecuteProductionWorkResult, { authorized: true }>;
    expect(success.evidence.pushed).toBe(false);

    // Verify no remotes exist (local-only repo)
    const remotes = execSync("git remote", { cwd: tempDir, encoding: "utf-8" }).trim();
    expect(remotes).toBe("");
  });

  it("does not modify main branch (only test branch is affected)", async () => {
    const mainBefore = execSync("git rev-parse HEAD", { cwd: tempDir, encoding: "utf-8" }).trim();

    const snapshotId = "snapshot_real_004";
    const payload = {
      quarantine_ref: "quarantine_real",
      mission_id: "mission_real_004",
      grant_id: "grant_real_004",
      secret_scan_passed: true,
      snapshot_id: snapshotId,
      approved_for_division: "Div4.Production" as const,
      approved_at: new Date().toISOString(),
      branch_inventory: ["main"],
      ref_inventory: ["refs/heads/main"],
      commit_shas: ["abc123"],
      local_path: tempDir,
    };
    emitDivisionPacket("Div5.QualificationsLibraryLearning", "Div4.Production", "gate_decision", payload);

    await executeProductionWork("Div4.Production", snapshotId, realGitOps);

    // Verify main branch HEAD is unchanged
    const mainAfter = execSync("git rev-parse main", { cwd: tempDir, encoding: "utf-8" }).trim();
    expect(mainAfter).toBe(mainBefore);
  });

  it("commit_sha matches HEAD of the test branch", async () => {
    const snapshotId = "snapshot_real_005";
    const payload = {
      quarantine_ref: "quarantine_real",
      mission_id: "mission_real_005",
      grant_id: "grant_real_005",
      secret_scan_passed: true,
      snapshot_id: snapshotId,
      approved_for_division: "Div4.Production" as const,
      approved_at: new Date().toISOString(),
      branch_inventory: ["main"],
      ref_inventory: ["refs/heads/main"],
      commit_shas: ["abc123"],
      local_path: tempDir,
    };
    emitDivisionPacket("Div5.QualificationsLibraryLearning", "Div4.Production", "gate_decision", payload);

    const result = await executeProductionWork("Div4.Production", snapshotId, realGitOps);
    const success = result as Extract<ExecuteProductionWorkResult, { authorized: true }>;

    // Verify commit_sha matches current HEAD
    const headSha = execSync("git rev-parse HEAD", { cwd: tempDir, encoding: "utf-8" }).trim();
    expect(success.evidence.commit_sha).toBe(headSha);
  });

  it("multiple sequential runs create distinct branches and commits", async () => {
    const ids = ["snapshot_seq_001", "snapshot_seq_002"];
    const results: ExecuteProductionWorkResult[] = [];

    for (const sid of ids) {
      clearPacketRouter();
      const payload = {
        quarantine_ref: "quarantine_seq",
        mission_id: `mission_${sid}`,
        grant_id: "grant_seq",
        secret_scan_passed: true,
        snapshot_id: sid,
        approved_for_division: "Div4.Production" as const,
        approved_at: new Date().toISOString(),
        branch_inventory: ["main"],
        ref_inventory: ["refs/heads/main"],
        commit_shas: ["abc123"],
        local_path: tempDir,
      };
      emitDivisionPacket("Div5.QualificationsLibraryLearning", "Div4.Production", "gate_decision", payload);
      const r = await executeProductionWork("Div4.Production", sid, realGitOps);
      results.push(r);
    }

    const [r1, r2] = results.map((r) => r as Extract<ExecuteProductionWorkResult, { authorized: true }>);
    expect(r1.evidence.branch_created).not.toBe(r2.evidence.branch_created);
    expect(r1.evidence.commit_sha).not.toBe(r2.evidence.commit_sha);

    // Both branches exist
    const branches = execSync("git branch", { cwd: tempDir, encoding: "utf-8" });
    expect(branches).toContain(r1.evidence.branch_created);
    expect(branches).toContain(r2.evidence.branch_created);
  });

  it("smoke file content contains snapshot ID and timestamp", async () => {
    const snapshotId = "snapshot_real_006";
    const payload = {
      quarantine_ref: "quarantine_real",
      mission_id: "mission_real_006",
      grant_id: "grant_real_006",
      secret_scan_passed: true,
      snapshot_id: snapshotId,
      approved_for_division: "Div4.Production" as const,
      approved_at: new Date().toISOString(),
      branch_inventory: ["main"],
      ref_inventory: ["refs/heads/main"],
      commit_shas: ["abc123"],
      local_path: tempDir,
    };
    emitDivisionPacket("Div5.QualificationsLibraryLearning", "Div4.Production", "gate_decision", payload);

    await executeProductionWork("Div4.Production", snapshotId, realGitOps);

    const smokeContent = readFileSync(join(tempDir, ".bos-smoke-test.md"), "utf-8");
    expect(smokeContent).toContain("# BOS Smoke Test");
    expect(smokeContent).toContain(`Snapshot: ${snapshotId}`);
    expect(smokeContent).toContain("Generated by Div4.Production");
    expect(smokeContent).toContain("harmless test file");
  });
});
