import type { BettingTableItem, BPIScore, BosStatusOverlay, CircuitBreakerRecord, DecisionMetadata, EvalGateResult } from "./contracts";

export interface NativeApprovalRequest {
  id: string;
  issue_ids: string[];
  status: "PENDING" | "APPROVED" | "REJECTED";
}

export interface PaperclipAdapter {
  createIssueDocument(issueId: string, title: string, markdown: string): Promise<{ document_id: string }>;
  addIssueComment(issueId: string, markdown: string): Promise<{ comment_id: string }>;
  createApprovalRequest(issueIds: string[], reason: string): Promise<NativeApprovalRequest>;
  createEscalationIssue(input: { title: string; body: string; related_issue_id: string }): Promise<{ issue_id: string }>;
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

// Test/draft adapter. Replace with current Paperclip SDK calls after C6/C7.
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
