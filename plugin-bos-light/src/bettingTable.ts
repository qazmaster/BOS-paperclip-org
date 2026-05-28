import type {
  BettingApprovalRequestEnvelope,
  BettingApprovalRequestFallbackDiagnostics,
  BettingApprovalRequestSurface,
  BettingTableItem,
  NativeApprovalStatus
} from "./contracts";
import type { BOSPersistence, PaperclipAdapter } from "./paperclipAdapter";

export interface BuildBettingTableInput {
  cycle_id: string;
  candidates: Array<Pick<BettingTableItem, "issue_id" | "bpi_score" | "blueprint_id">>;
  top_n: number;
  now?: string;
}

export type BettingCyclePersistence = Partial<Pick<BOSPersistence, "saveBettingTable" | "getBettingTable">>;

export type BettingCyclePersistenceAvailability = "missing" | "provided";
export type BettingCycleSaveStatus = "saved" | "failed" | "not_attempted";
export type BettingCycleLoadStatus = "loaded" | "missing" | "failed" | "not_attempted";

export interface BettingCycleCacheOverlayDiagnostics {
  durability: "cache-overlay-only";
  persistence: BettingCyclePersistenceAvailability;
  save: BettingCycleSaveStatus;
  load: BettingCycleLoadStatus;
  error: string | null;
  timestamp: string;
}

export interface BettingCycleResult {
  schema_version: "1.0";
  cycle_id: string;
  items: BettingTableItem[];
  selected_issue_ids: string[];
  cache_overlay: BettingCycleCacheOverlayDiagnostics;
}

export interface SaveBettingCycleInput {
  cycle_id: string;
  items: BettingTableItem[];
  persistence?: BettingCyclePersistence | null;
  now?: string;
}

export interface LoadBettingCycleInput {
  cycle_id: string;
  persistence?: BettingCyclePersistence | null;
  now?: string;
}

export interface BuildAndSaveBettingCycleInput extends BuildBettingTableInput {
  persistence?: BettingCyclePersistence | null;
}

export type ApprovalRequestPersistence = BettingCyclePersistence;
export type ApprovalRequestAdapter = Partial<Pick<PaperclipAdapter, "createApprovalRequest" | "addIssueComment">>;

export interface RequestBettingCycleApprovalInput {
  cycle_id: string;
  issue_ids: string[];
  reason: string;
  adapter?: ApprovalRequestAdapter | null;
  persistence?: ApprovalRequestPersistence | null;
  requested_by?: string;
  now?: string;
}

export interface BettingApprovalRequestResult extends BettingApprovalRequestEnvelope {
  updated_rows: BettingTableItem[];
  cache_overlay: BettingCycleCacheOverlayDiagnostics;
}

function sanitizeDiagnosticError(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  return raw.replace(/[\r\n\t]+/g, " ").replace(/\s{2,}/g, " ").trim().slice(0, 500) || "unknown error";
}

function buildCacheOverlayDiagnostics(input: {
  persistence: BettingCyclePersistenceAvailability;
  save: BettingCycleSaveStatus;
  load: BettingCycleLoadStatus;
  error?: string | null;
  timestamp: string;
}): BettingCycleCacheOverlayDiagnostics {
  return {
    durability: "cache-overlay-only",
    persistence: input.persistence,
    save: input.save,
    load: input.load,
    error: input.error ?? null,
    timestamp: input.timestamp
  };
}

function mergeCacheOverlayDiagnostics(input: {
  load: BettingCycleCacheOverlayDiagnostics;
  save: BettingCycleSaveStatus;
  error?: string | null;
  timestamp: string;
}): BettingCycleCacheOverlayDiagnostics {
  const errors = [input.load.error, input.error].filter((error): error is string => Boolean(error));
  return buildCacheOverlayDiagnostics({
    persistence: input.load.persistence,
    save: input.save,
    load: input.load.load,
    error: errors.length ? errors.join("; ") : null,
    timestamp: input.timestamp
  });
}

