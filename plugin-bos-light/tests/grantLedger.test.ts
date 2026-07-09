import { describe, expect, it } from "vitest";
import { InMemoryGrantLedger, createBudgetGrant, createAccessGrant } from "../src/grantLedger";
import type { GrantRequest, GrantApproved } from "../src/contracts";

const now = "2026-06-03T00:00:00.000Z";

describe("InMemoryGrantLedger", () => {
  function ledgerWithEntry() {
    const ledger = new InMemoryGrantLedger();
    ledger.add({
      grantId: "grant_1",
      missionId: "mission_1",
      targetDivision: "Div4.Production",
      grantType: "BUDGET_GRANT",
      tokenCap: 100000,
      ttlMinutes: 120,
      issuedAt: now,
      expiresAt: new Date(Date.now() + 120 * 60_000).toISOString(),
      revoked: false
    });
    return ledger;
  }

  it("adds and retrieves an entry", () => {
    const ledger = ledgerWithEntry();
    const entry = ledger.get("grant_1");

    expect(entry).toBeDefined();
    expect(entry?.grantId).toBe("grant_1");
    expect(entry?.missionId).toBe("mission_1");
  });

  it("returns undefined for unknown grant", () => {
    const ledger = new InMemoryGrantLedger();
    expect(ledger.get("unknown")).toBeUndefined();
  });

  it("retrieves entries by mission", () => {
    const ledger = ledgerWithEntry();
    ledger.add({
      grantId: "grant_2",
      missionId: "mission_1",
      targetDivision: "Div1.HCO",
      grantType: "ACCESS_GRANT",
      tokenCap: 50000,
      ttlMinutes: 60,
      issuedAt: now,
      expiresAt: new Date(Date.now() + 60 * 60_000).toISOString(),
      revoked: false
    });
    ledger.add({
      grantId: "grant_3",
      missionId: "mission_2",
      targetDivision: "Div3.Treasury",
      grantType: "BUDGET_GRANT",
      tokenCap: 200000,
      ttlMinutes: 240,
      issuedAt: now,
      expiresAt: new Date(Date.now() + 240 * 60_000).toISOString(),
      revoked: false
    });

    const mission1Grants = ledger.getByMission("mission_1");
    expect(mission1Grants).toHaveLength(2);
    expect(mission1Grants.map(g => g.grantId)).toEqual(["grant_1", "grant_2"]);
  });

  it("revokes an active grant", () => {
    const ledger = ledgerWithEntry();
    const result = ledger.revoke("grant_1", "budget exhausted");

    expect(result).toBe(true);
    const entry = ledger.get("grant_1");
    expect(entry?.revoked).toBe(true);
    expect(entry?.revokedReason).toBe("budget exhausted");
  });

  it("returns false when revoking already revoked grant", () => {
    const ledger = ledgerWithEntry();
    ledger.revoke("grant_1", "first revoke");
    expect(ledger.revoke("grant_1", "second revoke")).toBe(false);
  });

  it("returns false when revoking unknown grant", () => {
    const ledger = new InMemoryGrantLedger();
    expect(ledger.revoke("unknown", "reason")).toBe(false);
  });

  it("detects expired grants", () => {
    const ledger = new InMemoryGrantLedger();
    ledger.add({
      grantId: "grant_expired",
      missionId: "mission_1",
      targetDivision: "Div4.Production",
      grantType: "BUDGET_GRANT",
      tokenCap: 100000,
      ttlMinutes: 120,
      issuedAt: now,
      expiresAt: "2020-01-01T00:00:00.000Z", // past
      revoked: false
    });

    expect(ledger.isExpired("grant_expired")).toBe(true);
  });

  it("returns true for unknown grant on isExpired", () => {
    const ledger = new InMemoryGrantLedger();
    expect(ledger.isExpired("unknown")).toBe(true);
  });

  it("detects budget overrun", () => {
    const ledger = ledgerWithEntry();
    expect(ledger.checkOverrun("grant_1", 150000)).toBe(true); // cap is 100000
    expect(ledger.checkOverrun("grant_1", 50000)).toBe(false);
  });

  it("returns true for unknown grant on checkOverrun", () => {
    const ledger = new InMemoryGrantLedger();
    expect(ledger.checkOverrun("unknown", 0)).toBe(true);
  });

  it("clears all entries", () => {
    const ledger = ledgerWithEntry();
    ledger.clear();
    expect(ledger.get("grant_1")).toBeUndefined();
  });
});

