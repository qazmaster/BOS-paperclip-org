import type { BettingTableItem } from "./contracts";
import type { BOSPersistence } from "./paperclipAdapter";

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

export function markApprovalRequested(
  item: BettingTableItem,
  nativeApprovalRequestId: string,
  approvedBy: string,
  now = new Date().toISOString()
): BettingTableItem {
  return {
    ...item,
    status: "APPROVAL_REQUESTED",
    native_approval_request_id: nativeApprovalRequestId,
    native_approval_status: "PENDING",
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
