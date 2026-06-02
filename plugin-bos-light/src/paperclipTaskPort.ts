import type { Division } from "./contracts";

/**
 * Paperclip task port interface.
 * Defines the contract for creating/updating Paperclip issues/tasks.
 *
 * M008: DryRun implementation only (no live HTTP calls).
 * M007B: Live implementation will call Paperclip API.
 */
export interface PaperclipTaskPort {
  createIssue(input: CreateIssueInput): Promise<PaperclipIssueRef>;
  updateIssue(input: UpdateIssueInput): Promise<void>;
  addComment(input: AddCommentInput): Promise<void>;
  createChildIssue(input: CreateChildIssueInput): Promise<PaperclipIssueRef>;
}

export interface CreateIssueInput {
  idempotencyKey: string;
  title: string;
  description: string;
  assigneeDivision: Division;
  labels: string[];
  metadata: Record<string, unknown>;
}

export interface UpdateIssueInput {
  idempotencyKey: string;
  issueId: string;
  title?: string;
  description?: string;
  labels?: string[];
  metadata?: Record<string, unknown>;
}

export interface AddCommentInput {
  idempotencyKey: string;
  issueId: string;
  body: string;
  metadata?: Record<string, unknown>;
}

export interface CreateChildIssueInput {
  idempotencyKey: string;
  parentIssueId: string;
  title: string;
  description: string;
  assigneeDivision: Division;
  labels: string[];
  metadata: Record<string, unknown>;
}

export interface PaperclipIssueRef {
  issueId: string;
  issueNumber: number;
  url: string;
}

/**
 * Represents a dry-run action that would be performed on Paperclip.
 * Used for testing and verification without live API calls.
 */
export interface PaperclipAction {
  actionType: "create_issue" | "update_issue" | "add_comment" | "create_child_issue";
  idempotencyKey: string;
  targetDivision?: Division;
  issueId?: string;
  parentIssueId?: string;
  title?: string;
  description?: string;
  body?: string;
  labels: string[];
  metadata: Record<string, unknown>;
  timestamp: string;
}
