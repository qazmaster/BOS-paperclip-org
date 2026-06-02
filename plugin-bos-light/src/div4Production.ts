import { createHash } from "crypto";
import { writeFileSync } from "fs";
import { spawn } from "child_process";
import type {
  Division,
  ProductionWorkEvidence,
  Div4ProductionUnauthorized,
  BlockerRaisedPacket,
  QAReviewRequestedPacket,
} from "./contracts";
import { getDivisionInbox, emitDivisionPacket } from "./divisionPacketRouter";
import type { DivisionPacketDiagnostic } from "./divisionPacketRouter";
import { DefaultGitOperations } from "./gitOperations";
import type { GitOperations } from "./gitOperations";

const DIV4_PRODUCTION = "Div4.Production" as const;
const DIV1_HCO = "Div1.HCO" as const;
const DIV5_QUALLIB = "Div5.QualificationsLibraryLearning" as const;

function now(): string {
  return new Date().toISOString();
}

function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

function buildUnauthorized(caller: Division, reason: string): Div4ProductionUnauthorized {
  return {
    schema_version: "1.0",
    authorized: false,
    caller,
    required_role: DIV4_PRODUCTION,
    reason,
    rejected_at: now(),
  };
}

function getHeadCommitSha(localPath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn("git", ["rev-parse", "HEAD"], { cwd: localPath });
    let stdout = "";
    child.stdout.on("data", (data) => {
      stdout += String(data);
    });
    child.on("error", (err) => {
      reject(err);
    });
    child.on("close", (code) => {
      if (code === 0) {
        resolve(stdout.trim());
      } else {
        reject(new Error(`git rev-parse HEAD failed with exit code ${code}`));
      }
    });
  });
}

/**
 * Raise a blocker to Div1.HCO.
 * Div4 must use this instead of direct cross-division communication.
 */
