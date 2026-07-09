import { describe, expect, it } from "vitest";
import {
  buildBettingTable,
  saveBettingCycle,
  loadBettingCycle,
  buildAndSaveBettingCycle,
  markApprovalRequested,
  markNativeApprovalDecided
} from "../src/bettingTable";
import type { BettingTableItem } from "../src/contracts";

const now = "2026-06-03T00:00:00.000Z";

describe("buildBettingTable", () => {
  it("sorts candidates by bpi_score descending and takes top_n", () => {
    const items = buildBettingTable({
      cycle_id: "cycle_1",
      candidates: [
        { issue_id: "a", bpi_score: 0.5, blueprint_id: "bp_a" },
        { issue_id: "b", bpi_score: 0.9, blueprint_id: "bp_b" },
        { issue_id: "c", bpi_score: 0.7, blueprint_id: "bp_c" }
      ],
      top_n: 2,
      now
    });

    expect(items).toHaveLength(2);
    expect(items[0].issue_id).toBe("b");
    expect(items[1].issue_id).toBe("c");
  });

  it("filters out zero-score candidates", () => {
    const items = buildBettingTable({
      cycle_id: "cycle_1",
      candidates: [
        { issue_id: "a", bpi_score: 0, blueprint_id: "bp_a" },
        { issue_id: "b", bpi_score: 0.5, blueprint_id: "bp_b" }
      ],
      top_n: 10,
      now
    });

    expect(items).toHaveLength(1);
    expect(items[0].issue_id).toBe("b");
  });

  it("sets all items to CANDIDATE status", () => {
    const items = buildBettingTable({
      cycle_id: "cycle_1",
      candidates: [
        { issue_id: "a", bpi_score: 0.8, blueprint_id: "bp_a" }
      ],
      top_n: 10,
      now
    });

    expect(items[0].status).toBe("CANDIDATE");
    expect(items[0].native_approval_request_id).toBeNull();
    expect(items[0].native_approval_status).toBeNull();
    expect(items[0].approved_by).toBeNull();
  });

  it("preserves cycle_id and timestamps", () => {
    const items = buildBettingTable({
      cycle_id: "cycle_42",
      candidates: [
        { issue_id: "a", bpi_score: 0.8, blueprint_id: "bp_a" }
      ],
      top_n: 10,
      now
    });

    expect(items[0].cycle_id).toBe("cycle_42");
    expect(items[0].created_at).toBe(now);
    expect(items[0].updated_at).toBe(now);
    expect(items[0].schema_version).toBe("1.0");
  });

  it("enforces minimum top_n of 1", () => {
    const items = buildBettingTable({
      cycle_id: "cycle_1",
      candidates: [
        { issue_id: "a", bpi_score: 0.8, blueprint_id: "bp_a" },
        { issue_id: "b", bpi_score: 0.9, blueprint_id: "bp_b" }
      ],
      top_n: 0,
      now
    });

    expect(items).toHaveLength(1);
    expect(items[0].issue_id).toBe("b");
  });
});

describe("saveBettingCycle", () => {
  it("returns missing persistence when no persistence provided", async () => {
    const result = await saveBettingCycle({
      cycle_id: "cycle_1",
      items: [],
      persistence: undefined,
      now
    });

    expect(result.persistence).toBe("missing");
    expect(result.save).toBe("not_attempted");
    expect(result.durability).toBe("cache-overlay-only");
  });

  it("returns saved when persistence succeeds", async () => {
    const saved: BettingTableItem[][] = [];
    const result = await saveBettingCycle({
      cycle_id: "cycle_1",
      items: [],
      persistence: {
        saveBettingTable: async (_cycleId, items) => { saved.push(items); }
      },
      now
    });

    expect(result.persistence).toBe("provided");
    expect(result.save).toBe("saved");
  });

  it("returns failed when persistence throws", async () => {
    const result = await saveBettingCycle({
      cycle_id: "cycle_1",
      items: [],
      persistence: {
        saveBettingTable: async () => { throw new Error("disk full"); }
      },
      now
    });

    expect(result.persistence).toBe("provided");
    expect(result.save).toBe("failed");
    expect(result.error).toContain("disk full");
  });
});

