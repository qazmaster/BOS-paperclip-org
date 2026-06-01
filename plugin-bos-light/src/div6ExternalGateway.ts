import type {
  Division,
  ScopedAccessGrant,
  ExternalGitGatewayUnauthorized,
  SecretRef,
} from "./contracts";
import type { GitCommandEvidence } from "./gitOperations";
import { DefaultGitOperations } from "./gitOperations";
import { emitDivisionPacket, getDivisionInbox } from "./divisionPacketRouter";
import { resolveSecretRef, redactSecretRef } from "./secretResolver";

const DIV6_EXTERNAL = "Div6.External" as const;
const DIV3_TREASURY = "Div3.Treasury" as const;
const DIV5_QUALLIB = "Div5.QualificationsLibraryLearning" as const;
const DIV1_HCO = "Div1.HCO" as const;

export type ExternalGitOperation = "ls-remote" | "clone" | "fetch";

export interface ExternalGitEvidence {
  schema_version: "1.0";
  trust_level: "untrusted";
  grant_id: string;
  mission_id: string;
  operation: ExternalGitOperation;
  git_evidence: GitCommandEvidence;
  quarantine_ref: string;
  produced_at: string;
  produced_by: "Div6.External";
  /** Optional structured metadata parsed from git output (refs, branches, commit SHAs). */
  parsed_metadata?: {
    branches?: string[];
    refs?: string[];
    commit_shas?: string[];
  };
}

function now(): string {
  return new Date().toISOString();
}

