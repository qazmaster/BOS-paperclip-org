import type { NativeApprovalRequest, PaperclipAdapter } from "./paperclipAdapter";

export interface LivePaperclipFetchResponse {
  ok: boolean;
  status: number;
  text?: () => Promise<string>;
  json?: () => Promise<unknown>;
}

export interface LivePaperclipFetchInit {
  method: "GET" | "POST" | "PATCH" | "PUT";
  headers: Record<string, string>;
  body?: string;
}

export type LivePaperclipFetch = (url: string, init: LivePaperclipFetchInit) => Promise<LivePaperclipFetchResponse>;

export type LivePaperclipPathBuilder = (context: {
  baseUrl: string;
  companyId: string;
  issueId?: string;
  relatedIssueId?: string;
}) => string;

export interface LivePaperclipPathConfig {
  createIssueDocument?: string | LivePaperclipPathBuilder;
  addIssueComment?: string | LivePaperclipPathBuilder;
  createEscalationIssue?: string | LivePaperclipPathBuilder;
  logActivity?: string | LivePaperclipPathBuilder;
}

export interface ValidatedNativeApprovalApi {
  /** Caller must only provide this after an independent Paperclip native approval create/readback proof. */
  validatedNativeApproval: true;
  createApprovalRequest(input: {
    company_id: string;
    issue_ids: string[];
    reason: string;
  }): Promise<NativeApprovalRequest>;
}

export interface LivePaperclipIssueAdapterInput {
  fetch: LivePaperclipFetch;
  baseUrl: string;
  companyId: string;
  issueId?: string;
  headers?: Record<string, string>;
  timeoutMs?: number;
  paths?: LivePaperclipPathConfig;
  nativeApprovalApi?: ValidatedNativeApprovalApi | null;
}

export interface LivePaperclipAdapterDiagnostic {
  phase: "documents.native" | "comments.native" | "issues.native" | "approvals.native" | "activity.logging";
  status_code: number | null;
  bounded_response_text: string | null;
  malformed_json_reason: string | null;
  timeout_ms: number | null;
  fallback_used: boolean;
  message: string;
}

export interface LivePaperclipSideEffectCounts {
  documents_created: number;
  comments_created: number;
  escalation_issues_created: number;
  approval_requests_created: number;
  activity_logs_written: number;
}

const DEFAULT_TIMEOUT_MS = 5_000;
const MAX_DIAGNOSTIC_TEXT = 500;
const SECRET_VALUE_PATTERNS = [
  /\bBearer\s+[A-Za-z0-9._~+\/-]+=*/gi,
  /\b(token|api[_-]?key|secret|authorization|cookie|password)=([^\s&]+)/gi,
  /\b(sk|pk)_(live|test)_[A-Za-z0-9]{12,}\b/g,
  /\b[A-Za-z0-9_\-]{24,}\.[A-Za-z0-9_\-]{6,}\.[A-Za-z0-9_\-]{20,}\b/g
];

export class LivePaperclipApiError extends Error {
  constructor(public readonly diagnostic: LivePaperclipAdapterDiagnostic) {
    super(diagnostic.message);
    this.name = "LivePaperclipApiError";
  }
}

export function redactSensitiveText(value: unknown): string {
  const raw = value instanceof Error && value.message
    ? value.message
    : typeof value === "string"
      ? value
      : String(value ?? "");

  let redacted = raw.replace(/[\r\n\t]+/g, " ").replace(/\s{2,}/g, " ").trim();
  for (const pattern of SECRET_VALUE_PATTERNS) {
    redacted = redacted.replace(pattern, (match, key) => {
      if (typeof key === "string" && key.length > 0) return `${key}=[REDACTED]`;
      return "[REDACTED]";
    });
  }
  return redacted.slice(0, MAX_DIAGNOSTIC_TEXT);
}

function sanitizeHeaders(headers: Record<string, string> | undefined): Record<string, string> {
  const safe: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers ?? {})) {
    if (/authorization|cookie|token|secret|api[-_]?key|password/i.test(key)) {
      safe[key] = value;
    } else {
      safe[key] = value;
    }
  }
  return safe;
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

function encodePathPart(value: string): string {
  return encodeURIComponent(value);
}

