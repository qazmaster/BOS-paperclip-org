/**
 * Integration tests for division-specific tool access boundaries and
 * agent-to-hook issue routing flow.
 *
 * These tests exercise:
 * 1. The wrapped dist/worker.js tools with multiple divisions to verify
 *    cross-division allow/deny behavior end-to-end.
 * 2. The full issue routing flow via IssueLifecycleHookManager:
 *    issue.created event -> MissionRouter -> division inbox packet delivery.
 * 3. Two-pass routing through Div7 executive decision for strategic/chaotic issues.
 * 4. Edge cases: unknown event types, empty titles, graceful fallbacks.
 *
 * Unlike the unit tests in distWorkerTools.test.ts which test individual
 * tool happy paths and grant wrapper mechanics in isolation, these tests
 * create dedicated validators per division and systematically verify
 * every division's allowed and denied tool access against the registered
 * worker tools, plus end-to-end routing integration.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  activate,
  AgentActionValidator,
  InMemoryGrantLedger,
  createValidatedToolWrapper,
  createBosLightHookManager,
  IssueLifecycleHookManager,
  getRoutingDecisionLog,
  clearRoutingDecisionLog,
  getRoutingPacketSummary,
  getPacketsForIssue,
  deriveMissionSignalsFromText,
  inferDivisionsFromText,
  requiresExecutiveDecision,
} from "../dist/worker.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface RegisteredTool {
  name: string;
  handler: (params: Record<string, unknown>) => Promise<unknown>;
}

function createMockCtx() {
  const tools: RegisteredTool[] = [];
  return {
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    tools: {
      register: vi.fn(
        async (
          name: string,
          handler: (params: Record<string, unknown>) => Promise<unknown>
        ) => {
          tools.push({ name, handler });
        }
      ),
    },
    _tools: tools,
  };
}

type Division =
  | "Div1.HCO"
  | "Div2.MasterPlanner"
  | "Div3.Treasury"
  | "Div4.Production"
  | "Div5.QualificationsLibraryLearning"
  | "Div6.External"
  | "Div7.MissionControl";

/** Create a validator + wrapper for a specific division/mission and return a
 *  helper that invokes any registered worker tool through the wrapper. */
function createDivisionToolCaller(division: Division, missionId = "integration-test") {
  const validator = new AgentActionValidator();
  const wrap = createValidatedToolWrapper(validator, division, missionId);

  /** Wrap a worker handler through the grant policy and invoke it. */
  function callTool(
    toolName: string,
    handler: (params: Record<string, unknown>) => Promise<unknown>,
    params: Record<string, unknown> = {}
  ) {
    const wrapped = wrap(toolName, handler);
    return wrapped(params);
  }

  return { validator, callTool };
}

// ---------------------------------------------------------------------------
// Test fixture: minimal valid params for each worker tool
// ---------------------------------------------------------------------------

