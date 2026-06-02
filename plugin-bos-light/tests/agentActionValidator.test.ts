import { describe, it, expect, beforeEach } from "vitest";
import { AgentActionValidator, createValidatedToolWrapper } from "../src/agentActionValidator";
import type { AgentActionRequest } from "../src/agentActionValidator";
import { InMemoryGrantLedger } from "../src/grantLedger";
import type { Division, GrantRequest } from "../src/contracts";

function makeActionRequest(overrides: Partial<AgentActionRequest> = {}): AgentActionRequest {
  return {
    division: "Div4.Production",
    missionId: "mission_001",
    toolName: "repo_read",
    requestedSecrets: [],
    estimatedCost: 10_000,
    riskLevel: "LOW",
    ttlMinutes: 120,
    purpose: "Read repository files",
    ...overrides,
  };
}

describe("AgentActionValidator - grant policy enforcement", () => {
  let validator: AgentActionValidator;
  let ledger: InMemoryGrantLedger;

  beforeEach(() => {
    ledger = new InMemoryGrantLedger();
    validator = new AgentActionValidator(ledger);
  });

  it("approves routine action for Div4 with allowed tool", () => {
    const result = validator.validate(makeActionRequest());

    expect(result.allowed).toBe(true);
    expect(result.decision?.status).toBe("approved");
    expect(result.grantId).toBeDefined();
    expect(result.denialId).toBeUndefined();
  });

  it("denies external tool access for Div4", () => {
    const result = validator.validate(
      makeActionRequest({
        toolName: "web_search",
      })
    );

    expect(result.allowed).toBe(false);
    expect(result.decision?.status).toBe("denied");
    expect(result.reason).toContain("Div6.External");
    expect(result.denialId).toBeDefined();
  });

  it("denies external_api for Div4", () => {
    const result = validator.validate(
      makeActionRequest({
        toolName: "external_api",
      })
    );

    expect(result.allowed).toBe(false);
    expect(result.decision?.status).toBe("denied");
    expect(result.reason).toContain("Div6.External");
  });

  it("allows external tools for Div6.External", () => {
    const result = validator.validate(
      makeActionRequest({
        division: "Div6.External",
        toolName: "web_search",
        estimatedCost: 50_000,
      })
    );

    expect(result.allowed).toBe(true);
    expect(result.decision?.status).toBe("approved");
  });

  it("denies forbidden tool for division", () => {
    const result = validator.validate(
      makeActionRequest({
        toolName: "production",
      })
    );

    expect(result.allowed).toBe(false);
    expect(result.decision?.status).toBe("denied");
    expect(result.reason).toContain("denied tools");
  });

  it("escalates cost exceeding human approval limit", () => {
    const result = validator.validate(
      makeActionRequest({
        estimatedCost: 600_000,
      })
    );

    expect(result.allowed).toBe(false);
    expect(result.decision?.status).toBe("escalate");
    expect(result.reason).toContain("escalation");
  });

  it("escalates cost exceeding auto-approve limit", () => {
    const result = validator.validate(
      makeActionRequest({
        estimatedCost: 200_000,
      })
    );

    expect(result.allowed).toBe(false);
    expect(result.decision?.status).toBe("escalate");
    expect(result.reason).toContain("Div1.HCO");
  });

  it("escalates critical risk level", () => {
    const result = validator.validate(
      makeActionRequest({
        riskLevel: "CRITICAL",
      })
    );

    expect(result.allowed).toBe(false);
    expect(result.decision?.status).toBe("escalate");
    expect(result.reason).toContain("Div7.MissionControl");
  });

  it("denies TTL exceeding maximum", () => {
    const result = validator.validate(
      makeActionRequest({
        ttlMinutes: 600,
      })
    );

    expect(result.allowed).toBe(false);
    expect(result.decision?.status).toBe("denied");
    expect(result.reason).toContain("TTL");
  });
});