function joinUrl(baseUrl: string, path: string): string {
  if (/^https?:\/\//i.test(path)) return path;
  return `${trimTrailingSlash(baseUrl)}/${path.replace(/^\/+/, "")}`;
}

function defaultPath(phase: LivePaperclipAdapterDiagnostic["phase"], context: {
  companyId: string;
  issueId?: string;
  relatedIssueId?: string;
}): string {
  const company = encodePathPart(context.companyId);
  const issue = encodePathPart(context.issueId ?? "");
  const related = encodePathPart(context.relatedIssueId ?? context.issueId ?? "");

  if (phase === "documents.native") return `/api/companies/${company}/issues/${issue}/documents`;
  if (phase === "comments.native") return `/api/companies/${company}/issues/${issue}/comments`;
  if (phase === "issues.native") return `/api/companies/${company}/issues?related_issue_id=${related}`;
  return `/api/companies/${company}/activity`;
}

function resolvePath(input: {
  configured?: string | LivePaperclipPathBuilder;
  phase: LivePaperclipAdapterDiagnostic["phase"];
  baseUrl: string;
  companyId: string;
  issueId?: string;
  relatedIssueId?: string;
}): string {
  const context = {
    baseUrl: trimTrailingSlash(input.baseUrl),
    companyId: input.companyId,
    issueId: input.issueId,
    relatedIssueId: input.relatedIssueId
  };
  const path = typeof input.configured === "function"
    ? input.configured(context)
    : input.configured ?? defaultPath(input.phase, context);
  return joinUrl(input.baseUrl, path);
}

function readStringAtPath(value: unknown, path: string[]): string | null {
  let cursor = value;
  for (const segment of path) {
    if (!cursor || typeof cursor !== "object" || !(segment in cursor)) return null;
    cursor = (cursor as Record<string, unknown>)[segment];
  }
  return typeof cursor === "string" && cursor.trim().length > 0 ? cursor.trim() : null;
}

function firstStringAtPath(value: unknown, paths: string[][]): string | null {
  for (const path of paths) {
    const found = readStringAtPath(value, path);
    if (found) return found;
  }
  return null;
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => reject(new Error(`timeout after ${timeoutMs}ms`)), timeoutMs);
      })
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

export class LivePaperclipIssueAdapter implements PaperclipAdapter {
  private readonly fetch: LivePaperclipFetch;
  private readonly baseUrl: string;
  private readonly companyId: string;
  private readonly issueId?: string;
  private readonly headers: Record<string, string>;
  private readonly timeoutMs: number;
  private readonly paths: LivePaperclipPathConfig;
  private readonly nativeApprovalApi: ValidatedNativeApprovalApi | null;
  private readonly diagnostics: LivePaperclipAdapterDiagnostic[] = [];
  private readonly sideEffectCounts: LivePaperclipSideEffectCounts = {
    documents_created: 0,
    comments_created: 0,
    escalation_issues_created: 0,
    approval_requests_created: 0,
    activity_logs_written: 0
  };

  constructor(input: LivePaperclipIssueAdapterInput) {
    this.fetch = input.fetch;
    this.baseUrl = trimTrailingSlash(input.baseUrl);
    this.companyId = input.companyId;
    this.issueId = input.issueId;
    this.headers = sanitizeHeaders(input.headers);
    this.timeoutMs = input.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.paths = input.paths ?? {};
    this.nativeApprovalApi = input.nativeApprovalApi ?? null;
  }

  getDiagnostics(): LivePaperclipAdapterDiagnostic[] {
    return this.diagnostics.map((diagnostic) => ({ ...diagnostic }));
  }

  getSideEffectCounts(): LivePaperclipSideEffectCounts {
    return { ...this.sideEffectCounts };
  }

  async createIssueDocument(issueId: string, title: string, markdown: string): Promise<{ document_id: string }> {
    const body = await this.postJson({
      phase: "documents.native",
      issueId,
      configuredPath: this.paths.createIssueDocument,
      body: {
        company_id: this.companyId,
        issue_id: issueId,
        title,
        markdown
      }
    });
    const documentId = firstStringAtPath(body, [["document_id"], ["id"], ["document", "id"], ["data", "document_id"], ["data", "id"]]);
    if (!documentId) this.fail("documents.native", "createIssueDocument returned missing document_id", 200, body, null);
    this.sideEffectCounts.documents_created += 1;
    return { document_id: documentId };
  }

  async addIssueComment(issueId: string, markdown: string): Promise<{ comment_id: string }> {
    const body = await this.postJson({
      phase: "comments.native",
      issueId,
      configuredPath: this.paths.addIssueComment,
      body: {
        company_id: this.companyId,
        issue_id: issueId,
        markdown,
        body: markdown
      }
    });
    const commentId = firstStringAtPath(body, [["comment_id"], ["id"], ["comment", "id"], ["data", "comment_id"], ["data", "id"]]);
    if (!commentId) this.fail("comments.native", "addIssueComment returned missing comment_id", 200, body, null);
    this.sideEffectCounts.comments_created += 1;
    return { comment_id: commentId };
  }

  async createApprovalRequest(issueIds: string[], reason: string): Promise<NativeApprovalRequest> {
    if (this.nativeApprovalApi?.validatedNativeApproval !== true) {
      this.recordDiagnostic({
        phase: "approvals.native",
        status_code: null,
        bounded_response_text: null,
        malformed_json_reason: null,
        timeout_ms: null,
        fallback_used: true,
        message: "approvals.native:unvalidated"
      });
      throw new LivePaperclipApiError(this.diagnostics[this.diagnostics.length - 1]);
    }

    try {
      const approval = await withTimeout(
        this.nativeApprovalApi.createApprovalRequest({
          company_id: this.companyId,
          issue_ids: issueIds,
          reason
        }),
        this.timeoutMs
      );
      if (!approval?.id || !["PENDING", "APPROVED", "REJECTED"].includes(approval.status)) {
        this.fail("approvals.native", "createApprovalRequest returned missing id or invalid status", 200, approval, null);
      }
      this.sideEffectCounts.approval_requests_created += 1;
      return approval;
    } catch (error) {
      if (error instanceof LivePaperclipApiError) throw error;
      const timeout = error instanceof Error && error.message.includes("timeout after") ? this.timeoutMs : null;
      this.fail("approvals.native", redactSensitiveText(error), null, null, timeout);
    }
  }