function generateQuarantineRef(): string {
  return `quarantine_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function isGrantExpired(grant: ScopedAccessGrant): boolean {
  return new Date(grant.expires_at).getTime() <= Date.now();
}

function operationAllowed(
  operation: ExternalGitOperation,
  allowedOps: string[]
): boolean {
  switch (operation) {
    case "ls-remote":
      return allowedOps.includes("read") || allowedOps.includes("clone") || allowedOps.includes("fetch");
    case "clone":
      return allowedOps.includes("clone");
    case "fetch":
      return allowedOps.includes("fetch") || allowedOps.includes("pull");
    default: {
      const _exhaustive: never = operation;
      return false;
    }
  }
}

function buildUnauthorized(
  caller: Division,
  reason: string
): ExternalGitGatewayUnauthorized {
  return {
    schema_version: "1.0",
    authorized: false,
    caller,
    required_role: DIV6_EXTERNAL,
    reason,
    rejected_at: now(),
  };
}

async function runGitOperation(
  operation: ExternalGitOperation,
  repoUrl: string,
  secretRef: SecretRef,
  localPath?: string,
  refs?: string[]
): Promise<GitCommandEvidence> {
  const ops = new DefaultGitOperations(secretRef);

  switch (operation) {
    case "ls-remote":
      return ops.lsRemote(repoUrl, refs);
    case "clone": {
      if (!localPath) {
        return {
          command: "git",
          args: ["clone", repoUrl, ""],
          cwd: process.cwd(),
          env_keys: [],
          exit_code: null,
          stdout_hash: "",
          stderr_hash: "",
          duration_ms: 0,
          success: false,
          error_category: "generic",
          redacted_diagnostics: "clone operation requires localPath",
        };
      }
      return ops.clone(repoUrl, localPath);
    }
    case "fetch": {
      if (!localPath) {
        return {
          command: "git",
          args: ["fetch"],
          cwd: process.cwd(),
          env_keys: [],
          exit_code: null,
          stdout_hash: "",
          stderr_hash: "",
          duration_ms: 0,
          success: false,
          error_category: "generic",
          redacted_diagnostics: "fetch operation requires localPath",
        };
      }
      return ops.fetch(localPath, "origin", refs);
    }
    default: {
      const _exhaustive: never = operation;
      return {
        command: "git",
        args: [],
        cwd: process.cwd(),
        env_keys: [],
        exit_code: null,
        stdout_hash: "",
        stderr_hash: "",
        duration_ms: 0,
        success: false,
        error_category: "generic",
        redacted_diagnostics: `Unknown operation: ${_exhaustive}`,
      };
    }
  }
}

/**
 * Execute a bounded external git operation on behalf of Div6.External.
 *
 * - Only Div6.External may call this function.
 * - Consumes `access_grant` packets from Div6 inbox to locate the matching grant_id.
 * - Validates grant origin (Div3.Treasury), expiration, and allowed_ops mapping.
 * - Resolves secret_ref and executes the git operation via DefaultGitOperations.
 * - On validation failure returns ExternalGitGatewayUnauthorized.
 * - On execution success or git failure builds ExternalGitEvidence (trust_level: untrusted).
 * - Emits completion_report to Div5.QualificationsLibraryLearning with evidence payload.
 * - Emits status_update to Div1.HCO with redacted summary.
 *
 * Returns ExternalGitEvidence on execution (success or failure), ExternalGitGatewayUnauthorized on validation failure.
 */
export async function executeExternalGitOperation(
  callerDivision: Division,
  grantId: string,
  operation: ExternalGitOperation,
  localPath?: string,
  refs?: string[]
): Promise<ExternalGitEvidence | ExternalGitGatewayUnauthorized> {
  if (callerDivision !== DIV6_EXTERNAL) {
    return buildUnauthorized(
      callerDivision,
      `External git operation execution is restricted to Div6.External. Caller ${callerDivision} is not authorized.`
    );
  }

  if (!grantId || typeof grantId !== "string" || grantId.trim().length === 0) {
    return buildUnauthorized(callerDivision, "grantId must be a non-empty string.");
  }

  const div6Inbox = getDivisionInbox(DIV6_EXTERNAL);
  const grantPacket = div6Inbox.find(
    (p) =>
      p.packet_type === "access_grant" &&
      (p.payload as ScopedAccessGrant).grant_id === grantId
  );

  if (!grantPacket) {
    return buildUnauthorized(
      callerDivision,
      `No access_grant packet with grant_id ${grantId} found in Div6.External inbox.`
    );
  }

  const grant = grantPacket.payload as ScopedAccessGrant;

  if (grant.granted_by !== DIV3_TREASURY) {
    return buildUnauthorized(
      callerDivision,
      `Grant origin invalid: expected Div3.Treasury, got ${grant.granted_by}.`
    );
  }

  if (isGrantExpired(grant)) {
    return buildUnauthorized(
      callerDivision,
      `Grant ${grantId} expired at ${grant.expires_at}.`
    );
  }

  if (!operationAllowed(operation, grant.allowed_ops)) {
    return buildUnauthorized(
      callerDivision,
      `Operation ${operation} is not permitted by grant ${grantId}. Allowed ops: ${grant.allowed_ops.join(", ")}.`
    );
  }

  // Validate localPath for operations that require it
  if ((operation === "clone" || operation === "fetch") && (!localPath || localPath.trim().length === 0)) {
    return buildUnauthorized(
      callerDivision,
      `Operation ${operation} requires a non-empty localPath.`
    );
  }

  // Execute the git operation (secret resolution happens inside DefaultGitOperations)
  let gitEvidence: GitCommandEvidence;
  try {
    gitEvidence = await runGitOperation(operation, grant.repo_url, grant.secret_ref, localPath, refs);
  } catch (err) {
    gitEvidence = {
      command: "git",
      args: [operation],
      cwd: localPath || process.cwd(),
      env_keys: [],
      exit_code: null,
      stdout_hash: "",
      stderr_hash: "",
      duration_ms: 0,
      success: false,
      error_category: "generic",
      redacted_diagnostics: `Unhandled exception during git execution: ${(err as Error).message}`,
    };
  }

  const evidence: ExternalGitEvidence = {
    schema_version: "1.0",
    trust_level: "untrusted",
    grant_id: grant.grant_id,
    mission_id: grant.mission_id,
    operation,
    git_evidence: gitEvidence,
    quarantine_ref: generateQuarantineRef(),
    produced_at: now(),
    produced_by: DIV6_EXTERNAL,
  };

  if (gitEvidence.metadata) {
    evidence.parsed_metadata = gitEvidence.metadata;
  }

  // Emit completion_report to Div5.QualificationsLibraryLearning with evidence payload
  emitDivisionPacket(DIV6_EXTERNAL, DIV5_QUALLIB, "completion_report", evidence);

  // Emit status_update to Div1.HCO with redacted summary
  emitDivisionPacket(DIV6_EXTERNAL, DIV1_HCO, "status_update", {
    grant_id: grant.grant_id,
    mission_id: grant.mission_id,
    operation,
    repo_url: grant.repo_url,
    success: gitEvidence.success,
    error_category: gitEvidence.error_category,
    trust_level: evidence.trust_level,
    quarantine_ref: evidence.quarantine_ref,
  });

  return evidence;
}
