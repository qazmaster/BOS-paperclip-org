import type {
  Division,
  ScopedAccessGrant,
  TreasuryUnauthorized,
  SecretRef,
  AllowedGitOperation,
} from "./contracts";
import { emitDivisionPacket } from "./divisionPacketRouter";
import { redactSecretRef } from "./secretResolver";

const DIV3_TREASURY = "Div3.Treasury" as const;
const DIV6_EXTERNAL = "Div6.External" as const;
const DIV1_HCO = "Div1.HCO" as const;

const ALL_ALLOWED_OPS: AllowedGitOperation[] = [
  "clone",
  "fetch",
  "pull",
  "push",
  "read",
  "write",
];

function now(): string {
  return new Date().toISOString();
}

function generateGrantId(): string {
  return `grant_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function isValidSecretRef(ref: unknown): ref is SecretRef {
  if (typeof ref !== "object" || ref === null) return false;

  const r = ref as Record<string, unknown>;

  if (r.type === "secret_ref") {
    return (
      typeof r.secret_id === "string" &&
      r.secret_id.length > 0 &&
      r.version === "latest"
    );
  }

  if (r.type === "inline_env") {
    return typeof r.env_key === "string" && r.env_key.length > 0;
  }

  return false;
}

function isNonEmptySubsetOfAllowedOps(
  ops: unknown
): ops is AllowedGitOperation[] {
  if (!Array.isArray(ops) || ops.length === 0) return false;
  return ops.every(
    (op): op is AllowedGitOperation =>
      typeof op === "string" && ALL_ALLOWED_OPS.includes(op as AllowedGitOperation)
  );
}

/**
 * Issue a scoped access grant for git operations on an external repository.
 *
 * - Only Div3.Treasury may call this function.
 * - Validates repoUrl, allowedOps, and secretRef shape.
 * - Emits an `access_grant` packet to Div6.External containing the ScopedAccessGrant
 *   (secret_ref only — no plaintext secret value).
 * - Emits a `status_update` to Div1.HCO with a redacted summary.
 *
 * Returns ScopedAccessGrant on success, TreasuryUnauthorized on any validation or auth failure.
 */
export function issueScopedAccessGrant(
  callerDivision: Division,
  missionId: string,
  repoUrl: string,
  allowedOps: unknown,
  secretRef: unknown
): ScopedAccessGrant | TreasuryUnauthorized {
  if (callerDivision !== DIV3_TREASURY) {
    return {
      schema_version: "1.0",
      authorized: false,
      caller: callerDivision,
      required_role: DIV3_TREASURY,
      reason: `Scoped access grant issuance is restricted to Div3.Treasury. Caller ${callerDivision} is not authorized.`,
      rejected_at: now(),
    };
  }

  if (typeof repoUrl !== "string" || repoUrl.trim().length === 0) {
    return {
      schema_version: "1.0",
      authorized: false,
      caller: callerDivision,
      required_role: DIV3_TREASURY,
      reason: "repoUrl must be a non-empty string.",
      rejected_at: now(),
    };
  }

  if (!isNonEmptySubsetOfAllowedOps(allowedOps)) {
    return {
      schema_version: "1.0",
      authorized: false,
      caller: callerDivision,
      required_role: DIV3_TREASURY,
      reason: `allowedOps must be a non-empty array of valid AllowedGitOperation values: ${ALL_ALLOWED_OPS.join(", ")}.`,
      rejected_at: now(),
    };
  }

  if (!isValidSecretRef(secretRef)) {
    return {
      schema_version: "1.0",
      authorized: false,
      caller: callerDivision,
      required_role: DIV3_TREASURY,
      reason: "secretRef must be a valid SecretRef (PaperclipSecretRef or InlineEnvRef).",
      rejected_at: now(),
    };
  }

  const grant: ScopedAccessGrant = {
    schema_version: "1.0",
    grant_id: generateGrantId(),
    mission_id: missionId,
    repo_url: repoUrl.trim(),
    allowed_ops: allowedOps,
    secret_ref: secretRef,
    granted_by: DIV3_TREASURY,
    granted_at: now(),
    expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
  };

  // Emit access_grant to Div6.External — payload contains the grant with secret_ref only (no plaintext)
  emitDivisionPacket(DIV3_TREASURY, DIV6_EXTERNAL, "access_grant", grant);

  // Emit status_update to Div1.HCO with redacted secret_ref and grant summary
  emitDivisionPacket(DIV3_TREASURY, DIV1_HCO, "status_update", {
    grant_id: grant.grant_id,
    mission_id: grant.mission_id,
    repo_url: grant.repo_url,
    allowed_ops: grant.allowed_ops,
    secret_ref_redacted: redactSecretRef(secretRef),
    granted_by: grant.granted_by,
    granted_at: grant.granted_at,
    expires_at: grant.expires_at,
  });

  return grant;
}
