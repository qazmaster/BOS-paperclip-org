import type { EvalGateResult } from "./contracts";
import { runEvalGates, type EvalGateInput } from "./evalGates";
import type { BOSPersistence, PaperclipAdapter } from "./paperclipAdapter";

export type EvalGateEvidenceSurface = "comments.native" | "markdown-only";
export type EvalGatePersistenceAvailability = "missing" | "provided";
export type EvalGateCacheSaveStatus = "saved" | "failed" | "not_attempted";

export interface EvalGateCacheOverlayDiagnostics {
  durability: "cache-overlay-only";
  persistence: EvalGatePersistenceAvailability;
  save: EvalGateCacheSaveStatus;
  error: string | null;
  timestamp: string;
}

export interface EvalGateEvidenceFallbackDiagnostics {
  reason: string | null;
  validation_error?: string;
  comment_error?: string;
}

export interface EvalGateEvidenceEnvelope {
  schema_version: "1.0";
  issue_id: string;
  run_id: string | null;
  selected_surface: EvalGateEvidenceSurface;
  artifact_id: string;
  artifact_ref: string;
  evaluated_at: string;
  mirrored_at: string;
  result: EvalGateResult;
  guidance: string;
  markdown: string;
  cache_overlay: EvalGateCacheOverlayDiagnostics;
  fallback: EvalGateEvidenceFallbackDiagnostics;
}

export type EvalGateEvidencePersistence = Partial<Pick<BOSPersistence, "saveGateResult">>;
export type EvalGateEvidenceAdapter = Partial<Pick<PaperclipAdapter, "addIssueComment">>;

export interface EvalGateEvidenceInput extends EvalGateInput {
  persistence?: EvalGateEvidencePersistence | null;
  adapter?: EvalGateEvidenceAdapter | null;
}

const EVAL_GATE_IDS: EvalGateResult["gates"][number]["gate_id"][] = [
  "LARS.Deterministic",
  "LARS.SecurityPolicy",
  "LARS.ArtifactIntegrity",
  "LARS.Budget"
];

