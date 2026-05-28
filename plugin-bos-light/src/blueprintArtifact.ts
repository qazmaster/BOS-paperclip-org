import { generateBlueprintMarkdown, type BlueprintInput } from "./blueprint";
import type { BPIScore } from "./contracts";
import type { PaperclipAdapter } from "./paperclipAdapter";
import type { PaperclipRuntimeCapabilityStatus } from "./runtimeCapabilities";

export type BlueprintArtifactSurface = "documents.native" | "comments.native" | "markdown-only";

export type BlueprintArtifactCapabilityPosture = PaperclipRuntimeCapabilityStatus | "enabled" | "failed";

export interface BlueprintArtifactCapabilities {
  /**
   * `confirmed` means runtime proof exists; `enabled` means the caller is deliberately
   * exercising the adapter seam without claiming Paperclip support is proven.
   * Other postures skip document writes and fall back to comments/markdown.
   */
  documents_native: BlueprintArtifactCapabilityPosture;
  /** Comments are the preferred Paperclip-visible fallback unless explicitly unsupported/failed. */
  comments_native?: BlueprintArtifactCapabilityPosture;
}

export interface BlueprintArtifactFallbackDiagnostics {
  reason: string | null;
  document_error?: string;
  comment_error?: string;
}

export interface ProductBlueprintArtifact {
  schema_version: "1.0";
  artifact_id: string;
  artifact_ref: string;
  issue_id: string;
  title: string;
  selected_surface: BlueprintArtifactSurface;
  mirrored_at: string;
  markdown: string;
  bpi: BPIScore;
  fallback: BlueprintArtifactFallbackDiagnostics;
}

export interface CreateBlueprintArtifactInput {
  adapter: Pick<PaperclipAdapter, "createIssueDocument" | "addIssueComment">;
  blueprint: BlueprintInput;
  capabilities: BlueprintArtifactCapabilities;
  now?: string;
}

const HARD_GATE_NAMES: Array<keyof BPIScore["hard_gates"]> = [
  "strategic_weight_passed",
  "budget_snapshot_available",
  "acceptance_inputs_present",
  "policy_precheck_passed",
  "security_precheck_passed"
];

function hasDocumentWritePosture(posture: BlueprintArtifactCapabilityPosture): boolean {
  return posture === "confirmed" || posture === "enabled";
}

function hasCommentWritePosture(posture: BlueprintArtifactCapabilityPosture | undefined): boolean {
  return posture !== "unsupported" && posture !== "failed";
}

function serializeError(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "string") return error;
  return "Unknown adapter error";
}

function markdownOnlyArtifactId(issueId: string): string {
  return `markdown-only:${issueId}:product-blueprint`;
}

function artifactRef(surface: BlueprintArtifactSurface, issueId: string, artifactId: string): string {
  if (surface === "documents.native") return `paperclip://issues/${issueId}/documents/${artifactId}`;
  if (surface === "comments.native") return `paperclip://issues/${issueId}/comments/${artifactId}`;
  return `markdown-only://issues/${issueId}/product-blueprint`;
}

function invalidScoreReason(blueprint: BlueprintInput): string | null {
  if (blueprint.bpi.schema_version !== "1.0" || blueprint.bpi.formula !== "bpi_v1.0") {
    return "incompatible_bpi_score";
  }
  if (blueprint.bpi.source_issue_id !== blueprint.issue_id) {
    return "incompatible_bpi_issue";
  }

  const failedGates = HARD_GATE_NAMES.filter((gate) => !blueprint.bpi.hard_gates[gate]);
  if (failedGates.length) return `hard_gate_failed:${failedGates.join(",")}`;
  if (!blueprint.acceptance_criteria.length || !blueprint.resources.length) {
    return "incomplete_blueprint_inputs";
  }
  return null;
}

function buildArtifact(input: {
  artifactId: string;
  issueId: string;
  title: string;
  surface: BlueprintArtifactSurface;
  mirroredAt: string;
  markdown: string;
  bpi: BPIScore;
  fallback: BlueprintArtifactFallbackDiagnostics;
}): ProductBlueprintArtifact {
  return {
    schema_version: "1.0",
    artifact_id: input.artifactId,
    artifact_ref: artifactRef(input.surface, input.issueId, input.artifactId),
    issue_id: input.issueId,
    title: input.title,
    selected_surface: input.surface,
    mirrored_at: input.mirroredAt,
    markdown: input.markdown,
    bpi: input.bpi,
    fallback: input.fallback
  };
}

export async function createProductBlueprintArtifact(input: CreateBlueprintArtifactInput): Promise<ProductBlueprintArtifact> {
  const { adapter, blueprint, capabilities } = input;
  const mirroredAt = input.now ?? new Date().toISOString();
  const title = `Product Blueprint: ${blueprint.title}`;
  const markdown = generateBlueprintMarkdown(blueprint);
  const issueId = blueprint.issue_id;

  const invalidReason = invalidScoreReason(blueprint);
  if (invalidReason) {
    return buildArtifact({
      artifactId: markdownOnlyArtifactId(issueId),
      issueId,
      title,
      surface: "markdown-only",
      mirroredAt,
      markdown,
      bpi: blueprint.bpi,
      fallback: { reason: invalidReason }
    });
  }

  let reason: string | null = null;
  let documentError: string | undefined;

  if (hasDocumentWritePosture(capabilities.documents_native)) {
    try {
      const document = await adapter.createIssueDocument(issueId, title, markdown);
      return buildArtifact({
        artifactId: document.document_id,
        issueId,
        title,
        surface: "documents.native",
        mirroredAt,
        markdown,
        bpi: blueprint.bpi,
        fallback: { reason: null }
      });
    } catch (error) {
      documentError = serializeError(error);
      reason = "document_write_failed";
    }
  } else {
    reason = `documents.native:${capabilities.documents_native}`;
  }

  if (hasCommentWritePosture(capabilities.comments_native)) {
    try {
      const comment = await adapter.addIssueComment(issueId, markdown);
      return buildArtifact({
        artifactId: comment.comment_id,
        issueId,
        title,
        surface: "comments.native",
        mirroredAt,
        markdown,
        bpi: blueprint.bpi,
        fallback: {
          reason,
          ...(documentError ? { document_error: documentError } : {})
        }
      });
    } catch (error) {
      return buildArtifact({
        artifactId: markdownOnlyArtifactId(issueId),
        issueId,
        title,
        surface: "markdown-only",
        mirroredAt,
        markdown,
        bpi: blueprint.bpi,
        fallback: {
          reason: "comment_write_failed",
          ...(documentError ? { document_error: documentError } : {}),
          comment_error: serializeError(error)
        }
      });
    }
  }

  return buildArtifact({
    artifactId: markdownOnlyArtifactId(issueId),
    issueId,
    title,
    surface: "markdown-only",
    mirroredAt,
    markdown,
    bpi: blueprint.bpi,
    fallback: {
      reason: reason ?? `comments.native:${capabilities.comments_native ?? "unvalidated"}`,
      ...(documentError ? { document_error: documentError } : {})
    }
  });
}
