import type {
  Division,
  QuarantineVerdict,
  SanitizedRepoSnapshot,
  Div5QuarantineUnauthorized,
} from "./contracts";
import type { ExternalGitEvidence } from "./div6ExternalGateway";
import { getDivisionInbox, emitDivisionPacket } from "./divisionPacketRouter";
import type { DivisionPacketDiagnostic } from "./divisionPacketRouter";
import { SECRET_PATTERNS } from "./gitOperations";
import type { SecurityFlag } from "./qaReview";

const DIV5_QUALLIB = "Div5.QualificationsLibraryLearning" as const;
const DIV4_PRODUCTION = "Div4.Production" as const;
const DIV1_HCO = "Div1.HCO" as const;

function now(): string {
  return new Date().toISOString();
}

function generateSnapshotId(): string {
  return `snapshot_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function buildUnauthorized(caller: Division, reason: string): Div5QuarantineUnauthorized {
  return {
    schema_version: "1.0",
    authorized: false,
    caller,
    required_role: DIV5_QUALLIB,
    reason,
    rejected_at: now(),
  };
}

function scanTextForSecrets(text: string, context: string): SecurityFlag[] {
  const flags: SecurityFlag[] = [];

  const patterns: Array<{
    pattern: RegExp;
    severity: SecurityFlag["severity"];
    category: SecurityFlag["category"];
    message: string;
  }> = [
    {
      pattern: SECRET_PATTERNS[0],
      severity: "critical",
      category: "secret_leak",
      message: "GitHub personal access token pattern detected",
    },
    {
      pattern: SECRET_PATTERNS[1],
      severity: "critical",
      category: "secret_leak",
      message: "GitLab personal access token pattern detected",
    },
    {
      pattern: SECRET_PATTERNS[2],
      severity: "critical",
      category: "secret_leak",
      message: "OpenSSH private key pattern detected",
    },
    {
      pattern: SECRET_PATTERNS[3],
      severity: "critical",
      category: "secret_leak",
      message: "RSA private key pattern detected",
    },
    {
      pattern: SECRET_PATTERNS[4],
      severity: "critical",
      category: "secret_leak",
      message: "EC private key pattern detected",
    },
    {
      pattern: SECRET_PATTERNS[5],
      severity: "warning",
      category: "secret_leak",
      message: "40-character hex pattern detected (possible leaked commit SHA or API key)",
    },
  ];

  for (const { pattern, severity, category, message } of patterns) {
    const matches = text.match(pattern);
    if (matches) {
      for (const _match of matches) {
        flags.push({
          severity,
          category,
          message: `${message} in ${context}`,
        });
      }
    }
  }

  return flags;
}

function performSecretScan(evidence: ExternalGitEvidence): SecurityFlag[] {
  const flags: SecurityFlag[] = [];

  if (evidence.git_evidence.redacted_diagnostics) {
    flags.push(
      ...scanTextForSecrets(
        evidence.git_evidence.redacted_diagnostics,
        "git redacted_diagnostics"
      )
    );
  }

  if (evidence.parsed_metadata?.branches) {
    for (const branch of evidence.parsed_metadata.branches) {
      flags.push(...scanTextForSecrets(branch, `branch: ${branch}`));
    }
  }

  if (evidence.parsed_metadata?.refs) {
    for (const ref of evidence.parsed_metadata.refs) {
      flags.push(...scanTextForSecrets(ref, `ref: ${ref}`));
    }
  }

  return flags;
}

export interface VerifyAndQuarantineEmissions {
  gate_decision?: DivisionPacketDiagnostic;
  escalation?: DivisionPacketDiagnostic;
  status_update: DivisionPacketDiagnostic;
}

export interface VerifyAndQuarantineSuccess {
  authorized: true;
  verdict: QuarantineVerdict;
  snapshot?: SanitizedRepoSnapshot;
  emitted: VerifyAndQuarantineEmissions;
}

export type VerifyAndQuarantineResult =
  | VerifyAndQuarantineSuccess
  | Div5QuarantineUnauthorized;

function emitRejection(
  quarantineRef: string,
  expectedGrantId: string,
  reason: string,
  missionId?: string,
  grantId?: string,
  flags: SecurityFlag[] = []
): VerifyAndQuarantineSuccess {
  const scannedAt = now();
  const verdict: QuarantineVerdict = {
    schema_version: "1.0",
    quarantine_ref: quarantineRef,
    mission_id: missionId || "unknown",
    grant_id: grantId || expectedGrantId,
    status: "REJECTED",
    secret_scan_passed: flags.length === 0,
    branch_inventory: [],
    ref_inventory: [],
    commit_shas: [],
    scanned_at: scannedAt,
    scanned_by: DIV5_QUALLIB,
    security_flags_ref: flags.map((_, i) => `flag_${String(i + 1).padStart(3, "0")}`),
  };

  const statusUpdate = emitDivisionPacket(DIV5_QUALLIB, DIV1_HCO, "status_update", {
    quarantine_ref: quarantineRef,
    mission_id: missionId || "unknown",
    grant_id: grantId || expectedGrantId,
    status: "REJECTED",
    secret_scan_passed: verdict.secret_scan_passed,
    rejection_reason: reason,
    security_flag_count: flags.length,
  });

  const escalation = emitDivisionPacket(DIV5_QUALLIB, DIV1_HCO, "escalation", {
    quarantine_ref: quarantineRef,
    mission_id: missionId || "unknown",
    grant_id: grantId || expectedGrantId,
    reason,
    secret_scan_passed: verdict.secret_scan_passed,
    security_flags: flags,
  });

  return {
    authorized: true,
    verdict,
    emitted: {
      status_update: statusUpdate,
      escalation,
    },
  };
}

/**
 * Verify and quarantine external git evidence from Div6.External.
 *
 * - Only Div5.QualificationsLibraryLearning may call this function.
 * - Retrieves completion_report from Div5 inbox by quarantine_ref.
 * - Validates evidence: trust_level must be 'untrusted', git_evidence must exist,
 *   grant_id must match expectedGrantId.
 * - Rejects immediately if git_evidence.success is false.
 * - Scans redacted_diagnostics and parsed_metadata for secret patterns.
 * - Builds QuarantineVerdict and SanitizedRepoSnapshot.
 * - Emits gate_decision to Div4.Production on approval.
 * - Emits escalation to Div1.HCO on rejection.
 * - Emits status_update to Div1.HCO in both cases.
 */
export function verifyAndQuarantine(
  callerDivision: Division,
  quarantineRef: string,
  expectedGrantId: string
): VerifyAndQuarantineResult {
  if (callerDivision !== DIV5_QUALLIB) {
    return buildUnauthorized(
      callerDivision,
      `Quarantine verification is restricted to ${DIV5_QUALLIB}. Caller ${callerDivision} is not authorized.`
    );
  }

  if (!quarantineRef || typeof quarantineRef !== "string" || quarantineRef.trim().length === 0) {
    return buildUnauthorized(callerDivision, "quarantineRef must be a non-empty string.");
  }

  if (
    !expectedGrantId ||
    typeof expectedGrantId !== "string" ||
    expectedGrantId.trim().length === 0
  ) {
    return buildUnauthorized(callerDivision, "expectedGrantId must be a non-empty string.");
  }

  const div5Inbox = getDivisionInbox(DIV5_QUALLIB);
  const reportPacket = div5Inbox.find(
    (p) =>
      p.packet_type === "completion_report" &&
      (p.payload as ExternalGitEvidence).quarantine_ref === quarantineRef
  );

  if (!reportPacket) {
    return emitRejection(
      quarantineRef,
      expectedGrantId,
      `No completion_report packet with quarantine_ref ${quarantineRef} found in Div5 inbox.`
    );
  }

  const evidence = reportPacket.payload as ExternalGitEvidence;

  if (evidence.trust_level !== "untrusted") {
    return emitRejection(
      quarantineRef,
      expectedGrantId,
      `Invalid trust_level: expected 'untrusted', got '${evidence.trust_level}'.`,
      evidence.mission_id,
      evidence.grant_id
    );
  }

  if (!evidence.git_evidence) {
    return emitRejection(
      quarantineRef,
      expectedGrantId,
      "Missing git_evidence in completion_report.",
      evidence.mission_id,
      evidence.grant_id
    );
  }

  if (evidence.grant_id !== expectedGrantId) {
    return emitRejection(
      quarantineRef,
      expectedGrantId,
      `Grant ID mismatch: expected ${expectedGrantId}, got ${evidence.grant_id}.`,
      evidence.mission_id,
      evidence.grant_id
    );
  }

  if (evidence.git_evidence.success === false) {
    return emitRejection(
      quarantineRef,
      expectedGrantId,
      `Git operation failed: ${evidence.git_evidence.error_category} — ${evidence.git_evidence.redacted_diagnostics}`,
      evidence.mission_id,
      evidence.grant_id
    );
  }

  const flags = performSecretScan(evidence);
  const secretScanPassed = flags.length === 0;

  if (!secretScanPassed) {
    return emitRejection(
      quarantineRef,
      expectedGrantId,
      `Secret scan failed with ${flags.length} flag(s).`,
      evidence.mission_id,
      evidence.grant_id,
      flags
    );
  }

  const commitShas = evidence.parsed_metadata?.commit_shas ?? [];
  const branches = evidence.parsed_metadata?.branches ?? [];
  const refs = evidence.parsed_metadata?.refs ?? evidence.git_evidence.args ?? [];

  const scannedAt = now();
  const verdict: QuarantineVerdict = {
    schema_version: "1.0",
    quarantine_ref: quarantineRef,
    mission_id: evidence.mission_id,
    grant_id: evidence.grant_id,
    status: "APPROVED",
    secret_scan_passed: true,
    branch_inventory: branches,
    ref_inventory: refs,
    commit_shas: commitShas,
    scanned_at: scannedAt,
    scanned_by: DIV5_QUALLIB,
    security_flags_ref: [],
  };

  const snapshot: SanitizedRepoSnapshot = {
    schema_version: "1.0",
    snapshot_id: generateSnapshotId(),
    quarantine_ref: quarantineRef,
    mission_id: evidence.mission_id,
    approved_for_division: DIV4_PRODUCTION,
    branch_inventory: branches,
    ref_inventory: refs,
    commit_shas: commitShas,
    secret_scan_passed: true,
    approved_at: scannedAt,
    approved_by: DIV5_QUALLIB,
    ...(evidence.local_path !== undefined ? { local_path: evidence.local_path } : {}),
  };

  const gateDecision = emitDivisionPacket(DIV5_QUALLIB, DIV4_PRODUCTION, "gate_decision", {
    quarantine_ref: quarantineRef,
    mission_id: evidence.mission_id,
    grant_id: evidence.grant_id,
    secret_scan_passed: true,
    snapshot_id: snapshot.snapshot_id,
    approved_for_division: DIV4_PRODUCTION,
    approved_at: snapshot.approved_at,
    branch_inventory: branches,
    ref_inventory: refs,
    commit_shas: commitShas,
    ...(snapshot.local_path !== undefined ? { local_path: snapshot.local_path } : {}),
  });

  const statusUpdate = emitDivisionPacket(DIV5_QUALLIB, DIV1_HCO, "status_update", {
    quarantine_ref: quarantineRef,
    mission_id: evidence.mission_id,
    grant_id: evidence.grant_id,
    status: "APPROVED",
    secret_scan_passed: true,
    snapshot_id: snapshot.snapshot_id,
    branch_count: branches.length,
    ref_count: refs.length,
    commit_count: commitShas.length,
  });

  return {
    authorized: true,
    verdict,
    snapshot,
    emitted: {
      gate_decision: gateDecision,
      status_update: statusUpdate,
    },
  };
}
