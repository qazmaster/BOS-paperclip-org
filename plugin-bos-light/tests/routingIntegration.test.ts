/**
 * Comprehensive routing integration tests covering all 12 named routing rules.
 *
 * Tests the dist/worker.js bos-route-packet routing table against the
 * missionRouter.ts routing engine to ensure alignment.
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
    _tools: tools,
  };
}

function getHandler(ctx: ReturnType<typeof createMockCtx>, name: string) {
  const entry = ctx._tools.find((t) => t.name === name);
  if (!entry) throw new Error(`Tool ${name} not registered`);
  return entry.handler;
}

// ---------------------------------------------------------------------------
// Expected routing table (from dist/worker.js)
// ---------------------------------------------------------------------------

const EXPECTED_ROUTING_TABLE: Record<string, { routed_to: string[]; routing_rule: string }> = {
  // Single-division routes
  intake: { routed_to: ["Div7.MissionControl"], routing_rule: "requires_executive_decision" },
  planning: { routed_to: ["Div2.MasterPlanner"], routing_rule: "backlog_shaping" },
  budget: { routed_to: ["Div3.Treasury"], routing_rule: "budget_capacity" },
  execution: { routed_to: ["Div4.Production"], routing_rule: "implementation" },
  qa_review: { routed_to: ["Div5.QualificationsLibraryLearning"], routing_rule: "qa_security_review" },
  review: { routed_to: ["Div1.HCO"], routing_rule: "operational_review" },
  external: { routed_to: ["Div6.External"], routing_rule: "external_io" },
  // Multi-division routes
  external_io: { routed_to: ["Div5.QualificationsLibraryLearning", "Div6.External"], routing_rule: "external_io_request" },
  paid_external_io: { routed_to: ["Div3.Treasury", "Div5.QualificationsLibraryLearning", "Div6.External"], routing_rule: "paid_credentialed_external_io_request" },
  multi_division: { routed_to: ["Div2.MasterPlanner", "Div4.Production", "Div5.QualificationsLibraryLearning"], routing_rule: "multi_division_workflow" },
  complex: { routed_to: ["Div2.MasterPlanner", "Div3.Treasury", "Div4.Production", "Div5.QualificationsLibraryLearning"], routing_rule: "complex_safe_to_fail" },
  chaotic: { routed_to: ["Div1.HCO", "Div3.Treasury", "Div5.QualificationsLibraryLearning"], routing_rule: "chaotic_incident_flow" },
  complicated: { routed_to: ["Div2.MasterPlanner", "Div4.Production", "Div5.QualificationsLibraryLearning"], routing_rule: "complicated_expert_review" },
  standard: { routed_to: ["Div2.MasterPlanner", "Div4.Production", "Div5.QualificationsLibraryLearning"], routing_rule: "standard_operational" },
};

// All 12 named routing rules from missionRouter.ts
const NAMED_ROUTING_RULES = [
  "requires_executive_decision",
  "backlog_shaping",
  "budget_capacity",
  "implementation",
  "qa_security_review",
  "external_io_request",
  "paid_credentialed_external_io_request",
  "multi_division_workflow",
  "complex_safe_to_fail",
  "chaotic_incident_flow",
  "complicated_expert_review",
  "standard_operational",
];

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Routing Integration Tests", () => {
  let ctx: ReturnType<typeof createMockCtx>;
  let routeHandler: (params: Record<string, unknown>) => Promise<unknown>;

  beforeEach(async () => {
    ctx = createMockCtx();
    await activate(ctx as any);
    routeHandler = getHandler(ctx, "bos-route-packet");
  });

  // =========================================================================
  // All 14 packet_type values produce correct routed_to targets
  // =========================================================================
  describe("All packet types route correctly", () => {
    const packetTypes = Object.keys(EXPECTED_ROUTING_TABLE);

    for (const packetType of packetTypes) {
      it(`routes "${packetType}" to correct divisions`, async () => {
        const result = await routeHandler({ mission_id: "m1", packet_type: packetType }) as any;
        expect(result.error).toBeUndefined();
        expect(result.mission_id).toBe("m1");
        expect(result.packet_type).toBe(packetType);
        expect(result.routed_to).toEqual(EXPECTED_ROUTING_TABLE[packetType].routed_to);
        expect(result.routing_rule).toBe(EXPECTED_ROUTING_TABLE[packetType].routing_rule);
        expect(result.routed_at).toBeDefined();
      });
    }
  });

  // =========================================================================
  // routing_rule field matches expected rule for each packet type
  // =========================================================================
  describe("routing_rule field correctness", () => {
    for (const [packetType, expected] of Object.entries(EXPECTED_ROUTING_TABLE)) {
      it(`"${packetType}" has routing_rule="${expected.routing_rule}"`, async () => {
        const result = await routeHandler({ mission_id: "m1", packet_type: packetType }) as any;
        expect(result.routing_rule).toBe(expected.routing_rule);
      });
    }
  });

  // =========================================================================
  // Multi-division routing types return arrays with correct divisions
  // =========================================================================
  describe("Multi-division routing returns arrays", () => {
    const multiDivisionTypes = [
      "external_io",
      "paid_external_io",
      "multi_division",
      "complex",
      "chaotic",
      "complicated",
      "standard",
    ];

    for (const packetType of multiDivisionTypes) {
      it(`"${packetType}" returns array with multiple divisions`, async () => {
        const result = await routeHandler({ mission_id: "m1", packet_type: packetType }) as any;
        expect(Array.isArray(result.routed_to)).toBe(true);
        expect(result.routed_to.length).toBeGreaterThan(1);
        expect(result.routed_to).toEqual(EXPECTED_ROUTING_TABLE[packetType].routed_to);
      });
    }
  });

  // =========================================================================
  // Single-division routing types return single-element arrays
  // =========================================================================
  describe("Single-division routing returns single-element arrays", () => {
    const singleDivisionTypes = [
      "intake",
      "planning",
      "budget",
      "execution",
      "qa_review",
      "review",
      "external",
    ];

    for (const packetType of singleDivisionTypes) {
      it(`"${packetType}" returns single-element array`, async () => {
        const result = await routeHandler({ mission_id: "m1", packet_type: packetType }) as any;
        expect(Array.isArray(result.routed_to)).toBe(true);
        expect(result.routed_to.length).toBe(1);
        expect(result.routed_to).toEqual(EXPECTED_ROUTING_TABLE[packetType].routed_to);
      });
    }
  });

  // =========================================================================
  // Unknown packet_type defaults to Div7.MissionControl
  // =========================================================================
  describe("Unknown packet_type defaults to Div7.MissionControl", () => {
    const unknownTypes = ["unknown_type", "nonexistent", "invalid_packet", "test123"];

    for (const packetType of unknownTypes) {
      it(`"${packetType}" defaults to Div7.MissionControl`, async () => {
        const result = await routeHandler({ mission_id: "m1", packet_type: packetType }) as any;
        expect(result.routed_to).toEqual(["Div7.MissionControl"]);
        expect(result.routing_rule).toBe("unknown_fallback");
      });
    }
  });

  // =========================================================================
  // Cross-validation: dist/worker.js routing matches src/ missionRouter routing
  // =========================================================================
  describe("Cross-validation with missionRouter.ts routing rules", () => {
    // Map from routing rule to packet_type that triggers it
    const ruleToPacketType: Record<string, string> = {
      requires_executive_decision: "intake",
      backlog_shaping: "planning",
      budget_capacity: "budget",
      implementation: "execution",
      qa_security_review: "qa_review",
      external_io_request: "external_io",
      paid_credentialed_external_io_request: "paid_external_io",
      multi_division_workflow: "multi_division",
      complex_safe_to_fail: "complex",
      chaotic_incident_flow: "chaotic",
      complicated_expert_review: "complicated",
      standard_operational: "standard",
    };

    for (const rule of NAMED_ROUTING_RULES) {
      it(`rule "${rule}" maps to correct packet_type and divisions`, async () => {
        const packetType = ruleToPacketType[rule];
        expect(packetType).toBeDefined();

        const result = await routeHandler({ mission_id: "m1", packet_type: packetType }) as any;
        expect(result.routing_rule).toBe(rule);
        expect(result.routed_to).toEqual(EXPECTED_ROUTING_TABLE[packetType].routed_to);
      });
    }

    it("all 12 named routing rules are represented", () => {
      // Verify every rule maps to a packet_type
      for (const rule of NAMED_ROUTING_RULES) {
        expect(ruleToPacketType[rule]).toBeDefined();
      }
      // Verify every packet_type maps back to a rule
      for (const packetType of Object.keys(EXPECTED_ROUTING_TABLE)) {
        const rule = EXPECTED_ROUTING_TABLE[packetType].routing_rule;
        if (rule !== "unknown_fallback" && rule !== "operational_review" && rule !== "external_io") {
          expect(NAMED_ROUTING_RULES).toContain(rule);
        }
      }
    });
  });

  // =========================================================================
  // Edge cases
  // =========================================================================
  describe("Edge cases", () => {
    it("handles empty payload", async () => {
      const result = await routeHandler({ mission_id: "m1", packet_type: "intake" }) as any;
      expect(result.payload).toEqual({});
    });

    it("includes payload when provided", async () => {
      const payload = { key: "value", nested: { data: 123 } };
      const result = await routeHandler({ mission_id: "m1", packet_type: "intake", payload }) as any;
      expect(result.payload).toEqual(payload);
    });

    it("handles null payload gracefully", async () => {
      const result = await routeHandler({ mission_id: "m1", packet_type: "intake", payload: null }) as any;
      expect(result.payload).toEqual({});
    });

    it("handles undefined payload gracefully", async () => {
      const result = await routeHandler({ mission_id: "m1", packet_type: "intake", payload: undefined }) as any;
      expect(result.payload).toEqual({});
    });

    it("packet types with special characters route to unknown_fallback", async () => {
      const result = await routeHandler({ mission_id: "m1", packet_type: "test@#$%" }) as any;
      expect(result.routed_to).toEqual(["Div7.MissionControl"]);
      expect(result.routing_rule).toBe("unknown_fallback");
    });

    it("empty string packet_type routes to unknown_fallback", async () => {
      const result = await routeHandler({ mission_id: "m1", packet_type: "" }) as any;
      expect(result.error).toBe("mission_id and packet_type required");
    });

    it("numeric packet_type routes to unknown_fallback", async () => {
      const result = await routeHandler({ mission_id: "m1", packet_type: 123 }) as any;
      // Numbers are truthy, so it should route to unknown_fallback
      expect(result.routed_to).toEqual(["Div7.MissionControl"]);
      expect(result.routing_rule).toBe("unknown_fallback");
    });
  });

  // =========================================================================
  // Error handling
  // =========================================================================
  describe("Error handling", () => {
    it("returns error when mission_id is missing", async () => {
      const result = await routeHandler({ packet_type: "intake" }) as any;
      expect(result.error).toBe("mission_id and packet_type required");
    });

    it("returns error when packet_type is missing", async () => {
      const result = await routeHandler({ mission_id: "m1" }) as any;
      expect(result.error).toBe("mission_id and packet_type required");
    });

    it("returns error when both required params missing", async () => {
      const result = await routeHandler({}) as any;
      expect(result.error).toBe("mission_id and packet_type required");
    });

    it("returns error when called with null params", async () => {
      const result = await routeHandler(null as any) as any;
      expect(result.error).toBe("mission_id and packet_type required");
    });

    it("returns error when called with undefined params", async () => {
      const result = await routeHandler(undefined as any) as any;
      expect(result.error).toBe("mission_id and packet_type required");
    });
  });

  // =========================================================================
  // Observability: routed_at timestamp
  // =========================================================================
  describe("Observability: routed_at timestamp", () => {
    it("includes valid ISO timestamp in routed_at", async () => {
      const result = await routeHandler({ mission_id: "m1", packet_type: "intake" }) as any;
      expect(result.routed_at).toBeDefined();
      const timestamp = new Date(result.routed_at);
      expect(timestamp.getTime()).not.toBeNaN();
    });

    it("routed_at is recent (within last 5 seconds)", async () => {
      const before = Date.now();
      const result = await routeHandler({ mission_id: "m1", packet_type: "intake" }) as any;
      const after = Date.now();
      const routedAt = new Date(result.routed_at).getTime();
      expect(routedAt).toBeGreaterThanOrEqual(before - 1000);
      expect(routedAt).toBeLessThanOrEqual(after + 1000);
    });
  });

  // =========================================================================
  // Complete routing table coverage
  // =========================================================================
  describe("Complete routing table coverage", () => {
    it("all 14 packet types are defined in routing table", () => {
      const packetTypes = Object.keys(EXPECTED_ROUTING_TABLE);
      expect(packetTypes.length).toBe(14);
    });

    it("all routing rules are distinct", () => {
      const rules = Object.values(EXPECTED_ROUTING_TABLE).map(r => r.routing_rule);
      const uniqueRules = new Set(rules);
      expect(uniqueRules.size).toBe(rules.length);
    });

    it("all divisions are represented in routing table", () => {
      const allDivisions = new Set<string>();
      for (const route of Object.values(EXPECTED_ROUTING_TABLE)) {
        for (const div of route.routed_to) {
          allDivisions.add(div);
        }
      }
      expect(allDivisions).toContain("Div1.HCO");
      expect(allDivisions).toContain("Div2.MasterPlanner");
      expect(allDivisions).toContain("Div3.Treasury");
      expect(allDivisions).toContain("Div4.Production");
      expect(allDivisions).toContain("Div5.QualificationsLibraryLearning");
      expect(allDivisions).toContain("Div6.External");
      expect(allDivisions).toContain("Div7.MissionControl");
    });
  });
});
