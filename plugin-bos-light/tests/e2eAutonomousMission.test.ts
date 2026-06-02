import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { MissionIntake } from "../src/missionIntake";
import type { MissionEnvelope } from "../src/missionIntake";
import { routeApprovedMission } from "../src/missionRouter";
import type { MissionRoutingState } from "../src/contracts";
import { verifyAndQuarantine } from "../src/div5Quarantine";
import type { VerifyAndQuarantineSuccess } from "../src/div5Quarantine";
import { executeProductionWork } from "../src/div4Production";
import type { ExecuteProductionWorkSuccess } from "../src/div4Production";
import { verifyProductionWork } from "../src/div5PostProductionVerification";
import type { PostProductionVerificationSuccess } from "../src/div5PostProductionVerification";
import { generateExecutiveReport, toMarkdown } from "../src/executiveReport";
import type { ExecutiveReportOutput } from "../src/executiveReport";
import {
  emitDivisionPacket,
  getDivisionInbox,
  clearPacketRouter,
} from "../src/divisionPacketRouter";
import { InMemoryPaperclipAdapter } from "../src/paperclipAdapter";
import { DefaultGitOperations } from "../src/gitOperations";
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { execSync } from "child_process";
import type { Division, EvalGateResult } from "../src/contracts";
import type { ExternalGitEvidence } from "../src/div6ExternalGateway";

