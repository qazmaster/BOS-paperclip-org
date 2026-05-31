import type {
  DecisionArtifactCacheOverlayDiagnostics,
  DecisionArtifactCapabilities,
  DecisionArtifactCapabilityPosture,
  DecisionArtifactEnvelope,
  DecisionArtifactFallbackDiagnostics,
  DecisionArtifactSurface,
  DecisionMetadata,
  DecisionResult
} from "./contracts";
import type { BOSPersistence, PaperclipAdapter } from "./paperclipAdapter";

export type DecisionArtifactAdapter = Partial<Pick<PaperclipAdapter, "createIssueDocument" | "addIssueComment">>;
export type DecisionArtifactPersistence = Partial<Pick<BOSPersistence, "saveDecision">>;

export interface PersistDecisionArtifactOptions {
  adapter?: DecisionArtifactAdapter | null;
  persistence?: DecisionArtifactPersistence | null;
  capabilities?: DecisionArtifactCapabilities | null;
  now?: string;
}

const PHASE: DecisionArtifactEnvelope["phase"] = "S02.decision_artifact";
const MAX_DIAGNOSTIC_ERROR_LENGTH = 500;
const MAX_MARKDOWN_DIAGNOSTIC_LENGTH = 200;

function normalizeOneLine(value: unknown): string {
  const raw = value instanceof Error && value.message ? value.message : String(value ?? "");
  return raw
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function redactSensitiveDiagnosticText(value: unknown): string {
  return normalizeOneLine(value)
    .replace(/\bBearer\s+[A-Za-z0-9._~+\/-]+=*/gi, "Bearer [REDACTED]")
    .replace(/\b(access[_-]?token|refresh[_-]?token|session[_-]?token|api[_\s-]?key|token|secret|authorization|cookie|password)\s*[:=]\s*("[^"]+"|'[^']+'|[^\s,;]+)/gi, "$1=[REDACTED]")
    .replace(/\b(access[_-]?token|refresh[_-]?token|session[_-]?token|token|secret|password|authorization|cookie)\s+(?:is\s+)?[A-Za-z0-9._~+\/-]{8,}\b/gi, "$1 [REDACTED]")
    .replace(/\b(sk|pk)_(live|test)_[A-Za-z0-9]{12,}\b/g, "[REDACTED]")
    .replace(/\b[A-Za-z0-9_-]{24,}\.[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{20,}\b/g, "[REDACTED]")
    .replace(/\s+at\s+[A-Za-z0-9_$.[\]<>]+[^\s]*(?:\s+\([^)]*\))?/g, " [STACK_REDACTED]");
}

function sanitizeDiagnosticError(error: unknown): string {
  return redactSensitiveDiagnosticText(error).slice(0, MAX_DIAGNOSTIC_ERROR_LENGTH) || "unknown error";
}

function sanitizeMarkdownValue(value: unknown): string {
  return redactSensitiveDiagnosticText(value)
    .replace(/\|/g, "\\|")
    .slice(0, MAX_MARKDOWN_DIAGNOSTIC_LENGTH) || "none";
}

function hasDocumentWritePosture(posture: DecisionArtifactCapabilityPosture | undefined): boolean {
  return posture === "confirmed" || posture === "enabled";
}

function hasCommentWritePosture(posture: DecisionArtifactCapabilityPosture | undefined): boolean {
  return posture !== "unsupported" && posture !== "failed";
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function markdownOnlyArtifactId(issueId: string | null, decisionId: string | null): string {
  return `markdown-only:${issueId ?? "missing"}:decisions:${decisionId ?? "invalid"}`;
}

function markdownOnlyArtifactRef(issueId: string | null, decisionId: string | null): string {
  return `markdown-only://issues/${issueId ?? "missing"}/decisions/${decisionId ?? "invalid"}`;
}

function artifactRef(surface: DecisionArtifactSurface, issueId: string, artifactId: string, decisionId: string): string {
  if (surface === "documents.native") return `paperclip://issues/${issueId}/documents/${artifactId}`;
  if (surface === "comments.native") return `paperclip://issues/${issueId}/comments/${artifactId}`;
  return markdownOnlyArtifactRef(issueId, decisionId);
}

function buildCacheOverlayDiagnostics(input: {
  persistence: DecisionArtifactCacheOverlayDiagnostics["persistence"];
  save: DecisionArtifactCacheOverlayDiagnostics["save"];
  timestamp: string;
  error?: string | null;
}): DecisionArtifactCacheOverlayDiagnostics {
  return {
    durability: "cache-overlay-only",
    persistence: input.persistence,
    save: input.save,
    error: input.error ?? null,
    timestamp: input.timestamp
  };
}

async function saveDecisionCacheOverlay(input: {
  decision: DecisionMetadata;
  persistence?: DecisionArtifactPersistence | null;
  timestamp: string;
}): Promise<DecisionArtifactCacheOverlayDiagnostics> {
  if (!input.persistence) {
    return buildCacheOverlayDiagnostics({
      persistence: "missing",
      save: "not_attempted",
      timestamp: input.timestamp
    });
  }

  if (typeof input.persistence.saveDecision !== "function") {
    return buildCacheOverlayDiagnostics({
      persistence: "provided",
      save: "not_attempted",
      timestamp: input.timestamp
    });
  }

  try {
    await input.persistence.saveDecision(input.decision);
    return buildCacheOverlayDiagnostics({
      persistence: "provided",
      save: "saved",
      timestamp: input.timestamp
    });
  } catch (error) {
    return buildCacheOverlayDiagnostics({
      persistence: "provided",
      save: "failed",
      error: sanitizeDiagnosticError(error),
      timestamp: input.timestamp
    });
  }
}

function rejectedDecisionMarkdown(decision: DecisionResult): string {
  if (decision.accepted) return decision.record_markdown;

  const validationErrors = decision.diagnostics.validation_errors.length > 0
    ? decision.diagnostics.validation_errors.map((error) => `- ${sanitizeMarkdownValue(error)}`)
    : ["- none"];

  return [
    "# BOS Decision Validation Failure",
    "",
    `- Schema version: ${decision.schema_version}`,
    "- Accepted: false",
    `- Issue: ${sanitizeMarkdownValue(decision.issue_id)}`,
    `- Error: ${decision.error}`,
    `- Decided by: ${decision.decided_by}`,
    `- Decided at: ${sanitizeMarkdownValue(decision.decided_at)}`,
    "- Selected surface: markdown-only",
    "- Diagnostics sanitized: true",
    "- Native approval mutated: false",
    "",
    "## Validation Diagnostics",
    ...validationErrors
  ].join("\n");
}

function envelope(input: {
  decision: DecisionResult;
  selectedSurface: DecisionArtifactSurface;
  artifactId: string;
  artifactRef: string;
  mirroredAt: string;
  markdown: string;
  cacheOverlay: DecisionArtifactCacheOverlayDiagnostics;
  fallback: DecisionArtifactFallbackDiagnostics;
}): DecisionArtifactEnvelope {
  return {
    schema_version: "1.0",
    phase: PHASE,
    issue_id: input.decision.issue_id,
    decision_id: input.decision.accepted ? input.decision.decision_id : null,
    selected_surface: input.selectedSurface,
    artifact_id: input.artifactId,
    artifact_ref: input.artifactRef,
    decided_at: input.decision.decided_at,
    mirrored_at: input.mirroredAt,
    markdown: input.markdown,
    cache_overlay: input.cacheOverlay,
    fallback: input.fallback,
    decision: input.decision,
    invariants: {
      decided_by: "Div7.MissionControl",
      diagnostics_sanitized: true,
      native_approval_mutated: false
    }
  };
}

export async function persistDecisionArtifact(
  decision: DecisionResult,
  options: PersistDecisionArtifactOptions = {}
): Promise<DecisionArtifactEnvelope> {
  const mirroredAt = options.now ?? new Date().toISOString();

  if (!decision.accepted) {
    const fallback: DecisionArtifactFallbackDiagnostics = {
      reason: "invalid_decision_input",
      validation_error: decision.diagnostics.validation_errors.map(sanitizeDiagnosticError).join("; ") || "invalid_decision_input"
    };
    const markdown = rejectedDecisionMarkdown(decision);
    return envelope({
      decision,
      selectedSurface: "markdown-only",
      artifactId: markdownOnlyArtifactId(decision.issue_id, null),
      artifactRef: markdownOnlyArtifactRef(decision.issue_id, null),
      mirroredAt,
      markdown,
      cacheOverlay: buildCacheOverlayDiagnostics({
        persistence: options.persistence ? "provided" : "missing",
        save: "not_attempted",
        timestamp: mirroredAt
      }),
      fallback
    });
  }

  const cacheOverlay = await saveDecisionCacheOverlay({
    decision,
    persistence: options.persistence,
    timestamp: mirroredAt
  });
  const markdown = decision.record_markdown;
  const issueId = decision.issue_id;
  const decisionId = decision.decision_id;
  const capabilities = options.capabilities ?? {};
  const adapter = options.adapter;
  const title = `BOS Decision Record: ${decisionId}`;

  let reason: string | null = null;
  let documentError: string | undefined;
  let commentError: string | undefined;

  if (hasDocumentWritePosture(capabilities.documents_native)) {
    if (typeof adapter?.createIssueDocument === "function") {
      try {
        const document = await adapter.createIssueDocument(issueId, title, markdown);
        if (isNonEmptyString(document?.document_id)) {
          const artifactId = document.document_id.trim();
          return envelope({
            decision,
            selectedSurface: "documents.native",
            artifactId,
            artifactRef: artifactRef("documents.native", issueId, artifactId, decisionId),
            mirroredAt,
            markdown,
            cacheOverlay,
            fallback: { reason: null }
          });
        }
        reason = "document_response_malformed";
        documentError = "createIssueDocument returned missing document_id";
      } catch (error) {
        reason = "document_write_failed";
        documentError = sanitizeDiagnosticError(error);
      }
    } else {
      reason = "documents.native:unavailable";
    }
  } else {
    reason = `documents.native:${capabilities.documents_native ?? "unvalidated"}`;
  }

  if (hasCommentWritePosture(capabilities.comments_native)) {
    if (typeof adapter?.addIssueComment === "function") {
      try {
        const comment = await adapter.addIssueComment(issueId, markdown);
        if (isNonEmptyString(comment?.comment_id)) {
          const artifactId = comment.comment_id.trim();
          return envelope({
            decision,
            selectedSurface: "comments.native",
            artifactId,
            artifactRef: artifactRef("comments.native", issueId, artifactId, decisionId),
            mirroredAt,
            markdown,
            cacheOverlay,
            fallback: {
              reason,
              ...(documentError ? { document_error: documentError } : {})
            }
          });
        }

        const fallback: DecisionArtifactFallbackDiagnostics = {
          reason: "comment_response_malformed",
          ...(documentError ? { document_error: documentError } : {}),
          comment_error: "addIssueComment returned missing comment_id"
        };
        return envelope({
          decision,
          selectedSurface: "markdown-only",
          artifactId: markdownOnlyArtifactId(issueId, decisionId),
          artifactRef: markdownOnlyArtifactRef(issueId, decisionId),
          mirroredAt,
          markdown,
          cacheOverlay,
          fallback
        });
      } catch (error) {
        const fallback: DecisionArtifactFallbackDiagnostics = {
          reason: "comment_write_failed",
          ...(documentError ? { document_error: documentError } : {}),
          comment_error: sanitizeDiagnosticError(error)
        };
        return envelope({
          decision,
          selectedSurface: "markdown-only",
          artifactId: markdownOnlyArtifactId(issueId, decisionId),
          artifactRef: markdownOnlyArtifactRef(issueId, decisionId),
          mirroredAt,
          markdown,
          cacheOverlay,
          fallback
        });
      }
    }

    reason = "comments.native:unavailable";
    commentError = sanitizeDiagnosticError("addIssueComment is unavailable");
  } else {
    reason = `comments.native:${capabilities.comments_native}`;
    commentError = sanitizeDiagnosticError(`comments.native posture is ${capabilities.comments_native}`);
  }

  const fallback: DecisionArtifactFallbackDiagnostics = {
    reason,
    ...(documentError ? { document_error: documentError } : {}),
    ...(commentError ? { comment_error: commentError } : {})
  };

  return envelope({
    decision,
    selectedSurface: "markdown-only",
    artifactId: markdownOnlyArtifactId(issueId, decisionId),
    artifactRef: markdownOnlyArtifactRef(issueId, decisionId),
    mirroredAt,
    markdown,
    cacheOverlay,
    fallback
  });
}
