import type {
  PaperclipTaskPort,
  CreateIssueInput,
  UpdateIssueInput,
  AddCommentInput,
  CreateChildIssueInput,
  PaperclipIssueRef,
  PaperclipAction
} from "./paperclipTaskPort";

/**
 * Dry-run implementation of PaperclipTaskPort.
 * Returns deterministic action objects without making HTTP calls.
 * Used for testing and verification in M008.
 */
export class DryRunPaperclipTaskPort implements PaperclipTaskPort {
  private actions: PaperclipAction[] = [];
  private issueCounter = 0;

  async createIssue(input: CreateIssueInput): Promise<PaperclipIssueRef> {
    this.issueCounter++;
    const issueId = `dry_run_issue_${this.issueCounter}`;
    const issueNumber = this.issueCounter;

    this.actions.push({
      actionType: "create_issue",
      idempotencyKey: input.idempotencyKey,
      targetDivision: input.assigneeDivision,
      title: input.title,
      description: input.description,
      labels: input.labels,
      metadata: input.metadata,
      timestamp: new Date().toISOString(),
    });

    return {
      issueId,
      issueNumber,
      url: `https://paperclip.example/issues/${issueNumber}`,
    };
  }

  async updateIssue(input: UpdateIssueInput): Promise<void> {
    this.actions.push({
      actionType: "update_issue",
      idempotencyKey: input.idempotencyKey,
      issueId: input.issueId,
      title: input.title,
      description: input.description,
      labels: input.labels ?? [],
      metadata: input.metadata ?? {},
      timestamp: new Date().toISOString(),
    });
  }

  async addComment(input: AddCommentInput): Promise<void> {
    this.actions.push({
      actionType: "add_comment",
      idempotencyKey: input.idempotencyKey,
      issueId: input.issueId,
      body: input.body,
      labels: [],
      metadata: input.metadata ?? {},
      timestamp: new Date().toISOString(),
    });
  }

  async createChildIssue(input: CreateChildIssueInput): Promise<PaperclipIssueRef> {
    this.issueCounter++;
    const issueId = `dry_run_child_${this.issueCounter}`;
    const issueNumber = this.issueCounter;

    this.actions.push({
      actionType: "create_child_issue",
      idempotencyKey: input.idempotencyKey,
      targetDivision: input.assigneeDivision,
      parentIssueId: input.parentIssueId,
      title: input.title,
      description: input.description,
      labels: input.labels,
      metadata: input.metadata,
      timestamp: new Date().toISOString(),
    });

    return {
      issueId,
      issueNumber,
      url: `https://paperclip.example/issues/${issueNumber}`,
    };
  }

  /**
   * Get all emitted actions for inspection and verification.
   */
  getEmittedActions(): PaperclipAction[] {
    return [...this.actions];
  }

  /**
   * Get actions filtered by type.
   */
  getActionsByType(actionType: PaperclipAction["actionType"]): PaperclipAction[] {
    return this.actions.filter(a => a.actionType === actionType);
  }

  /**
   * Get actions filtered by target division.
   */
  getActionsByDivision(division: string): PaperclipAction[] {
    return this.actions.filter(a => a.targetDivision === division);
  }

  /**
   * Clear all emitted actions (for test isolation).
   */
  clearActions(): void {
    this.actions = [];
    this.issueCounter = 0;
  }
}
