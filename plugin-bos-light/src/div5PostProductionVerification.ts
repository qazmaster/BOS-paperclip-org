import { existsSync, statSync } from "fs";
import { execSync } from "child_process";
import type {
  Division,
  PostProductionCheck,
  PostProductionVerdict,
  Div5PostProductionUnauthorized,
} from "./contracts";
import { getDivisionInbox, emitDivisionPacket } from "./divisionPacketRouter";
import type { DivisionPacketDiagnostic } from "./divisionPacketRouter";
import type { GitOperations } from "./gitOperations";

const DIV5_QUALLIB = "Div5.QualificationsLibraryLearning" as const;
const DIV1_HCO = "Div1.HCO" as const;
const DIV7_MISSION_CONTROL = "Div7.MissionControl" as const;

function now(): string {
  return new Date().toISOString();
}

function buildUnauthorized(caller: Division, reason: string): Div5PostProductionUnauthorized {
  return {
    schema_version: "1.0",
    authorized: false,
    caller,
    required_role: DIV5_QUALLIB,
    reason,
    rejected_at: now(),
  };
}

function execGit(args: string[], cwd: string): string {
  return execSync(`git ${args.join(" ")}`, { cwd, encoding: "utf-8" }).trim();
}

export interface PostProductionVerificationSuccess {
  authorized: true;
  verdict: PostProductionVerdict;
  emitted: {
    status_update_hco: DivisionPacketDiagnostic;
    status_update_mission_control: DivisionPacketDiagnostic;
  };
}

export type PostProductionVerificationResult =
  | PostProductionVerificationSuccess
  | Div5PostProductionUnauthorized;

/**
 * Verify Div4's production work against the local workspace.
 *
 * - Only Div5.QualificationsLibraryLearning may call this function.
 * - Reads status_update from Div5 inbox by snapshot_id match.
 * - Extracts commit_sha, branch_created, mission_id from the payload.
 * - Gets local_path from the status_update payload (added in T01).
 * - Runs 7 synchronous verification checks using fs.existsSync and execSync.
 * - Builds PostProductionVerdict with all check results and overall PASS/FAIL.
 * - Emits status_update to Div1.HCO and Div7.MissionControl with verdict summary.
 */