describe("E2E autonomous git mission (full 7-division loop)", () => {
  let tempDir: string;
  let adapter: InMemoryPaperclipAdapter;
  let intake: MissionIntake;
  const realGitOps = new DefaultGitOperations();

  function initTempRepo(): string {
    const dir = mkdtempSync(join(tmpdir(), "e2e-mission-"));
    execSync("git init -b main", { cwd: dir, stdio: "pipe" });
    execSync("git config user.email test@test.com", { cwd: dir, stdio: "pipe" });
    execSync("git config user.name Test", { cwd: dir, stdio: "pipe" });
    writeFileSync(join(dir, "README.md"), "# External Repo\n");
    execSync("git add README.md", { cwd: dir, stdio: "pipe" });
    execSync('git commit -m "initial commit"', { cwd: dir, stdio: "pipe" });
    return dir;
  }

  beforeEach(() => {
    clearPacketRouter();
    tempDir = initTempRepo();
    adapter = new InMemoryPaperclipAdapter();
    intake = new MissionIntake(adapter);
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  /**
   * Full E2E test: Human mission → all 7 divisions → executive report.
   *
   * Division packet flow:
   * Div7 (mission) → Div1 (routing) → Div3/Div4/Div5/Div6 (work_assignment)
   * Div6 (completion_report) → Div5 (quarantine)
   * Div5 (gate_decision) → Div4 (production)
   * Div4 (completion_report) → Div1, (status_update) → Div5
   * Div5 (status_update) → Div1, Div7 (post-production verdict)
   * Div7 (executive report)
   */
  it("full 7-division autonomous loop produces branch, verdict, and executive report", async () => {
    // ── Step 1: Div7.MissionControl — Human submits mission ──
    const mission = intake.frameMission(
      "Div7.MissionControl",
      "Build a smoke test feature in the code repository"
    );

    expect("unauthorized" in mission).toBe(false);
    const missionEnvelope = mission as MissionEnvelope;
    expect(missionEnvelope.schema_version).toBe("1.0");
    expect(missionEnvelope.status).toBe("DRAFT");
    expect(missionEnvelope.mission_id).toBeDefined();
    expect(missionEnvelope.requested_divisions).toContain("Div4.Production");
    expect(missionEnvelope.requested_divisions).toContain("Div5.QualificationsLibraryLearning");
    expect(missionEnvelope.requested_divisions).toContain("Div6.External");

    // ── Step 2: Div1.HCO — Route approved mission ──
    // Approve the mission first
    intake.onApproval(missionEnvelope);

    const routingResult = routeApprovedMission("Div1.HCO", missionEnvelope);
    expect("status" in routingResult).toBe(true);
    const routingState = routingResult as MissionRoutingState;
    expect(routingState.status).toBe("ROUTED");
    expect(routingState.activated_divisions.length).toBeGreaterThan(0);
    expect(routingState.excluded_divisions).toContain("Div1.HCO");

    // With new architecture, Div7 presence triggers executive decision routing
    // Div7 is routed TO for decision, not excluded
    expect(routingState.activated_divisions).toContain("Div7.MissionControl");

    // Verify Div7 receives work_assignment for executive decision
    const div7Inbox = getDivisionInbox("Div7.MissionControl");
    const div7WorkAssignments = div7Inbox.filter((p) => p.packet_type === "work_assignment");
    expect(div7WorkAssignments.length).toBeGreaterThan(0);
    expect((div7WorkAssignments[0].payload as Record<string, unknown>).requires_decision).toBe(true);

    // ── Step 3: Simulate Div6.External gateway ──
    // Construct ExternalGitEvidence (simulating what Div6 would produce)
    const mainSha = execSync("git rev-parse main", {
      cwd: tempDir,
      encoding: "utf-8",
    }).trim();

    const quarantineRef = `quarantine_${Date.now()}`;
    const grantId = `grant_${Date.now()}`;

    const externalEvidence: ExternalGitEvidence = {
      schema_version: "1.0",
      trust_level: "untrusted",
      grant_id: grantId,
      mission_id: missionEnvelope.mission_id,
      operation: "clone",
      git_evidence: {
        command: "git",
        args: ["clone", "https://example.com/repo.git", tempDir],
        cwd: tempDir,
        env_keys: [],
        exit_code: 0,
        stdout_hash: "abc123",
        stderr_hash: "def456",
        duration_ms: 100,
        success: true,
        error_category: "none",
        redacted_diagnostics: "OK",
      },
      quarantine_ref: quarantineRef,
      produced_at: new Date().toISOString(),
      produced_by: "Div6.External",
      local_path: tempDir,
      parsed_metadata: {
        branches: ["main"],
        refs: ["refs/heads/main"],
        commit_shas: [mainSha],
      },
    };

    // Emit completion_report from Div6 to Div5
    emitDivisionPacket("Div6.External", "Div5.QualificationsLibraryLearning", "completion_report", externalEvidence);

    // ── Step 4: Div5.QualificationsLibraryLearning — Quarantine ──
    const quarantineResult = verifyAndQuarantine(
      "Div5.QualificationsLibraryLearning",
      quarantineRef,
      grantId
    );

    expect(quarantineResult.authorized).toBe(true);
    const quarantineSuccess = quarantineResult as VerifyAndQuarantineSuccess;
    expect(quarantineSuccess.verdict.status).toBe("APPROVED");
    expect(quarantineSuccess.verdict.secret_scan_passed).toBe(true);
    expect(quarantineSuccess.snapshot).toBeDefined();
    expect(quarantineSuccess.snapshot!.local_path).toBe(tempDir);
    expect(quarantineSuccess.emitted.gate_decision?.emitted).toBe(true);

    // ── Step 5: Div4.Production — Execute production work ──
    const snapshotId = quarantineSuccess.snapshot!.snapshot_id;

    const productionResult = await executeProductionWork(
      "Div4.Production",
      snapshotId,
      realGitOps
    );

    expect(productionResult.authorized).toBe(true);
    const productionSuccess = productionResult as ExecuteProductionWorkSuccess;
    expect(productionSuccess.evidence.schema_version).toBe("1.0");
    expect(productionSuccess.evidence.mission_id).toBe(missionEnvelope.mission_id);
    expect(productionSuccess.evidence.branch_created).toMatch(/^bos-smoke-test\/\d+$/);
    expect(productionSuccess.evidence.files_changed).toEqual([".bos-smoke-test.md"]);
    expect(productionSuccess.evidence.pushed).toBe(false);
    expect(productionSuccess.emitted.completion_report.emitted).toBe(true);
    expect(productionSuccess.emitted.status_update.emitted).toBe(true);

    // Verify smoke file exists on disk
    const smokeContent = readFileSync(join(tempDir, ".bos-smoke-test.md"), "utf-8");
    expect(smokeContent).toContain("# BOS Smoke Test");
    expect(smokeContent).toContain(snapshotId);

    // Verify branch was created
    const branches = execSync("git branch", { cwd: tempDir, encoding: "utf-8" });
    expect(branches).toContain(productionSuccess.evidence.branch_created);

    // ── Step 6: Div5 — Post-production verification ──
    const verificationResult = verifyProductionWork(
      "Div5.QualificationsLibraryLearning",
      snapshotId
    );

    expect(verificationResult.authorized).toBe(true);
    const verificationSuccess = verificationResult as PostProductionVerificationSuccess;
    expect(verificationSuccess.verdict.schema_version).toBe("1.0");
    expect(verificationSuccess.verdict.mission_id).toBe(missionEnvelope.mission_id);
    expect(verificationSuccess.verdict.overall).toBe("PASS");
    expect(verificationSuccess.verdict.checks).toHaveLength(7);
    expect(verificationSuccess.verdict.checks.every((c) => c.passed)).toBe(true);
    expect(verificationSuccess.emitted.status_update_hco.emitted).toBe(true);
    expect(verificationSuccess.emitted.status_update_mission_control.emitted).toBe(true);

    // ── Step 7: Div7.MissionControl — Executive report ──
    // Collect all packets for the report
    const allPackets = [
      ...getDivisionInbox("Div1.HCO"),
      ...getDivisionInbox("Div7.MissionControl"),
    ];

    const report = generateExecutiveReport(
      missionEnvelope,
      allPackets,
      [] // No eval gates in this flow
    );

    expect(report.schema_version).toBe("1.0");
    expect(report.report_id).toBeDefined();
    expect(report.issued_by).toBe("Div7.MissionControl");
    expect(report.mission_summary).toContain(missionEnvelope.mission_id);
    expect(report.mission_summary).toContain(missionEnvelope.title);
    expect(report.division_activity.length).toBeGreaterThan(0);
    expect(report.verdict).toBeDefined();
    expect(report.recommendations).toBeDefined();

    // Verify markdown rendering
    const markdown = toMarkdown(report);
    expect(markdown).toContain("# Executive Report");
    expect(markdown).toContain(missionEnvelope.mission_id);
    expect(markdown).toContain("## Division Activity");
    expect(markdown).toContain("## Verdict");
    expect(markdown).toContain("## Recommendations");

    // ── Final state verification ──
    // Branch exists
    const finalBranches = execSync("git branch", { cwd: tempDir, encoding: "utf-8" });
    expect(finalBranches).toContain(productionSuccess.evidence.branch_created);

    // Smoke file exists
    const finalSmoke = readFileSync(join(tempDir, ".bos-smoke-test.md"), "utf-8");
    expect(finalSmoke).toContain("# BOS Smoke Test");

    // Current branch is the test branch
    const currentBranch = execSync("git rev-parse --abbrev-ref HEAD", {
      cwd: tempDir,
      encoding: "utf-8",
    }).trim();
    expect(currentBranch).toBe(productionSuccess.evidence.branch_created);

    // No remotes (local-only)
    const remotes = execSync("git remote", { cwd: tempDir, encoding: "utf-8" }).trim();
    expect(remotes).toBe("");

    // Main branch unchanged
    const mainAfter = execSync("git rev-parse main", {
      cwd: tempDir,
      encoding: "utf-8",
    }).trim();
    expect(mainAfter).toBe(mainSha);
  });

  it("division packet trace shows complete flow", async () => {
    // Create and approve mission
    const mission = intake.frameMission(
      "Div7.MissionControl",
      "Implement code feature with external repository"
    );
    const missionEnvelope = mission as MissionEnvelope;
    intake.onApproval(missionEnvelope);
    const routingResult = routeApprovedMission("Div1.HCO", missionEnvelope);
    expect("status" in routingResult).toBe(true);

    // With new architecture, Div7 presence triggers executive decision routing
    // Div7 receives work_assignment for decision, not status_update
    const div7Inbox = getDivisionInbox("Div7.MissionControl");
    const div7WorkAssignments = div7Inbox.filter((p) => p.packet_type === "work_assignment");
    expect(div7WorkAssignments.length).toBeGreaterThan(0);
    expect((div7WorkAssignments[0].payload as Record<string, unknown>).routing_rule).toBe("requires_executive_decision");

    // Other divisions don't get work assignments until after Div7 decision
    const preDecisionWorkAssignments = [
      ...getDivisionInbox("Div3.Treasury"),
      ...getDivisionInbox("Div4.Production"),
      ...getDivisionInbox("Div5.QualificationsLibraryLearning"),
      ...getDivisionInbox("Div6.External"),
    ].filter((p) => p.packet_type === "work_assignment");
    expect(preDecisionWorkAssignments.length).toBe(0);

    // Now simulate the full flow and count all packets
    const mainSha = execSync("git rev-parse main", {
      cwd: tempDir,
      encoding: "utf-8",
    }).trim();

    const quarantineRef = `quarantine_trace_${Date.now()}`;
    const grantId = `grant_trace_${Date.now()}`;

    emitDivisionPacket("Div6.External", "Div5.QualificationsLibraryLearning", "completion_report", {
      schema_version: "1.0",
      trust_level: "untrusted",
      grant_id: grantId,
      mission_id: missionEnvelope.mission_id,
      operation: "clone",
      git_evidence: {
        command: "git",
        args: ["clone"],
        cwd: tempDir,
        env_keys: [],
        exit_code: 0,
        stdout_hash: "abc",
        stderr_hash: "def",
        duration_ms: 50,
        success: true,
        error_category: "none",
        redacted_diagnostics: "OK",
      },
      quarantine_ref: quarantineRef,
      produced_at: new Date().toISOString(),
      produced_by: "Div6.External",
      local_path: tempDir,
      parsed_metadata: {
        branches: ["main"],
        refs: ["refs/heads/main"],
        commit_shas: [mainSha],
      },
    } as ExternalGitEvidence);

    verifyAndQuarantine("Div5.QualificationsLibraryLearning", quarantineRef, grantId);

    // Div5 should have emitted gate_decision to Div4
    const div4Inbox = getDivisionInbox("Div4.Production");
    const gateDecisions = div4Inbox.filter((p) => p.packet_type === "gate_decision");
    expect(gateDecisions.length).toBeGreaterThan(0);

    // Get snapshot_id from gate decision
    const gatePayload = gateDecisions[0].payload as Record<string, unknown>;
    const snapshotId = gatePayload.snapshot_id as string;

    await executeProductionWork("Div4.Production", snapshotId, realGitOps);

    // Div5 should now have status_update from Div4
    const div5Inbox = getDivisionInbox("Div5.QualificationsLibraryLearning");
    const div4StatusUpdates = div5Inbox.filter(
      (p) => p.packet_type === "status_update" && p.from_division === "Div4.Production"
    );
    expect(div4StatusUpdates.length).toBeGreaterThan(0);

    const verificationResult = verifyProductionWork(
      "Div5.QualificationsLibraryLearning",
      snapshotId
    );

    expect(verificationResult.authorized).toBe(true);
    const success = verificationResult as PostProductionVerificationSuccess;

    // Div1 should now have status_update from Div5
    const div1Inbox = getDivisionInbox("Div1.HCO");
    const div5StatusUpdates = div1Inbox.filter(
      (p) => p.packet_type === "status_update" && p.from_division === "Div5.QualificationsLibraryLearning"
    );
    expect(div5StatusUpdates.length).toBeGreaterThan(0);

    // Div7 should now have status_update from Div5
    const div7FinalInbox = getDivisionInbox("Div7.MissionControl");
    const div5ToMcUpdates = div7FinalInbox.filter(
      (p) => p.packet_type === "status_update" && p.from_division === "Div5.QualificationsLibraryLearning"
    );
    expect(div5ToMcUpdates.length).toBeGreaterThan(0);
  });

  it("rejected quarantine blocks production", async () => {
    const mission = intake.frameMission(
      "Div7.MissionControl",
      "Build feature with suspicious code"
    );
    const missionEnvelope = mission as MissionEnvelope;
    intake.onApproval(missionEnvelope);

    const quarantineRef = `quarantine_reject_${Date.now()}`;
    const grantId = `grant_reject_${Date.now()}`;

    // Simulate Div6 with secret leak in diagnostics
    emitDivisionPacket("Div6.External", "Div5.QualificationsLibraryLearning", "completion_report", {
      schema_version: "1.0",
      trust_level: "untrusted",
      grant_id: grantId,
      mission_id: missionEnvelope.mission_id,
      operation: "clone",
      git_evidence: {
        command: "git",
        args: ["clone"],
        cwd: tempDir,
        env_keys: [],
        exit_code: 0,
        stdout_hash: "abc",
        stderr_hash: "def",
        duration_ms: 50,
        success: true,
        error_category: "none",
        redacted_diagnostics: "ghp_1234567890abcdef1234567890abcdef1234", // leaked token
      },
      quarantine_ref: quarantineRef,
      produced_at: new Date().toISOString(),
      produced_by: "Div6.External",
      local_path: tempDir,
    } as ExternalGitEvidence);

    const quarantineResult = verifyAndQuarantine(
      "Div5.QualificationsLibraryLearning",
      quarantineRef,
      grantId
    );

    // Quarantine should reject due to secret leak
    expect(quarantineResult.authorized).toBe(true);
    const success = quarantineResult as VerifyAndQuarantineSuccess;
    expect(success.verdict.status).toBe("REJECTED");
    expect(success.verdict.secret_scan_passed).toBe(false);

    // No snapshot should be produced
    expect(success.snapshot).toBeUndefined();

    // No gate_decision should be emitted to Div4
    const div4Inbox = getDivisionInbox("Div4.Production");
    const gateDecisions = div4Inbox.filter((p) => p.packet_type === "gate_decision");
    expect(gateDecisions.length).toBe(0);

    // Escalation should be emitted to Div1
    const div1Inbox = getDivisionInbox("Div1.HCO");
    const escalations = div1Inbox.filter((p) => p.packet_type === "escalation");
    expect(escalations.length).toBeGreaterThan(0);
  });

  it("executive report captures mission metadata correctly", async () => {
    const mission = intake.frameMission(
      "Div7.MissionControl",
      "Deploy production security patch"
    );
    const missionEnvelope = mission as MissionEnvelope;

    const report = generateExecutiveReport(missionEnvelope, [], []);

    expect(report.mission_summary).toContain(missionEnvelope.mission_id);
    expect(report.mission_summary).toContain(missionEnvelope.title);
    expect(report.mission_summary).toContain(missionEnvelope.business_goal);
    expect(report.mission_summary).toContain(missionEnvelope.risk_level);

    const markdown = toMarkdown(report);
    expect(markdown).toContain("# Executive Report");
    expect(markdown).toContain("## Mission Summary");
    expect(markdown).toContain("## Recommendations");
  });
});