describe("createBudgetGrant", () => {
  const request: GrantRequest = {
    schema_version: "1.0",
    requested_by: "Div1.HCO",
    target_division: "Div4.Production",
    mission_id: "mission_1",
    purpose: "Implement feature",
    requested_tools: ["repo_read", "repo_write"],
    requested_secrets: ["GITHUB_TOKEN"],
    estimated_cost: 50000,
    risk_level: "LOW",
    ttl_minutes: 120,
    requested_at: now
  };

  const decision: GrantApproved = {
    schema_version: "1.0",
    decision_id: "gdec_1",
    status: "approved",
    budget_grant_id: "bgrant_1",
    allowed_tools: ["repo_read", "repo_write"],
    denied_tools: [],
    token_cap: 50000,
    ttl_minutes: 120,
    rationale: "Approved",
    decided_by: "Div3.Treasury",
    decided_at: now
  };

  it("creates budget grant with correct fields", () => {
    const grant = createBudgetGrant(request, decision);

    expect(grant.schema_version).toBe("1.0");
    expect(grant.grant_id).toBe("bgrant_1");
    expect(grant.grant_type).toBe("BUDGET_GRANT");
    expect(grant.mission_id).toBe("mission_1");
    expect(grant.target_division).toBe("Div4.Production");
    expect(grant.allowed_tools).toEqual(["repo_read", "repo_write"]);
    expect(grant.denied_tools).toEqual([]);
    expect(grant.token_cap).toBe(50000);
    expect(grant.ttl_minutes).toBe(120);
    expect(grant.secrets).toEqual(["GITHUB_TOKEN"]);
    expect(grant.requires_qa).toBe(true);
    expect(grant.granted_by).toBe("Div3.Treasury");
  });
});

describe("createAccessGrant", () => {
  const request: GrantRequest = {
    schema_version: "1.0",
    requested_by: "Div1.HCO",
    target_division: "Div6.External",
    mission_id: "mission_1",
    purpose: "External API access",
    requested_tools: ["web_search", "external_api"],
    requested_secrets: ["API_KEY"],
    estimated_cost: 10000,
    risk_level: "LOW",
    ttl_minutes: 60,
    requested_at: now
  };

  const decision: GrantApproved = {
    schema_version: "1.0",
    decision_id: "gdec_2",
    status: "approved",
    budget_grant_id: "bgrant_2",
    allowed_tools: ["web_search", "external_api"],
    denied_tools: [],
    token_cap: 10000,
    ttl_minutes: 60,
    rationale: "Approved",
    decided_by: "Div3.Treasury",
    decided_at: now
  };

  it("creates access grant with correct fields", () => {
    const grant = createAccessGrant(request, decision);

    expect(grant.schema_version).toBe("1.0");
    expect(grant.grant_type).toBe("ACCESS_GRANT");
    expect(grant.mission_id).toBe("mission_1");
    expect(grant.target_division).toBe("Div6.External");
    expect(grant.allowed_tools).toEqual(["web_search", "external_api"]);
    expect(grant.secrets).toEqual(["API_KEY"]);
    expect(grant.adapter_scope).toBe("Div6.External");
    expect(grant.granted_by).toBe("Div3.Treasury");
  });

  it("generates unique grant IDs", () => {
    const grant1 = createAccessGrant(request, decision);
    const grant2 = createAccessGrant(request, decision);

    expect(grant1.grant_id).not.toBe(grant2.grant_id);
  });
});