export function raiseBlocker(
  missionId: string,
  taskId: string,
  blockerType: BlockerRaisedPacket["blocker_type"],
  description: string,
  requestedAction: string
): BlockerRaisedPacket {
  const blockerId = `blk_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  const packet: BlockerRaisedPacket = {
    schema_version: "1.0",
    packet_type: "blocker_raised",
    blocker_id: blockerId,
    mission_id: missionId,
    task_id: taskId,
    blocker_type: blockerType,
    description,
    requested_action: requestedAction,
    raised_by: DIV4_PRODUCTION,
    raised_at: now(),
  };

  emitDivisionPacket(DIV4_PRODUCTION, DIV1_HCO, "blocker_raised", packet);
  return packet;
}

/**
 * Request QA review from Div5 through Div1 routing.
 * Div4 must use this to hand off completed work for independent verification.
 */
export function requestQAReview(
  missionId: string,
  taskId: string,
  snapshotId: string,
  commitSha: string,
  branchCreated: string,
  filesChanged: string[],
  localChecksPassed: boolean,
  implementationNotes: string
): QAReviewRequestedPacket {
  const packet: QAReviewRequestedPacket = {
    schema_version: "1.0",
    packet_type: "qa_review_requested",
    mission_id: missionId,
    task_id: taskId,
    snapshot_id: snapshotId,
    commit_sha: commitSha,
    branch_created: branchCreated,
    files_changed: filesChanged,
    local_checks_passed: localChecksPassed,
    implementation_notes: implementationNotes,
    requested_by: DIV4_PRODUCTION,
    requested_at: now(),
  };

  emitDivisionPacket(DIV4_PRODUCTION, DIV1_HCO, "qa_review_requested", packet);
  return packet;
}

export interface ExecuteProductionWorkSuccess {
  authorized: true;
  evidence: ProductionWorkEvidence;
  emitted: {
    completion_report: DivisionPacketDiagnostic;
    status_update: DivisionPacketDiagnostic;
  };
}

export type ExecuteProductionWorkResult =
  | ExecuteProductionWorkSuccess
  | Div4ProductionUnauthorized;

/**
 * Execute local-only production work on an approved sanitized repo snapshot.
 *
 * - Only Div4.Production may call this function.
 * - Retrieves gate_decision from Div4 inbox by snapshot_id.
 * - Validates: approved_for_division, secret_scan_passed, and local_path presence.
 * - Creates a test branch, writes a harmless smoke-test file, adds, and commits.
 * - Does NOT push to any remote.
 * - Builds ProductionWorkEvidence with commit_sha, diff_hash, branch_created, files_changed, pushed:false.
 * - Emits completion_report to Div1.HCO and status_update to Div5.QualificationsLibraryLearning.
 */
export async function executeProductionWork(
  callerDivision: Division,
  snapshotId: string,
  gitOps?: GitOperations
): Promise<ExecuteProductionWorkResult> {
  if (callerDivision !== DIV4_PRODUCTION) {
    return buildUnauthorized(
      callerDivision,
      `Production work is restricted to ${DIV4_PRODUCTION}. Caller ${callerDivision} is not authorized.`
    );
  }

  if (!snapshotId || typeof snapshotId !== "string" || snapshotId.trim().length === 0) {
    return buildUnauthorized(callerDivision, "snapshotId must be a non-empty string.");
  }

  const div4Inbox = getDivisionInbox(DIV4_PRODUCTION);
  const gateDecisionPacket = div4Inbox.find(
    (p) =>
      p.packet_type === "gate_decision" &&
      (p.payload as Record<string, unknown>).snapshot_id === snapshotId
  );

  if (!gateDecisionPacket) {
    return buildUnauthorized(
      callerDivision,
      `No gate_decision packet with snapshot_id ${snapshotId} found in Div4 inbox.`
    );
  }

  const payload = gateDecisionPacket.payload as Record<string, unknown>;

  if (payload.approved_for_division !== DIV4_PRODUCTION) {
    return buildUnauthorized(
      callerDivision,
      `Snapshot not approved for ${DIV4_PRODUCTION}. Expected approved_for_division='${DIV4_PRODUCTION}', got '${payload.approved_for_division}'.`
    );
  }

  if (payload.secret_scan_passed !== true) {
    return buildUnauthorized(
      callerDivision,
      `Secret scan did not pass. Expected secret_scan_passed=true, got '${payload.secret_scan_passed}'.`
    );
  }

  const localPath = payload.local_path as string | undefined;
  if (!localPath || typeof localPath !== "string" || localPath.trim().length === 0) {
    return buildUnauthorized(
      callerDivision,
      "Missing or empty local_path in gate_decision payload. Local workspace path is required for production work."
    );
  }

  const operations = gitOps ?? new DefaultGitOperations();

  const branchName = `bos-smoke-test/${Date.now()}`;
  const smokeTestFile = ".bos-smoke-test.md";
  const smokeTestContent = [
    "# BOS Smoke Test",
    "",
    `Generated by ${DIV4_PRODUCTION} at ${now()}`,
    `Snapshot: ${snapshotId}`,
    "",
    "This is a harmless test file used to verify local git operations.",
    "It does not modify any production code or configuration.",
  ].join("\n");

  // Create test branch
  const checkoutResult = await operations.checkoutBranch(localPath, branchName, true);
  if (!checkoutResult.success) {
    return buildUnauthorized(
      callerDivision,
      `Failed to create test branch: ${checkoutResult.error_category} — ${checkoutResult.redacted_diagnostics}`
    );
  }

  // Write smoke test file
  writeFileSync(`${localPath}/${smokeTestFile}`, smokeTestContent, "utf-8");

  // Add file
  const addResult = await operations.add(localPath, [smokeTestFile]);
  if (!addResult.success) {
    return buildUnauthorized(
      callerDivision,
      `Failed to add smoke test file: ${addResult.error_category} — ${addResult.redacted_diagnostics}`
    );
  }

  // Commit
  const commitResult = await operations.commit(
    localPath,
    `chore(bos): smoke test on ${branchName}`
  );
  if (!commitResult.success) {
    return buildUnauthorized(
      callerDivision,
      `Failed to commit smoke test file: ${commitResult.error_category} — ${commitResult.redacted_diagnostics}`
    );
  }

  // Get commit SHA
  let commitSha: string;
  try {
    commitSha = await getHeadCommitSha(localPath);
  } catch (err) {
    return buildUnauthorized(
      callerDivision,
      `Failed to read HEAD commit SHA: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  const diffHash = sha256(smokeTestContent);

  const evidence: ProductionWorkEvidence = {
    schema_version: "1.0",
    mission_id: (payload.mission_id as string) || "unknown",
    snapshot_id: snapshotId,
    commit_sha: commitSha,
    diff_hash: diffHash,
    branch_created: branchName,
    files_changed: [smokeTestFile],
    pushed: false,
    produced_at: now(),
    produced_by: DIV4_PRODUCTION,
  };

  const completionReport = emitDivisionPacket(DIV4_PRODUCTION, DIV1_HCO, "completion_report", {
    mission_id: evidence.mission_id,
    snapshot_id: snapshotId,
    commit_sha: evidence.commit_sha,
    diff_hash: evidence.diff_hash,
    branch_created: evidence.branch_created,
    files_changed: evidence.files_changed,
    pushed: false,
    produced_at: evidence.produced_at,
    status: "COMPLETED",
  });

  const statusUpdate = emitDivisionPacket(DIV4_PRODUCTION, DIV5_QUALLIB, "status_update", {
    mission_id: evidence.mission_id,
    snapshot_id: snapshotId,
    commit_sha: evidence.commit_sha,
    branch_created: evidence.branch_created,
    local_path: localPath,
    pushed: false,
    status: "COMPLETED",
  });

  return {
    authorized: true,
    evidence,
    emitted: {
      completion_report: completionReport,
      status_update: statusUpdate,
    },
  };
}
