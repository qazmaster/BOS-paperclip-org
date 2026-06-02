/**
 * BosTaskMetadata — Plugin state storage for BOS task metadata.
 *
 * Stores structured metadata per issue/task that tracks grant lifecycle,
 * assignment, status transitions, and audit trail. The metadata is the
 * source of truth for what the BOS system knows about a task, and is
 * the payload that gets mirrored to Paperclip comments.
 */

import type { Division, DecisionRiskTier } from "./contracts";

// ─── Metadata Types ──────────────────────────────────────────────────────────

export type BosTaskPhase =
  | "intake"
  | "triage"
  | "grant_pending"
  | "granted"
  | "in_progress"
  | "qa_review"
  | "completed"
  | "blocked"
  | "failed";

export interface BosTaskGrantRef {
  grant_id: string;
  grant_type: "BUDGET_GRANT" | "ACCESS_GRANT" | "EMERGENCY_GRANT";
  status: "active" | "expired" | "revoked";
  issued_at: string;
  expires_at: string;
  token_cap: number;
  allowed_tools: string[];
}

export interface BosTaskAuditEntry {
  timestamp: string;
  event: string;
  actor: string;
  detail: string;
}

export interface BosTaskMetadata {
  schema_version: "1.0";
  issue_id: string;
  mission_id: string;
  phase: BosTaskPhase;
  assigned_division: Division | null;
  risk_level: DecisionRiskTier;
  grant_ref: BosTaskGrantRef | null;
  title: string;
  description: string;
  created_at: string;
  updated_at: string;
  audit_trail: BosTaskAuditEntry[];
}

export interface BosTaskMetadataCreateInput {
  issue_id: string;
  mission_id: string;
  title: string;
  description?: string;
  assigned_division?: Division;
  risk_level?: DecisionRiskTier;
  phase?: BosTaskPhase;
}

// ─── In-Memory Metadata Store ────────────────────────────────────────────────

/**
 * In-memory store for BosTaskMetadata indexed by issue_id.
 * Plugin state overlay — not durable until mirrored to Paperclip comments.
 */
export class BosTaskMetadataStore {
  private store = new Map<string, BosTaskMetadata>();

  /**
   * Create and store metadata for a new task.
   */
  create(input: BosTaskMetadataCreateInput): BosTaskMetadata {
    if (this.store.has(input.issue_id)) {
      throw new Error(`Metadata already exists for issue ${input.issue_id}`);
    }

    const now = new Date().toISOString();
    const metadata: BosTaskMetadata = {
      schema_version: "1.0",
      issue_id: input.issue_id,
      mission_id: input.mission_id,
      phase: input.phase ?? "intake",
      assigned_division: input.assigned_division ?? null,
      risk_level: input.risk_level ?? "LOW",
      grant_ref: null,
      title: input.title,
      description: input.description ?? "",
      created_at: now,
      updated_at: now,
      audit_trail: [
        {
          timestamp: now,
          event: "metadata.created",
          actor: "Div3.Treasury",
          detail: `Task metadata initialized for issue ${input.issue_id}`,
        },
      ],
    };

    this.store.set(input.issue_id, metadata);
    return metadata;
  }

  /**
   * Retrieve metadata for an issue.
   */
  get(issueId: string): BosTaskMetadata | null {
    return this.store.get(issueId) ?? null;
  }

  /**
   * Update the phase of a task and record an audit entry.
   */
  updatePhase(issueId: string, phase: BosTaskPhase, actor: string, detail?: string): BosTaskMetadata {
    const metadata = this.require(issueId);
    const now = new Date().toISOString();

    metadata.phase = phase;
    metadata.updated_at = now;
    metadata.audit_trail.push({
      timestamp: now,
      event: `phase.${phase}`,
      actor,
      detail: detail ?? `Phase updated to ${phase}`,
    });

    return metadata;
  }

  /**
   * Attach a grant reference to the task metadata.
   */
  attachGrant(issueId: string, grant: BosTaskGrantRef, actor: string): BosTaskMetadata {
    const metadata = this.require(issueId);
    const now = new Date().toISOString();

    metadata.grant_ref = grant;
    metadata.phase = "granted";
    metadata.updated_at = now;
    metadata.audit_trail.push({
      timestamp: now,
      event: "grant.attached",
      actor,
      detail: `Grant ${grant.grant_id} attached, type=${grant.grant_type}, cap=${grant.token_cap}`,
    });

    return metadata;
  }

