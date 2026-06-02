/**
 * Integration tests for division-specific tool access boundaries.
 *
 * These tests exercise the wrapped dist/worker.js tools with multiple
 * divisions to verify cross-division allow/deny behavior end-to-end.
 * Unlike the unit tests in distWorkerTools.test.ts which test individual
 * tool happy paths and grant wrapper mechanics in isolation, these tests
 * create dedicated validators per division and systematically verify
 * every division's allowed and denied tool access against the registered
 * worker tools.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  activate,
  AgentActionValidator,
  InMemoryGrantLedger,
  createValidatedToolWrapper,
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
