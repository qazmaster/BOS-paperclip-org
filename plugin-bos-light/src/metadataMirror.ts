/**
 * MetadataMirror — Mirrors BosTaskMetadata to Paperclip comments.
 *
 * Serializes the task metadata (including grant ref, phase, audit trail)
 * into a structured markdown comment and posts it via the PaperclipAdapter.
 * This is the mechanism that makes BOS task state visible in the issue
 * comment stream for human review.
 */

import type { PaperclipAdapter } from "./paperclipAdapter";
import type { BosTaskMetadata } from "./bosTaskMetadata";

// ─── Mirror Result Types ─────────────────────────────────────────────────────

export interface MetadataMirrorResult {
  success: boolean;
  issue_id: string;
  comment_id: string | null;
  mirrored_at: string;
  error?: string;
}

// ─── Serialization ───────────────────────────────────────────────────────────

/**
 * Serialize BosTaskMetadata into a structured markdown comment.
 * The format is designed to be human-readable in Paperclip's comment UI
 * and parseable by downstream BOS tools.
 */
export function serializeMetadataToMarkdown(metadata: BosTaskMetadata): string {
  const lines: string[] = [];

  lines.push("# BOS Task Metadata");
  lines.push("");
  lines.push(`**Issue:** ${metadata.issue_id}`);
  lines.push(`**Mission:** ${metadata.mission_id}`);
  lines.push(`**Phase:** ${metadata.phase}`);
  lines.push(`**Risk:** ${metadata.risk_level}`);
  lines.push(`**Division:** ${metadata.assigned_division ?? "(unassigned)"}`);
  lines.push(`**Updated:** ${metadata.updated_at}`);
  lines.push("");

  // Grant section
  if (metadata.grant_ref) {
    const g = metadata.grant_ref;
    lines.push("## Grant");
    lines.push("");
    lines.push(`- **ID:** ${g.grant_id}`);
    lines.push(`- **Type:** ${g.grant_type}`);
    lines.push(`- **Status:** ${g.status}`);
    lines.push(`- **Token Cap:** ${g.token_cap.toLocaleString()}`);
    lines.push(`- **Tools:** ${g.allowed_tools.join(", ")}`);
    lines.push(`- **Issued:** ${g.issued_at}`);
    lines.push(`- **Expires:** ${g.expires_at}`);
    lines.push("");
  }

  // Audit trail (last 10 entries)
  if (metadata.audit_trail.length > 0) {
    lines.push("## Audit Trail");
    lines.push("");
    const entries = metadata.audit_trail.slice(-10);
    for (const entry of entries) {
      lines.push(`- \`${entry.timestamp}\` **${entry.event}** by ${entry.actor}: ${entry.detail}`);
    }
    if (metadata.audit_trail.length > 10) {
      lines.push(`- _(showing last 10 of ${metadata.audit_trail.length} entries)_`);
    }
    lines.push("");
  }

  lines.push("---");
  lines.push(`_schema: bos-task-metadata/v1.0 | generated: ${new Date().toISOString()}_`);

  return lines.join("\n");
}

/**
 * Serialize a grant decision log entry for mirroring.
 * Used when a grant is issued, denied, or escalated — not the full metadata,
 * just the grant event.
 */
export function serializeGrantDecisionToMarkdown(
  issueId: string,
  decision: {
    status: "approved" | "denied" | "escalate";
    decision_id: string;
    rationale: string;
    allowed_tools?: string[];
    denied_tools?: string[];
    token_cap?: number;
    ttl_minutes?: number;
    reason?: string;
    escalation_target?: string;
  }
): string {
  const lines: string[] = [];

  lines.push(`# BOS Grant Decision — ${decision.status.toUpperCase()}`);
  lines.push("");
  lines.push(`**Issue:** ${issueId}`);
  lines.push(`**Decision ID:** ${decision.decision_id}`);
  lines.push(`**Status:** ${decision.status}`);
  lines.push(`**Rationale:** ${decision.rationale}`);
  lines.push("");

  if (decision.status === "approved" && decision.allowed_tools) {
    lines.push(`- **Allowed Tools:** ${decision.allowed_tools.join(", ")}`);
    if (decision.denied_tools && decision.denied_tools.length > 0) {
      lines.push(`- **Denied Tools:** ${decision.denied_tools.join(", ")}`);
    }
    lines.push(`- **Token Cap:** ${(decision.token_cap ?? 0).toLocaleString()}`);
    lines.push(`- **TTL:** ${decision.ttl_minutes ?? 0}m`);
  }

  if (decision.status === "denied" && decision.reason) {
    lines.push(`- **Reason:** ${decision.reason}`);
  }

  if (decision.status === "escalate") {
    lines.push(`- **Escalation Target:** ${decision.escalation_target ?? "(unknown)"}`);
    if (decision.reason) lines.push(`- **Reason:** ${decision.reason}`);
  }

  lines.push("");
  lines.push("---");
  lines.push(`_schema: bos-grant-decision/v1.0 | generated: ${new Date().toISOString()}_`);

  return lines.join("\n");
}

// ─── Mirror Operations ───────────────────────────────────────────────────────