describe("AgentActionValidator - denial logging", () => {
  let validator: AgentActionValidator;

  beforeEach(() => {
    validator = new AgentActionValidator();
  });

  it("logs denial when action is denied", () => {
    validator.validate(
      makeActionRequest({
        toolName: "web_search",
      })
    );

    const denials = validator.getDenialLog();
    expect(denials).toHaveLength(1);
    expect(denials[0].division).toBe("Div4.Production");
    expect(denials[0].toolName).toBe("web_search");
    expect(denials[0].missionId).toBe("mission_001");
    expect(denials[0].reason).toContain("Div6.External");
    expect(denials[0].denialId).toBeDefined();
  });

  it("logs escalation as denial", () => {
    validator.validate(
      makeActionRequest({
        estimatedCost: 600_000,
      })
    );

    const denials = validator.getDenialLog();
    expect(denials).toHaveLength(1);
    expect(denials[0].reason).toContain("Escalated");
  });

  it("does not log when action is approved", () => {
    validator.validate(makeActionRequest());

    const denials = validator.getDenialLog();
    expect(denials).toHaveLength(0);
  });

  it("filters denials by division", () => {
    validator.validate(makeActionRequest({ division: "Div4.Production", toolName: "web_search" }));
    validator.validate(makeActionRequest({ division: "Div2.MasterPlanner", toolName: "external_api" }));
    validator.validate(makeActionRequest({ division: "Div4.Production", toolName: "external_api_call" }));

    const div4Denials = validator.getDenialsForDivision("Div4.Production");
    const div2Denials = validator.getDenialsForDivision("Div2.MasterPlanner");

    expect(div4Denials).toHaveLength(2);
    expect(div2Denials).toHaveLength(1);
  });

  it("filters denials by mission", () => {
    validator.validate(makeActionRequest({ missionId: "mission_001", toolName: "web_search" }));
    validator.validate(makeActionRequest({ missionId: "mission_002", toolName: "web_search" }));
    validator.validate(makeActionRequest({ missionId: "mission_001", toolName: "external_api" }));

    const mission1Denials = validator.getDenialsForMission("mission_001");
    const mission2Denials = validator.getDenialsForMission("mission_002");

    expect(mission1Denials).toHaveLength(2);
    expect(mission2Denials).toHaveLength(1);
  });

  it("clears denial log", () => {
    validator.validate(makeActionRequest({ toolName: "web_search" }));
    expect(validator.getDenialLog()).toHaveLength(1);

    validator.clearDenialLog();
    expect(validator.getDenialLog()).toHaveLength(0);
  });
});

describe("AgentActionValidator - grant lifecycle", () => {
  let validator: AgentActionValidator;
  let ledger: InMemoryGrantLedger;

  beforeEach(() => {
    ledger = new InMemoryGrantLedger();
    validator = new AgentActionValidator(ledger);
  });

  it("validates grant decisions are stored for audit", () => {
    const result = validator.validate(makeActionRequest());
    expect(result.allowed).toBe(true);
    expect(result.decision).toBeDefined();
    expect(result.grantId).toBeDefined();
  });

  it("ledger can track grants and detect revocation", () => {
    // Simulate grant issuance and ledger tracking
    const grantId = "grant_test_001";
    ledger.add({
      grantId,
      missionId: "mission_001",
      targetDivision: "Div4.Production",
      grantType: "BUDGET_GRANT",
      tokenCap: 100_000,
      ttlMinutes: 120,
      issuedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 120 * 60_000).toISOString(),
      revoked: false,
    });

    expect(ledger.isExpired(grantId)).toBe(false);
    expect(ledger.checkOverrun(grantId, 50_000)).toBe(false);

    ledger.revoke(grantId, "Policy violation");
    const entry = ledger.get(grantId);
    expect(entry?.revoked).toBe(true);
    expect(entry?.revokedReason).toBe("Policy violation");
  });

  it("ledger detects expired grants", () => {
    const grantId = "grant_test_002";
    ledger.add({
      grantId,
      missionId: "mission_001",
      targetDivision: "Div4.Production",
      grantType: "BUDGET_GRANT",
      tokenCap: 100_000,
      ttlMinutes: 120,
      issuedAt: new Date(Date.now() - 200 * 60_000).toISOString(),
      expiresAt: new Date(Date.now() - 60 * 60_000).toISOString(),
      revoked: false,
    });

    expect(ledger.isExpired(grantId)).toBe(true);
  });

  it("ledger detects cost overrun", () => {
    const grantId = "grant_test_003";
    ledger.add({
      grantId,
      missionId: "mission_001",
      targetDivision: "Div4.Production",
      grantType: "BUDGET_GRANT",
      tokenCap: 5_000,
      ttlMinutes: 120,
      issuedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 120 * 60_000).toISOString(),
      revoked: false,
    });

    expect(ledger.checkOverrun(grantId, 10_000)).toBe(true);
    expect(ledger.checkOverrun(grantId, 3_000)).toBe(false);
  });
});