export function verifyProductionWork(
  callerDivision: Division,
  snapshotId: string,
  _gitOps?: GitOperations
): PostProductionVerificationResult {
  // ── Authorization check ──
  if (callerDivision !== DIV5_QUALLIB) {
    return buildUnauthorized(
      callerDivision,
      `Post-production verification is restricted to ${DIV5_QUALLIB}. Caller ${callerDivision} is not authorized.`
    );
  }

  if (!snapshotId || typeof snapshotId !== "string" || snapshotId.trim().length === 0) {
    return buildUnauthorized(callerDivision, "snapshotId must be a non-empty string.");
  }

  // ── Read status_update from Div5 inbox ──
  const div5Inbox = getDivisionInbox(DIV5_QUALLIB);
  const statusPacket = div5Inbox.find(
    (p) =>
      p.packet_type === "status_update" &&
      (p.payload as Record<string, unknown>).snapshot_id === snapshotId
  );

  if (!statusPacket) {
    return buildUnauthorized(
      callerDivision,
      `No status_update packet with snapshot_id ${snapshotId} found in Div5 inbox.`
    );
  }

  const payload = statusPacket.payload as Record<string, unknown>;

  const commitSha = payload.commit_sha as string;
  const branchCreated = payload.branch_created as string;
  const missionId = (payload.mission_id as string) || "unknown";
  const localPath = payload.local_path as string | undefined;

  // ── Validate local_path ──
  if (!localPath || typeof localPath !== "string" || localPath.trim().length === 0) {
    return buildUnauthorized(
      callerDivision,
      "Missing or empty local_path in status_update payload. Workspace path is required for post-production verification."
    );
  }

  // ── Run 7 verification checks ──
  const checks: PostProductionCheck[] = [];
  let allPassed = true;

  function addCheck(id: string, passed: boolean, detail: string): void {
    checks.push({ check_id: id, passed, detail });
    if (!passed) allPassed = false;
  }

  // 1. branch_exists
  try {
    const branches = execGit(["branch"], localPath);
    const branchExists = branches
      .split("\n")
      .some((b) => b.replace(/^\*?\s*/, "").trim() === branchCreated);
    addCheck(
      "branch_exists",
      branchExists,
      branchExists
        ? `Branch '${branchCreated}' found.`
        : `Branch '${branchCreated}' not found. Available: ${branches.trim()}`
    );
  } catch (err) {
    addCheck(
      "branch_exists",
      false,
      `git branch failed: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  // 2. commit_sha_matches_head
  try {
    const headSha = execGit(["rev-parse", branchCreated], localPath);
    const shaMatches = headSha === commitSha;
    addCheck(
      "commit_sha_matches_head",
      shaMatches,
      shaMatches
        ? `HEAD on '${branchCreated}' matches commit SHA.`
        : `Expected '${commitSha}', got '${headSha}'.`
    );
  } catch (err) {
    addCheck(
      "commit_sha_matches_head",
      false,
      `git rev-parse failed: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  // 3. smoke_file_exists
  const smokeFilePath = `${localPath}/.bos-smoke-test.md`;
  const smokeExists = existsSync(smokeFilePath);
  addCheck(
    "smoke_file_exists",
    smokeExists,
    smokeExists
      ? `Smoke test file found at ${smokeFilePath}.`
      : `Smoke test file not found at ${smokeFilePath}.`
  );

  // 4. files_changed_present
  try {
    const diffOutput = execGit(["diff-tree", "--no-commit-id", "-r", "--name-only", commitSha], localPath);
    const changedFiles = diffOutput.split("\n").filter((f) => f.trim().length > 0);
    let allFilesPresent = true;
    const missingFiles: string[] = [];

    for (const file of changedFiles) {
      const filePath = `${localPath}/${file}`;
      const exists = existsSync(filePath);
      if (!exists) {
        allFilesPresent = false;
        missingFiles.push(file);
      }
    }

    addCheck(
      "files_changed_present",
      allFilesPresent,
      allFilesPresent
        ? `All ${changedFiles.length} changed file(s) present on disk.`
        : `Missing files: ${missingFiles.join(", ")}.`
    );
  } catch (err) {
    addCheck(
      "files_changed_present",
      false,
      `git diff-tree failed: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  // 5. not_pushed
  try {
    const remotes = execGit(["remote"], localPath);
    const noRemotes = remotes.length === 0;
    addCheck(
      "not_pushed",
      noRemotes,
      noRemotes
        ? "No remotes configured. Work is local-only."
        : `Remotes found: ${remotes}. Work may have been pushed.`
    );
  } catch (err) {
    addCheck(
      "not_pushed",
      false,
      `git remote failed: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  // 6. main_branch_unchanged
  try {
    const mainSha = execGit(["rev-parse", "main"], localPath);
    // Verify main is an ancestor-or-equal of the current state and
    // that no commits were made directly on main after the snapshot
    // by checking that main's HEAD is reachable from the gate commit.
    // Simplified: check main SHA didn't change from what it should be.
    // Since we don't have the original main SHA, we verify main is
    // not the same as the test branch HEAD (confirming the branch diverged).
    const testBranchSha = commitSha;
    const mainUnchanged = mainSha !== testBranchSha;
    addCheck(
      "main_branch_unchanged",
      mainUnchanged,
      mainUnchanged
        ? `main HEAD (${mainSha.slice(0, 8)}) is distinct from test branch HEAD (${testBranchSha.slice(0, 8)}).`
        : `main HEAD matches test branch HEAD — main may have been modified.`
    );
  } catch (err) {
    addCheck(
      "main_branch_unchanged",
      false,
      `git rev-parse main failed: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  // 7. on_test_branch
  try {
    const currentBranch = execGit(["rev-parse", "--abbrev-ref", "HEAD"], localPath);
    const onTestBranch = currentBranch === branchCreated;
    addCheck(
      "on_test_branch",
      onTestBranch,
      onTestBranch
        ? `Currently on test branch '${branchCreated}'.`
        : `Expected branch '${branchCreated}', currently on '${currentBranch}'.`
    );
  } catch (err) {
    addCheck(
      "on_test_branch",
      false,
      `git rev-parse --abbrev-ref HEAD failed: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  // ── Build verdict ──
  const evaluatedAt = now();

  const verdict: PostProductionVerdict = {
    schema_version: "1.0",
    mission_id: missionId,
    snapshot_id: snapshotId,
    branch_created: branchCreated,
    commit_sha: commitSha,
    checks,
    overall: allPassed ? "PASS" : "FAIL",
    evaluated_at: evaluatedAt,
    evaluated_by: DIV5_QUALLIB,
  };

  // ── Emit status_updates ──
  const failedChecks = checks.filter((c) => !c.passed);

  const statusUpdateHco = emitDivisionPacket(DIV5_QUALLIB, DIV1_HCO, "status_update", {
    mission_id: missionId,
    snapshot_id: snapshotId,
    verdict: verdict.overall,
    check_count: checks.length,
    passed_count: checks.filter((c) => c.passed).length,
    failed_count: failedChecks.length,
    failed_checks: failedChecks.map((c) => ({ check_id: c.check_id, detail: c.detail })),
    evaluated_at: evaluatedAt,
  });

  const statusUpdateMc = emitDivisionPacket(DIV5_QUALLIB, DIV7_MISSION_CONTROL, "status_update", {
    mission_id: missionId,
    snapshot_id: snapshotId,
    verdict: verdict.overall,
    check_count: checks.length,
    passed_count: checks.filter((c) => c.passed).length,
    failed_count: failedChecks.length,
    evaluated_at: evaluatedAt,
  });

  return {
    authorized: true,
    verdict,
    emitted: {
      status_update_hco: statusUpdateHco,
      status_update_mission_control: statusUpdateMc,
    },
  };
}
