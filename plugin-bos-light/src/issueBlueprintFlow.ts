import { calculateBPIScore, type BPIScoreInput } from "./bpi";
import type { BlueprintInput } from "./blueprint";
import {
  createProductBlueprintArtifact,
  type BlueprintArtifactCapabilities,
  type ProductBlueprintArtifact
} from "./blueprintArtifact";
import { BosStatus, type BosStatusOverlay, type Division } from "./contracts";
import type { BOSPersistence, PaperclipAdapter } from "./paperclipAdapter";

export interface SeededIssueFields {
  issue_id: string;
  title: string;
  problem_statement: string;
  producer_division: Division;
  acceptance_criteria: string[];
  resources: string[];
  qa_policy?: string[];
}

export type SeededIssueBPIInput = Omit<BPIScoreInput, "source_issue_id"> & {
  /** Defaults to issue.issue_id so seeded issue identity stays single-sourced. */
  source_issue_id?: string;
};

export type CacheOverlayWriteResult = "not_attempted" | "saved" | "failed";

export interface CacheOverlayWriteDiagnostics {
  durability: "cache-overlay-only";
  persistence: "missing" | "provided";
  bpi: CacheOverlayWriteResult;
  status: CacheOverlayWriteResult;
  error: string | null;
}

export type IssueBlueprintStatusOverlay = BosStatusOverlay & {
  cache_overlay: CacheOverlayWriteDiagnostics;
};

export interface SeededIssueBlueprintFlowInput {
  issue: SeededIssueFields;
  bpi: SeededIssueBPIInput;
  adapter: Pick<PaperclipAdapter, "createIssueDocument" | "addIssueComment">;
  persistence?: Pick<BOSPersistence, "saveBPI" | "saveStatus">;
  capabilities: BlueprintArtifactCapabilities;
  now?: string;
}

export interface SeededIssueBlueprintFlowResult {
  bpi: ReturnType<typeof calculateBPIScore>;
  blueprint_markdown: string;
  artifact: ProductBlueprintArtifact;
  status_overlay: IssueBlueprintStatusOverlay;
}

function serializeCacheOverlayError(error: unknown): string {
  const raw = error instanceof Error && error.message
    ? error.message
    : typeof error === "string"
      ? error
      : "Unknown cache-overlay persistence error";
  return raw.replace(/[\r\n\t]+/g, " ").replace(/\s{2,}/g, " ").trim().slice(0, 500) || "Unknown cache-overlay persistence error";
}

async function saveCacheOverlay(input: {
  persistence: Pick<BOSPersistence, "saveBPI" | "saveStatus"> | undefined;
  bpi: ReturnType<typeof calculateBPIScore>;
  status: BosStatusOverlay;
}): Promise<CacheOverlayWriteDiagnostics> {
  if (!input.persistence) {
    return {
      durability: "cache-overlay-only",
      persistence: "missing",
      bpi: "not_attempted",
      status: "not_attempted",
      error: null
    };
  }

  let bpi: CacheOverlayWriteResult = "not_attempted";
  let status: CacheOverlayWriteResult = "not_attempted";
  const errors: string[] = [];

  try {
    await input.persistence.saveBPI(input.bpi);
    bpi = "saved";
  } catch (error) {
    bpi = "failed";
    errors.push(`saveBPI: ${serializeCacheOverlayError(error)}`);
  }

  try {
    await input.persistence.saveStatus(input.status);
    status = "saved";
  } catch (error) {
    status = "failed";
    errors.push(`saveStatus: ${serializeCacheOverlayError(error)}`);
  }

  return {
    durability: "cache-overlay-only",
    persistence: "provided",
    bpi,
    status,
    error: errors.length ? errors.join("; ") : null
  };
}

export async function runSeededIssueBlueprintFlow(
  input: SeededIssueBlueprintFlowInput
): Promise<SeededIssueBlueprintFlowResult> {
  const now = input.now ?? new Date().toISOString();
  const bpi = calculateBPIScore({
    ...input.bpi,
    source_issue_id: input.bpi.source_issue_id ?? input.issue.issue_id,
    now: input.bpi.now ?? now
  });

  const blueprint: BlueprintInput = {
    issue_id: input.issue.issue_id,
    title: input.issue.title,
    problem_statement: input.issue.problem_statement,
    producer_division: input.issue.producer_division,
    bpi,
    acceptance_criteria: input.issue.acceptance_criteria,
    resources: input.issue.resources,
    qa_policy: input.issue.qa_policy
  };

  const artifact = await createProductBlueprintArtifact({
    adapter: input.adapter,
    blueprint,
    capabilities: input.capabilities,
    now
  });

  const baseStatusOverlay: BosStatusOverlay = {
    schema_version: "1.0",
    issue_id: input.issue.issue_id,
    bos_status: BosStatus.BLUEPRINT_READY,
    producer_division: input.issue.producer_division,
    blueprint_id: artifact.artifact_ref || artifact.artifact_id || null,
    bpi_score: bpi.score,
    updated_at: now
  };

  const cacheOverlay = await saveCacheOverlay({
    persistence: input.persistence,
    bpi,
    status: baseStatusOverlay
  });

  return {
    bpi,
    blueprint_markdown: artifact.markdown,
    artifact,
    status_overlay: {
      ...baseStatusOverlay,
      cache_overlay: cacheOverlay
    }
  };
}