  async createEscalationIssue(input: { title: string; body: string; related_issue_id: string }): Promise<{ issue_id: string }> {
    const body = await this.postJson({
      phase: "issues.native",
      issueId: this.issueId,
      relatedIssueId: input.related_issue_id,
      configuredPath: this.paths.createEscalationIssue,
      body: {
        company_id: this.companyId,
        title: input.title,
        body: input.body,
        related_issue_id: input.related_issue_id
      }
    });
    const issueId = firstStringAtPath(body, [["issue_id"], ["id"], ["issue", "id"], ["data", "issue_id"], ["data", "id"]]);
    if (!issueId) this.fail("issues.native", "createEscalationIssue returned missing issue_id", 200, body, null);
    this.sideEffectCounts.escalation_issues_created += 1;
    return { issue_id: issueId };
  }

  async logActivity(message: string, data?: unknown): Promise<void> {
    if (!this.paths.logActivity) return;
    await this.postJson({
      phase: "activity.logging",
      issueId: this.issueId,
      configuredPath: this.paths.logActivity,
      body: {
        company_id: this.companyId,
        issue_id: this.issueId ?? null,
        message,
        data
      }
    });
    this.sideEffectCounts.activity_logs_written += 1;
  }

  private async postJson(input: {
    phase: LivePaperclipAdapterDiagnostic["phase"];
    issueId?: string;
    relatedIssueId?: string;
    configuredPath?: string | LivePaperclipPathBuilder;
    body: Record<string, unknown>;
  }): Promise<unknown> {
    const url = resolvePath({
      configured: input.configuredPath,
      phase: input.phase,
      baseUrl: this.baseUrl,
      companyId: this.companyId,
      issueId: input.issueId,
      relatedIssueId: input.relatedIssueId
    });

    let response: LivePaperclipFetchResponse;
    try {
      response = await withTimeout(
        this.fetch(url, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            accept: "application/json",
            ...this.headers
          },
          body: JSON.stringify(input.body)
        }),
        this.timeoutMs
      );
    } catch (error) {
      const timeout = error instanceof Error && error.message.includes("timeout after") ? this.timeoutMs : null;
      this.fail(input.phase, redactSensitiveText(error), null, null, timeout);
    }

    let rawText: string | null = null;
    if (typeof response.text === "function") {
      rawText = await withTimeout(response.text(), this.timeoutMs);
    }

    if (!response.ok) {
      this.fail(input.phase, `Paperclip API ${input.phase} failed with status ${response.status}`, response.status, rawText, null);
    }

    if (rawText === null || rawText.trim() === "") {
      if (typeof response.json === "function") {
        try {
          return await withTimeout(response.json(), this.timeoutMs);
        } catch (error) {
          this.fail(input.phase, "Paperclip API returned malformed JSON", response.status, null, null, redactSensitiveText(error));
        }
      }
      return {};
    }

    try {
      return JSON.parse(rawText) as unknown;
    } catch (error) {
      this.fail(input.phase, "Paperclip API returned malformed JSON", response.status, rawText, null, redactSensitiveText(error));
    }
  }

  private fail(
    phase: LivePaperclipAdapterDiagnostic["phase"],
    message: string,
    statusCode: number | null,
    responseBody: unknown,
    timeoutMs: number | null,
    malformedJsonReason?: string | null
  ): never {
    const diagnostic: LivePaperclipAdapterDiagnostic = {
      phase,
      status_code: statusCode,
      bounded_response_text: responseBody === null || responseBody === undefined
        ? null
        : redactSensitiveText(typeof responseBody === "string" ? responseBody : JSON.stringify(responseBody)),
      malformed_json_reason: malformedJsonReason ? redactSensitiveText(malformedJsonReason) : null,
      timeout_ms: timeoutMs,
      fallback_used: true,
      message: redactSensitiveText(message)
    };
    this.recordDiagnostic(diagnostic);
    throw new LivePaperclipApiError(diagnostic);
  }

  private recordDiagnostic(diagnostic: LivePaperclipAdapterDiagnostic): void {
    this.diagnostics.push({
      ...diagnostic,
      bounded_response_text: diagnostic.bounded_response_text ? redactSensitiveText(diagnostic.bounded_response_text) : null,
      malformed_json_reason: diagnostic.malformed_json_reason ? redactSensitiveText(diagnostic.malformed_json_reason) : null,
      message: redactSensitiveText(diagnostic.message)
    });
  }
}