describe("loadBettingCycle", () => {
  it("returns empty items when no persistence", async () => {
    const result = await loadBettingCycle({
      cycle_id: "cycle_1",
      persistence: undefined,
      now
    });

    expect(result.items).toHaveLength(0);
    expect(result.selected_issue_ids).toHaveLength(0);
    expect(result.cache_overlay.persistence).toBe("missing");
  });

  it("returns loaded items from persistence", async () => {
    const items: BettingTableItem[] = [{
      schema_version: "1.0",
      cycle_id: "cycle_1",
      issue_id: "a",
      bpi_score: 0.8,
      blueprint_id: "bp_a",
      status: "CANDIDATE",
      native_approval_request_id: null,
      native_approval_status: null,
      approved_by: null,
      created_at: now,
      updated_at: now
    }];

    const result = await loadBettingCycle({
      cycle_id: "cycle_1",
      persistence: {
        getBettingTable: async () => items
      },
      now
    });

    expect(result.items).toHaveLength(1);
    expect(result.cache_overlay.load).toBe("loaded");
  });

  it("returns missing load status when persistence returns empty", async () => {
    const result = await loadBettingCycle({
      cycle_id: "cycle_1",
      persistence: {
        getBettingTable: async () => []
      },
      now
    });

    expect(result.items).toHaveLength(0);
    expect(result.cache_overlay.load).toBe("missing");
  });
});

describe("markApprovalRequested", () => {
  const baseItem: BettingTableItem = {
    schema_version: "1.0",
    cycle_id: "cycle_1",
    issue_id: "issue_1",
    bpi_score: 0.8,
    blueprint_id: "bp_1",
    status: "CANDIDATE",
    native_approval_request_id: null,
    native_approval_status: null,
    approved_by: null,
    created_at: now,
    updated_at: now
  };

  it("transitions to APPROVAL_REQUESTED with native approval info", () => {
    const result = markApprovalRequested(baseItem, "approval_123", "Div3.Treasury", now, "PENDING");

    expect(result.status).toBe("APPROVAL_REQUESTED");
    expect(result.native_approval_request_id).toBe("approval_123");
    expect(result.native_approval_status).toBe("PENDING");
    expect(result.approved_by).toBe("Div3.Treasury");
    expect(result.updated_at).toBe(now);
  });

  it("preserves other fields", () => {
    const result = markApprovalRequested(baseItem, "approval_123", "Div3.Treasury", now);

    expect(result.cycle_id).toBe("cycle_1");
    expect(result.issue_id).toBe("issue_1");
    expect(result.bpi_score).toBe(0.8);
    expect(result.created_at).toBe(now);
  });
});

describe("markNativeApprovalDecided", () => {
  const baseItem: BettingTableItem = {
    schema_version: "1.0",
    cycle_id: "cycle_1",
    issue_id: "issue_1",
    bpi_score: 0.8,
    blueprint_id: "bp_1",
    status: "APPROVAL_REQUESTED",
    native_approval_request_id: "approval_123",
    native_approval_status: "PENDING",
    approved_by: "Div3.Treasury",
    created_at: now,
    updated_at: now
  };

  it("transitions to APPROVED_FOR_CYCLE when approved", () => {
    const result = markNativeApprovalDecided(baseItem, "APPROVED", now);

    expect(result.status).toBe("APPROVED_FOR_CYCLE");
    expect(result.native_approval_status).toBe("APPROVED");
    expect(result.updated_at).toBe(now);
  });

  it("transitions to REJECTED when rejected", () => {
    const result = markNativeApprovalDecided(baseItem, "REJECTED", now);

    expect(result.status).toBe("REJECTED");
    expect(result.native_approval_status).toBe("REJECTED");
  });
});