function sanitizeDiagnosticError(error: unknown): string {
  const raw = error instanceof Error && error.message ? error.message : String(error);
  return raw.replace(/[\r\n\t]+/g, " ").replace(/\s{2,}/g, " ").trim().slice(0, 500) || "unknown error";
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function markdownArtifactId(issueId: string, runId: string | null): string {
  return `markdown-only:${issueId}:eval-gates:${runId ?? "latest"}`;
}

function markdownArtifactRef(issueId: string, runId: string | null): string {
  return `markdown-only://issues/${issueId}/eval-gates/${runId ?? "latest"}`;
}

function commentArtifactRef(issueId: string, commentId: string): string {
  return `paperclip://issues/${issueId}/comments/${commentId}`;
}

function buildCacheOverlayDiagnostics(input: {
  persistence: EvalGatePersistenceAvailability;
  save: EvalGateCacheSaveStatus;
  error?: string | null;
  timestamp: string;
}): EvalGateCacheOverlayDiagnostics {
  return {
    durability: "cache-overlay-only",
    persistence: input.persistence,
    save: input.save,
    error: input.error ?? null,
    timestamp: input.timestamp
  };
}

function validateEvalGateInput(input: EvalGateEvidenceInput): string | null {
  if (!isNonEmptyString(input.issue_id)) return "issue_id is required";
  if (typeof input.toolScopeRespected !== "boolean" || typeof input.budgetWarning !== "boolean") {
    return "toolScopeRespected and budgetWarning are required booleans";
  }
  return null;
}

function incompleteGateResult(input: EvalGateEvidenceInput, evaluatedAt: string, validationError: string): EvalGateResult {
  return {
    schema_version: "1.0",
    issue_id: typeof input.issue_id === "string" ? input.issue_id.trim() : "",
    run_id: input.run_id ?? null,
    gates: EVAL_GATE_IDS.map((gateId) => ({
      gate_id: gateId,
      status: "NOT_RUN",
      evidence: validationError,
      is_blocking: gateId !== "LARS.Budget"
    })),
    overall: "INCOMPLETE",
    blocking_failure_count: 0,
    warning_count: 0,
    not_run_count: EVAL_GATE_IDS.length,
    evaluated_at: evaluatedAt,
    evaluated_by: "Div5.QualificationsLibraryLearning"
  };
}

function buildGuidance(result: EvalGateResult, validationError?: string): string {
  if (result.overall === "INCOMPLETE") {
    return `Eval Gate incomplete: ${validationError ?? "one or more gates could not run"}. Treat Paperclip issue evidence as source of truth and rerun after inputs are complete.`;
  }

  const blockingFailures = result.gates.filter((gate) => gate.is_blocking && gate.status === "FAILED");
  if (blockingFailures.length) {
    return `Blocking Eval Gate failure: ${blockingFailures.map((gate) => `${gate.gate_id} (${gate.evidence ?? "no evidence"})`).join("; ")}. Do not accept this run until blocking gates pass.`;
  }

  const warnings = result.gates.filter((gate) => !gate.is_blocking && gate.status === "FAILED");
  if (warnings.length) {
    return `Non-blocking Eval Gate warning: ${warnings.map((gate) => `${gate.gate_id} (${gate.evidence ?? "no evidence"})`).join("; ")}. The run may proceed with visible budget diagnostics.`;
  }

  return "Eval Gates passed: all blocking and non-blocking gates passed.";
}

function buildMarkdown(result: EvalGateResult, guidance: string, cacheOverlay: EvalGateCacheOverlayDiagnostics, fallback: EvalGateEvidenceFallbackDiagnostics): string {
  const gateLines = result.gates.map((gate) => `- ${gate.gate_id}: ${gate.status} (${gate.is_blocking ? "blocking" : "non-blocking"}) - ${gate.evidence ?? "no evidence"}`);
  return [
    "# BOS Eval Gate Result",
    "",
    `- Issue: ${result.issue_id || "missing"}`,
    `- Run: ${result.run_id ?? "none"}`,
    `- Overall: ${result.overall}`,
    `- Evaluated at: ${result.evaluated_at}`,
    `- Evaluated by: ${result.evaluated_by}`,
    `- Cache overlay: ${cacheOverlay.save} (${cacheOverlay.durability})`,
    ...(cacheOverlay.error ? [`- Cache overlay error: ${cacheOverlay.error}`] : []),
    `- Native fallback reason: ${fallback.reason ?? "none"}`,
    ...(fallback.validation_error ? [`- Validation error: ${fallback.validation_error}`] : []),
    ...(fallback.comment_error ? [`- Comment error: ${fallback.comment_error}`] : []),
    "",
    "## Guidance",
    guidance,
    "",
    "## Gates",
    ...gateLines
  ].join("\n");
}

async function saveGateResult(input: {
  result: EvalGateResult;
  persistence?: EvalGateEvidencePersistence | null;
  timestamp: string;
}): Promise<EvalGateCacheOverlayDiagnostics> {
  if (!input.persistence) {
    return buildCacheOverlayDiagnostics({
      persistence: "missing",
      save: "not_attempted",
      timestamp: input.timestamp
    });
  }

  if (typeof input.persistence.saveGateResult !== "function") {
    return buildCacheOverlayDiagnostics({
      persistence: "provided",
      save: "not_attempted",
      timestamp: input.timestamp
    });
  }

  try {
    await input.persistence.saveGateResult(input.result);
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

function envelope(input: {
  result: EvalGateResult;
  selectedSurface: EvalGateEvidenceSurface;
  artifactId: string;
  artifactRef: string;
  mirroredAt: string;
  cacheOverlay: EvalGateCacheOverlayDiagnostics;
  fallback: EvalGateEvidenceFallbackDiagnostics;
  guidance: string;
  markdown: string;
}): EvalGateEvidenceEnvelope {
  return {
    schema_version: "1.0",
    issue_id: input.result.issue_id,
    run_id: input.result.run_id,
    selected_surface: input.selectedSurface,
    artifact_id: input.artifactId,
    artifact_ref: input.artifactRef,
    evaluated_at: input.result.evaluated_at,
    mirrored_at: input.mirroredAt,
    result: input.result,
    guidance: input.guidance,
    markdown: input.markdown,
    cache_overlay: input.cacheOverlay,
    fallback: input.fallback
  };
}

export async function evalGateEvidence(input: EvalGateEvidenceInput): Promise<EvalGateEvidenceEnvelope> {
  const timestamp = input.now ?? new Date().toISOString();
  const validationError = validateEvalGateInput(input);
  const result = validationError
    ? incompleteGateResult(input, timestamp, validationError)
    : runEvalGates({
      ...input,
      issue_id: input.issue_id.trim(),
      run_id: input.run_id ?? null,
      now: timestamp
    });

  const invalidFallback: EvalGateEvidenceFallbackDiagnostics | null = validationError
    ? { reason: "invalid_input", validation_error: validationError }
    : null;

  const cacheOverlay = validationError
    ? buildCacheOverlayDiagnostics({
      persistence: input.persistence ? "provided" : "missing",
      save: "not_attempted",
      timestamp
    })
    : await saveGateResult({ result, persistence: input.persistence, timestamp });

  const guidance = buildGuidance(result, validationError ?? undefined);

  if (invalidFallback) {
    const markdown = buildMarkdown(result, guidance, cacheOverlay, invalidFallback);
    return envelope({
      result,
      selectedSurface: "markdown-only",
      artifactId: markdownArtifactId(result.issue_id || "missing", result.run_id),
      artifactRef: markdownArtifactRef(result.issue_id || "missing", result.run_id),
      mirroredAt: timestamp,
      cacheOverlay,
      fallback: invalidFallback,
      guidance,
      markdown
    });
  }

  const adapter = input.adapter;
  if (typeof adapter?.addIssueComment !== "function") {
    const fallback: EvalGateEvidenceFallbackDiagnostics = {
      reason: "comments.native:unavailable",
      comment_error: "comments.native:unavailable"
    };
    const markdown = buildMarkdown(result, guidance, cacheOverlay, fallback);
    return envelope({
      result,
      selectedSurface: "markdown-only",
      artifactId: markdownArtifactId(result.issue_id, result.run_id),
      artifactRef: markdownArtifactRef(result.issue_id, result.run_id),
      mirroredAt: timestamp,
      cacheOverlay,
      fallback,
      guidance,
      markdown
    });
  }

  try {
    const markdown = buildMarkdown(result, guidance, cacheOverlay, { reason: null });
    const comment = await adapter.addIssueComment(result.issue_id, markdown);
    if (!isNonEmptyString(comment?.comment_id)) {
      const fallback: EvalGateEvidenceFallbackDiagnostics = {
        reason: "comment_response_malformed",
        comment_error: "addIssueComment returned missing comment_id"
      };
      const fallbackMarkdown = buildMarkdown(result, guidance, cacheOverlay, fallback);
      return envelope({
        result,
        selectedSurface: "markdown-only",
        artifactId: markdownArtifactId(result.issue_id, result.run_id),
        artifactRef: markdownArtifactRef(result.issue_id, result.run_id),
        mirroredAt: timestamp,
        cacheOverlay,
        fallback,
        guidance,
        markdown: fallbackMarkdown
      });
    }

    const commentId = comment.comment_id.trim();
    return envelope({
      result,
      selectedSurface: "comments.native",
      artifactId: commentId,
      artifactRef: commentArtifactRef(result.issue_id, commentId),
      mirroredAt: timestamp,
      cacheOverlay,
      fallback: { reason: null },
      guidance,
      markdown
    });
  } catch (error) {
    const fallback: EvalGateEvidenceFallbackDiagnostics = {
      reason: "comment_write_failed",
      comment_error: sanitizeDiagnosticError(error)
    };
    const markdown = buildMarkdown(result, guidance, cacheOverlay, fallback);
    return envelope({
      result,
      selectedSurface: "markdown-only",
      artifactId: markdownArtifactId(result.issue_id, result.run_id),
      artifactRef: markdownArtifactRef(result.issue_id, result.run_id),
      mirroredAt: timestamp,
      cacheOverlay,
      fallback,
      guidance,
      markdown
    });
  }
}
