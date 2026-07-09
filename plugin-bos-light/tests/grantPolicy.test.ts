import { describe, expect, it } from "vitest";
import { validateGrantRequest } from "../src/grantPolicy";
import type { GrantRequest } from "../src/contracts";

const now = "2026-06-03T00:00:00.000Z";

function baseRequest(overrides: Partial<GrantRequest> = {}): GrantRequest {
  return {
    schema_version: "1.0",
    requested_by: "Div1.HCO",
    target_division: "Div4.Production",
    mission_id: "mission_1",
    purpose: "Implement feature X",
    requested_tools: ["repo_read", "repo_write"],
    requested_secrets: [],
    estimated_cost: 50000,
    risk_level: "LOW",
    ttl_minutes: 120,
    requested_at: now,
    ...overrides
  };
}

describe("validateGrantRequest", () => {
  it("auto-approves low-risk request within limits", () => {
    const decision = validateGrantRequest(baseRequest());

    expect(decision.status).toBe("approved");
    expect(decision.decided_by).toBe("Div3.Treasury");
    if (decision.status === "approved") {
      expect(decision.allowed_tools).toContain("repo_read");
      expect(decision.allowed_tools).toContain("repo_write");
      expect(decision.token_cap).toBe(50000);
      expect(decision.ttl_minutes).toBe(120);
    }
  });

  it("denies external tools for non-Div6 division", () => {
    const decision = validateGrantRequest(baseRequest({
      target_division: "Div4.Production",
      requested_tools: ["repo_read", "web_search"]
    }));

    expect(decision.status).toBe("denied");
    if (decision.status === "denied") {
      expect(decision.reason).toContain("external-world access");
      expect(decision.required_route).toContain("Div6.External");
    }
  });

  it("allows external tools for Div6.External", () => {
    const decision = validateGrantRequest(baseRequest({
      target_division: "Div6.External",
      requested_tools: ["web_search", "external_api"]
    }));

    expect(decision.status).toBe("approved");
  });

  it("denies TTL exceeding maximum", () => {
    const decision = validateGrantRequest(baseRequest({
      ttl_minutes: 1000 // exceeds 480 max
    }));

    expect(decision.status).toBe("denied");
    if (decision.status === "denied") {
      expect(decision.reason).toContain("TTL");
      expect(decision.reason).toContain("exceeds maximum");
    }
  });

  it("escalates when cost exceeds human approval limit", () => {
    const decision = validateGrantRequest(baseRequest({
      estimated_cost: 600000 // exceeds 500000 human limit
    }));

    expect(decision.status).toBe("escalate");
    if (decision.status === "escalate") {
      expect(decision.escalation_target).toBe("HumanOwner");
    }
  });

  it("escalates when cost exceeds auto-approve limit", () => {
    const decision = validateGrantRequest(baseRequest({
      estimated_cost: 200000 // exceeds 100000 auto-approve
    }));

    expect(decision.status).toBe("escalate");
    if (decision.status === "escalate") {
      expect(decision.escalation_target).toBe("Div1.HCO");
    }
  });

  it("denies forbidden tools for division", () => {
    const decision = validateGrantRequest(baseRequest({
      target_division: "Div1.HCO",
      requested_tools: ["routing", "repo_write"] // repo_write is denied for Div1 but not external
    }));

    expect(decision.status).toBe("denied");
    if (decision.status === "denied") {
      expect(decision.reason).toContain("repo_write");
    }
  });

  it("escalates critical risk level", () => {
    const decision = validateGrantRequest(baseRequest({
      risk_level: "CRITICAL",
      estimated_cost: 1000
    }));

    expect(decision.status).toBe("escalate");
    if (decision.status === "escalate") {
      expect(decision.escalation_target).toBe("Div7.MissionControl");
      expect(decision.reason).toContain("Critical risk");
    }
  });

  it("escalates high risk with significant cost", () => {
    const decision = validateGrantRequest(baseRequest({
      risk_level: "HIGH",
      estimated_cost: 60000 // > 50% of auto-approve limit
    }));

    expect(decision.status).toBe("escalate");
    if (decision.status === "escalate") {
      expect(decision.escalation_target).toBe("Div1.HCO");
    }
  });

  it("filters denied tools from allowed list on approval", () => {
    const decision = validateGrantRequest(baseRequest({
      target_division: "Div4.Production",
      requested_tools: ["repo_read", "repo_write", "test_runner"]
    }));

    expect(decision.status).toBe("approved");
    if (decision.status === "approved") {
      // web_search and external_api are denied for Div4 but not requested
      expect(decision.allowed_tools).toEqual(["repo_read", "repo_write", "test_runner"]);
      expect(decision.denied_tools).toEqual([]);
    }
  });
});