function isNativeApprovalStatus(status: unknown): status is NativeApprovalStatus {
  return status === "PENDING" || status === "APPROVED" || status === "REJECTED";
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function markdownApprovalRequestRef(cycleId: string): string {
  return `markdown-only://betting-cycles/${cycleId}/approval-request`;
}

function commentApprovalRequestRef(issueId: string, commentId: string): string {
  return `paperclip://issues/${issueId}/comments/${commentId}`;
}

function nativeApprovalRequestRef(requestId: string): string {
  return `paperclip://approval-requests/${requestId}`;
}

function buildApprovalRequestMarkdown(input: {
  cycle_id: string;
  issue_ids: string[];
  reason: string;
  requested_at: string;
  fallback: BettingApprovalRequestFallbackDiagnostics;
}): string {
  return [
    `# BOS Betting Cycle Approval Request`,
    ``,
    `- Cycle: ${input.cycle_id}`,
    `- Requested at: ${input.requested_at}`,
    `- Requested issue IDs: ${input.issue_ids.length ? input.issue_ids.join(", ") : "none"}`,
    `- Reason: ${input.reason || "No reason provided"}`,
    `- Native approval fallback reason: ${input.fallback.reason ?? "none"}`,
    ...(input.fallback.native_error ? [`- Native approval error: ${input.fallback.native_error}`] : []),
    ...(input.fallback.comment_error ? [`- Comment fallback error: ${input.fallback.comment_error}`] : [])
  ].join("\n");
}

function approvalResult(input: {
  cycle_id: string;
  selected_issue_ids: string[];
  selected_surface: BettingApprovalRequestSurface;
  native_approval_request_id: string | null;
  native_approval_status: NativeApprovalStatus | null;
  approval_request_ref: string;
  requested_at: string;
  fallback: BettingApprovalRequestFallbackDiagnostics;
  updated_rows: BettingTableItem[];
  cache_overlay: BettingCycleCacheOverlayDiagnostics;
}): BettingApprovalRequestResult {
  return {
    schema_version: "1.0",
    cycle_id: input.cycle_id,
    selected_issue_ids: input.selected_issue_ids,
    selected_surface: input.selected_surface,
    native_approval_request_id: input.native_approval_request_id,
    native_approval_status: input.native_approval_status,
    approval_request_ref: input.approval_request_ref,
    requested_at: input.requested_at,
    fallback: input.fallback,
    updated_rows: input.updated_rows,
    cache_overlay: input.cache_overlay
  };
}

function validateSelectedRows(input: {
  requestedIssueIds: string[];
  loadedItems: BettingTableItem[];
}): { ok: true; rows: BettingTableItem[]; selectedIssueIds: string[] } | { ok: false; reason: string; selectedIssueIds: string[] } {
  const selectedIssueIds = input.requestedIssueIds.map((issueId) => issueId.trim()).filter(Boolean);
  if (!selectedIssueIds.length) return { ok: false, reason: "empty_issue_ids", selectedIssueIds };

  const rowsByIssueId = new Map(input.loadedItems.map((item) => [item.issue_id, item]));
  const staleIssueId = selectedIssueIds.find((issueId) => !rowsByIssueId.has(issueId));
  if (staleIssueId) return { ok: false, reason: `stale_issue_id:${staleIssueId}`, selectedIssueIds };

  const selectedRows = selectedIssueIds.map((issueId) => rowsByIssueId.get(issueId)!);
  const nonRequestableRow = selectedRows.find((item) => item.status !== "CANDIDATE");
  if (nonRequestableRow) return { ok: false, reason: `issue_not_requestable:${nonRequestableRow.issue_id}:${nonRequestableRow.status}`, selectedIssueIds };

  return { ok: true, rows: selectedRows, selectedIssueIds };
}

function resultFor(cycle_id: string, items: BettingTableItem[], cache_overlay: BettingCycleCacheOverlayDiagnostics): BettingCycleResult {
  return {
    schema_version: "1.0",
    cycle_id,
    items,
    selected_issue_ids: items.map((item) => item.issue_id),
    cache_overlay
  };
}

export function buildBettingTable(input: BuildBettingTableInput): BettingTableItem[] {
  const now = input.now ?? new Date().toISOString();
  return [...input.candidates]
    .filter((item) => item.bpi_score > 0)
    .sort((a, b) => b.bpi_score - a.bpi_score)
    .slice(0, Math.max(1, input.top_n))
    .map((item) => ({
      schema_version: "1.0",
      cycle_id: input.cycle_id,
      issue_id: item.issue_id,
      bpi_score: item.bpi_score,
      blueprint_id: item.blueprint_id,
      status: "CANDIDATE",
      native_approval_request_id: null,
      native_approval_status: null,
      approved_by: null,
      created_at: now,
      updated_at: now
    }));
}

export async function saveBettingCycle(input: SaveBettingCycleInput): Promise<BettingCycleCacheOverlayDiagnostics> {
  const timestamp = input.now ?? new Date().toISOString();
  const persistence = input.persistence;

  if (!persistence) {
    return buildCacheOverlayDiagnostics({
      persistence: "missing",
      save: "not_attempted",
      load: "not_attempted",
      timestamp
    });
  }

  if (typeof persistence.saveBettingTable !== "function") {
    return buildCacheOverlayDiagnostics({
      persistence: "provided",
      save: "not_attempted",
      load: "not_attempted",
      timestamp
    });
  }

  try {
    await persistence.saveBettingTable(input.cycle_id, input.items);
    return buildCacheOverlayDiagnostics({
      persistence: "provided",
      save: "saved",
      load: "not_attempted",
      timestamp
    });
  } catch (error) {
    return buildCacheOverlayDiagnostics({
      persistence: "provided",
      save: "failed",
      load: "not_attempted",
      error: sanitizeDiagnosticError(error),
      timestamp
    });
  }
}

export async function loadBettingCycle(input: LoadBettingCycleInput): Promise<BettingCycleResult> {
  const timestamp = input.now ?? new Date().toISOString();
  const persistence = input.persistence;

  if (!persistence) {
    return resultFor(input.cycle_id, [], buildCacheOverlayDiagnostics({
      persistence: "missing",
      save: "not_attempted",
      load: "not_attempted",
      timestamp
    }));
  }

  if (typeof persistence.getBettingTable !== "function") {
    return resultFor(input.cycle_id, [], buildCacheOverlayDiagnostics({
      persistence: "provided",
      save: "not_attempted",
      load: "not_attempted",
      timestamp
    }));
  }

  try {
    const items = await persistence.getBettingTable(input.cycle_id);
    return resultFor(input.cycle_id, items, buildCacheOverlayDiagnostics({
      persistence: "provided",
      save: "not_attempted",
      load: items.length > 0 ? "loaded" : "missing",
      timestamp
    }));
  } catch (error) {
    return resultFor(input.cycle_id, [], buildCacheOverlayDiagnostics({
      persistence: "provided",
      save: "not_attempted",
      load: "failed",
      error: sanitizeDiagnosticError(error),
      timestamp
    }));
  }
}

export async function buildAndSaveBettingCycle(input: BuildAndSaveBettingCycleInput): Promise<BettingCycleResult> {
  const timestamp = input.now ?? new Date().toISOString();
  const items = buildBettingTable({
    cycle_id: input.cycle_id,
    candidates: input.candidates,
    top_n: input.top_n,
    now: timestamp
  });
  const cache_overlay = await saveBettingCycle({
    cycle_id: input.cycle_id,
    items,
    persistence: input.persistence,
    now: timestamp
  });

  return resultFor(input.cycle_id, items, cache_overlay);
}

export async function requestBettingCycleApproval(input: RequestBettingCycleApprovalInput): Promise<BettingApprovalRequestResult> {
  const requestedAt = input.now ?? new Date().toISOString();
  const loaded = await loadBettingCycle({
    cycle_id: input.cycle_id,
    persistence: input.persistence,
    now: requestedAt
  });
  const notSavedCacheOverlay = mergeCacheOverlayDiagnostics({
    load: loaded.cache_overlay,
    save: "not_attempted",
    timestamp: requestedAt
  });
  const sanitizedIssueIds = input.issue_ids.map((issueId) => issueId.trim()).filter(Boolean);

  if (!sanitizedIssueIds.length) {
    return approvalResult({
      cycle_id: input.cycle_id,
      selected_issue_ids: sanitizedIssueIds,
      selected_surface: "markdown-only",
      native_approval_request_id: null,
      native_approval_status: null,
      approval_request_ref: markdownApprovalRequestRef(input.cycle_id),
      requested_at: requestedAt,
      fallback: { reason: "empty_issue_ids" },
      updated_rows: loaded.items,
      cache_overlay: notSavedCacheOverlay
    });
  }

  if (!loaded.items.length && loaded.cache_overlay.load !== "loaded") {
    return approvalResult({
      cycle_id: input.cycle_id,
      selected_issue_ids: sanitizedIssueIds,
      selected_surface: "markdown-only",
      native_approval_request_id: null,
      native_approval_status: null,
      approval_request_ref: markdownApprovalRequestRef(input.cycle_id),
      requested_at: requestedAt,
      fallback: { reason: "missing_cycle" },
      updated_rows: loaded.items,
      cache_overlay: notSavedCacheOverlay
    });
  }

  const validation = validateSelectedRows({ requestedIssueIds: sanitizedIssueIds, loadedItems: loaded.items });
  if (!validation.ok) {
    return approvalResult({
      cycle_id: input.cycle_id,
      selected_issue_ids: validation.selectedIssueIds,
      selected_surface: "markdown-only",
      native_approval_request_id: null,
      native_approval_status: null,
      approval_request_ref: markdownApprovalRequestRef(input.cycle_id),
      requested_at: requestedAt,
      fallback: { reason: validation.reason },
      updated_rows: loaded.items,
      cache_overlay: notSavedCacheOverlay
    });
  }

  const adapter = input.adapter;
  let nativeFallback: BettingApprovalRequestFallbackDiagnostics = { reason: "approvals.native:unavailable" };

  if (typeof adapter?.createApprovalRequest === "function") {
    try {
      const native = await adapter.createApprovalRequest(validation.selectedIssueIds, input.reason);
      if (!isNonEmptyString(native?.id) || !isNativeApprovalStatus(native?.status)) {
        nativeFallback = {
          reason: "native_response_malformed",
          native_error: "createApprovalRequest returned missing id or invalid status"
        };
      } else {
        const updatedRows = loaded.items.map((item) => (
          validation.selectedIssueIds.includes(item.issue_id)
            ? markApprovalRequested(
              item,
              native.id.trim(),
              input.requested_by ?? "Paperclip.NativeApproval",
              requestedAt,
              native.status
            )
            : item
        ));
        const save = await saveBettingCycle({
          cycle_id: input.cycle_id,
          items: updatedRows,
          persistence: input.persistence,
          now: requestedAt
        });

        return approvalResult({
          cycle_id: input.cycle_id,
          selected_issue_ids: validation.selectedIssueIds,
          selected_surface: "approvals.native",
          native_approval_request_id: native.id.trim(),
          native_approval_status: native.status,
          approval_request_ref: nativeApprovalRequestRef(native.id.trim()),
          requested_at: requestedAt,
          fallback: { reason: null },
          updated_rows: updatedRows,
          cache_overlay: mergeCacheOverlayDiagnostics({
            load: loaded.cache_overlay,
            save: save.save,
            error: save.error,
            timestamp: requestedAt
          })
        });
      }
    } catch (error) {
      nativeFallback = {
        reason: "native_request_failed",
        native_error: sanitizeDiagnosticError(error)
      };
    }
  }

  const markdown = buildApprovalRequestMarkdown({
    cycle_id: input.cycle_id,
    issue_ids: validation.selectedIssueIds,
    reason: input.reason,
    requested_at: requestedAt,
    fallback: nativeFallback
  });

  if (typeof adapter?.addIssueComment === "function") {
    try {
      const comment = await adapter.addIssueComment(validation.selectedIssueIds[0], markdown);
      if (isNonEmptyString(comment?.comment_id)) {
        return approvalResult({
          cycle_id: input.cycle_id,
          selected_issue_ids: validation.selectedIssueIds,
          selected_surface: "comments.native",
          native_approval_request_id: null,
          native_approval_status: null,
          approval_request_ref: commentApprovalRequestRef(validation.selectedIssueIds[0], comment.comment_id.trim()),
          requested_at: requestedAt,
          fallback: nativeFallback,
          updated_rows: loaded.items,
          cache_overlay: notSavedCacheOverlay
        });
      }
      nativeFallback = {
        ...nativeFallback,
        comment_error: "addIssueComment returned missing comment_id"
      };
    } catch (error) {
      nativeFallback = {
        ...nativeFallback,
        reason: "comment_write_failed",
        comment_error: sanitizeDiagnosticError(error)
      };
    }
  } else {
    nativeFallback = {
      ...nativeFallback,
      comment_error: "comments.native:unavailable"
    };
  }

  return approvalResult({
    cycle_id: input.cycle_id,
    selected_issue_ids: validation.selectedIssueIds,
    selected_surface: "markdown-only",
    native_approval_request_id: null,
    native_approval_status: null,
    approval_request_ref: markdownApprovalRequestRef(input.cycle_id),
    requested_at: requestedAt,
    fallback: nativeFallback,
    updated_rows: loaded.items,
    cache_overlay: notSavedCacheOverlay
  });
}

export function markApprovalRequested(
  item: BettingTableItem,
  nativeApprovalRequestId: string,
  approvedBy: string,
  now = new Date().toISOString(),
  nativeApprovalStatus: NativeApprovalStatus = "PENDING"
): BettingTableItem {
  return {
    ...item,
    status: "APPROVAL_REQUESTED",
    native_approval_request_id: nativeApprovalRequestId,
    native_approval_status: nativeApprovalStatus,
    approved_by: approvedBy,
    updated_at: now
  };
}

export function markNativeApprovalDecided(
  item: BettingTableItem,
  status: "APPROVED" | "REJECTED",
  now = new Date().toISOString()
): BettingTableItem {
  return {
    ...item,
    status: status === "APPROVED" ? "APPROVED_FOR_CYCLE" : "REJECTED",
    native_approval_status: status,
    updated_at: now
  };
}