  /**
   * Revoke the grant on a task and transition to blocked.
   */
  revokeGrant(issueId: string, reason: string, actor: string): BosTaskMetadata {
    const metadata = this.require(issueId);
    const now = new Date().toISOString();

    if (metadata.grant_ref) {
      metadata.grant_ref.status = "revoked";
    }
    metadata.phase = "blocked";
    metadata.updated_at = now;
    metadata.audit_trail.push({
      timestamp: now,
      event: "grant.revoked",
      actor,
      detail: reason,
    });

    return metadata;
  }

  /**
   * Assign a division to the task.
   */
  assignDivision(issueId: string, division: Division, actor: string): BosTaskMetadata {
    const metadata = this.require(issueId);
    const now = new Date().toISOString();

    metadata.assigned_division = division;
    metadata.updated_at = now;
    metadata.audit_trail.push({
      timestamp: now,
      event: "division.assigned",
      actor,
      detail: `Assigned to ${division}`,
    });

    return metadata;
  }

  /**
   * List all stored metadata (for diagnostics).
   */
  listAll(): BosTaskMetadata[] {
    return [...this.store.values()];
  }

  /**
   * Check if metadata exists for an issue.
   */
  has(issueId: string): boolean {
    return this.store.has(issueId);
  }

  /**
   * Clear all metadata (for test isolation).
   */
  clear(): void {
    this.store.clear();
  }

  /**
   * Get the count of stored metadata entries.
   */
  size(): number {
    return this.store.size;
  }

  private require(issueId: string): BosTaskMetadata {
    const metadata = this.store.get(issueId);
    if (!metadata) {
      throw new Error(`No metadata found for issue ${issueId}`);
    }
    return metadata;
  }
}

// ─── Legacy Routing Metadata API (paperclip-mapper compatible) ───────────────

/**
 * Routing-oriented metadata shape used by the PaperclipAction mapper flow.
 * This is a separate, lighter metadata contract used in the routing pipeline;
 * BosTaskMetadata (above) is the grant-lifecycle-oriented store.
 */
export interface BosRoutingMetadata {
  schemaVersion: "bos-light.metadata.v1";
  bosMissionId: string;
  currentDivision: Division;
  routingPhase: "pre_decision" | "post_div7_decision" | "operational";
  qaRequired: boolean;
  cynefinDomain?: string;
  decisionId?: string;
  issueId?: string;
}

export interface BosRoutingMetadataOptions {
  cynefinDomain?: string;
  decisionId?: string;
  routingPhase?: BosRoutingMetadata["routingPhase"];
  qaRequired?: boolean;
}

/**
 * Create a BosRoutingMetadata instance for the PaperclipAction mapper.
 */
export function createBosTaskMetadata(
  missionId: string,
  division: Division,
  _followupDivisions: Division[],
  options?: BosRoutingMetadataOptions
): BosRoutingMetadata {
  return {
    schemaVersion: "bos-light.metadata.v1",
    bosMissionId: missionId,
    currentDivision: division,
    routingPhase: options?.routingPhase ?? "operational",
    qaRequired: options?.qaRequired ?? false,
    cynefinDomain: options?.cynefinDomain,
    decisionId: options?.decisionId,
  };
}

/**
 * In-memory storage for BosRoutingMetadata, indexed by issue ID.
 * Separate from BosTaskMetadataStore — this is routing-pipeline state.
 */
export class InMemoryBosTaskMetadataStorage {
  private entries = new Map<string, BosRoutingMetadata>();

  get(issueId: string): BosRoutingMetadata | undefined {
    return this.entries.get(issueId);
  }

  set(issueId: string, metadata: BosRoutingMetadata): void {
    this.entries.set(issueId, metadata);
  }

  delete(issueId: string): void {
    this.entries.delete(issueId);
  }

  getByMission(missionId: string): Array<{ issueId: string; metadata: BosRoutingMetadata }> {
    const results: Array<{ issueId: string; metadata: BosRoutingMetadata }> = [];
    for (const [issueId, metadata] of this.entries) {
      if (metadata.bosMissionId === missionId) {
        results.push({ issueId, metadata });
      }
    }
    return results;
  }

  clear(): void {
    this.entries.clear();
  }
}