const TOOL_PARAMS: Record<string, Record<string, unknown>> = {
  "bos-bpi-score": { mission_id: "m1" },
  "bos-blueprint-gen": { mission_id: "m1", title: "Test" },
  "bos-eval-gate": { gate_id: "Q3", target_id: "m1" },
  "bos-circuit-breaker": { action: "check", breaker_id: "b1" },
  "bos-decide": { mission_id: "m1" },
  "bos-route-packet": { mission_id: "m1", packet_type: "intake" },
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Division-specific tool access integration tests", () => {
  let ctx: ReturnType<typeof createMockCtx>;
  let toolHandlers: Map<string, RegisteredTool["handler"]>;

  beforeEach(async () => {
    ctx = createMockCtx();
    await activate(ctx as any);
    toolHandlers = new Map(ctx._tools.map((t) => [t.name, t.handler]));
  });

  function getHandler(toolName: string) {
    const h = toolHandlers.get(toolName);
    if (!h) throw new Error(`Tool ${toolName} not registered`);
    return h;
  }

  // =========================================================================
  // Div4.Production
  // =========================================================================
  describe("Div4.Production", () => {
    it("is allowed bos-bpi-score (tool not in denied list)", async () => {
      const { callTool } = createDivisionToolCaller("Div4.Production");
      const result = (await callTool(
        "bos-bpi-score",
        getHandler("bos-bpi-score"),
        TOOL_PARAMS["bos-bpi-score"]
      )) as any;
      expect(result.error).toBeUndefined();
      expect(result.mission_id).toBe("m1");
    });

    it("is allowed bos-route-packet (tool not in denied list)", async () => {
      const { callTool } = createDivisionToolCaller("Div4.Production");
      const result = (await callTool(
        "bos-route-packet",
        getHandler("bos-route-packet"),
        TOOL_PARAMS["bos-route-packet"]
      )) as any;
      expect(result.error).toBeUndefined();
      expect(result.routed_to).toBeDefined();
    });

    it("is allowed bos-decide (tool not in denied list)", async () => {
      const { callTool } = createDivisionToolCaller("Div4.Production");
      const result = (await callTool(
        "bos-decide",
        getHandler("bos-decide"),
        TOOL_PARAMS["bos-decide"]
      )) as any;
      expect(result.error).toBeUndefined();
      expect(result.decision).toBe("proceed");
    });

    it("is denied web_search (external-world access)", async () => {
      const { validator, callTool } = createDivisionToolCaller("Div4.Production");
      // Simulate external tool by wrapping a hypothetical web_search handler
      const result = (await callTool("web_search", async () => ({ results: [] }), {
        query: "test",
      })) as any;
      expect(result.error).toBe("grant_denied");
      expect(result.division).toBe("Div4.Production");
      expect(result.reason).toContain("external-world access");
      expect(result.denialId).toMatch(/^den_/);

      // Verify denial log entry
      const denials = validator.getDenialsForDivision("Div4.Production");
      expect(denials).toHaveLength(1);
      expect(denials[0].toolName).toBe("web_search");
    });

    it("is denied external_api (external-world access)", async () => {
      const { callTool } = createDivisionToolCaller("Div4.Production");
      const result = (await callTool("external_api", async () => ({}), {})) as any;
      expect(result.error).toBe("grant_denied");
      expect(result.reason).toContain("external-world access");
    });
  });

  // =========================================================================
  // Div6.External
  // =========================================================================
  describe("Div6.External", () => {
    it("is allowed web_search (external division)", async () => {
      const { callTool } = createDivisionToolCaller("Div6.External");
      const result = (await callTool("web_search", async () => ({ found: true }), {
        query: "test",
      })) as any;
      expect(result.error).toBeUndefined();
      expect(result.found).toBe(true);
    });

    it("is allowed external_api (external division)", async () => {
      const { callTool } = createDivisionToolCaller("Div6.External");
      const result = (await callTool(
        "external_api",
        async () => ({ data: "ok" }),
        {}
      )) as any;
      expect(result.error).toBeUndefined();
      expect(result.data).toBe("ok");
    });

    it("is allowed repo_write (Div6 has empty denied list)", async () => {
      const { validator, callTool } = createDivisionToolCaller("Div6.External");
      const result = (await callTool("repo_write", async () => ({ written: true }), {})) as any;
      // Div6.External has an empty deniedToolsByDivision list, so repo_write
      // is allowed (no explicit deny, no external-world access check failure)
      expect(result.error).toBeUndefined();
      expect(result.written).toBe(true);
      expect(validator.getDenialsForDivision("Div6.External")).toHaveLength(0);
    });

    it("is allowed BOS tools (not in denied list, no external check)", async () => {
      const { callTool } = createDivisionToolCaller("Div6.External");
      const result = (await callTool(
        "bos-eval-gate",
        getHandler("bos-eval-gate"),
        TOOL_PARAMS["bos-eval-gate"]
      )) as any;
      // BOS tools are not denied for Div6; validator should pass through
      expect(result.error).toBeUndefined();
      expect(result.gate_id).toBe("Q3");
    });
  });

  // =========================================================================
  // Div3.Treasury
  // =========================================================================
  describe("Div3.Treasury", () => {
    it("is allowed budget_snapshot (in allowed list)", async () => {
      const { callTool } = createDivisionToolCaller("Div3.Treasury");
      // budget_snapshot is in allowed list but not a registered worker tool;
      // verify the wrapper allows it by testing the validator directly
      const validator = new AgentActionValidator();
      const result = validator.validate({
        division: "Div3.Treasury",
        missionId: "integration-test",
        toolName: "budget_snapshot",
      });
      expect(result.allowed).toBe(true);
      expect(result.decision?.status).toBe("approved");
    });

    it("is denied repo_write (in denied list)", async () => {
      const { callTool } = createDivisionToolCaller("Div3.Treasury");
      const result = (await callTool("repo_write", async () => ({}), {})) as any;
      expect(result.error).toBe("grant_denied");
      expect(result.division).toBe("Div3.Treasury");
      expect(result.reason).toContain("denied tools");
    });

    it("is denied web_search (external-world access)", async () => {
      const { validator, callTool } = createDivisionToolCaller("Div3.Treasury");
      const result = (await callTool("web_search", async () => ({}), {})) as any;
      expect(result.error).toBe("grant_denied");
      expect(result.reason).toContain("external-world access");

      const denials = validator.getDenialsForDivision("Div3.Treasury");
      expect(denials).toHaveLength(1);
      expect(denials[0].toolName).toBe("web_search");
    });

    it("is denied external_api (external-world access)", async () => {
      const { callTool } = createDivisionToolCaller("Div3.Treasury");
      const result = (await callTool("external_api", async () => ({}), {})) as any;
      expect(result.error).toBe("grant_denied");
      expect(result.reason).toContain("external-world access");
    });

    it("is allowed bos-bpi-score (not in denied list)", async () => {
      const { callTool } = createDivisionToolCaller("Div3.Treasury");
      const result = (await callTool(
        "bos-bpi-score",
        getHandler("bos-bpi-score"),
        TOOL_PARAMS["bos-bpi-score"]
      )) as any;
      expect(result.error).toBeUndefined();
      expect(result.mission_id).toBe("m1");
    });
  });

  // =========================================================================
  // Div7.MissionControl
  // =========================================================================
  describe("Div7.MissionControl", () => {
    it("is allowed bos-decide (decision in allowed list)", async () => {
      const { callTool } = createDivisionToolCaller("Div7.MissionControl");
      const result = (await callTool(
        "bos-decide",
        getHandler("bos-decide"),
        TOOL_PARAMS["bos-decide"]
      )) as any;
      expect(result.error).toBeUndefined();
      expect(result.decision).toBe("proceed");
    });

    it("is denied repo_write (in denied list)", async () => {
      const { callTool } = createDivisionToolCaller("Div7.MissionControl");
      const result = (await callTool("repo_write", async () => ({}), {})) as any;
      expect(result.error).toBe("grant_denied");
      expect(result.division).toBe("Div7.MissionControl");
      expect(result.reason).toContain("denied tools");
    });

    it("is denied external_api (in denied list)", async () => {
      const { validator, callTool } = createDivisionToolCaller("Div7.MissionControl");
      const result = (await callTool("external_api", async () => ({}), {})) as any;
      expect(result.error).toBe("grant_denied");
      expect(result.reason).toContain("external-world access");

      const denials = validator.getDenialsForDivision("Div7.MissionControl");
      expect(denials).toHaveLength(1);
      expect(denials[0].toolName).toBe("external_api");
    });

    it("is allowed bos-route-packet (packet_emission in allowed list)", async () => {
      const { callTool } = createDivisionToolCaller("Div7.MissionControl");
      const result = (await callTool(
        "bos-route-packet",
        getHandler("bos-route-packet"),
        TOOL_PARAMS["bos-route-packet"]
      )) as any;
      expect(result.error).toBeUndefined();
      expect(result.routed_to).toBeDefined();
    });
  });

  // =========================================================================
  // Div1.HCO
  // =========================================================================
  describe("Div1.HCO", () => {
    it("is allowed routing (in allowed list)", async () => {
      const validator = new AgentActionValidator();
      const result = validator.validate({
        division: "Div1.HCO",
        missionId: "integration-test",
        toolName: "routing",
      });
      expect(result.allowed).toBe(true);
      expect(result.decision?.status).toBe("approved");
    });

    it("is denied repo_write (in denied list)", async () => {
      const { callTool } = createDivisionToolCaller("Div1.HCO");
      const result = (await callTool("repo_write", async () => ({}), {})) as any;
      expect(result.error).toBe("grant_denied");
      expect(result.division).toBe("Div1.HCO");
      expect(result.reason).toContain("denied tools");
    });

    it("is denied external_api (in denied list)", async () => {
      const { callTool } = createDivisionToolCaller("Div1.HCO");
      const result = (await callTool("external_api", async () => ({}), {})) as any;
      expect(result.error).toBe("grant_denied");
      expect(result.reason).toContain("external-world access");
    });

    it("is allowed bos-eval-gate (not in denied list)", async () => {
      const { callTool } = createDivisionToolCaller("Div1.HCO");
      const result = (await callTool(
        "bos-eval-gate",
        getHandler("bos-eval-gate"),
        TOOL_PARAMS["bos-eval-gate"]
      )) as any;
      expect(result.error).toBeUndefined();
      expect(result.gate_id).toBe("Q3");
    });
  });

  // =========================================================================
  // Div2.MasterPlanner
  // =========================================================================
  describe("Div2.MasterPlanner", () => {
    it("is allowed planning (in allowed list)", async () => {
      const validator = new AgentActionValidator();
      const result = validator.validate({
        division: "Div2.MasterPlanner",
        missionId: "integration-test",
        toolName: "planning",
      });
      expect(result.allowed).toBe(true);
      expect(result.decision?.status).toBe("approved");
    });

    it("is denied repo_write (in denied list)", async () => {
      const { callTool } = createDivisionToolCaller("Div2.MasterPlanner");
      const result = (await callTool("repo_write", async () => ({}), {})) as any;
      expect(result.error).toBe("grant_denied");
      expect(result.division).toBe("Div2.MasterPlanner");
      expect(result.reason).toContain("denied tools");
    });

    it("is denied external_api (in denied list)", async () => {
      const { callTool } = createDivisionToolCaller("Div2.MasterPlanner");
      const result = (await callTool("external_api", async () => ({}), {})) as any;
      expect(result.error).toBe("grant_denied");
      expect(result.reason).toContain("external-world access");
    });

    it("is denied web_search (external-world access)", async () => {
      const { validator, callTool } = createDivisionToolCaller("Div2.MasterPlanner");
      const result = (await callTool("web_search", async () => ({}), {})) as any;
      expect(result.error).toBe("grant_denied");
      expect(result.reason).toContain("external-world access");

      const denials = validator.getDenialsForDivision("Div2.MasterPlanner");
      expect(denials).toHaveLength(1);
      expect(denials[0].toolName).toBe("web_search");
    });

    it("is allowed bos-blueprint-gen (not in denied list)", async () => {
      const { callTool } = createDivisionToolCaller("Div2.MasterPlanner");
      const result = (await callTool(
        "bos-blueprint-gen",
        getHandler("bos-blueprint-gen"),
        TOOL_PARAMS["bos-blueprint-gen"]
      )) as any;
      expect(result.error).toBeUndefined();
      expect(result.blueprint).toContain("Blueprint");
    });
  });

  // =========================================================================
  // Div5.QualificationsLibraryLearning
  // =========================================================================
  describe("Div5.QualificationsLibraryLearning", () => {
    it("is allowed verification (in allowed list)", async () => {
      const validator = new AgentActionValidator();
      const result = validator.validate({
        division: "Div5.QualificationsLibraryLearning",
        missionId: "integration-test",
        toolName: "verification",
      });
      expect(result.allowed).toBe(true);
      expect(result.decision?.status).toBe("approved");
    });

    it("is denied repo_write (in denied list)", async () => {
      const { callTool } = createDivisionToolCaller("Div5.QualificationsLibraryLearning");
      const result = (await callTool("repo_write", async () => ({}), {})) as any;
      expect(result.error).toBe("grant_denied");
      expect(result.division).toBe("Div5.QualificationsLibraryLearning");
      expect(result.reason).toContain("denied tools");
    });

    it("is denied external_api (in denied list)", async () => {
      const { callTool } = createDivisionToolCaller("Div5.QualificationsLibraryLearning");
      const result = (await callTool("external_api", async () => ({}), {})) as any;
      expect(result.error).toBe("grant_denied");
      expect(result.reason).toContain("external-world access");
    });

    it("is denied web_search (external-world access)", async () => {
      const { validator, callTool } = createDivisionToolCaller("Div5.QualificationsLibraryLearning");
      const result = (await callTool("web_search", async () => ({}), {})) as any;
      expect(result.error).toBe("grant_denied");
      expect(result.reason).toContain("external-world access");

      const denials = validator.getDenialsForDivision("Div5.QualificationsLibraryLearning");
      expect(denials).toHaveLength(1);
      expect(denials[0].toolName).toBe("web_search");
    });

    it("is allowed bos-eval-gate (not in denied list)", async () => {
      const { callTool } = createDivisionToolCaller("Div5.QualificationsLibraryLearning");
      const result = (await callTool(
        "bos-eval-gate",
        getHandler("bos-eval-gate"),
        TOOL_PARAMS["bos-eval-gate"]
      )) as any;
      expect(result.error).toBeUndefined();
      expect(result.gate_id).toBe("Q3");
    });
  });

  // =========================================================================
  // Grant lifecycle: approved returns result, denied returns grant_denied
  // =========================================================================
  describe("grant lifecycle", () => {
    it("approved action returns tool result", async () => {
      const { callTool } = createDivisionToolCaller("Div4.Production");
      const result = (await callTool(
        "bos-bpi-score",
        getHandler("bos-bpi-score"),
        TOOL_PARAMS["bos-bpi-score"]
      )) as any;
      expect(result.error).toBeUndefined();
      expect(result.bpi_score).toBeDefined();
      expect(result.mission_id).toBe("m1");
    });

    it("denied action returns grant_denied with denialId", async () => {
      const { callTool } = createDivisionToolCaller("Div4.Production");
      const result = (await callTool("web_search", async () => ({}), {})) as any;
      expect(result.error).toBe("grant_denied");
      expect(result.denialId).toMatch(/^den_/);
      expect(result.tool).toBe("web_search");
      expect(result.division).toBe("Div4.Production");
      expect(result.decision).toBeDefined();
      expect(result.decision.status).toBe("denied");
    });
  });

  // =========================================================================
  // Denial log: accumulation and division filtering
  // =========================================================================
  describe("denial log accumulation and filtering", () => {
    it("accumulates denials across multiple denied calls", async () => {
      const validator = new AgentActionValidator();
      const wrap = createValidatedToolWrapper(validator, "Div4.Production", "log-test");

      // Multiple denied calls
      await wrap("web_search", async () => ({}))();
      await wrap("external_api", async () => ({}))();
      await wrap("web_search", async () => ({}))();

      const denials = validator.getDenialLog();
      expect(denials).toHaveLength(3);
      // All entries have correct division
      expect(denials.every((d) => d.division === "Div4.Production")).toBe(true);
    });

    it("filters denial log by division across multiple divisions", async () => {
      const validator = new AgentActionValidator();

      // Denials from Div4
      const wrap4 = createValidatedToolWrapper(validator, "Div4.Production", "multi-div");
      await wrap4("web_search", async () => ({}))();
      await wrap4("external_api", async () => ({}))();

      // Denials from Div2
      const wrap2 = createValidatedToolWrapper(validator, "Div2.MasterPlanner", "multi-div");
      await wrap2("web_search", async () => ({}))();
      await wrap2("external_api", async () => ({}))();
      await wrap2("repo_write", async () => ({}))();

      // Denial from Div7
      const wrap7 = createValidatedToolWrapper(validator, "Div7.MissionControl", "multi-div");
      await wrap7("repo_write", async () => ({}))();

      // Total denials
      expect(validator.getDenialLog()).toHaveLength(6);

      // Filter by division
      expect(validator.getDenialsForDivision("Div4.Production")).toHaveLength(2);
      expect(validator.getDenialsForDivision("Div2.MasterPlanner")).toHaveLength(3);
      expect(validator.getDenialsForDivision("Div7.MissionControl")).toHaveLength(1);
      expect(validator.getDenialsForDivision("Div6.External")).toHaveLength(0);
    });

    it("each denial log entry has correct audit fields", async () => {
      const validator = new AgentActionValidator();
      const wrap = createValidatedToolWrapper(
        validator,
        "Div3.Treasury",
        "audit-mission"
      );
      await wrap("repo_write", async () => ({}))();

      const denials = validator.getDenialLog();
      expect(denials).toHaveLength(1);

      const entry = denials[0];
      expect(entry.denialId).toMatch(/^den_/);
      expect(entry.timestamp).toBeDefined();
      expect(new Date(entry.timestamp).getTime()).not.toBeNaN();
      expect(entry.division).toBe("Div3.Treasury");
      expect(entry.toolName).toBe("repo_write");
      expect(entry.missionId).toBe("audit-mission");
      expect(entry.reason).toBeDefined();
      expect(entry.reason.length).toBeGreaterThan(0);
    });

    it("filters denial log by mission", async () => {
      const validator = new AgentActionValidator();

      const wrapA = createValidatedToolWrapper(validator, "Div4.Production", "mission-alpha");
      await wrapA("web_search", async () => ({}))();

      const wrapB = createValidatedToolWrapper(validator, "Div4.Production", "mission-beta");
      await wrapB("web_search", async () => ({}))();

      const wrapA2 = createValidatedToolWrapper(validator, "Div4.Production", "mission-alpha");
      await wrapA2("external_api", async () => ({}))();

      expect(validator.getDenialsForMission("mission-alpha")).toHaveLength(2);
      expect(validator.getDenialsForMission("mission-beta")).toHaveLength(1);
      expect(validator.getDenialsForMission("mission-gamma")).toHaveLength(0);
    });
  });

  // =========================================================================
  // Cross-division boundary matrix: all 7 divisions x critical tool pairs
  // =========================================================================
  describe("cross-division boundary matrix", () => {
    const boundaryCases: Array<{
      division: Division;
      tool: string;
      expectedAllowed: boolean;
      expectedDenialPattern?: string;
      description: string;
    }> = [
      // Div4.PProduction
      { division: "Div4.Production", tool: "repo_read", expectedAllowed: true, description: "Div4 allowed repo_read" },
      { division: "Div4.Production", tool: "repo_write", expectedAllowed: true, description: "Div4 allowed repo_write" },
      { division: "Div4.Production", tool: "web_search", expectedAllowed: false, expectedDenialPattern: "external-world access", description: "Div4 denied web_search" },
      { division: "Div4.Production", tool: "external_api", expectedAllowed: false, expectedDenialPattern: "external-world access", description: "Div4 denied external_api" },

      // Div6.External
      { division: "Div6.External", tool: "web_search", expectedAllowed: true, description: "Div6 allowed web_search" },
      { division: "Div6.External", tool: "external_api", expectedAllowed: true, description: "Div6 allowed external_api" },
      { division: "Div6.External", tool: "fetch", expectedAllowed: true, description: "Div6 allowed fetch" },
      { division: "Div6.External", tool: "repo_write", expectedAllowed: true, description: "Div6 allowed repo_write (empty denied list)" },

      // Div3.Treasury
      { division: "Div3.Treasury", tool: "budget_snapshot", expectedAllowed: true, description: "Div3 allowed budget_snapshot" },
      { division: "Div3.Treasury", tool: "repo_write", expectedAllowed: false, expectedDenialPattern: "denied tools", description: "Div3 denied repo_write" },
      { division: "Div3.Treasury", tool: "web_search", expectedAllowed: false, expectedDenialPattern: "external-world access", description: "Div3 denied web_search" },

      // Div7.MissionControl
      { division: "Div7.MissionControl", tool: "decision", expectedAllowed: true, description: "Div7 allowed decision" },
      { division: "Div7.MissionControl", tool: "repo_write", expectedAllowed: false, expectedDenialPattern: "denied tools", description: "Div7 denied repo_write" },
      { division: "Div7.MissionControl", tool: "external_api", expectedAllowed: false, expectedDenialPattern: "external-world access", description: "Div7 denied external_api" },

      // Div1.HCO
      { division: "Div1.HCO", tool: "routing", expectedAllowed: true, description: "Div1 allowed routing" },
      { division: "Div1.HCO", tool: "repo_write", expectedAllowed: false, expectedDenialPattern: "denied tools", description: "Div1 denied repo_write" },
      { division: "Div1.HCO", tool: "external_api", expectedAllowed: false, expectedDenialPattern: "external-world access", description: "Div1 denied external_api" },

      // Div2.MasterPlanner
      { division: "Div2.MasterPlanner", tool: "planning", expectedAllowed: true, description: "Div2 allowed planning" },
      { division: "Div2.MasterPlanner", tool: "repo_write", expectedAllowed: false, expectedDenialPattern: "denied tools", description: "Div2 denied repo_write" },
      { division: "Div2.MasterPlanner", tool: "external_api", expectedAllowed: false, expectedDenialPattern: "external-world access", description: "Div2 denied external_api" },
      { division: "Div2.MasterPlanner", tool: "web_search", expectedAllowed: false, expectedDenialPattern: "external-world access", description: "Div2 denied web_search" },

      // Div5.QualificationsLibraryLearning
      { division: "Div5.QualificationsLibraryLearning", tool: "verification", expectedAllowed: true, description: "Div5 allowed verification" },
      { division: "Div5.QualificationsLibraryLearning", tool: "repo_write", expectedAllowed: false, expectedDenialPattern: "denied tools", description: "Div5 denied repo_write" },
      { division: "Div5.QualificationsLibraryLearning", tool: "external_api", expectedAllowed: false, expectedDenialPattern: "external-world access", description: "Div5 denied external_api" },
      { division: "Div5.QualificationsLibraryLearning", tool: "web_search", expectedAllowed: false, expectedDenialPattern: "external-world access", description: "Div5 denied web_search" },
    ];

    for (const tc of boundaryCases) {
      it(`${tc.description}`, () => {
        const validator = new AgentActionValidator();
        const result = validator.validate({
          division: tc.division,
          missionId: "matrix-test",
          toolName: tc.tool,
        });

        expect(result.allowed).toBe(tc.expectedAllowed);

        if (tc.expectedAllowed) {
          expect(result.decision?.status).toBe("approved");
          expect(result.denialId).toBeUndefined();
        } else {
          expect(result.decision?.status).toBe("denied");
          expect(result.denialId).toMatch(/^den_/);
          if (tc.expectedDenialPattern) {
            expect(result.reason).toContain(tc.expectedDenialPattern);
          }
        }
      });
    }
  });
});

