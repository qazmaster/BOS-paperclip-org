import { describe, it, expect, beforeEach } from "vitest";
import { validateGrantRequest } from "../src/grantPolicy";
import { InMemoryGrantLedger, createBudgetGrant, createAccessGrant } from "../src/grantLedger";
import type { GrantRequest, Division, DecisionRiskTier } from "../src/contracts";

function makeRequest(overrides: Partial<GrantRequest> = {}): GrantRequest {
  return {
    schema_version: "1.0",
    requested_by: "Div1.HCO",
    target_division: "Div4.Production",
    mission_id: "mission_001",
    purpose: "Build feature X",
    requested_tools: ["repo_read", "repo_write", "test_runner"],
    requested_secrets: ["github_token"],
    estimated_cost: 50_000,
    risk_level: "LOW",
    ttl_minutes: 120,
    requested_at: new Date().toISOString(),
    ...overrides,
  };
}

describe("Grant Policy - deterministic validation", () => {
  it("approves routine low-risk request within limits", () => {
    const request = makeRequest();
    const decision = validateGrantRequest(request);

    expect(decision.status).toBe("approved");
    if (decision.status !== "approved") throw new Error("Expected approved");
    expect(decision.allowed_tools).toContain("repo_read");
    expect(decision.allowed_tools).toContain("repo_write");
    expect(decision.token_cap).toBe(50_000);
  });

  it("denies external tools to Div4", () => {
    const request = makeRequest({
      requested_tools: ["repo_read", "web_search"],
    });
    const decision = validateGrantRequest(request);

    expect(decision.status).toBe("denied");
    if (decision.status !== "denied") throw new Error("Expected denied");
    expect(decision.required_route).toContain("Div6.External");
  });

  it("denies external tools to Div2", () => {
    const request = makeRequest({
      target_division: "Div2.MasterPlanner",
      requested_tools: ["planning", "external_api"],
    });
    const decision = validateGrantRequest(request);

    expect(decision.status).toBe("denied");
  });

  it("denies external tools to Div7", () => {
    const request = makeRequest({
      target_division: "Div7.MissionControl",
      requested_tools: ["decision", "web_search"],
    });
    const decision = validateGrantRequest(request);

    expect(decision.status).toBe("denied");
  });

  it("allows external tools for Div6", () => {
    const request = makeRequest({
      target_division: "Div6.External",
      requested_tools: ["web_search", "external_api", "git_gateway"],
      estimated_cost: 50_000,
    });
    const decision = validateGrantRequest(request);

    expect(decision.status).toBe("approved");
    if (decision.status !== "approved") throw new Error("Expected approved");
    expect(decision.allowed_tools).toContain("web_search");
    expect(decision.allowed_tools).toContain("external_api");
  });

  it("denies TTL exceeding maximum", () => {
    const request = makeRequest({
      ttl_minutes: 600, // exceeds 480 max
    });
    const decision = validateGrantRequest(request);

    expect(decision.status).toBe("denied");
  });

  it("escalates cost exceeding human approval limit", () => {
    const request = makeRequest({
      estimated_cost: 600_000,
    });
    const decision = validateGrantRequest(request);

    expect(decision.status).toBe("escalate");
    if (decision.status !== "escalate") throw new Error("Expected escalate");
    expect(decision.escalation_target).toBe("HumanOwner");
  });

  it("escalates cost exceeding auto-approve limit", () => {
    const request = makeRequest({
      estimated_cost: 200_000,
    });
    const decision = validateGrantRequest(request);

    expect(decision.status).toBe("escalate");
    if (decision.status !== "escalate") throw new Error("Expected escalate");
    expect(decision.escalation_target).toBe("Div1.HCO");
  });

  it("escalates critical risk", () => {
    const request = makeRequest({
      risk_level: "CRITICAL",
    });
    const decision = validateGrantRequest(request);

    expect(decision.status).toBe("escalate");
    if (decision.status !== "escalate") throw new Error("Expected escalate");
    expect(decision.escalation_target).toBe("Div7.MissionControl");
  });

  it("escalates high risk with significant cost", () => {
    const request = makeRequest({
      risk_level: "HIGH",
      estimated_cost: 80_000,
    });
    const decision = validateGrantRequest(request);

    expect(decision.status).toBe("escalate");
  });

  it("approves medium risk within limits", () => {
    const request = makeRequest({
      risk_level: "MEDIUM",
      estimated_cost: 50_000,
    });
    const decision = validateGrantRequest(request);

    expect(decision.status).toBe("approved");
  });

  it("denies forbidden tools for Div4", () => {
    const request = makeRequest({
      requested_tools: ["repo_read", "production"],
    });
    const decision = validateGrantRequest(request);

    expect(decision.status).toBe("denied");
  });
});

