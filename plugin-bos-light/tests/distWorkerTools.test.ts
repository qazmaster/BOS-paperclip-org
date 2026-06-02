/**
 * Unit tests for all 6 dist/worker.js plugin tools.
 *
 * Tests happy-path and missing-param error paths for:
 *   bos-bpi-score, bos-blueprint-gen, bos-eval-gate,
 *   bos-circuit-breaker, bos-decide, bos-route-packet
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { activate } from "../dist/worker.js";

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
      register: vi.fn(async (name: string, handler: (params: Record<string, unknown>) => Promise<unknown>) => {
        tools.push({ name, handler });
      }),
    },
    _tools: tools, // expose for test access
  };
}

function getHandler(ctx: ReturnType<typeof createMockCtx>, name: string) {
  const entry = ctx._tools.find((t) => t.name === name);
  if (!entry) throw new Error(`Tool ${name} not registered`);
  return entry.handler;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("dist/worker.js plugin tools", () => {
  let ctx: ReturnType<typeof createMockCtx>;
  let handler: (name: string) => RegisteredTool["handler"];

  beforeEach(async () => {
    ctx = createMockCtx();
    await activate(ctx as any);
    handler = (name: string) => getHandler(ctx, name);
  });

  // =========================================================================
  // bos-bpi-score
  // =========================================================================
  describe("bos-bpi-score", () => {
    it("returns bpi_score with default dimensions", async () => {
      const result = await handler("bos-bpi-score")({ mission_id: "m1" }) as any;
      expect(result.error).toBeUndefined();
      expect(result.mission_id).toBe("m1");
      expect(result.bpi_score).toBeCloseTo(6.5, 1); // weighted avg of defaults
      expect(result.dimensions).toEqual({
        strategic_alignment: 7,
        execution_confidence: 6,
        resource_efficiency: 7,
        risk_mitigation: 6,
      });
      expect(["green", "amber", "red"]).toContain(result.classification);
      expect(result.computed_at).toBeDefined();
    });

    it("returns bpi_score with custom dimensions", async () => {
      const result = await handler("bos-bpi-score")({
        mission_id: "m2",
        dimensions: { strategic_alignment: 9, execution_confidence: 8, resource_efficiency: 9, risk_mitigation: 8 },
      }) as any;
      expect(result.error).toBeUndefined();
      // 9*0.3 + 8*0.3 + 9*0.2 + 8*0.2 = 2.7+2.4+1.8+1.6 = 8.5
      expect(result.bpi_score).toBeCloseTo(8.5, 1);
      expect(result.classification).toBe("green");
    });

    it("classifies amber correctly (6-7.99)", async () => {
      const result = await handler("bos-bpi-score")({
        mission_id: "m3",
        dimensions: { strategic_alignment: 7, execution_confidence: 6, resource_efficiency: 6, risk_mitigation: 6 },
      }) as any;
      expect(result.classification).toBe("amber");
    });

    it("classifies red correctly (<6)", async () => {
      const result = await handler("bos-bpi-score")({
        mission_id: "m4",
        dimensions: { strategic_alignment: 3, execution_confidence: 4, resource_efficiency: 3, risk_mitigation: 4 },
      }) as any;
      expect(result.classification).toBe("red");
    });

    it("returns error when mission_id is missing", async () => {
      const result = await handler("bos-bpi-score")({}) as any;
      expect(result.error).toBe("mission_id required");
    });

    it("returns error when called with null params", async () => {
      const result = await handler("bos-bpi-score")(null as any) as any;
      expect(result.error).toBe("mission_id required");
    });
  });

  // =========================================================================
  // bos-blueprint-gen
  // =========================================================================
  describe("bos-blueprint-gen", () => {
    it("returns blueprint markdown with defaults", async () => {
      const result = await handler("bos-blueprint-gen")({ mission_id: "m1", title: "Test Blueprint" }) as any;
      expect(result.error).toBeUndefined();
      expect(result.mission_id).toBe("m1");
      expect(result.title).toBe("Test Blueprint");
      expect(result.blueprint).toContain("# Blueprint: Test Blueprint");
      expect(result.blueprint).toContain("## Mission ID: m1");
      expect(result.divisions).toEqual(["Div1.HCO", "Div2.MasterPlanner", "Div3.Treasury", "Div4.Production", "Div7.MissionControl"]);
    });

    it("returns blueprint with custom divisions", async () => {
      const result = await handler("bos-blueprint-gen")({
        mission_id: "m2",
        title: "Custom Divs",
        divisions: ["Div1.HCO", "Div4.Production"],
      }) as any;
      expect(result.error).toBeUndefined();
      expect(result.divisions).toEqual(["Div1.HCO", "Div4.Production"]);
    });

    it("returns error when mission_id is missing", async () => {
      const result = await handler("bos-blueprint-gen")({ title: "No Mission" }) as any;
      expect(result.error).toBe("mission_id and title required");
    });

    it("returns error when title is missing", async () => {
      const result = await handler("bos-blueprint-gen")({ mission_id: "m1" }) as any;
      expect(result.error).toBe("mission_id and title required");
    });

    it("returns error when both required params missing", async () => {
      const result = await handler("bos-blueprint-gen")({}) as any;
      expect(result.error).toBe("mission_id and title required");
    });
  });

  // =========================================================================
  // bos-eval-gate
  // =========================================================================
  describe("bos-eval-gate", () => {
    it("returns pass verdict when evidence is provided", async () => {
      const result = await handler("bos-eval-gate")({
        gate_id: "Q3",
        target_id: "m1",
        evidence: "Alignment confirmed",
      }) as any;
      expect(result.error).toBeUndefined();
      expect(result.gate_id).toBe("Q3");
      expect(result.gate_name).toBe("Strategic Alignment");
      expect(result.target_id).toBe("m1");
      expect(result.verdict).toBe("pass");
      expect(result.evidence).toBe("Alignment confirmed");
      expect(result.evaluated_at).toBeDefined();
    });

    it("returns needs-evidence verdict when evidence is missing", async () => {
      const result = await handler("bos-eval-gate")({ gate_id: "Q4", target_id: "m1" }) as any;
      expect(result.verdict).toBe("needs-evidence");
      expect(result.evidence).toBeNull();
    });

    it("maps all known gate_ids to gate_name", async () => {
      const expected: Record<string, string> = {
        Q3: "Strategic Alignment",
        Q4: "Resource Readiness",
        Q5: "Technical Feasibility",
        Q6: "Risk Assessment",
        Q7: "Stakeholder Buy-in",
        Q8: "Market Timing",
        MV01: "Milestone Validation 1",
        MV02: "Milestone Validation 2",
        MV03: "Milestone Validation 3",
        MV04: "Milestone Validation 4",
      };
      for (const [gateId, gateName] of Object.entries(expected)) {
        const result = await handler("bos-eval-gate")({ gate_id: gateId, target_id: "t1" }) as any;
        expect(result.gate_name).toBe(gateName);
      }
    });

    it("falls back to gate_id as gate_name for unknown gates", async () => {
      const result = await handler("bos-eval-gate")({ gate_id: "UNKNOWN_GATE", target_id: "t1" }) as any;
      expect(result.gate_name).toBe("UNKNOWN_GATE");
    });

    it("returns error when gate_id is missing", async () => {
      const result = await handler("bos-eval-gate")({ target_id: "t1" }) as any;
      expect(result.error).toBe("gate_id and target_id required");
    });

    it("returns error when target_id is missing", async () => {
      const result = await handler("bos-eval-gate")({ gate_id: "Q3" }) as any;
      expect(result.error).toBe("gate_id and target_id required");
    });

    it("returns error when both required params missing", async () => {
      const result = await handler("bos-eval-gate")({}) as any;
      expect(result.error).toBe("gate_id and target_id required");
    });
  });

  // =========================================================================
  // bos-circuit-breaker
  // =========================================================================
  describe("bos-circuit-breaker", () => {
    it("check action returns closed state", async () => {
      const result = await handler("bos-circuit-breaker")({ action: "check", breaker_id: "b1" }) as any;
      expect(result.error).toBeUndefined();
      expect(result.breaker_id).toBe("b1");
      expect(result.state).toBe("closed");
      expect(result.failures).toBe(0);
      expect(result.action).toBe("check");
    });

    it("record action returns open state with failure_reason", async () => {
      const result = await handler("bos-circuit-breaker")({
        action: "record",
        breaker_id: "b2",
        failure_reason: "timeout",
      }) as any;
      expect(result.error).toBeUndefined();
      expect(result.state).toBe("open");
      expect(result.failure_reason).toBe("timeout");
      expect(result.action).toBe("record");
      expect(result.recorded_at).toBeDefined();
    });

    it("record action defaults failure_reason to unknown", async () => {
      const result = await handler("bos-circuit-breaker")({ action: "record", breaker_id: "b3" }) as any;
      expect(result.failure_reason).toBe("unknown");
    });

    it("reset action returns closed state", async () => {
      const result = await handler("bos-circuit-breaker")({ action: "reset", breaker_id: "b4" }) as any;
      expect(result.error).toBeUndefined();
      expect(result.state).toBe("closed");
      expect(result.failures).toBe(0);
      expect(result.action).toBe("reset");
      expect(result.reset_at).toBeDefined();
    });

    it("returns error for unknown action", async () => {
      const result = await handler("bos-circuit-breaker")({ action: "fly", breaker_id: "b5" }) as any;
      expect(result.error).toBe("Unknown action: fly");
    });

    it("returns error when action is missing", async () => {
      const result = await handler("bos-circuit-breaker")({ breaker_id: "b1" }) as any;
      expect(result.error).toBe("action and breaker_id required");
    });

    it("returns error when breaker_id is missing", async () => {
      const result = await handler("bos-circuit-breaker")({ action: "check" }) as any;
      expect(result.error).toBe("action and breaker_id required");
    });

    it("returns error when both required params missing", async () => {
      const result = await handler("bos-circuit-breaker")({}) as any;
      expect(result.error).toBe("action and breaker_id required");
    });
  });

  // =========================================================================
  // bos-decide
  // =========================================================================
  describe("bos-decide", () => {
    it("returns decision with defaults", async () => {
      const result = await handler("bos-decide")({ mission_id: "m1" }) as any;
      expect(result.error).toBeUndefined();
      expect(result.mission_id).toBe("m1");
      expect(result.decision).toBe("proceed");
      expect(result.rationale).toBe("Default decision");
      expect(result.decided_at).toBeDefined();
    });

    it("returns decision with custom type and rationale", async () => {
      const result = await handler("bos-decide")({
        mission_id: "m2",
        decision_type: "halt",
        rationale: "Risk too high",
      }) as any;
      expect(result.decision).toBe("halt");
      expect(result.rationale).toBe("Risk too high");
    });

    it("returns error when mission_id is missing", async () => {
      const result = await handler("bos-decide")({}) as any;
      expect(result.error).toBe("mission_id required");
    });

    it("returns error when called with null params", async () => {
      const result = await handler("bos-decide")(null as any) as any;
      expect(result.error).toBe("mission_id required");
    });
  });

  // =========================================================================
  // bos-route-packet
  // =========================================================================
  describe("bos-route-packet", () => {
    it("routes intake to Div7.MissionControl", async () => {
      const result = await handler("bos-route-packet")({ mission_id: "m1", packet_type: "intake" }) as any;
      expect(result.routed_to).toBe("Div7.MissionControl");
      expect(result.packet_type).toBe("intake");
      expect(result.mission_id).toBe("m1");
      expect(result.payload).toEqual({});
      expect(result.routed_at).toBeDefined();
    });

    it("routes planning to Div2.MasterPlanner", async () => {
      const result = await handler("bos-route-packet")({ mission_id: "m1", packet_type: "planning" }) as any;
      expect(result.routed_to).toBe("Div2.MasterPlanner");
    });

    it("routes execution to Div4.Production", async () => {
      const result = await handler("bos-route-packet")({ mission_id: "m1", packet_type: "execution" }) as any;
      expect(result.routed_to).toBe("Div4.Production");
    });

    it("routes review to Div1.HCO", async () => {
      const result = await handler("bos-route-packet")({ mission_id: "m1", packet_type: "review" }) as any;
      expect(result.routed_to).toBe("Div1.HCO");
    });

    it("routes external to Div6.External", async () => {
      const result = await handler("bos-route-packet")({ mission_id: "m1", packet_type: "external" }) as any;
      expect(result.routed_to).toBe("Div6.External");
    });

    it("defaults unknown packet_type to Div7.MissionControl", async () => {
      const result = await handler("bos-route-packet")({ mission_id: "m1", packet_type: "unknown_type" }) as any;
      expect(result.routed_to).toBe("Div7.MissionControl");
    });

    it("includes payload when provided", async () => {
      const result = await handler("bos-route-packet")({
        mission_id: "m1",
        packet_type: "intake",
        payload: { key: "value" },
      }) as any;
      expect(result.payload).toEqual({ key: "value" });
    });

    it("returns error when mission_id is missing", async () => {
      const result = await handler("bos-route-packet")({ packet_type: "intake" }) as any;
      expect(result.error).toBe("mission_id and packet_type required");
    });

    it("returns error when packet_type is missing", async () => {
      const result = await handler("bos-route-packet")({ mission_id: "m1" }) as any;
      expect(result.error).toBe("mission_id and packet_type required");
    });

    it("returns error when both required params missing", async () => {
      const result = await handler("bos-route-packet")({}) as any;
      expect(result.error).toBe("mission_id and packet_type required");
    });
  });

  // =========================================================================
  // Registration
  // =========================================================================
  describe("registration", () => {
    it("registers all 6 tools", () => {
      expect(ctx.tools.register).toHaveBeenCalledTimes(6);
      const names = ctx._tools.map((t) => t.name);
      expect(names).toContain("bos-bpi-score");
      expect(names).toContain("bos-blueprint-gen");
      expect(names).toContain("bos-eval-gate");
      expect(names).toContain("bos-circuit-breaker");
      expect(names).toContain("bos-decide");
      expect(names).toContain("bos-route-packet");
    });
  });
});
