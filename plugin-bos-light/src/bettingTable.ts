import type { BettingTableItem } from "./contracts";

export interface BuildBettingTableInput {
  cycle_id: string;
  candidates: Array<Pick<BettingTableItem, "issue_id" | "bpi_score" | "blueprint_id">>;
  top_n: number;
  now?: string;
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
