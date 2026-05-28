import type { BettingTableItem, BPIScore, BosStatusOverlay, CircuitBreakerRecord, DecisionMetadata, EvalGateResult } from "./contracts";
import { PAPERCLIP_RUNTIME_BOUNDARY_RULES } from "./runtimeCapabilities";

export interface NativeApprovalRequest {
  id: string;
  issue_ids: string[];
  status: "PENDING" | "APPROVED" | "REJECTED";
}

export interface PaperclipAdapter {
  /**
   * Adapter assumption for the `documents.native` surface.
   * Durable BOS outputs should land in Paperclip-native issue documents when
   * proven, otherwise fall back to issue descriptions/comments as markdown.
   */
  createIssueDocument(issueId: string, title: string, markdown: string): Promise<{ document_id: string }>;
  /** Adapter assumption for `comments.native`; preferred human-visible fallback when available. */
  addIssueComment(issueId: string, markdown: string): Promise<{ comment_id: string }>;
  /**
   * Adapter assumption for `approvals.native`.
   * Paperclip owns native approval/request objects; plugin-side test doubles must
   * not be treated as approvals that satisfy A5.
   */
  createApprovalRequest(issueIds: string[], reason: string): Promise<NativeApprovalRequest>;
  /** Adapter assumption for `issues.native`; escalation issues require live create/read/update proof. */
  createEscalationIssue(input: { title: string; body: string; related_issue_id: string }): Promise<{ issue_id: string }>;
  /** Adapter assumption for `activity.logging`; use comments/issues if activity visibility is unproven. */
  logActivity(message: string, data?: unknown): Promise<void>;
}

export interface BOSPersistence {
  saveBPI(score: BPIScore): Promise<void>;
  getBPI(issueId: string): Promise<BPIScore | null>;
  saveStatus(status: BosStatusOverlay): Promise<void>;
  saveBettingTable(cycleId: string, items: BettingTableItem[]): Promise<void>;
  getBettingTable(cycleId: string): Promise<BettingTableItem[]>;
  saveGateResult(result: EvalGateResult): Promise<void>;
  saveCircuitBreaker(record: CircuitBreakerRecord): Promise<void>;
  getCircuitBreaker(issueId: string): Promise<CircuitBreakerRecord | null>;
  saveDecision(decision: DecisionMetadata): Promise<void>;
}

// Test/draft adapter only. It exercises BOS Light logic without claiming host support.
// Boundary rules stay aligned with the capability matrix and source contract.
export const PAPERCLIP_ADAPTER_BOUNDARY = PAPERCLIP_RUNTIME_BOUNDARY_RULES;

export class InMemoryPaperclipAdapter implements PaperclipAdapter {
  public comments: Array<{ issueId: string; markdown: string }> = [];
  public documents: Array<{ issueId: string; title: string; markdown: string }> = [];
  public approvals: NativeApprovalRequest[] = [];
  public issues: Array<{ title: string; body: string; related_issue_id: string }> = [];

  async createIssueDocument(issueId: string, title: string, markdown: string): Promise<{ document_id: string }> {
    this.documents.push({ issueId, title, markdown });
    return { document_id: `doc_${this.documents.length}` };
  }

  async addIssueComment(issueId: string, markdown: string): Promise<{ comment_id: string }> {
    this.comments.push({ issueId, markdown });
    return { comment_id: `comment_${this.comments.length}` };
  }

  async createApprovalRequest(issueIds: string[], _reason: string): Promise<NativeApprovalRequest> {
    const approval = { id: `approval_${this.approvals.length + 1}`, issue_ids: issueIds, status: "PENDING" as const };
    this.approvals.push(approval);
    return approval;
  }

  async createEscalationIssue(input: { title: string; body: string; related_issue_id: string }): Promise<{ issue_id: string }> {
    this.issues.push(input);
    return { issue_id: `escalation_${this.issues.length}` };
  }

  async logActivity(_message: string, _data?: unknown): Promise<void> {
    return;
  }
}
