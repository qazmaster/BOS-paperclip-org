import { describe, it, expect, beforeEach } from "vitest";
import {
  verifyAndQuarantine,
  type VerifyAndQuarantineResult,
} from "../src/div5Quarantine";
import {
  emitDivisionPacket,
  getDivisionInbox,
  clearPacketRouter,
} from "../src/divisionPacketRouter";
import type {
  Division,
  Div5QuarantineUnauthorized,
  QuarantineVerdict,
  SanitizedRepoSnapshot,
} from "../src/contracts";
import type { ExternalGitEvidence } from "../src/div6ExternalGateway";
import type { GitCommandEvidence } from "../src/gitOperations";

const ALL_DIVISIONS: Division[] = [
  "Div7.MissionControl",
  "Div1.HCO",
  "Div2.MasterPlanner",
  "Div3.Treasury",
  "Div4.Production",
  "Div5.QualificationsLibraryLearning",
  "Div6.External",
];

function makeGitEvidence(overrides: Partial<GitCommandEvidence> = {}): GitCommandEvidence {
  return {
    command: "git",
    args: ["ls-remote", "https://github.com/example/repo.git"],
    cwd: "/tmp",
    env_keys: ["GIT_ASKPASS"],
    exit_code: 0,
    stdout_hash: "abc123",
    stderr_hash: "def456",
    duration_ms: 120,
    success: true,
    error_category: "none",
    redacted_diagnostics: "OK",
    ...overrides,
  };
}

function makeExternalGitEvidence(
  overrides: Partial<ExternalGitEvidence> = {}
): ExternalGitEvidence {
  return {
    schema_version: "1.0",
    trust_level: "untrusted",
    grant_id: "grant_001",
    mission_id: "mission_001",
    operation: "ls-remote",
    git_evidence: makeGitEvidence(),
    quarantine_ref: "quarantine_12345_abc123",
    produced_at: new Date().toISOString(),
    produced_by: "Div6.External",
    ...overrides,
  };
}

function seedCompletionReport(evidence: ExternalGitEvidence): void {
  emitDivisionPacket("Div6.External", "Div5.QualificationsLibraryLearning", "completion_report", evidence);
}

