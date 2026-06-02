/**
 * Unit tests for all 6 dist/worker.js plugin tools.
 *
 * Tests happy-path and missing-param error paths for:
 *   bos-bpi-score, bos-blueprint-gen, bos-eval-gate,
 *   bos-circuit-breaker, bos-decide, bos-route-packet
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  activate, AgentActionValidator, createValidatedToolWrapper,
  IssueLifecycleHookManager, mapDomainEventToHookEvent, createBosLightHookManager,
  missionRouterIssueCreatedHandler, logIssueCreatedHandler, logIssueUpdatedHandler, logIssueAssignmentHandler,
  deriveMissionSignalsFromText, inferDivisionsFromText, requiresExecutiveDecision,
  getRoutingDecisionLog, clearRoutingDecisionLog, getRoutingPacketSummary, getPacketsForIssue,
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
      expect(result.routed_to).toEqual(["Div7.MissionControl"]);
      expect(result.routing_rule).toBe("requires_executive_decision");
      expect(result.packet_type).toBe("intake");
      expect(result.mission_id).toBe("m1");
      expect(result.payload).toEqual({});
      expect(result.routed_at).toBeDefined();
    });

    it("routes planning to Div2.MasterPlanner", async () => {
      const result = await handler("bos-route-packet")({ mission_id: "m1", packet_type: "planning" }) as any;
      expect(result.routed_to).toEqual(["Div2.MasterPlanner"]);
      expect(result.routing_rule).toBe("backlog_shaping");
    });

    it("routes execution to Div4.Production", async () => {
      const result = await handler("bos-route-packet")({ mission_id: "m1", packet_type: "execution" }) as any;
      expect(result.routed_to).toEqual(["Div4.Production"]);
      expect(result.routing_rule).toBe("implementation");
    });

    it("routes review to Div1.HCO", async () => {
      const result = await handler("bos-route-packet")({ mission_id: "m1", packet_type: "review" }) as any;
      expect(result.routed_to).toEqual(["Div1.HCO"]);
      expect(result.routing_rule).toBe("operational_review");
    });

    it("routes external to Div6.External", async () => {
      const result = await handler("bos-route-packet")({ mission_id: "m1", packet_type: "external" }) as any;
      expect(result.routed_to).toEqual(["Div6.External"]);
      expect(result.routing_rule).toBe("external_io");
    });

    it("defaults unknown packet_type to Div7.MissionControl", async () => {
      const result = await handler("bos-route-packet")({ mission_id: "m1", packet_type: "unknown_type" }) as any;
      expect(result.routed_to).toEqual(["Div7.MissionControl"]);
      expect(result.routing_rule).toBe("unknown_fallback");
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
    it("registers all 7 tools (6 BOS + bos-dispatch-event)", () => {
      expect(ctx.tools.register).toHaveBeenCalledTimes(7);
      const names = ctx._tools.map((t) => t.name);
      expect(names).toContain("bos-bpi-score");
      expect(names).toContain("bos-blueprint-gen");
      expect(names).toContain("bos-eval-gate");
      expect(names).toContain("bos-circuit-breaker");
      expect(names).toContain("bos-decide");
      expect(names).toContain("bos-route-packet");
      expect(names).toContain("bos-dispatch-event");
    });

    it("stores hook manager on ctx._hookManager", () => {
      expect(ctx._hookManager).toBeDefined();
      expect(ctx._hookManager).toBeInstanceOf(IssueLifecycleHookManager);
    });

    it("hook manager has all 4 handlers registered", () => {
      const allHandlers = ctx._hookManager.listAllHandlers();
      expect(allHandlers.length).toBe(4);
      const handlerNames = allHandlers.map(h => h.handlerName);
      expect(handlerNames).toContain("bos-light-log-created");
      expect(handlerNames).toContain("bos-light-log-updated");
      expect(handlerNames).toContain("bos-light-log-assignment");
      expect(handlerNames).toContain("bos-light-mission-router");
    });
  });

  // =========================================================================
  // Grant Policy Enforcement
  // =========================================================================
  describe("grant policy enforcement", () => {
    it("exposes AgentActionValidator and createValidatedToolWrapper as exports", () => {
      expect(AgentActionValidator).toBeDefined();
      expect(createValidatedToolWrapper).toBeDefined();
      expect(typeof createValidatedToolWrapper).toBe("function");
    });

    it("default tools work for Div7.MissionControl (not in denied list for BOS tools)", async () => {
      const result = await handler("bos-bpi-score")({ mission_id: "m1" }) as any;
      // Div7.MissionControl is not denied bos-bpi-score (not in denied list)
      expect(result.error).toBeUndefined();
      expect(result.mission_id).toBe("m1");
    });

    it("tool wrapper returns grant_denied for tools denied to a division", async () => {
      const validator = new AgentActionValidator();
      const wrap = createValidatedToolWrapper(validator, "Div4.Production", "test-mission");
      const testHandler = wrap("web_search", async () => ({ result: "found" }));

      // Div4.PProduction is denied web_search (external-world access check fires first)
      const result = await testHandler() as any;
      expect(result.error).toBe("grant_denied");
      expect(result.division).toBe("Div4.Production");
      expect(result.reason).toContain("external-world access");
      expect(result.denialId).toBeDefined();
    });

    it("tool wrapper allows access for tools not in denied list", async () => {
      const validator = new AgentActionValidator();
      const wrap = createValidatedToolWrapper(validator, "Div4.Production", "test-mission");
      const testHandler = wrap("repo_read", async () => ({ result: "content" }));

      // Div4.Production is allowed repo_read
      const result = await testHandler() as any;
      expect(result.error).toBeUndefined();
      expect(result.result).toBe("content");
    });

    it("denial log records grant denials with correct fields", async () => {
      const validator = new AgentActionValidator();
      const wrap = createValidatedToolWrapper(validator, "Div2.MasterPlanner", "test-mission");
      const testHandler = wrap("external_api", async () => ({}));

      await testHandler();

      const denials = validator.getDenialLog();
      expect(denials.length).toBe(1);
      expect(denials[0].division).toBe("Div2.MasterPlanner");
      expect(denials[0].toolName).toBe("external_api");
      expect(denials[0].missionId).toBe("test-mission");
      expect(denials[0].denialId).toMatch(/^den_/);
      expect(denials[0].reason).toContain("external-world access");
    });

    it("denial log filters by division", async () => {
      const validator = new AgentActionValidator();

      // Deny for Div2
      const wrap2 = createValidatedToolWrapper(validator, "Div2.MasterPlanner", "m1");
      await wrap2("web_search", async () => ({}))();
      await wrap2("external_api", async () => ({}))();

      // Deny for Div4
      const wrap4 = createValidatedToolWrapper(validator, "Div4.Production", "m1");
      await wrap4("web_search", async () => ({}))();

      expect(validator.getDenialLog().length).toBe(3);
      expect(validator.getDenialsForDivision("Div2.MasterPlanner").length).toBe(2);
      expect(validator.getDenialsForDivision("Div4.Production").length).toBe(1);
    });

    it("denial log filters by mission", async () => {
      const validator = new AgentActionValidator();

      const wrapA = createValidatedToolWrapper(validator, "Div4.Production", "mission-alpha");
      await wrapA("web_search", async () => ({}))();

      const wrapB = createValidatedToolWrapper(validator, "Div4.Production", "mission-beta");
      await wrapB("web_search", async () => ({}))();

      expect(validator.getDenialsForMission("mission-alpha").length).toBe(1);
      expect(validator.getDenialsForMission("mission-beta").length).toBe(1);
      expect(validator.getDenialsForMission("mission-gamma").length).toBe(0);
    });

    it("cross-division: Div4 can use repo_read but not web_search", async () => {
      const validator = new AgentActionValidator();
      const wrap = createValidatedToolWrapper(validator, "Div4.Production", "cross-test");

      // Allowed: repo_read
      const allowedHandler = wrap("repo_read", async () => ({ data: "ok" }));
      const allowedResult = await allowedHandler() as any;
      expect(allowedResult.error).toBeUndefined();
      expect(allowedResult.data).toBe("ok");

      // Denied: web_search
      const deniedHandler = wrap("web_search", async () => ({ data: "nope" }));
      const deniedResult = await deniedHandler() as any;
      expect(deniedResult.error).toBe("grant_denied");
      expect(deniedResult.division).toBe("Div4.Production");
    });

    it("cross-division: Div6.External can use web_search but Div3.Treasury cannot", async () => {
      const validator = new AgentActionValidator();

      // Div6.External allowed web_search
      const wrap6 = createValidatedToolWrapper(validator, "Div6.External", "ext-test");
      const handler6 = wrap6("web_search", async () => ({ found: true }));
      const result6 = await handler6() as any;
      expect(result6.error).toBeUndefined();
      expect(result6.found).toBe(true);

      // Div3.Treasury denied web_search
      const wrap3 = createValidatedToolWrapper(validator, "Div3.Treasury", "treasury-test");
      const handler3 = wrap3("web_search", async () => ({}));
      const result3 = await handler3() as any;
      expect(result3.error).toBe("grant_denied");
      expect(result3.reason).toContain("external-world access");
    });

    it("grant_denied response includes decision metadata", async () => {
      const validator = new AgentActionValidator();
      const wrapProd = createValidatedToolWrapper(validator, "Div4.Production", "meta-test");
      const handler = wrapProd("external_api", async () => ({}));
      const result = await handler() as any;

      expect(result.error).toBe("grant_denied");
      expect(result.tool).toBe("external_api");
      expect(result.division).toBe("Div4.Production");
      expect(result.decision).toBeDefined();
      expect(result.decision.status).toBe("denied");
    });

    it("clearDenialLog resets the log", async () => {
      const validator = new AgentActionValidator();
      const wrap = createValidatedToolWrapper(validator, "Div4.Production", "clear-test");
      await wrap("web_search", async () => ({}))();
      expect(validator.getDenialLog().length).toBe(1);

      validator.clearDenialLog();
      expect(validator.getDenialLog().length).toBe(0);
    });
  });

  // =========================================================================
  // Issue Lifecycle Hook Manager
  // =========================================================================
  describe("IssueLifecycleHookManager", () => {
    it("is exported and constructable", () => {
      const manager = new IssueLifecycleHookManager();
      expect(manager).toBeDefined();
      expect(manager.listAllHandlers()).toEqual([]);
    });

    it("registers and lists handlers for each event type", () => {
      const manager = new IssueLifecycleHookManager();
      manager.on("issue.created", "test-handler", async () => ({ handled: true, durationMs: 0 }));
      expect(manager.listHandlers("issue.created")).toEqual(["test-handler"]);
      expect(manager.listHandlers("issue.updated")).toEqual([]);
    });

    it("throws on duplicate handler registration", () => {
      const manager = new IssueLifecycleHookManager();
      manager.on("issue.created", "h1", async () => ({ handled: true, durationMs: 0 }));
      expect(() => manager.on("issue.created", "h1", async () => ({ handled: true, durationMs: 0 }))).toThrow('Handler "h1" is already registered for event "issue.created"');
    });

    it("unregisters handlers with off()", () => {
      const manager = new IssueLifecycleHookManager();
      manager.on("issue.created", "h1", async () => ({ handled: true, durationMs: 0 }));
      expect(manager.off("issue.created", "h1")).toBe(true);
      expect(manager.off("issue.created", "h1")).toBe(false);
      expect(manager.listHandlers("issue.created")).toEqual([]);
    });

    it("dispatches events to registered handlers and logs invocations", async () => {
      const manager = new IssueLifecycleHookManager();
      const mockHandler = vi.fn(async () => ({ handled: true, message: "ok", durationMs: 5 }));
      manager.on("issue.created", "test-handler", mockHandler);

      const event = {
        eventType: "issue.created" as const,
        eventId: "evt-001",
        occurredAt: "2026-06-02T10:00:00.000Z",
        payload: { issueId: "issue-1", companyId: "c1", identifier: "BOS-1", title: "Test", status: "open", createdAt: "2026-06-02T10:00:00.000Z" },
      };

      const logs = await manager.dispatchEvent(event);
      expect(logs.length).toBe(1);
      expect(logs[0].handlerName).toBe("test-handler");
      expect(logs[0].result.handled).toBe(true);
      expect(mockHandler).toHaveBeenCalledTimes(1);

      expect(manager.getInvocationCount()).toBe(1);
      expect(manager.getInvocationLogByIssueId("issue-1").length).toBe(1);
      expect(manager.getInvocationCountByEventType()["issue.created"]).toBe(1);
    });

    it("returns empty-handler log when no handlers registered for event", async () => {
      const manager = new IssueLifecycleHookManager();
      const event = {
        eventType: "issue.created" as const,
        eventId: "evt-002",
        occurredAt: "2026-06-02T10:00:00.000Z",
        payload: { issueId: "issue-2", companyId: "c1", identifier: "BOS-2", title: "Test", status: "open", createdAt: "2026-06-02T10:00:00.000Z" },
      };

      const logs = await manager.dispatchEvent(event);
      expect(logs.length).toBe(1);
      expect(logs[0].handlerName).toBe("(no handlers)");
      expect(logs[0].result.handled).toBe(false);
    });

    it("captures handler errors in invocation log", async () => {
      const manager = new IssueLifecycleHookManager();
      manager.on("issue.created", "fail-handler", async () => { throw new Error("boom"); });

      const event = {
        eventType: "issue.created" as const,
        eventId: "evt-003",
        occurredAt: "2026-06-02T10:00:00.000Z",
        payload: { issueId: "issue-3", companyId: "c1", identifier: "BOS-3", title: "Test", status: "open", createdAt: "2026-06-02T10:00:00.000Z" },
      };

      const logs = await manager.dispatchEvent(event);
      expect(logs[0].result.handled).toBe(false);
      expect(logs[0].result.error).toBe("boom");
    });

    it("clearInvocationLog resets the log", async () => {
      const manager = new IssueLifecycleHookManager();
      manager.on("issue.created", "h", async () => ({ handled: true, durationMs: 0 }));
      await manager.dispatchEvent({
        eventType: "issue.created" as const,
        eventId: "evt-004",
        occurredAt: new Date().toISOString(),
        payload: { issueId: "i4", companyId: "c1", identifier: "B-4", title: "T", status: "open", createdAt: new Date().toISOString() },
      });
      expect(manager.getInvocationCount()).toBe(1);
      manager.clearInvocationLog();
      expect(manager.getInvocationCount()).toBe(0);
    });
  });

  // =========================================================================
  // mapDomainEventToHookEvent
  // =========================================================================
  describe("mapDomainEventToHookEvent", () => {
    it("maps issue.created domain event", () => {
      const domainEvent = {
        eventId: "de-001",
        eventType: "issue.created",
        occurredAt: "2026-06-02T10:00:00.000Z",
        payload: { issueId: "i1", companyId: "c1", identifier: "BOS-1", title: "Test", status: "open", createdAt: "2026-06-02T10:00:00.000Z" },
      };
      const hookEvent = mapDomainEventToHookEvent(domainEvent);
      expect(hookEvent).not.toBeNull();
      expect(hookEvent!.eventType).toBe("issue.created");
      expect(hookEvent!.eventId).toBe("de-001");
    });

    it("maps issue.checked_out to issue.assignment", () => {
      const domainEvent = {
        eventId: "de-002",
        eventType: "issue.checked_out",
        occurredAt: "2026-06-02T10:00:00.000Z",
        payload: { issueId: "i1", companyId: "c1", identifier: "BOS-1" },
      };
      const hookEvent = mapDomainEventToHookEvent(domainEvent);
      expect(hookEvent).not.toBeNull();
      expect(hookEvent!.eventType).toBe("issue.assignment");
    });

    it("returns null for unrecognized event types", () => {
      const domainEvent = {
        eventId: "de-003",
        eventType: "comment.created",
        occurredAt: "2026-06-02T10:00:00.000Z",
        payload: {},
      };
      expect(mapDomainEventToHookEvent(domainEvent)).toBeNull();
    });
  });

  // =========================================================================
  // createBosLightHookManager
  // =========================================================================
  describe("createBosLightHookManager", () => {
    it("creates manager with 4 registered handlers", () => {
      const manager = createBosLightHookManager();
      const allHandlers = manager.listAllHandlers();
      expect(allHandlers.length).toBe(4);
    });

    it("includes mission router handler for issue.created", () => {
      const manager = createBosLightHookManager();
      const createdHandlers = manager.listHandlers("issue.created");
      expect(createdHandlers).toContain("bos-light-log-created");
      expect(createdHandlers).toContain("bos-light-mission-router");
    });
  });

  // =========================================================================
  // MissionSignals derivation (inlined)
  // =========================================================================
  describe("deriveMissionSignalsFromText", () => {
    it("classifies technical tasks", () => {
      const signals = deriveMissionSignalsFromText("Implement auth flow");
      expect(signals.taskClass).toBe("technical");
      expect(signals.requiresImplementation).toBe(true);
    });

    it("classifies incident signals as CRITICAL", () => {
      const signals = deriveMissionSignalsFromText("Critical outage in production");
      expect(signals.incidentSignals).toBe(true);
      expect(signals.riskLevel).toBe("CRITICAL");
    });

    it("classifies strategy tasks with policy signals", () => {
      const signals = deriveMissionSignalsFromText("Strategic policy experiment");
      expect(signals.taskClass).toBe("strategy");
      expect(signals.policySignals).toBe(true);
    });

    it("detects external data requirements", () => {
      const signals = deriveMissionSignalsFromText("Third-party API integration webhook");
      expect(signals.requiresExternalData).toBe(true);
    });
  });

  describe("requiresExecutiveDecision", () => {
    it("returns true for incident signals", () => {
      expect(requiresExecutiveDecision({
        taskClass: "strategy", requiresExternalData: false, requiresBudgetOrAccess: false,
        requiresImplementation: false, requiresQA: false, riskLevel: "CRITICAL",
        ambiguityLevel: "low", incidentSignals: true, policySignals: false,
      } as any)).toBe(true);
    });

    it("returns true for strategy task class", () => {
      expect(requiresExecutiveDecision({
        taskClass: "strategy", requiresExternalData: false, requiresBudgetOrAccess: false,
        requiresImplementation: false, requiresQA: false, riskLevel: "MEDIUM",
        ambiguityLevel: "low", incidentSignals: false, policySignals: true,
      } as any)).toBe(true);
    });

    it("returns false for routine technical task", () => {
      expect(requiresExecutiveDecision({
        taskClass: "technical", requiresExternalData: false, requiresBudgetOrAccess: false,
        requiresImplementation: true, requiresQA: false, riskLevel: "MEDIUM",
        ambiguityLevel: "low", incidentSignals: false, policySignals: false,
      } as any)).toBe(false);
    });
  });

  // =========================================================================
  // Routing Decision Log
  // =========================================================================
  describe("routing decision log", () => {
    beforeEach(() => {
      clearRoutingDecisionLog();
    });

    it("starts empty", () => {
      expect(getRoutingDecisionLog()).toEqual([]);
    });

    it("getRoutingPacketSummary returns empty map initially", () => {
      const summary = getRoutingPacketSummary();
      expect(summary.size).toBe(0);
    });

    it("getPacketsForIssue returns empty array initially", () => {
      expect(getPacketsForIssue("any-issue")).toEqual([]);
    });
  });

  // =========================================================================
  // bos-dispatch-event tool
  // =========================================================================
  describe("bos-dispatch-event tool", () => {
    it("dispatches issue.created event through hook manager", async () => {
      const result = await handler("bos-dispatch-event")({
        event_type: "issue.created",
        payload: {
          issueId: "issue-dispatch-001",
          companyId: "company-1",
          identifier: "BOS-D1",
          title: "Implement feature",
          description: "Build the code feature",
          status: "open",
          priority: "high",
          createdAt: new Date().toISOString(),
        },
      }) as any;

      expect(result.error).toBeUndefined();
      expect(result.dispatched).toBe(true);
      expect(result.event_type).toBe("issue.created");
      expect(result.handlers_invoked).toBe(2); // log-created + mission-router
      expect(result.results.length).toBe(2);
      expect(result.eventId).toBeDefined();
      expect(result.dispatched_at).toBeDefined();
    });

    it("dispatches issue.updated event through hook manager", async () => {
      const result = await handler("bos-dispatch-event")({
        event_type: "issue.updated",
        payload: {
          issueId: "issue-dispatch-002",
          companyId: "company-1",
          identifier: "BOS-D2",
          status: "in_progress",
          previousStatus: "open",
          updatedAt: new Date().toISOString(),
          changedFields: ["status"],
        },
      }) as any;

      expect(result.dispatched).toBe(true);
      expect(result.handlers_invoked).toBe(1); // log-updated only
      expect(result.results[0].handler).toBe("bos-light-log-updated");
      expect(result.results[0].handled).toBe(true);
    });

    it("dispatches issue.assignment event through hook manager", async () => {
      const result = await handler("bos-dispatch-event")({
        event_type: "issue.assignment",
        payload: {
          issueId: "issue-dispatch-003",
          companyId: "company-1",
          identifier: "BOS-D3",
          assigneeAgentId: "agent-001",
          assignedAt: new Date().toISOString(),
        },
      }) as any;

      expect(result.dispatched).toBe(true);
      expect(result.handlers_invoked).toBe(1); // log-assignment only
      expect(result.results[0].handler).toBe("bos-light-log-assignment");
    });

    it("returns error when event_type is missing", async () => {
      const result = await handler("bos-dispatch-event")({ payload: {} }) as any;
      expect(result.error).toBe("event_type and payload required");
    });

    it("returns error when payload is missing", async () => {
      const result = await handler("bos-dispatch-event")({ event_type: "issue.created" }) as any;
      expect(result.error).toBe("event_type and payload required");
    });

    it("returns error when both params missing", async () => {
      const result = await handler("bos-dispatch-event")({}) as any;
      expect(result.error).toBe("event_type and payload required");
    });
  });

  // =========================================================================
  // MissionRouter integration via bos-dispatch-event
  // =========================================================================
  describe("MissionRouter integration via bos-dispatch-event", () => {
    beforeEach(() => {
      clearRoutingDecisionLog();
    });

    it("routes a technical issue to Div4.Production (routine, no Div7)", async () => {
      const result = await handler("bos-dispatch-event")({
        event_type: "issue.created",
        payload: {
          issueId: "issue-route-001",
          companyId: "company-1",
          identifier: "BOS-R1",
          title: "Fix login bug",
          description: "Users cannot login due to auth error",
          status: "open",
          createdAt: new Date().toISOString(),
        },
      }) as any;

      expect(result.dispatched).toBe(true);
      const routerResult = result.results.find((r: any) => r.handler === "bos-light-mission-router");
      expect(routerResult).toBeDefined();
      expect(routerResult.handled).toBe(true);
      expect(routerResult.message).toContain("Div4.Production");
      expect(routerResult.message).toContain("implementation");

      // Check routing decision log
      const log = getRoutingDecisionLog();
      expect(log.length).toBe(1);
      expect(log[0].issueId).toBe("issue-route-001");
      expect(log[0].signals.taskClass).toBe("technical");
      expect(log[0].routingResult.activated_divisions).toContain("Div4.Production");
      expect(log[0].twoPassRouting).toBeUndefined();
    });

    it("routes a critical incident through Div7 executive decision (two-pass)", async () => {
      const result = await handler("bos-dispatch-event")({
        event_type: "issue.created",
        payload: {
          issueId: "issue-route-002",
          companyId: "company-1",
          identifier: "BOS-R2",
          title: "Critical outage in production",
          description: "Emergency crash recovery needed",
          status: "open",
          priority: "critical",
          createdAt: new Date().toISOString(),
        },
      }) as any;

      const routerResult = result.results.find((r: any) => r.handler === "bos-light-mission-router");
      expect(routerResult.handled).toBe(true);
      expect(routerResult.message).toContain("Div7 (executive decision)");
      expect(routerResult.message).toContain("CHAOTIC");

      const log = getRoutingDecisionLog();
      expect(log.length).toBe(1);
      expect(log[0].twoPassRouting).toBeDefined();
      expect(log[0].twoPassRouting!.decisionDelegated.cynefin_domain).toBe("CHAOTIC");
      expect(log[0].twoPassRouting!.operationalRoutingResult.activated_divisions).toContain("Div1.HCO");
    });

    it("routes a strategy/policy issue through Div7 (COMPLICATED domain)", async () => {
      const result = await handler("bos-dispatch-event")({
        event_type: "issue.created",
        payload: {
          issueId: "issue-route-003",
          companyId: "company-1",
          identifier: "BOS-R3",
          title: "Strategic policy experiment",
          description: "Ambiguous strategy direction needed",
          status: "open",
          createdAt: new Date().toISOString(),
        },
      }) as any;

      const routerResult = result.results.find((r: any) => r.handler === "bos-light-mission-router");
      expect(routerResult.handled).toBe(true);
      expect(routerResult.message).toContain("Div7 (executive decision)");

      const log = getRoutingDecisionLog();
      expect(log[0].twoPassRouting).toBeDefined();
      expect(log[0].twoPassRouting!.decisionDelegated.cynefin_domain).toBe("COMPLICATED");
    });

    it("routes multi-division issues with QA signals", async () => {
      const result = await handler("bos-dispatch-event")({
        event_type: "issue.created",
        payload: {
          issueId: "issue-route-004",
          companyId: "company-1",
          identifier: "BOS-R4",
          title: "Code feature with security review",
          description: "Build and test the new feature",
          status: "open",
          createdAt: new Date().toISOString(),
        },
      }) as any;

      const routerResult = result.results.find((r: any) => r.handler === "bos-light-mission-router");
      expect(routerResult.handled).toBe(true);
      // Should route to both Div4.Production and Div5 (code + review keywords)
      expect(routerResult.message).toContain("multi_division_workflow");

      const log = getRoutingDecisionLog();
      expect(log[0].routingResult.activated_divisions).toContain("Div4.Production");
      expect(log[0].routingResult.activated_divisions).toContain("Div5.QualificationsLibraryLearning");
    });

    it("records packet deliveries in routing decision log", async () => {
      await handler("bos-dispatch-event")({
        event_type: "issue.created",
        payload: {
          issueId: "issue-route-005",
          companyId: "company-1",
          identifier: "BOS-R5",
          title: "Fix login bug",
          status: "open",
          createdAt: new Date().toISOString(),
        },
      });

      const log = getRoutingDecisionLog();
      expect(log[0].packetDeliveries.length).toBeGreaterThan(0);
      expect(log[0].packetDeliveries[0].packetId).toBeDefined();
      expect(log[0].packetDeliveries[0].toDivision).toBeDefined();
      expect(log[0].packetDeliveries[0].fromDivision).toBe("Div1.HCO");
    });

    it("getPacketsForIssue returns packets for routed issue", async () => {
      await handler("bos-dispatch-event")({
        event_type: "issue.created",
        payload: {
          issueId: "issue-route-006",
          companyId: "company-1",
          identifier: "BOS-R6",
          title: "Fix login bug",
          status: "open",
          createdAt: new Date().toISOString(),
        },
      });

      const packets = getPacketsForIssue("issue-route-006");
      expect(packets.length).toBeGreaterThan(0);
    });

    it("getRoutingPacketSummary counts packets by division", async () => {
      await handler("bos-dispatch-event")({
        event_type: "issue.created",
        payload: {
          issueId: "issue-route-007",
          companyId: "company-1",
          identifier: "BOS-R7",
          title: "Fix login bug",
          status: "open",
          createdAt: new Date().toISOString(),
        },
      });

      const summary = getRoutingPacketSummary();
      expect(summary.size).toBeGreaterThan(0);
    });
  });

  // =========================================================================
  // Hook manager invocation log after dispatch
  // =========================================================================
  describe("hook manager invocation log after dispatch", () => {
    it("tracks invocation log entries for dispatched events", async () => {
      const hookMgr = ctx._hookManager as InstanceType<typeof IssueLifecycleHookManager>;
      hookMgr.clearInvocationLog();

      await handler("bos-dispatch-event")({
        event_type: "issue.created",
        payload: {
          issueId: "issue-log-001",
          companyId: "company-1",
          identifier: "BOS-L1",
          title: "Implement feature",
          status: "open",
          createdAt: new Date().toISOString(),
        },
      });

      const invLog = hookMgr.getInvocationLog();
      expect(invLog.length).toBe(2); // log-created + mission-router
      expect(invLog[0].handlerName).toBe("bos-light-log-created");
      expect(invLog[1].handlerName).toBe("bos-light-mission-router");
      expect(invLog[0].eventType).toBe("issue.created");
      expect(invLog[0].issueId).toBe("issue-log-001");
    });

    it("tracks invocation count by event type", async () => {
      const hookMgr = ctx._hookManager as InstanceType<typeof IssueLifecycleHookManager>;
      hookMgr.clearInvocationLog();

      await handler("bos-dispatch-event")({
        event_type: "issue.created",
        payload: { issueId: "i1", companyId: "c1", identifier: "B-1", title: "T", status: "open", createdAt: new Date().toISOString() },
      });
      await handler("bos-dispatch-event")({
        event_type: "issue.updated",
        payload: { issueId: "i1", companyId: "c1", identifier: "B-1", updatedAt: new Date().toISOString(), changedFields: ["status"] },
      });

      const counts = hookMgr.getInvocationCountByEventType();
      expect(counts["issue.created"]).toBe(2); // 2 handlers for issue.created
      expect(counts["issue.updated"]).toBe(1); // 1 handler for issue.updated
    });
  });

  // =========================================================================
  // ctx.events.on registration
  // =========================================================================
  describe("ctx.events.on registration", () => {
    it("registers event handler when ctx.events.on is available", async () => {
      const tools: RegisteredTool[] = [];
      const eventsOn = vi.fn();
      const mockCtx = {
        logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
        tools: {
          register: vi.fn(async (name: string, handler: (params: Record<string, unknown>) => Promise<unknown>) => {
            tools.push({ name, handler });
          }),
        },
        events: { on: eventsOn, emit: vi.fn() },
        _tools: tools,
      };

      await activate(mockCtx as any);

      expect(eventsOn).toHaveBeenCalledTimes(1);
      expect(eventsOn).toHaveBeenCalledWith("issue.lifecycle", expect.any(Function));
      expect(mockCtx.logger.info).toHaveBeenCalledWith(
        "Registered issue.lifecycle event handler via ctx.events.on"
      );
    });

    it("skips event registration when ctx.events is not available", async () => {
      const tools: RegisteredTool[] = [];
      const mockCtx = {
        logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
        tools: {
          register: vi.fn(async (name: string, handler: (params: Record<string, unknown>) => Promise<unknown>) => {
            tools.push({ name, handler });
          }),
        },
        _tools: tools,
      };

      await activate(mockCtx as any);
      // Should not throw; hook manager still created
      expect(mockCtx._hookManager).toBeDefined();
    });
  });
});