describe("Grant Ledger", () => {
  let ledger: InMemoryGrantLedger;

  beforeEach(() => {
    ledger = new InMemoryGrantLedger();
  });

  it("add and get entry", () => {
    ledger.add({
      grantId: "grant_001",
      missionId: "mission_001",
      targetDivision: "Div4.Production",
      grantType: "BUDGET_GRANT",
      tokenCap: 250_000,
      ttlMinutes: 180,
      issuedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 180 * 60_000).toISOString(),
      revoked: false,
    });

    const entry = ledger.get("grant_001");
    expect(entry).toBeDefined();
    expect(entry!.missionId).toBe("mission_001");
  });

  it("getByMission returns matching entries", () => {
    ledger.add({
      grantId: "grant_001",
      missionId: "mission_001",
      targetDivision: "Div4.Production",
      grantType: "BUDGET_GRANT",
      tokenCap: 250_000,
      ttlMinutes: 180,
      issuedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 180 * 60_000).toISOString(),
      revoked: false,
    });

    ledger.add({
      grantId: "grant_002",
      missionId: "mission_001",
      targetDivision: "Div5.QualificationsLibraryLearning",
      grantType: "ACCESS_GRANT",
      tokenCap: 50_000,
      ttlMinutes: 60,
      issuedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 60 * 60_000).toISOString(),
      revoked: false,
    });

    ledger.add({
      grantId: "grant_003",
      missionId: "mission_002",
      targetDivision: "Div4.Production",
      grantType: "BUDGET_GRANT",
      tokenCap: 100_000,
      ttlMinutes: 120,
      issuedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 120 * 60_000).toISOString(),
      revoked: false,
    });

    const entries = ledger.getByMission("mission_001");
    expect(entries).toHaveLength(2);
  });

  it("revoke marks entry as revoked", () => {
    ledger.add({
      grantId: "grant_001",
      missionId: "mission_001",
      targetDivision: "Div4.Production",
      grantType: "BUDGET_GRANT",
      tokenCap: 250_000,
      ttlMinutes: 180,
      issuedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 180 * 60_000).toISOString(),
      revoked: false,
    });

    const result = ledger.revoke("grant_001", "Policy violation");
    expect(result).toBe(true);

    const entry = ledger.get("grant_001");
    expect(entry!.revoked).toBe(true);
    expect(entry!.revokedReason).toBe("Policy violation");
  });

  it("checkOverrun detects overruns", () => {
    ledger.add({
      grantId: "grant_001",
      missionId: "mission_001",
      targetDivision: "Div4.Production",
      grantType: "BUDGET_GRANT",
      tokenCap: 250_000,
      ttlMinutes: 180,
      issuedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 180 * 60_000).toISOString(),
      revoked: false,
    });

    expect(ledger.checkOverrun("grant_001", 200_000)).toBe(false);
    expect(ledger.checkOverrun("grant_001", 300_000)).toBe(true);
  });
});

describe("BudgetGrant and AccessGrant creation", () => {
  it("createBudgetGrant produces valid grant", () => {
    const request = makeRequest();
    const decision = validateGrantRequest(request);
    if (decision.status !== "approved") throw new Error("Expected approved");

    const grant = createBudgetGrant(request, decision);

    expect(grant.schema_version).toBe("1.0");
    expect(grant.grant_type).toBe("BUDGET_GRANT");
    expect(grant.mission_id).toBe("mission_001");
    expect(grant.target_division).toBe("Div4.Production");
    expect(grant.token_cap).toBe(50_000);
    expect(grant.granted_by).toBe("Div3.Treasury");
    expect(grant.requires_qa).toBe(true);
  });

  it("createAccessGrant produces valid grant", () => {
    const request = makeRequest();
    const decision = validateGrantRequest(request);
    if (decision.status !== "approved") throw new Error("Expected approved");

    const grant = createAccessGrant(request, decision);

    expect(grant.grant_type).toBe("ACCESS_GRANT");
    expect(grant.target_division).toBe("Div4.Production");
    expect(grant.adapter_scope).toBe("Div4.Production");
    expect(grant.granted_by).toBe("Div3.Treasury");
  });
});

describe("Full grant flow: Div1 request → Div3 validate → grant issued → ledger tracked", () => {
  it("routine production grant", () => {
    const ledger = new InMemoryGrantLedger();

    // Div1 requests
    const request = makeRequest({
      requested_tools: ["repo_read", "repo_write", "test_runner"],
      estimated_cost: 50_000,
    });

    // Div3 validates
    const decision = validateGrantRequest(request);
    expect(decision.status).toBe("approved");
    if (decision.status !== "approved") throw new Error("Expected approved");

    // Create grants
    const budgetGrant = createBudgetGrant(request, decision);
    const accessGrant = createAccessGrant(request, decision);

    // Track in ledger
    ledger.add({
      grantId: budgetGrant.grant_id,
      missionId: budgetGrant.mission_id,
      targetDivision: budgetGrant.target_division,
      grantType: "BUDGET_GRANT",
      tokenCap: budgetGrant.token_cap,
      ttlMinutes: budgetGrant.ttl_minutes,
      issuedAt: budgetGrant.granted_at,
      expiresAt: budgetGrant.expires_at,
      revoked: false,
    });

    // Verify
    const entries = ledger.getByMission("mission_001");
    expect(entries).toHaveLength(1);
    expect(entries[0].tokenCap).toBe(50_000);
    expect(entries[0].revoked).toBe(false);
  });

  it("denied external access for Div4 with reroute", () => {
    const request = makeRequest({
      requested_tools: ["repo_read", "web_search"],
    });

    const decision = validateGrantRequest(request);
    expect(decision.status).toBe("denied");
    if (decision.status !== "denied") throw new Error("Expected denied");
    expect(decision.required_route).toContain("Div6.External");
    expect(decision.reason).toContain("Div6.External");
  });
});