/**
 * Mirror BosTaskMetadata to a Paperclip issue comment.
 *
 * Serializes the metadata and posts it via the adapter's addIssueComment.
 * Returns a MirrorResult indicating success/failure.
 */
export async function mirrorMetadataToComment(
  adapter: PaperclipAdapter,
  metadata: BosTaskMetadata
): Promise<MetadataMirrorResult> {
  try {
    const markdown = serializeMetadataToMarkdown(metadata);
    const result = await adapter.addIssueComment(metadata.issue_id, markdown);

    return {
      success: true,
      issue_id: metadata.issue_id,
      comment_id: result.comment_id,
      mirrored_at: new Date().toISOString(),
    };
  } catch (error) {
    return {
      success: false,
      issue_id: metadata.issue_id,
      comment_id: null,
      mirrored_at: new Date().toISOString(),
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Mirror a grant decision to a Paperclip issue comment.
 * Used when a grant is issued, denied, or escalated.
 */
export async function mirrorGrantDecisionToComment(
  adapter: PaperclipAdapter,
  issueId: string,
  decision: Parameters<typeof serializeGrantDecisionToMarkdown>[1]
): Promise<MetadataMirrorResult> {
  try {
    const markdown = serializeGrantDecisionToMarkdown(issueId, decision);
    const result = await adapter.addIssueComment(issueId, markdown);

    return {
      success: true,
      issue_id: issueId,
      comment_id: result.comment_id,
      mirrored_at: new Date().toISOString(),
    };
  } catch (error) {
    return {
      success: false,
      issue_id: issueId,
      comment_id: null,
      mirrored_at: new Date().toISOString(),
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Mirror all metadata in a store to comments (batch operation).
 * Useful for reconciliation or periodic sync.
 */
export async function mirrorAllMetadata(
  adapter: PaperclipAdapter,
  store: { listAll(): BosTaskMetadata[] }
): Promise<MetadataMirrorResult[]> {
  const results: MetadataMirrorResult[] = [];
  const allMetadata = store.listAll();

  for (const metadata of allMetadata) {
    const result = await mirrorMetadataToComment(adapter, metadata);
    results.push(result);
  }

  return results;
}

// ─── Legacy Routing Metadata Mirror API ─────────────────────────────────────

const METADATA_START = "<!-- BOS_LIGHT_METADATA_START -->";
const METADATA_END = "<!-- BOS_LIGHT_METADATA_END -->";

import type { BosRoutingMetadata } from "./bosTaskMetadata";

/**
 * Format BosRoutingMetadata into a comment with delimited markers.
 * The markers enable round-trip parse → format → parse fidelity.
 */
export function formatBosMetadataComment(metadata: BosRoutingMetadata): string {
  const lines: string[] = [METADATA_START];
  lines.push(`schema_version: ${metadata.schemaVersion}`);
  lines.push(`mission_id: ${metadata.bosMissionId}`);
  lines.push(`division: ${metadata.currentDivision}`);
  lines.push(`routing_phase: ${metadata.routingPhase}`);
  lines.push(`qa_required: ${metadata.qaRequired}`);
  if (metadata.cynefinDomain) lines.push(`cynefin_domain: ${metadata.cynefinDomain}`);
  if (metadata.decisionId) lines.push(`decision_id: ${metadata.decisionId}`);
  lines.push(METADATA_END);
  return lines.join("\n");
}

/**
 * Parse a delimited metadata comment back into BosRoutingMetadata.
 * Returns null if the comment does not contain valid metadata.
 */
export function parseBosMetadataComment(comment: string): BosRoutingMetadata | null {
  const startIdx = comment.indexOf(METADATA_START);
  const endIdx = comment.indexOf(METADATA_END);
  if (startIdx === -1 || endIdx === -1 || endIdx <= startIdx) return null;

  const body = comment.slice(startIdx + METADATA_START.length, endIdx).trim();
  const pairs = new Map<string, string>();
  for (const line of body.split("\n")) {
    const colonIdx = line.indexOf(":");
    if (colonIdx === -1) continue;
    const key = line.slice(0, colonIdx).trim();
    const value = line.slice(colonIdx + 1).trim();
    pairs.set(key, value);
  }

  const missionId = pairs.get("mission_id");
  if (!missionId) return null;

  const division = pairs.get("division");
  if (!division) return null;

  return {
    schemaVersion: (pairs.get("schema_version") as BosRoutingMetadata["schemaVersion"]) ?? "bos-light.metadata.v1",
    bosMissionId: missionId,
    currentDivision: division as BosRoutingMetadata["currentDivision"],
    routingPhase: (pairs.get("routing_phase") as BosRoutingMetadata["routingPhase"]) ?? "operational",
    qaRequired: pairs.get("qa_required") === "true",
    cynefinDomain: pairs.get("cynefin_domain") ?? undefined,
    decisionId: pairs.get("decision_id") ?? undefined,
  };
}

/**
 * Check if a comment contains delimited BOS metadata.
 */
export function hasBosMetadata(comment: string): boolean {
  return comment.includes(METADATA_START) && comment.includes(METADATA_END);
}