describe("verifyAndQuarantine", () => {
  beforeEach(() => {
    clearPacketRouter();
  });

  it("rejects non-Div5 callers with Div5QuarantineUnauthorized", () => {
    const nonDiv5 = ALL_DIVISIONS.filter((d) => d !== "Div5.QualificationsLibraryLearning");

    for (const caller of nonDiv5) {
      clearPacketRouter();
      const result = verifyAndQuarantine(
        caller,
        "quarantine_12345_abc123",
        "grant_001"
      );

      expect("authorized" in result).toBe(true);
      const unauthorized = result as Div5QuarantineUnauthorized;
      expect(unauthorized.authorized).toBe(false);
      expect(unauthorized.caller).toBe(caller);
      expect(unauthorized.required_role).toBe("Div5.QualificationsLibraryLearning");
      expect(unauthorized.reason).toContain("Div5.QualificationsLibraryLearning");
      expect(unauthorized.rejected_at).toBeDefined();
    }
  });

  it("rejects empty quarantineRef", () => {
    const result = verifyAndQuarantine(
      "Div5.QualificationsLibraryLearning",
      "",
      "grant_001"
    );
    expect("authorized" in result).toBe(true);
    const unauthorized = result as Div5QuarantineUnauthorized;
    expect(unauthorized.reason).toContain("quarantineRef");
  });

  it("rejects empty expectedGrantId", () => {
    const result = verifyAndQuarantine(
      "Div5.QualificationsLibraryLearning",
      "quarantine_12345_abc123",
      ""
    );
    expect("authorized" in result).toBe(true);
    const unauthorized = result as Div5QuarantineUnauthorized;
    expect(unauthorized.reason).toContain("expectedGrantId");
  });

  it("rejects when no completion_report is found in Div5 inbox", () => {
    const result = verifyAndQuarantine(
      "Div5.QualificationsLibraryLearning",
      "quarantine_12345_abc123",
      "grant_001"
    );

    expect("authorized" in result).toBe(true);
    const success = result as Extract<VerifyAndQuarantineResult, { authorized: true }>;
    expect(success.verdict.status).toBe("REJECTED");
    expect(success.emitted.escalation).toBeDefined();
    expect(success.emitted.status_update).toBeDefined();
    expect(success.emitted.gate_decision).toBeUndefined();

    const div1Inbox = getDivisionInbox("Div1.HCO");
    expect(div1Inbox.length).toBeGreaterThanOrEqual(1);
    const escalation = div1Inbox.find((p) => p.packet_type === "escalation");
    expect(escalation).toBeDefined();
    const status = div1Inbox.find((p) => p.packet_type === "status_update");
    expect(status).toBeDefined();
  });

  it("rejects when trust_level is not 'untrusted'", () => {
    const evidence = makeExternalGitEvidence({ trust_level: "sanitized" as "untrusted" });
    seedCompletionReport(evidence);

    const result = verifyAndQuarantine(
      "Div5.QualificationsLibraryLearning",
      evidence.quarantine_ref,
      evidence.grant_id
    );

    expect("authorized" in result).toBe(true);
    const success = result as Extract<VerifyAndQuarantineResult, { authorized: true }>;
    expect(success.verdict.status).toBe("REJECTED");
    expect(success.verdict.secret_scan_passed).toBe(true);
    expect(success.emitted.escalation).toBeDefined();
  });

  it("rejects when grant_id does not match expectedGrantId", () => {
    const evidence = makeExternalGitEvidence({ grant_id: "grant_002" });
    seedCompletionReport(evidence);

    const result = verifyAndQuarantine(
      "Div5.QualificationsLibraryLearning",
      evidence.quarantine_ref,
      "grant_001"
    );

    expect("authorized" in result).toBe(true);
    const success = result as Extract<VerifyAndQuarantineResult, { authorized: true }>;
    expect(success.verdict.status).toBe("REJECTED");
    expect(success.emitted.escalation).toBeDefined();
  });

  it("rejects immediately when git_evidence.success is false", () => {
    const evidence = makeExternalGitEvidence({
      git_evidence: makeGitEvidence({
        success: false,
        error_category: "auth_failure",
        redacted_diagnostics: "Authentication failed",
      }),
    });
    seedCompletionReport(evidence);

    const result = verifyAndQuarantine(
      "Div5.QualificationsLibraryLearning",
      evidence.quarantine_ref,
      evidence.grant_id
    );

    expect("authorized" in result).toBe(true);
    const success = result as Extract<VerifyAndQuarantineResult, { authorized: true }>;
    expect(success.verdict.status).toBe("REJECTED");
    expect(success.verdict.secret_scan_passed).toBe(true);
    expect(success.emitted.escalation).toBeDefined();
    expect(success.emitted.gate_decision).toBeUndefined();
    expect(success.snapshot).toBeUndefined();
  });

  it("rejects when secret scan detects leaks in redacted_diagnostics", () => {
    const evidence = makeExternalGitEvidence({
      git_evidence: makeGitEvidence({
        redacted_diagnostics: "Something something ghp_abcdefghijklmnopqrstuvwxyz0123456789 here",
      }),
    });
    seedCompletionReport(evidence);

    const result = verifyAndQuarantine(
      "Div5.QualificationsLibraryLearning",
      evidence.quarantine_ref,
      evidence.grant_id
    );

    expect("authorized" in result).toBe(true);
    const success = result as Extract<VerifyAndQuarantineResult, { authorized: true }>;
    expect(success.verdict.status).toBe("REJECTED");
    expect(success.verdict.secret_scan_passed).toBe(false);
    expect(success.verdict.security_flags_ref.length).toBeGreaterThan(0);
    expect(success.emitted.escalation).toBeDefined();
    expect(success.emitted.gate_decision).toBeUndefined();
  });

  it("rejects when secret scan detects leaks in parsed_metadata branches", () => {
    const evidence = makeExternalGitEvidence({
      parsed_metadata: {
        branches: ["main", "feature/ghp_abcdefghijklmnopqrstuvwxyz0123456789"],
        refs: ["refs/heads/main"],
        commit_shas: ["abc123def456789012345678901234567890abcd"],
      },
    });
    seedCompletionReport(evidence);

    const result = verifyAndQuarantine(
      "Div5.QualificationsLibraryLearning",
      evidence.quarantine_ref,
      evidence.grant_id
    );

    expect("authorized" in result).toBe(true);
    const success = result as Extract<VerifyAndQuarantineResult, { authorized: true }>;
    expect(success.verdict.status).toBe("REJECTED");
    expect(success.verdict.secret_scan_passed).toBe(false);
    expect(success.verdict.security_flags_ref.length).toBeGreaterThan(0);
  });

  it("rejects when secret scan detects leaks in parsed_metadata refs", () => {
    const evidence = makeExternalGitEvidence({
      parsed_metadata: {
        branches: ["main"],
        refs: ["refs/heads/main", "refs/heads/feature/glpat-xxxxxxxxxxxxxxxxxxxx"],
        commit_shas: ["abc123def456789012345678901234567890abcd"],
      },
    });
    seedCompletionReport(evidence);

    const result = verifyAndQuarantine(
      "Div5.QualificationsLibraryLearning",
      evidence.quarantine_ref,
      evidence.grant_id
    );

    expect("authorized" in result).toBe(true);
    const success = result as Extract<VerifyAndQuarantineResult, { authorized: true }>;
    expect(success.verdict.status).toBe("REJECTED");
    expect(success.verdict.secret_scan_passed).toBe(false);
  });

  it("approves when all validations pass and no secrets found", () => {
    const evidence = makeExternalGitEvidence({
      parsed_metadata: {
        branches: ["main", "develop"],
        refs: ["HEAD", "refs/heads/main", "refs/heads/develop"],
        commit_shas: [
          "abc123def456789012345678901234567890abcd",
          "def789abc123456789012345678901234567890d",
        ],
      },
    });
    seedCompletionReport(evidence);

    const result = verifyAndQuarantine(
      "Div5.QualificationsLibraryLearning",
      evidence.quarantine_ref,
      evidence.grant_id
    );

    expect("authorized" in result).toBe(true);
    const success = result as Extract<VerifyAndQuarantineResult, { authorized: true }>;
    expect(success.verdict.status).toBe("APPROVED");
    expect(success.verdict.secret_scan_passed).toBe(true);
    expect(success.verdict.branch_inventory).toEqual(["main", "develop"]);
    expect(success.verdict.ref_inventory).toEqual([
      "HEAD",
      "refs/heads/main",
      "refs/heads/develop",
    ]);
    expect(success.verdict.commit_shas).toEqual([
      "abc123def456789012345678901234567890abcd",
      "def789abc123456789012345678901234567890d",
    ]);
    expect(success.verdict.security_flags_ref).toEqual([]);
    expect(success.snapshot).toBeDefined();
    expect(success.snapshot!.approved_for_division).toBe("Div4.Production");
    expect(success.snapshot!.secret_scan_passed).toBe(true);
    expect(success.emitted.gate_decision).toBeDefined();
    expect(success.emitted.status_update).toBeDefined();
    expect(success.emitted.escalation).toBeUndefined();
  });

  it("falls back to git_evidence.args when parsed_metadata.refs is missing", () => {
    const evidence = makeExternalGitEvidence({
      parsed_metadata: {
        branches: ["main"],
        commit_shas: ["abc123def456789012345678901234567890abcd"],
      },
    });
    seedCompletionReport(evidence);

    const result = verifyAndQuarantine(
      "Div5.QualificationsLibraryLearning",
      evidence.quarantine_ref,
      evidence.grant_id
    );

    expect("authorized" in result).toBe(true);
    const success = result as Extract<VerifyAndQuarantineResult, { authorized: true }>;
    expect(success.verdict.status).toBe("APPROVED");
    expect(success.verdict.ref_inventory).toEqual(evidence.git_evidence.args);
  });

  it("emits gate_decision to Div4.Production on approval", () => {
    const evidence = makeExternalGitEvidence();
    seedCompletionReport(evidence);

    verifyAndQuarantine(
      "Div5.QualificationsLibraryLearning",
      evidence.quarantine_ref,
      evidence.grant_id
    );

    const div4Inbox = getDivisionInbox("Div4.Production");
    expect(div4Inbox.length).toBe(1);
    expect(div4Inbox[0].packet_type).toBe("gate_decision");
    expect(div4Inbox[0].from_division).toBe("Div5.QualificationsLibraryLearning");
    expect(div4Inbox[0].to_division).toBe("Div4.Production");

    const payload = div4Inbox[0].payload as Record<string, unknown>;
    expect(payload.quarantine_ref).toBe(evidence.quarantine_ref);
    expect(payload.mission_id).toBe(evidence.mission_id);
    expect(payload.grant_id).toBe(evidence.grant_id);
    expect(payload.secret_scan_passed).toBe(true);
    expect(typeof payload.snapshot_id).toBe("string");
  });

  it("emits escalation to Div1.HCO on rejection", () => {
    const evidence = makeExternalGitEvidence({
      git_evidence: makeGitEvidence({ success: false, error_category: "generic" }),
    });
    seedCompletionReport(evidence);

    verifyAndQuarantine(
      "Div5.QualificationsLibraryLearning",
      evidence.quarantine_ref,
      evidence.grant_id
    );

    const div1Inbox = getDivisionInbox("Div1.HCO");
    const escalation = div1Inbox.find((p) => p.packet_type === "escalation");
    expect(escalation).toBeDefined();
    expect(escalation!.from_division).toBe("Div5.QualificationsLibraryLearning");
    expect(escalation!.to_division).toBe("Div1.HCO");

    const payload = escalation!.payload as Record<string, unknown>;
    expect(payload.quarantine_ref).toBe(evidence.quarantine_ref);
    expect(payload.reason).toBeDefined();
  });

  it("emits status_update to Div1.HCO in both approval and rejection", () => {
    // Approval case
    clearPacketRouter();
    const approveEvidence = makeExternalGitEvidence();
    seedCompletionReport(approveEvidence);

    verifyAndQuarantine(
      "Div5.QualificationsLibraryLearning",
      approveEvidence.quarantine_ref,
      approveEvidence.grant_id
    );

    let div1Inbox = getDivisionInbox("Div1.HCO");
    let statusUpdate = div1Inbox.find((p) => p.packet_type === "status_update");
    expect(statusUpdate).toBeDefined();
    expect((statusUpdate!.payload as Record<string, unknown>).status).toBe("APPROVED");

    // Rejection case
    clearPacketRouter();
    const rejectEvidence = makeExternalGitEvidence({
      git_evidence: makeGitEvidence({ success: false }),
    });
    seedCompletionReport(rejectEvidence);

    verifyAndQuarantine(
      "Div5.QualificationsLibraryLearning",
      rejectEvidence.quarantine_ref,
      rejectEvidence.grant_id
    );

    div1Inbox = getDivisionInbox("Div1.HCO");
    statusUpdate = div1Inbox.find((p) => p.packet_type === "status_update");
    expect(statusUpdate).toBeDefined();
    expect((statusUpdate!.payload as Record<string, unknown>).status).toBe("REJECTED");
  });

  it("does not emit gate_decision on rejection", () => {
    const evidence = makeExternalGitEvidence({
      git_evidence: makeGitEvidence({ success: false }),
    });
    seedCompletionReport(evidence);

    const result = verifyAndQuarantine(
      "Div5.QualificationsLibraryLearning",
      evidence.quarantine_ref,
      evidence.grant_id
    );

    expect("authorized" in result).toBe(true);
    const success = result as Extract<VerifyAndQuarantineResult, { authorized: true }>;
    expect(success.emitted.gate_decision).toBeUndefined();

    const div4Inbox = getDivisionInbox("Div4.Production");
    expect(div4Inbox.length).toBe(0);
  });

  it("isolates packet state between tests", () => {
    const evidence = makeExternalGitEvidence();
    seedCompletionReport(evidence);

    verifyAndQuarantine(
      "Div5.QualificationsLibraryLearning",
      evidence.quarantine_ref,
      evidence.grant_id
    );

    expect(getDivisionInbox("Div5.QualificationsLibraryLearning").length).toBe(1);
    expect(getDivisionInbox("Div4.Production").length).toBe(1);
    expect(getDivisionInbox("Div1.HCO").length).toBe(1);

    clearPacketRouter();
    expect(getDivisionInbox("Div5.QualificationsLibraryLearning").length).toBe(0);
    expect(getDivisionInbox("Div4.Production").length).toBe(0);
    expect(getDivisionInbox("Div1.HCO").length).toBe(0);
  });

  it("verifies multiple packets in inbox and selects correct one by quarantine_ref", () => {
    const evidence1 = makeExternalGitEvidence({ quarantine_ref: "quarantine_111_aaa" });
    const evidence2 = makeExternalGitEvidence({ quarantine_ref: "quarantine_222_bbb" });
    seedCompletionReport(evidence1);
    seedCompletionReport(evidence2);

    const result = verifyAndQuarantine(
      "Div5.QualificationsLibraryLearning",
      evidence2.quarantine_ref,
      evidence2.grant_id
    );

    expect("authorized" in result).toBe(true);
    const success = result as Extract<VerifyAndQuarantineResult, { authorized: true }>;
    expect(success.verdict.quarantine_ref).toBe(evidence2.quarantine_ref);
    expect(success.verdict.mission_id).toBe(evidence2.mission_id);
  });

  it("produces SanitizedRepoSnapshot with correct schema version and fields on approval", () => {
    const evidence = makeExternalGitEvidence({
      parsed_metadata: {
        branches: ["main"],
        refs: ["refs/heads/main"],
        commit_shas: ["abc123def456789012345678901234567890abcd"],
      },
    });
    seedCompletionReport(evidence);

    const result = verifyAndQuarantine(
      "Div5.QualificationsLibraryLearning",
      evidence.quarantine_ref,
      evidence.grant_id
    );

    expect("authorized" in result).toBe(true);
    const success = result as Extract<VerifyAndQuarantineResult, { authorized: true }>;
    const snapshot = success.snapshot!;
    expect(snapshot.schema_version).toBe("1.0");
    expect(snapshot.quarantine_ref).toBe(evidence.quarantine_ref);
    expect(snapshot.mission_id).toBe(evidence.mission_id);
    expect(snapshot.approved_for_division).toBe("Div4.Production");
    expect(snapshot.approved_by).toBe("Div5.QualificationsLibraryLearning");
    expect(snapshot.branch_inventory).toEqual(["main"]);
    expect(snapshot.ref_inventory).toEqual(["refs/heads/main"]);
    expect(snapshot.commit_shas).toEqual(["abc123def456789012345678901234567890abcd"]);
    expect(snapshot.secret_scan_passed).toBe(true);
    expect(snapshot.snapshot_id).toMatch(/^snapshot_\d+_[a-z0-9]+$/);
    expect(snapshot.approved_at).toBeDefined();
  });

  it("populates security_flags_ref with sequential IDs on secret scan failure", () => {
    const evidence = makeExternalGitEvidence({
      git_evidence: makeGitEvidence({
        redacted_diagnostics:
          "Multiple tokens: ghp_abcdefghijklmnopqrstuvwxyz0123456789 and glpat-xxxxxxxxxxxxxxxxxxxx",
      }),
    });
    seedCompletionReport(evidence);

    const result = verifyAndQuarantine(
      "Div5.QualificationsLibraryLearning",
      evidence.quarantine_ref,
      evidence.grant_id
    );

    expect("authorized" in result).toBe(true);
    const success = result as Extract<VerifyAndQuarantineResult, { authorized: true }>;
    expect(success.verdict.security_flags_ref).toEqual(["flag_001", "flag_002"]);
  });

  it("does not flag commit_shas as secret leaks in parsed_metadata", () => {
    const evidence = makeExternalGitEvidence({
      parsed_metadata: {
        branches: ["main"],
        refs: ["refs/heads/main"],
        commit_shas: ["abc123def456789012345678901234567890abcd"],
      },
    });
    seedCompletionReport(evidence);

    const result = verifyAndQuarantine(
      "Div5.QualificationsLibraryLearning",
      evidence.quarantine_ref,
      evidence.grant_id
    );

    expect("authorized" in result).toBe(true);
    const success = result as Extract<VerifyAndQuarantineResult, { authorized: true }>;
    expect(success.verdict.secret_scan_passed).toBe(true);
    expect(success.verdict.security_flags_ref).toEqual([]);
  });

  it("rejects when git_evidence is missing from completion_report", () => {
    const evidence = makeExternalGitEvidence({ git_evidence: undefined as unknown as GitCommandEvidence });
    seedCompletionReport(evidence);

    const result = verifyAndQuarantine(
      "Div5.QualificationsLibraryLearning",
      evidence.quarantine_ref,
      evidence.grant_id
    );

    expect("authorized" in result).toBe(true);
    const success = result as Extract<VerifyAndQuarantineResult, { authorized: true }>;
    expect(success.verdict.status).toBe("REJECTED");
    expect(success.verdict.secret_scan_passed).toBe(true);
    expect(success.emitted.escalation).toBeDefined();
    expect(success.emitted.status_update).toBeDefined();
    expect(success.emitted.gate_decision).toBeUndefined();
    expect(success.snapshot).toBeUndefined();

    const div1Inbox = getDivisionInbox("Div1.HCO");
    const escalation = div1Inbox.find((p) => p.packet_type === "escalation");
    expect(escalation).toBeDefined();
    const payload = escalation!.payload as Record<string, unknown>;
    expect(payload.reason).toContain("Missing git_evidence");
  });

  it("snapshot is undefined on rejection and fully sanitized on approval", () => {
    // Rejection case — no snapshot
    clearPacketRouter();
    const rejectEvidence = makeExternalGitEvidence({
      git_evidence: makeGitEvidence({ success: false, error_category: "generic" }),
    });
    seedCompletionReport(rejectEvidence);

    const rejectResult = verifyAndQuarantine(
      "Div5.QualificationsLibraryLearning",
      rejectEvidence.quarantine_ref,
      rejectEvidence.grant_id
    );

    expect("authorized" in rejectResult).toBe(true);
    const rejectSuccess = rejectResult as Extract<VerifyAndQuarantineResult, { authorized: true }>;
    expect(rejectSuccess.snapshot).toBeUndefined();
    expect(rejectSuccess.verdict.status).toBe("REJECTED");
    expect(rejectSuccess.verdict.branch_inventory).toEqual([]);
    expect(rejectSuccess.verdict.ref_inventory).toEqual([]);
    expect(rejectSuccess.verdict.commit_shas).toEqual([]);

    // Approval case — snapshot is fully sanitized
    clearPacketRouter();
    const approveEvidence = makeExternalGitEvidence({
      parsed_metadata: {
        branches: ["main", "feature/x"],
        refs: ["HEAD", "refs/heads/main", "refs/heads/feature/x"],
        commit_shas: ["abc123def456789012345678901234567890abcd"],
      },
    });
    seedCompletionReport(approveEvidence);

    const approveResult = verifyAndQuarantine(
      "Div5.QualificationsLibraryLearning",
      approveEvidence.quarantine_ref,
      approveEvidence.grant_id
    );

    expect("authorized" in approveResult).toBe(true);
    const approveSuccess = approveResult as Extract<VerifyAndQuarantineResult, { authorized: true }>;
    expect(approveSuccess.snapshot).toBeDefined();
    expect(approveSuccess.snapshot!.secret_scan_passed).toBe(true);
    expect(approveSuccess.snapshot!.approved_for_division).toBe("Div4.Production");
    expect(approveSuccess.snapshot!.branch_inventory).toEqual(["main", "feature/x"]);
    expect(approveSuccess.snapshot!.ref_inventory).toEqual(["HEAD", "refs/heads/main", "refs/heads/feature/x"]);
    expect(approveSuccess.snapshot!.commit_shas).toEqual(["abc123def456789012345678901234567890abcd"]);
    expect(approveSuccess.verdict.status).toBe("APPROVED");
    expect(approveSuccess.verdict.secret_scan_passed).toBe(true);
    expect(approveSuccess.verdict.branch_inventory).toEqual(["main", "feature/x"]);
    expect(approveSuccess.verdict.ref_inventory).toEqual(["HEAD", "refs/heads/main", "refs/heads/feature/x"]);
    expect(approveSuccess.verdict.commit_shas).toEqual(["abc123def456789012345678901234567890abcd"]);
  });

  it("handles missing parsed_metadata gracefully", () => {
    const evidence = makeExternalGitEvidence({ parsed_metadata: undefined });
    seedCompletionReport(evidence);

    const result = verifyAndQuarantine(
      "Div5.QualificationsLibraryLearning",
      evidence.quarantine_ref,
      evidence.grant_id
    );

    expect("authorized" in result).toBe(true);
    const success = result as Extract<VerifyAndQuarantineResult, { authorized: true }>;
    expect(success.verdict.status).toBe("APPROVED");
    expect(success.verdict.branch_inventory).toEqual([]);
    expect(success.verdict.commit_shas).toEqual([]);
    expect(success.verdict.ref_inventory).toEqual(evidence.git_evidence.args);
  });

  it("propagates local_path from evidence into SanitizedRepoSnapshot", () => {
    const evidence = makeExternalGitEvidence({
      local_path: "/tmp/test-repo",
      parsed_metadata: {
        branches: ["main"],
        refs: ["refs/heads/main"],
        commit_shas: ["abc123def456789012345678901234567890abcd"],
      },
    });
    seedCompletionReport(evidence);

    const result = verifyAndQuarantine(
      "Div5.QualificationsLibraryLearning",
      evidence.quarantine_ref,
      evidence.grant_id
    );

    expect("authorized" in result).toBe(true);
    const success = result as Extract<VerifyAndQuarantineResult, { authorized: true }>;
    expect(success.snapshot).toBeDefined();
    expect(success.snapshot!.local_path).toBe("/tmp/test-repo");
  });

  it("omits local_path from snapshot when evidence lacks it", () => {
    const evidence = makeExternalGitEvidence({
      parsed_metadata: {
        branches: ["main"],
        refs: ["refs/heads/main"],
        commit_shas: ["abc123def456789012345678901234567890abcd"],
      },
    });
    seedCompletionReport(evidence);

    const result = verifyAndQuarantine(
      "Div5.QualificationsLibraryLearning",
      evidence.quarantine_ref,
      evidence.grant_id
    );

    expect("authorized" in result).toBe(true);
    const success = result as Extract<VerifyAndQuarantineResult, { authorized: true }>;
    expect(success.snapshot).toBeDefined();
    expect(success.snapshot!).not.toHaveProperty("local_path");
  });

  it("propagates local_path through gate_decision to Div4.Production", () => {
    const evidence = makeExternalGitEvidence({
      local_path: "/workspace/clone-42",
      parsed_metadata: {
        branches: ["main"],
        refs: ["refs/heads/main"],
        commit_shas: ["abc123def456789012345678901234567890abcd"],
      },
    });
    seedCompletionReport(evidence);

    verifyAndQuarantine(
      "Div5.QualificationsLibraryLearning",
      evidence.quarantine_ref,
      evidence.grant_id
    );

    const div4Inbox = getDivisionInbox("Div4.Production");
    expect(div4Inbox.length).toBe(1);
    const payload = div4Inbox[0].payload as Record<string, unknown>;
    expect(payload.local_path).toBe("/workspace/clone-42");
  });

  it("omits local_path from gate_decision when evidence lacks it", () => {
    const evidence = makeExternalGitEvidence({
      parsed_metadata: {
        branches: ["main"],
        refs: ["refs/heads/main"],
        commit_shas: ["abc123def456789012345678901234567890abcd"],
      },
    });
    seedCompletionReport(evidence);

    verifyAndQuarantine(
      "Div5.QualificationsLibraryLearning",
      evidence.quarantine_ref,
      evidence.grant_id
    );

    const div4Inbox = getDivisionInbox("Div4.Production");
    expect(div4Inbox.length).toBe(1);
    const payload = div4Inbox[0].payload as Record<string, unknown>;
    expect(payload).not.toHaveProperty("local_path");
  });
});