// =========================================================================
// Issue Routing Flow Integration Tests (T04)
// =========================================================================

describe("Issue routing flow integration", () => {
  let ctx: ReturnType<typeof createMockCtx>;
  let hookManager: InstanceType<typeof IssueLifecycleHookManager>;

  beforeEach(async () => {
    clearRoutingDecisionLog();
    ctx = createMockCtx();
    await activate(ctx as any);
    hookManager = (ctx as any)._hookManager;
  });

  // Helper to create issue.created events
  function createIssueEvent(
    issueId: string,
    title: string,
    description = "",
    identifier = issueId
  ) {
    return {
      eventType: "issue.created" as const,
      eventId: `evt_${issueId}`,
      occurredAt: new Date().toISOString(),
      payload: {
        issueId,
        identifier,
        title,
        description,
        status: "open",
      },
      actor: { type: "agent" as const, id: "test-agent" },
    };
  }

  // -----------------------------------------------------------------------
  // Full issue routing flow: event -> MissionRouter -> routing decision log
  // -----------------------------------------------------------------------
  describe("full issue routing flow", () => {
    it("routes an issue.created event through MissionRouter and records routing decision", async () => {
      const event = createIssueEvent(
        "issue-001",
        "Implement code feature for login page",
        "Build the OAuth2 login flow"
      );
      const logs = await hookManager.dispatchEvent(event);

      // MissionRouter handler should have fired
      const routerLog = logs.find(
        (l) => l.handlerName === "bos-light-mission-router"
      );
      expect(routerLog).toBeDefined();
      expect(routerLog!.result.handled).toBe(true);
      expect(routerLog!.result.message).toContain("MissionRouter routed");

      // Routing decision log should have an entry
      const decisionLog = getRoutingDecisionLog();
      expect(decisionLog).toHaveLength(1);
      expect(decisionLog[0].issueId).toBe("issue-001");
      expect(decisionLog[0].signals).toBeDefined();
      expect(decisionLog[0].signals.taskClass).toBe("technical");
      expect(decisionLog[0].signals.requiresImplementation).toBe(true);
    });

    it("delivers packets to expected divisions for a technical issue", async () => {
      const event = createIssueEvent(
        "issue-002",
        "Fix login bug and implement redirect",
        "The login redirect is broken"
      );
      await hookManager.dispatchEvent(event);

      const packets = getPacketsForIssue("issue-002");
      expect(packets.length).toBeGreaterThan(0);

      // Technical keywords route to Div4.Production
      const targetDivisions = packets.map((p) => p.toDivision);
      expect(targetDivisions).toContain("Div4.Production");
      expect(targetDivisions).not.toContain("Div1.HCO"); // excluded from operational
      expect(targetDivisions).not.toContain("Div7.MissionControl"); // excluded from operational
    });

    it("records packet delivery records in the routing decision log entry", async () => {
      const event = createIssueEvent(
        "issue-003",
        "Deploy new code feature to production"
      );
      await hookManager.dispatchEvent(event);

      const decisionLog = getRoutingDecisionLog();
      expect(decisionLog).toHaveLength(1);
      expect(decisionLog[0].packetDeliveries.length).toBeGreaterThan(0);

      const delivery = decisionLog[0].packetDeliveries[0];
      expect(delivery.packetId).toMatch(/^pkt_/);
      expect(delivery.packetType).toBe("work_assignment");
      expect(delivery.toDivision).toBeDefined();
      expect(delivery.fromDivision).toBe("Div1.HCO");
      expect(delivery.deliveredAt).toBeDefined();
    });

    it("logs both hook handlers invoked for issue.created event", async () => {
      const event = createIssueEvent(
        "issue-004",
        "Build a test feature"
      );
      const logs = await hookManager.dispatchEvent(event);

      // 2 handlers registered for issue.created:
      // bos-light-log-created + bos-light-mission-router
      const createdHandlers = logs.filter(
        (l) => l.eventType === "issue.created"
      );
      expect(createdHandlers).toHaveLength(2);
      const handlerNames = createdHandlers.map((l) => l.handlerName);
      expect(handlerNames).toContain("bos-light-log-created");
      expect(handlerNames).toContain("bos-light-mission-router");
    });
  });

  // -----------------------------------------------------------------------
  // Two-pass routing: Div7 executive decision for strategic/chaotic issues
  // -----------------------------------------------------------------------
  describe("two-pass routing through Div7 executive decision", () => {
    it("routes a critical incident through Div7 CHAOTIC domain with two-pass", async () => {
      const event = createIssueEvent(
        "issue-incident-001",
        "Production outage: database crash emergency",
        "The primary database is down"
      );
      await hookManager.dispatchEvent(event);

      const decisionLog = getRoutingDecisionLog();
      expect(decisionLog).toHaveLength(1);

      const entry = decisionLog[0];
      // Two-pass routing should be present
      expect(entry.twoPassRouting).toBeDefined();
      expect(entry.twoPassRouting!.decisionDelegated.cynefin_domain).toBe("CHAOTIC");
      expect(entry.twoPassRouting!.decisionDelegated.recommended_mode).toBe("act");

      // First pass activated divisions should include Div7
      expect(entry.routingResult.activated_divisions).toContain("Div7.MissionControl");

      // Operational routing result should have activated divisions
      const opResult = entry.twoPassRouting!.operationalRoutingResult;
      expect(opResult.status).toBe("ROUTED");
      expect(opResult.activated_divisions.length).toBeGreaterThan(0);
      // CHAOTIC domain routes to Div1.HCO, Div3.Treasury, Div5
      expect(opResult.activated_divisions).toContain("Div1.HCO");
      expect(opResult.activated_divisions).toContain("Div3.Treasury");
    });

    it("routes a strategy/policy issue through Div7 COMPLICATED domain", async () => {
      const event = createIssueEvent(
        "issue-strategy-001",
        "Policy strategy ambiguous experiment",
        "We need a strategic direction for this experiment"
      );
      await hookManager.dispatchEvent(event);

      const decisionLog = getRoutingDecisionLog();
      expect(decisionLog).toHaveLength(1);

      const entry = decisionLog[0];
      expect(entry.twoPassRouting).toBeDefined();
      expect(entry.twoPassRouting!.decisionDelegated.cynefin_domain).toBe("COMPLICATED");
      expect(entry.twoPassRouting!.decisionDelegated.recommended_mode).toBe("probe");

      // COMPLICATED domain routes to Div2.MasterPlanner, Div4.Production, Div5
      const opDivisions =
        entry.twoPassRouting!.operationalRoutingResult.activated_divisions;
      expect(opDivisions).toContain("Div2.MasterPlanner");
      expect(opDivisions).toContain("Div4.Production");
    });

    it("delivers operational packets for two-pass routed issues", async () => {
      const event = createIssueEvent(
        "issue-incident-002",
        "Emergency crash in production system"
      );
      await hookManager.dispatchEvent(event);

      const packets = getPacketsForIssue("issue-incident-002");
      expect(packets.length).toBeGreaterThan(0);

      // Two-pass should have both pre-decision and post-decision packets
      const decisionLog = getRoutingDecisionLog();
      const entry = decisionLog[0];
      expect(entry.packetDeliveries.length).toBeGreaterThan(0); // pre-decision
      expect(
        entry.twoPassRouting!.operationalPacketDeliveries.length
      ).toBeGreaterThan(0); // post-decision
    });

    it("getRoutingPacketSummary aggregates two-pass packets by division", async () => {
      // Route an incident (CHAOTIC two-pass)
      const event = createIssueEvent(
        "issue-incident-003",
        "Critical outage emergency crash"
      );
      await hookManager.dispatchEvent(event);

      const summary = getRoutingPacketSummary();
      // CHAOTIC operational routing delivers to Div1, Div3, Div5
      expect(summary.has("Div1.HCO")).toBe(true);
      expect(summary.has("Div3.Treasury")).toBe(true);
      expect(summary.has("Div5.QualificationsLibraryLearning")).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // Division inbox verification
  // -----------------------------------------------------------------------
  describe("division inbox packet delivery", () => {
    it("routes a code feature to Div4.Production with correct packet structure", async () => {
      const event = createIssueEvent(
        "issue-code-001",
        "Implement new code feature for dashboard",
        "Build the dashboard widget component"
      );
      await hookManager.dispatchEvent(event);

      const packets = getPacketsForIssue("issue-code-001");
      const div4Packets = packets.filter((p) => p.toDivision === "Div4.Production");
      expect(div4Packets).toHaveLength(1);
      expect(div4Packets[0].packetType).toBe("work_assignment");
      expect(div4Packets[0].fromDivision).toBe("Div1.HCO");
    });

    it("routes a test/QA issue to Div5.QualificationsLibraryLearning", async () => {
      const event = createIssueEvent(
        "issue-qa-001",
        "Security audit and quality review of auth module",
        "Run security tests on the authentication module"
      );
      await hookManager.dispatchEvent(event);

      const packets = getPacketsForIssue("issue-qa-001");
      const targetDivisions = packets.map((p) => p.toDivision);
      expect(targetDivisions).toContain("Div5.QualificationsLibraryLearning");
    });

    it("routes a budget/cost issue to Div3.Treasury", async () => {
      const event = createIssueEvent(
        "issue-budget-001",
        "Review budget allocation for Q3 grant"
      );
      await hookManager.dispatchEvent(event);

      const packets = getPacketsForIssue("issue-budget-001");
      const targetDivisions = packets.map((p) => p.toDivision);
      expect(targetDivisions).toContain("Div3.Treasury");
    });

    it("routes a planning issue to Div2.MasterPlanner", async () => {
      const event = createIssueEvent(
        "issue-plan-001",
        "Backlog prioritization and roadmap planning"
      );
      await hookManager.dispatchEvent(event);

      const packets = getPacketsForIssue("issue-plan-001");
      const targetDivisions = packets.map((p) => p.toDivision);
      expect(targetDivisions).toContain("Div2.MasterPlanner");
    });
  });

  // -----------------------------------------------------------------------
  // Edge cases
  // -----------------------------------------------------------------------
  describe("edge cases", () => {
    it("unknown event type dispatches with no routing decision logged", async () => {
      const event = {
        eventType: "issue.unknown_type" as any,
        eventId: "evt-unknown",
        occurredAt: new Date().toISOString(),
        payload: { issueId: "issue-unknown", title: "Test" },
        actor: { type: "agent" as const, id: "test-agent" },
      };
      const logs = await hookManager.dispatchEvent(event);

      // Should dispatch with (no handlers) result
      expect(logs).toHaveLength(1);
      expect(logs[0].result.handled).toBe(false);
      expect(logs[0].result.message).toContain("No handlers registered");

      // No routing decision logged
      expect(getRoutingDecisionLog()).toHaveLength(0);
    });

    it("empty title falls back gracefully and still produces a routing entry", async () => {
      const event = createIssueEvent("issue-empty", "", "");
      await hookManager.dispatchEvent(event);

      const decisionLog = getRoutingDecisionLog();
      expect(decisionLog).toHaveLength(1);
      // Empty text defaults taskClass to unknown
      expect(decisionLog[0].signals.taskClass).toBe("unknown");
      // Should still route to a default division (Div4.Production fallback)
      expect(decisionLog[0].routingResult.activated_divisions.length).toBeGreaterThan(0);
    });

    it("empty description with keyword in title still routes correctly", async () => {
      const event = createIssueEvent(
        "issue-title-only",
        "Fix production bug in payment module",
        ""
      );
      await hookManager.dispatchEvent(event);

      const decisionLog = getRoutingDecisionLog();
      expect(decisionLog[0].signals.taskClass).toBe("technical");
      const packets = getPacketsForIssue("issue-title-only");
      expect(packets.some((p) => p.toDivision === "Div4.Production")).toBe(true);
    });

    it("multiple dispatches accumulate in the routing decision log", async () => {
      await hookManager.dispatchEvent(
        createIssueEvent("issue-multi-1", "Fix code bug")
      );
      await hookManager.dispatchEvent(
        createIssueEvent("issue-multi-2", "Security audit review")
      );
      await hookManager.dispatchEvent(
        createIssueEvent("issue-multi-3", "Budget cost allocation")
      );

      const decisionLog = getRoutingDecisionLog();
      expect(decisionLog).toHaveLength(3);
      expect(decisionLog[0].issueId).toBe("issue-multi-1");
      expect(decisionLog[1].issueId).toBe("issue-multi-2");
      expect(decisionLog[2].issueId).toBe("issue-multi-3");
    });

    it("clearRoutingDecisionLog resets the log between test runs", async () => {
      await hookManager.dispatchEvent(
        createIssueEvent("issue-clear-1", "Build code feature")
      );
      expect(getRoutingDecisionLog()).toHaveLength(1);

      clearRoutingDecisionLog();
      expect(getRoutingDecisionLog()).toHaveLength(0);
    });

    it("hook manager invocation log tracks event dispatch with handler name, result, and duration", async () => {
      const event = createIssueEvent(
        "issue-invlog-001",
        "Implement code feature"
      );
      await hookManager.dispatchEvent(event);

      const invocationLog = hookManager.getInvocationLog();
      expect(invocationLog.length).toBeGreaterThanOrEqual(2);

      const routerInvocation = invocationLog.find(
        (l) => l.handlerName === "bos-light-mission-router"
      );
      expect(routerInvocation).toBeDefined();
      expect(routerInvocation!.eventType).toBe("issue.created");
      expect(routerInvocation!.result.handled).toBe(true);
      expect(routerInvocation!.result.durationMs).toBeGreaterThanOrEqual(0);
      expect(routerInvocation!.dispatchedAt).toBeDefined();
    });
  });

  // -----------------------------------------------------------------------
  // MissionSignals derivation integration
  // -----------------------------------------------------------------------
  describe("MissionSignals derivation through routing", () => {
    it("derives correct signals for a multi-keyword issue", async () => {
      const event = createIssueEvent(
        "issue-signals-001",
        "Implement and test code feature for external API integration",
        "Build code to integrate with external third-party webhook"
      );
      await hookManager.dispatchEvent(event);

      const decisionLog = getRoutingDecisionLog();
      const signals = decisionLog[0].signals;
      expect(signals.taskClass).toBe("technical");
      expect(signals.requiresImplementation).toBe(true);
      expect(signals.requiresExternalData).toBe(true);
    });

    it("flags incident signals for outage keywords", () => {
      const signals = deriveMissionSignalsFromText(
        "Production outage emergency crash down"
      );
      expect(signals.incidentSignals).toBe(true);
      expect(signals.taskClass).toBe("strategy");
      expect(signals.riskLevel).toBe("CRITICAL");
      expect(requiresExecutiveDecision(signals)).toBe(true);
    });

    it("infers Div4.Production for code/feature keywords", () => {
      const divisions = inferDivisionsFromText(
        "Implement code feature build deploy",
        "MEDIUM"
      );
      expect(divisions).toContain("Div4.Production");
      expect(divisions).toContain("Div1.HCO");
    });
  });
});