describe("createValidatedToolWrapper - wraps tool handlers", () => {
  let validator: AgentActionValidator;

  beforeEach(() => {
    validator = new AgentActionValidator();
  });

  it("executes handler when action is approved", () => {
    const wrapTool = createValidatedToolWrapper(validator, "Div4.Production", "mission_001");
    const mockHandler = (params: any) => ({ result: "success", params });
    const wrapped = wrapTool("repo_read", mockHandler);

    const result = wrapped({ file: "test.ts" });
    expect(result).toEqual({ result: "success", params: { file: "test.ts" } });
  });

  it("returns denial object when action is denied", () => {
    const wrapTool = createValidatedToolWrapper(validator, "Div4.Production", "mission_001");
    const mockHandler = (params: any) => ({ result: "success" });
    const wrapped = wrapTool("web_search", mockHandler);

    const result = wrapped({ query: "test" }) as any;
    expect(result.error).toBe("grant_denied");
    expect(result.tool).toBe("web_search");
    expect(result.division).toBe("Div4.Production");
    expect(result.reason).toContain("Div6.External");
    expect(result.denialId).toBeDefined();
  });

  it("denies forbidden tool for division", () => {
    const wrapTool = createValidatedToolWrapper(validator, "Div3.Treasury", "mission_001");
    const mockHandler = (params: any) => ({ result: "success" });
    const wrapped = wrapTool("repo_write", mockHandler);

    const result = wrapped({}) as any;
    expect(result.error).toBe("grant_denied");
    expect(result.reason).toContain("denied tools");
  });

  it("allows Div6 to use external tools", () => {
    const wrapTool = createValidatedToolWrapper(validator, "Div6.External", "mission_001");
    const mockHandler = (params: any) => ({ result: "fetched" });
    const wrapped = wrapTool("web_search", mockHandler);

    const result = wrapped({ url: "https://example.com" });
    expect(result).toEqual({ result: "fetched" });
  });
});

describe("Full flow: Div4 blocked from external, Div6 allowed", () => {
  it("demonstrates complete grant policy enforcement", () => {
    const validator = new AgentActionValidator();

    // Div4 tries to use web_search - should be denied
    const div4Result = validator.validate({
      division: "Div4.Production",
      missionId: "BOS-T2",
      toolName: "web_search",
      estimatedCost: 10_000,
    });
    expect(div4Result.allowed).toBe(false);
    expect(div4Result.decision?.status).toBe("denied");
    expect(div4Result.reason).toContain("Div6.External");

    // Div4 tries repo_read - should be approved
    const div4RepoResult = validator.validate({
      division: "Div4.Production",
      missionId: "BOS-T2",
      toolName: "repo_read",
      estimatedCost: 10_000,
    });
    expect(div4RepoResult.allowed).toBe(true);
    expect(div4RepoResult.decision?.status).toBe("approved");

    // Div6 uses web_search - should be approved
    const div6Result = validator.validate({
      division: "Div6.External",
      missionId: "BOS-T2",
      toolName: "web_search",
      estimatedCost: 10_000,
    });
    expect(div6Result.allowed).toBe(true);
    expect(div6Result.decision?.status).toBe("approved");

    // Verify denial log has only Div4 external denial
    const denials = validator.getDenialLog();
    expect(denials).toHaveLength(1);
    expect(denials[0].division).toBe("Div4.Production");
    expect(denials[0].toolName).toBe("web_search");
  });
});

describe("Worker tool wrapping with grant policy", () => {
  it("wraps tools via createValidatedToolWrapper", () => {
    const validator = new AgentActionValidator();
    const wrapTool = createValidatedToolWrapper(validator, "Div4.Production", "mission_001");

    // Simulate wrapping a tool
    const bpiHandler = (params: any) => ({ score: 85, params });
    const wrappedBpi = wrapTool("piko:bpi-score", bpiHandler);

    // Approved action executes
    const result = wrappedBpi({ issue_id: "ISSUE-001" });
    expect(result.score).toBe(85);

    // Denied action returns grant_denied
    const webSearchHandler = (params: any) => ({ results: [] });
    const wrappedWebSearch = wrapTool("web_search", webSearchHandler);
    const deniedResult = wrappedWebSearch({ query: "test" }) as any;
    expect(deniedResult.error).toBe("grant_denied");
  });
});
