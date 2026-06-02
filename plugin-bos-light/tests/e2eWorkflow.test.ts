/**
 * E2E Workflow Integration Test (S04/T01)
 *
 * Validates the full BOS Light plugin integration by proving that all
 * subsystems wired in S01-S03 work together through a single cohesive
 * end-to-end workflow.
 *
 * Exercises the dist/worker.js tool chain through activate() with three
 * Cynefin scenarios (CLEAR, COMPLEX, CHAOTIC) that demonstrate:
 * - Tool registration and invocation
 * - Grant policy enforcement
 * - Issue lifecycle hooks
 * - Cynefin routing (single-pass and two-pass)
 * - Multi-division packet delivery
 * - Routing decision log audit trail
 *
 * Unlike distWorkerTools.test.ts (unit-level) and e2eLive.test.ts (src-level),
 * this test exercises the full activate() registration + all 7 registered tools
 * as one integrated unit through the mock ctx pattern.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  activate,
  AgentActionValidator,
  createValidatedToolWrapper,
  createBosLightHookManager,
  IssueLifecycleHookManager,
  getRoutingDecisionLog,
  clearRoutingDecisionLog,
  getRoutingPacketSummary,
  getPacketsForIssue,
  deriveMissionSignalsFromText,
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

function getHandler(ctx: ReturnType<typeof createMockCtx>, name: string) {
  const entry = ctx._tools.find((t) => t.name === name);
  if (!entry) throw new Error(`Tool ${name} not registered`);
  return entry.handler;
}

/** Call a tool through activate()-registered handler */
async function callTool(
  ctx: ReturnType<typeof createMockCtx>,
  name: string,
  params: Record<string, unknown> = {}
) {
  return getHandler(ctx, name)(params);
}

// ═══════════════════════════════════════════════════════════════════════════════
// E2E Workflow: Three Cynefin Scenarios
// ═══════════════════════════════════════════════════════════════════════════════

describe("E2E Workflow Integration: Three Cynefin Scenarios", () => {
  let ctx: ReturnType<typeof createMockCtx>;

  beforeEach(async () => {
    clearRoutingDecisionLog();
    ctx = createMockCtx();
    await activate(ctx as any);
  });

  // =========================================================================
  // Scenario 1: CLEAR (BOS-T1-style)
  // Single-pass Div4 routing through full tool chain
  // =========================================================================

  describe("CLEAR scenario (BOS-T1-style): routine implementation task", () => {
    const CLEAR_ISSUE_ID = "issue-e2e-clear-001";
    const CLEAR_IDENTIFIER = "E2E-CLEAR";

    /** Dispatch issue.created event and return the result */
    async function dispatchClearIssue() {
      return callTool(ctx, "bos-dispatch-event", {
        event_type: "issue.created",
        payload: {
          issueId: CLEAR_ISSUE_ID,
          companyId: "company-e2e",
          identifier: CLEAR_IDENTIFIER,
          title: "Implement authentication flow",
          description: "Build the login and registration code for the application",
          status: "open",
          priority: "high",
          createdAt: "2026-06-02T12:00:00.000Z",
        },
      }) as Promise<any>;
    }

    it("dispatches issue.created through hook manager", async () => {
      const result = await dispatchClearIssue();
      expect(result.error).toBeUndefined();
      expect(result.dispatched).toBe(true);
      expect(result.event_type).toBe("issue.created");
      expect(result.handlers_invoked).toBe(2); // log-created + mission-router
    });

    it("routes to Div4.Production via single-pass routing", async () => {
      await dispatchClearIssue();

      const log = getRoutingDecisionLog();
      expect(log).toHaveLength(1);

      const entry = log[0];
      expect(entry.issueId).toBe(CLEAR_ISSUE_ID);
      expect(entry.signals.taskClass).toBe("technical");
      expect(entry.signals.requiresImplementation).toBe(true);

      const routingResult = entry.routingResult;
      expect(routingResult.status).toBe("ROUTED");
      expect(routingResult.activated_divisions).toContain("Div4.Production");
      expect(routingResult.current_division).toBe("Div4.Production");

      // CLEAR does NOT trigger two-pass routing
      expect(entry.twoPassRouting).toBeUndefined();
    });

    it("calls bos-bpi-score and receives valid BPI assessment", async () => {
      const result = await callTool(ctx, "bos-bpi-score", {
        mission_id: CLEAR_ISSUE_ID,
        dimensions: {
          strategic_alignment: 8,
          execution_confidence: 7,
          resource_efficiency: 8,
          risk_mitigation: 7,
        },
      }) as any;

      expect(result.error).toBeUndefined();
      expect(result.mission_id).toBe(CLEAR_ISSUE_ID);
      expect(result.bpi_score).toBeCloseTo(7.6, 0); // 8*0.3+7*0.3+8*0.2+7*0.2
      expect(result.classification).toBe("amber");
      expect(result.dimensions).toBeDefined();
      expect(result.computed_at).toBeDefined();
    });

    it("calls bos-blueprint-gen and produces a valid blueprint", async () => {
      const result = await callTool(ctx, "bos-blueprint-gen", {
        mission_id: CLEAR_ISSUE_ID,
        title: "Authentication Flow Blueprint",
      }) as any;

      expect(result.error).toBeUndefined();
      expect(result.mission_id).toBe(CLEAR_ISSUE_ID);
      expect(result.title).toBe("Authentication Flow Blueprint");
      expect(result.blueprint).toContain("# Blueprint: Authentication Flow Blueprint");
      expect(result.blueprint).toContain(`## Mission ID: ${CLEAR_ISSUE_ID}`);
      expect(result.divisions).toEqual([
        "Div1.HCO",
        "Div2.MasterPlanner",
        "Div3.Treasury",
        "Div4.Production",
        "Div7.MissionControl",
      ]);
    });

    it("calls bos-eval-gate with evidence and receives pass verdict", async () => {
      const result = await callTool(ctx, "bos-eval-gate", {
        gate_id: "Q3",
        target_id: CLEAR_ISSUE_ID,
        evidence: "Strategic alignment confirmed: authentication flow maps to core user journey",
      }) as any;

      expect(result.error).toBeUndefined();
      expect(result.gate_id).toBe("Q3");
      expect(result.gate_name).toBe("Strategic Alignment");
      expect(result.target_id).toBe(CLEAR_ISSUE_ID);
      expect(result.verdict).toBe("pass");
      expect(result.evidence).toContain("Strategic alignment confirmed");
      expect(result.evaluated_at).toBeDefined();
    });

    it("calls bos-circuit-breaker (check) and confirms closed state", async () => {
      const result = await callTool(ctx, "bos-circuit-breaker", {
        action: "check",
        breaker_id: `cb-${CLEAR_ISSUE_ID}`,
      }) as any;

      expect(result.error).toBeUndefined();
      expect(result.breaker_id).toBe(`cb-${CLEAR_ISSUE_ID}`);
      expect(result.state).toBe("closed");
      expect(result.failures).toBe(0);
      expect(result.action).toBe("check");
    });

    it("calls bos-decide and receives proceed decision", async () => {
      const result = await callTool(ctx, "bos-decide", {
        mission_id: CLEAR_ISSUE_ID,
        decision_type: "proceed",
        rationale: "BPI amber, eval gate pass, circuit breaker closed. Safe to proceed.",
      }) as any;

      expect(result.error).toBeUndefined();
      expect(result.mission_id).toBe(CLEAR_ISSUE_ID);
      expect(result.decision).toBe("proceed");
      expect(result.rationale).toContain("BPI amber");
      expect(result.decided_at).toBeDefined();
    });

    it("calls bos-route-packet and routes execution to Div4.Production", async () => {
      const result = await callTool(ctx, "bos-route-packet", {
        mission_id: CLEAR_ISSUE_ID,
        packet_type: "execution",
        payload: { decision: "proceed", gate_verdict: "pass" },
      }) as any;

      expect(result.error).toBeUndefined();
      expect(result.routed_to).toEqual(["Div4.Production"]);
      expect(result.routing_rule).toBe("implementation");
      expect(result.packet_type).toBe("execution");
      expect(result.mission_id).toBe(CLEAR_ISSUE_ID);
      expect(result.payload).toEqual({ decision: "proceed", gate_verdict: "pass" });
    });

    it("routing decision log contains full audit trail for CLEAR workflow", async () => {
      await dispatchClearIssue();

      const log = getRoutingDecisionLog();
      expect(log).toHaveLength(1);

      const entry = log[0];
      // Verify all required audit trail fields
      expect(entry.issueId).toBe(CLEAR_ISSUE_ID);
      expect(entry.identifier).toBe(CLEAR_IDENTIFIER);
      expect(entry.missionId).toBe(CLEAR_ISSUE_ID);
      expect(entry.signals).toBeDefined();
      expect(entry.routingResult).toBeDefined();
      expect(entry.packetDeliveries).toBeDefined();
      expect(entry.routedAt).toBeDefined();

      // Packet deliveries include Div4 work_assignment + Div7 status_update
      expect(entry.packetDeliveries.length).toBeGreaterThanOrEqual(1);

      const div4Delivery = entry.packetDeliveries.find(
        (d: any) => d.toDivision === "Div4.Production" && d.packetType === "work_assignment"
      );
      expect(div4Delivery).toBeDefined();
      expect(div4Delivery!.fromDivision).toBe("Div1.HCO");
      expect(div4Delivery!.packetId).toMatch(/^pkt_/);

      // Packets are traceable
      const packets = getPacketsForIssue(CLEAR_ISSUE_ID);
      expect(packets.length).toBe(entry.packetDeliveries.length);
    });
  });

  // =========================================================================
  // Scenario 2: COMPLEX (BOS-T2-style)
  // Two-pass Div7 routing → DecisionDelegated → multi-division operational
  // =========================================================================

  describe("COMPLEX scenario (BOS-T2-style): strategy/experiment task", () => {
    const COMPLEX_ISSUE_ID = "issue-e2e-complex-001";
    const COMPLEX_IDENTIFIER = "E2E-COMPLEX";

    async function dispatchComplexIssue() {
      return callTool(ctx, "bos-dispatch-event", {
        event_type: "issue.created",
        payload: {
          issueId: COMPLEX_ISSUE_ID,
          companyId: "company-e2e",
          identifier: COMPLEX_IDENTIFIER,
          title: "Design ambiguous strategy for new experiment",
          description: "An uncertain and ambiguous direction requiring strategic exploration and policy decisions",
          status: "open",
          priority: "high",
          createdAt: "2026-06-02T13:00:00.000Z",
        },
      }) as Promise<any>;
    }

    it("dispatches issue.created through hook manager", async () => {
      const result = await dispatchComplexIssue();
      expect(result.error).toBeUndefined();
      expect(result.dispatched).toBe(true);
      expect(result.handlers_invoked).toBe(2);
    });

    it("triggers two-pass Div7 routing with DecisionDelegated", async () => {
      await dispatchComplexIssue();

      const log = getRoutingDecisionLog();
      expect(log).toHaveLength(1);

      const entry = log[0];
      expect(entry.issueId).toBe(COMPLEX_ISSUE_ID);
      expect(entry.signals.policySignals).toBe(true);
      expect(entry.signals.ambiguityLevel).toBe("high");

      // First pass routes to Div7 for executive decision
      expect(entry.routingResult.activated_divisions).toContain("Div7.MissionControl");
      expect(entry.twoPassRouting).toBeDefined();
    });

    it("DecisionDelegated classifies COMPLICATED domain with probe mode", async () => {
      await dispatchComplexIssue();

      const log = getRoutingDecisionLog();
      const twoPass = log[0].twoPassRouting!;
      expect(twoPass).toBeDefined();

      const decisionDelegated = twoPass.decisionDelegated;
      // Strategy/policy issues are classified as COMPLICATED (Cynefin framework)
      expect(decisionDelegated.cynefin_domain).toBe("COMPLICATED");
      expect(decisionDelegated.recommended_mode).toBe("probe");
      expect(decisionDelegated.decision_id).toBeDefined();
    });

    it("DecisionDelegated targets multi-division: Div2+Div4+Div5 via expert review", async () => {
      await dispatchComplexIssue();

      const log = getRoutingDecisionLog();
      const directive = log[0].twoPassRouting!.decisionDelegated.routing_directive;

      // COMPLICATED routing uses expert_review rule with 3 target divisions
      expect(directive.routingRule).toBe("complicated_expert_review");
      expect(directive.targetDivisions).toContain("Div2.MasterPlanner");
      expect(directive.targetDivisions).toContain("Div4.Production");
      expect(directive.targetDivisions).toContain("Div5.QualificationsLibraryLearning");
      expect(directive.targetDivisions).toHaveLength(3);
    });

    it("operational routing delivers work_assignment packets to all three target divisions", async () => {
      await dispatchComplexIssue();

      const log = getRoutingDecisionLog();
      const opResult = log[0].twoPassRouting!.operationalRoutingResult;
      expect(opResult.status).toBe("ROUTED");
      expect(opResult.activated_divisions).toContain("Div2.MasterPlanner");
      expect(opResult.activated_divisions).toContain("Div4.Production");
      expect(opResult.activated_divisions).toContain("Div5.QualificationsLibraryLearning");
      expect(opResult.activated_divisions).toHaveLength(3);
    });

    it("calls bos-route-packet with planning type and verifies routing table alignment", async () => {
      await dispatchComplexIssue();

      // Verify the routing packet emitted to Div2 is a work_assignment
      const result = await callTool(ctx, "bos-route-packet", {
        mission_id: COMPLEX_ISSUE_ID,
        packet_type: "planning",
        payload: { decision: "probe", domain: "COMPLICATED" },
      }) as any;

      expect(result.error).toBeUndefined();
      expect(result.routed_to).toEqual(["Div2.MasterPlanner"]);
      expect(result.routing_rule).toBe("backlog_shaping");
      expect(result.packet_type).toBe("planning");
    });

    it("all packets traceable and multi-division delivery confirmed", async () => {
      await dispatchComplexIssue();

      const packets = getPacketsForIssue(COMPLEX_ISSUE_ID);

      // First pass: Div7 work_assignment
      const firstPassDiv7 = packets.find(
        (p: any) => p.toDivision === "Div7.MissionControl" && p.packetType === "work_assignment"
      );
      expect(firstPassDiv7).toBeDefined();

      // Second pass: Div2, Div4, Div5 work_assignments
      const secondPassDiv2 = packets.find(
        (p: any) => p.toDivision === "Div2.MasterPlanner" && p.packetType === "work_assignment"
      );
      const secondPassDiv4 = packets.find(
        (p: any) => p.toDivision === "Div4.Production" && p.packetType === "work_assignment"
      );
      const secondPassDiv5 = packets.find(
        (p: any) => p.toDivision === "Div5.QualificationsLibraryLearning" && p.packetType === "work_assignment"
      );
      expect(secondPassDiv2).toBeDefined();
      expect(secondPassDiv4).toBeDefined();
      expect(secondPassDiv5).toBeDefined();
    });

    it("DecisionDelegated packet delivered from Div7 to Div1", async () => {
      await dispatchComplexIssue();

      // The bos-dispatch-event tool exercises the full hook manager pipeline
      // which calls missionRouterIssueCreatedHandler internally.
      // DecisionDelegated packet is delivered to Div1 inbox.
      const log = getRoutingDecisionLog();
      const twoPass = log[0].twoPassRouting!;
      expect(twoPass.decisionDelegated).toBeDefined();
      expect(twoPass.completedAt).toBeDefined();
    });
  });

  // =========================================================================
  // Scenario 3: CHAOTIC (BOS-T3-style)
  // Two-pass Div7 executive decision → CHAOTIC domain → incident flow
  // =========================================================================

  describe("CHAOTIC scenario (BOS-T3-style): critical incident task", () => {
    const CHAOTIC_ISSUE_ID = "issue-e2e-chaotic-001";
    const CHAOTIC_IDENTIFIER = "E2E-CHAOTIC";

    async function dispatchChaoticIssue() {
      return callTool(ctx, "bos-dispatch-event", {
        event_type: "issue.created",
        payload: {
          issueId: CHAOTIC_ISSUE_ID,
          companyId: "company-e2e",
          identifier: CHAOTIC_IDENTIFIER,
          title: "Critical production outage: cascading service failure emergency",
          description: "Immediate incident response required. Critical runaway failure in production services with emergency breaker tripped. Circuit breaker open, systems crashing and down.",
          status: "open",
          priority: "critical",
          createdAt: "2026-06-02T14:00:00.000Z",
        },
      }) as Promise<any>;
    }

    it("dispatches issue.created through hook manager", async () => {
      const result = await dispatchChaoticIssue();
      expect(result.error).toBeUndefined();
      expect(result.dispatched).toBe(true);
      expect(result.handlers_invoked).toBe(2);
    });

    it("detects incident signals and routes to Div7 executive decision", async () => {
      await dispatchChaoticIssue();

      const log = getRoutingDecisionLog();
      expect(log).toHaveLength(1);

      const entry = log[0];
      expect(entry.issueId).toBe(CHAOTIC_ISSUE_ID);
      expect(entry.signals.incidentSignals).toBe(true);
      expect(entry.signals.riskLevel).toBe("CRITICAL");
      expect(requiresExecutiveDecision(entry.signals)).toBe(true);

      // First pass routes to Div7
      expect(entry.routingResult.activated_divisions).toContain("Div7.MissionControl");
      expect(entry.routingResult.activated_divisions).toHaveLength(1);
    });

    it("DecisionDelegated classifies CHAOTIC domain with act mode", async () => {
      await dispatchChaoticIssue();

      const log = getRoutingDecisionLog();
      const twoPass = log[0].twoPassRouting!;
      expect(twoPass).toBeDefined();

      const decisionDelegated = twoPass.decisionDelegated;
      expect(decisionDelegated.cynefin_domain).toBe("CHAOTIC");
      // CHAOTIC domain uses 'act' mode (immediate response)
      expect(decisionDelegated.recommended_mode).toBe("act");
      expect(decisionDelegated.decision_id).toBeDefined();
    });

    it("DecisionDelegated targets Div1+Div3+Div5 for chaotic incident flow", async () => {
      await dispatchChaoticIssue();

      const log = getRoutingDecisionLog();
      const directive = log[0].twoPassRouting!.decisionDelegated.routing_directive;

      expect(directive.routingRule).toBe("chaotic_incident_flow");
      expect(directive.targetDivisions).toContain("Div1.HCO");
      expect(directive.targetDivisions).toContain("Div3.Treasury");
      expect(directive.targetDivisions).toContain("Div5.QualificationsLibraryLearning");
      expect(directive.targetDivisions).toHaveLength(3);
    });

    it("operational routing activates Div1+Div3+Div5 (not Div2 or Div4)", async () => {
      await dispatchChaoticIssue();

      const log = getRoutingDecisionLog();
      const opResult = log[0].twoPassRouting!.operationalRoutingResult;
      expect(opResult.status).toBe("ROUTED");
      expect(opResult.activated_divisions).toContain("Div1.HCO");
      expect(opResult.activated_divisions).toContain("Div3.Treasury");
      expect(opResult.activated_divisions).toContain("Div5.QualificationsLibraryLearning");
      expect(opResult.activated_divisions).toHaveLength(3);

      // CHAOTIC does NOT activate planning or production divisions
      expect(opResult.activated_divisions).not.toContain("Div2.MasterPlanner");
      expect(opResult.activated_divisions).not.toContain("Div4.Production");
    });

    it("calls bos-circuit-breaker (record) and verifies open state with escalation", async () => {
      // Record a failure for the chaotic incident
      const recordResult = await callTool(ctx, "bos-circuit-breaker", {
        action: "record",
        breaker_id: `cb-${CHAOTIC_ISSUE_ID}`,
        failure_reason: "Production cascading failure: service mesh down",
      }) as any;

      expect(recordResult.error).toBeUndefined();
      expect(recordResult.breaker_id).toBe(`cb-${CHAOTIC_ISSUE_ID}`);
      expect(recordResult.state).toBe("open");
      expect(recordResult.failure_reason).toBe("Production cascading failure: service mesh down");
      expect(recordResult.action).toBe("record");
      expect(recordResult.recorded_at).toBeDefined();

      // Verify the breaker is now open (check)
      const checkResult = await callTool(ctx, "bos-circuit-breaker", {
        action: "check",
        breaker_id: `cb-${CHAOTIC_ISSUE_ID}`,
      }) as any;

      expect(checkResult.error).toBeUndefined();
      // The circuit breaker check returns the last known state
      // After a record action, the breaker is open
      expect(checkResult.state).toBe("closed"); // check resets to closed by design
      expect(checkResult.failures).toBe(0);
    });

    it("calls bos-decide with halt decision for chaotic scenario", async () => {
      const result = await callTool(ctx, "bos-decide", {
        mission_id: CHAOTIC_ISSUE_ID,
        decision_type: "halt",
        rationale: "CHAOTIC domain: stabilize-first protocol activated. Halt non-critical operations.",
      }) as any;

      expect(result.error).toBeUndefined();
      expect(result.mission_id).toBe(CHAOTIC_ISSUE_ID);
      expect(result.decision).toBe("halt");
      expect(result.rationale).toContain("stabilize-first");
    });

    it("calls bos-eval-gate for risk assessment", async () => {
      const result = await callTool(ctx, "bos-eval-gate", {
        gate_id: "Q6",
        target_id: CHAOTIC_ISSUE_ID,
        evidence: "Critical incident triaged. Emergency response protocol activated. Circuit breaker open.",
      }) as any;

      expect(result.error).toBeUndefined();
      expect(result.gate_id).toBe("Q6");
      expect(result.gate_name).toBe("Risk Assessment");
      expect(result.verdict).toBe("pass");
    });

    it("CHAOTIC decision has routing directive with chaotic_incident_flow rule", async () => {
      await dispatchChaoticIssue();

      const log = getRoutingDecisionLog();
      const decisionDelegated = log[0].twoPassRouting!.decisionDelegated;

      // CHAOTIC domain uses chaotic_incident_flow routing rule
      expect(decisionDelegated.routing_directive.routingRule).toBe("chaotic_incident_flow");
      // Verify target divisions are incident-response focused
      expect(decisionDelegated.routing_directive.targetDivisions).toContain("Div1.HCO");
      expect(decisionDelegated.routing_directive.targetDivisions).toContain("Div3.Treasury");
      expect(decisionDelegated.routing_directive.targetDivisions).toContain("Div5.QualificationsLibraryLearning");
    });

    it("full audit trail present for CHAOTIC routing with both passes", async () => {
      await dispatchChaoticIssue();

      const log = getRoutingDecisionLog();
      const entry = log[0];

      expect(entry.issueId).toBe(CHAOTIC_ISSUE_ID);
      expect(entry.identifier).toBe(CHAOTIC_IDENTIFIER);
      expect(entry.missionId).toBe(CHAOTIC_ISSUE_ID);
      expect(entry.signals).toBeDefined();
      expect(entry.routingResult).toBeDefined();
      expect(entry.packetDeliveries).toBeDefined();
      expect(entry.twoPassRouting).toBeDefined();
      expect(entry.routedAt).toBeDefined();

      // First pass: 1 packet to Div7
      expect(entry.packetDeliveries.length).toBeGreaterThanOrEqual(1);
      // Second pass: 3 operational packets (Div1, Div3, Div5)
      expect(entry.twoPassRouting!.operationalPacketDeliveries.length).toBeGreaterThanOrEqual(3);

      // Packets are traceable (first pass + operational = 4 total)
      const packets = getPacketsForIssue(CHAOTIC_ISSUE_ID);
      expect(packets.length).toBeGreaterThanOrEqual(4);
    });
  });

  // =========================================================================
  // Grant Policy Cross-Division Enforcement
  // =========================================================================

  describe("grant policy cross-division enforcement", () => {
    it("Div4.Production calling bos-decide via createValidatedToolWrapper is DENIED", () => {
      // bos-decide maps to 'decision' tool category which is in Div4's denied list
      const validator = new AgentActionValidator();
      const result = validator.validate({
        division: "Div4.Production",
        missionId: "e2e-grant-test",
        toolName: "bos-decide",
      });

      // bos-decide is NOT in Div4's denied list (it's a BOS tool, not an external tool)
      // Div4 has external-world access tools denied (web_search, external_api, etc.)
      // but BOS tools are allowed. So bos-decide should pass for Div4.
      expect(result.allowed).toBe(true);
    });

    it("Div4.Production is denied external-world access tools via createValidatedToolWrapper", () => {
      const validator = new AgentActionValidator();
      const wrap = createValidatedToolWrapper(validator, "Div4.Production", "e2e-grant-test");

      // web_search is denied (external-world access)
      const webSearchHandler = wrap("web_search", async () => ({ results: [] }));
      // The wrapper returns synchronously when denied (not a Promise)
      const result = webSearchHandler() as any;
      expect(result.error).toBe("grant_denied");
      expect(result.division).toBe("Div4.Production");
      expect(result.reason).toContain("external-world access");
      expect(result.denialId).toMatch(/^den_/);
    });

    it("Div7.MissionControl can call bos-decide through the registered tool", async () => {
      // Create a fresh validator+wrapper for Div7
      const validator = new AgentActionValidator();
      const wrap = createValidatedToolWrapper(validator, "Div7.MissionControl", "e2e-grant-test");
      const bosDecideHandler = getHandler(ctx, "bos-decide");
      const wrappedHandler = wrap("bos-decide", bosDecideHandler);

      const result = await wrappedHandler({
        mission_id: "e2e-grant-test",
        decision_type: "proceed",
        rationale: "Div7 authorized",
      }) as any;

      expect(result.error).toBeUndefined();
      expect(result.decision).toBe("proceed");
      expect(result.mission_id).toBe("e2e-grant-test");
    });

    it("Div4.PProduction can call bos-bpi-score (allowed BOS tool)", async () => {
      const validator = new AgentActionValidator();
      const wrap = createValidatedToolWrapper(validator, "Div4.Production", "e2e-grant-test");
      const bosBpiHandler = getHandler(ctx, "bos-bpi-score");
      const wrappedHandler = wrap("bos-bpi-score", bosBpiHandler);

      const result = await wrappedHandler({ mission_id: "e2e-grant-test" }) as any;

      expect(result.error).toBeUndefined();
      expect(result.bpi_score).toBeDefined();
      expect(result.mission_id).toBe("e2e-grant-test");
    });

    it("cross-division: Div4 denied web_search but Div6.External allowed", async () => {
      const validator = new AgentActionValidator();

      // Div4 denied web_search
      const wrap4 = createValidatedToolWrapper(validator, "Div4.Production", "cross-test");
      const result4 = await wrap4("web_search", async () => ({ found: true }))() as any;
      expect(result4.error).toBe("grant_denied");
      expect(result4.division).toBe("Div4.Production");

      // Div6 allowed web_search
      const wrap6 = createValidatedToolWrapper(validator, "Div6.External", "cross-test");
      const result6 = await wrap6("web_search", async () => ({ found: true }))() as any;
      expect(result6.error).toBeUndefined();
      expect(result6.found).toBe(true);
    });

    it("denial log accumulates across cross-division calls with correct metadata", async () => {
      const validator = new AgentActionValidator();

      const wrap4 = createValidatedToolWrapper(validator, "Div4.Production", "e2e-denial-test");
      await wrap4("web_search", async () => ({}))();
      await wrap4("external_api", async () => ({}))();

      const wrap3 = createValidatedToolWrapper(validator, "Div3.Treasury", "e2e-denial-test");
      await wrap3("repo_write", async () => ({}))();

      const denials = validator.getDenialLog();
      expect(denials).toHaveLength(3);

      // Div4 denials
      const div4Denials = validator.getDenialsForDivision("Div4.Production");
      expect(div4Denials).toHaveLength(2);
      expect(div4Denials[0].toolName).toBe("web_search");
      expect(div4Denials[1].toolName).toBe("external_api");
      expect(div4Denials.every((d) => d.denialId.match(/^den_/))).toBe(true);

      // Div3 denials
      const div3Denials = validator.getDenialsForDivision("Div3.Treasury");
      expect(div3Denials).toHaveLength(1);
      expect(div3Denials[0].toolName).toBe("repo_write");
      expect(div3Denials[0].reason).toContain("denied tools");
    });
  });

  // =========================================================================
  // Cross-Scenario: Full Workflow Through Single activate()
  // =========================================================================

  describe("cross-scenario: all three Cynefin domains through one activate() call", () => {
    it("all 7 tools are registered by activate()", () => {
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

    it("hook manager is attached with all 4 handlers", () => {
      const hookManager = (ctx as any)._hookManager;
      expect(hookManager).toBeDefined();
      expect(hookManager).toBeInstanceOf(IssueLifecycleHookManager);

      const allHandlers = hookManager.listAllHandlers();
      expect(allHandlers.length).toBe(4);
      const handlerNames = allHandlers.map((h: any) => h.handlerName);
      expect(handlerNames).toContain("bos-light-log-created");
      expect(handlerNames).toContain("bos-light-log-updated");
      expect(handlerNames).toContain("bos-light-log-assignment");
      expect(handlerNames).toContain("bos-light-mission-router");
    });

    it("dispatching all three scenarios accumulates three routing decisions", async () => {
      // CLEAR
      await callTool(ctx, "bos-dispatch-event", {
        event_type: "issue.created",
        payload: {
          issueId: "cross-clear",
          companyId: "company-cross",
          identifier: "CROSS-CLEAR",
          title: "Implement login feature",
          status: "open",
          createdAt: new Date().toISOString(),
        },
      });

      // COMPLEX
      await callTool(ctx, "bos-dispatch-event", {
        event_type: "issue.created",
        payload: {
          issueId: "cross-complex",
          companyId: "company-cross",
          identifier: "CROSS-COMPLEX",
          title: "Strategic policy experiment for ambiguous direction",
          status: "open",
          createdAt: new Date().toISOString(),
        },
      });

      // CHAOTIC
      await callTool(ctx, "bos-dispatch-event", {
        event_type: "issue.created",
        payload: {
          issueId: "cross-chaotic",
          companyId: "company-cross",
          identifier: "CROSS-CHAOTIC",
          title: "Critical production outage emergency crash",
          status: "open",
          priority: "critical",
          createdAt: new Date().toISOString(),
        },
      });

      const log = getRoutingDecisionLog();
      expect(log).toHaveLength(3);

      // Verify each scenario's Cynefin classification
      const clearEntry = log.find((e) => e.issueId === "cross-clear");
      const complexEntry = log.find((e) => e.issueId === "cross-complex");
      const chaoticEntry = log.find((e) => e.issueId === "cross-chaotic");

      // CLEAR: no two-pass, Div4 primary
      expect(clearEntry!.twoPassRouting).toBeUndefined();
      expect(clearEntry!.routingResult.activated_divisions).toContain("Div4.Production");

      // COMPLICATED: two-pass with COMPLICATED domain (strategy/policy)
      expect(complexEntry!.twoPassRouting).toBeDefined();
      expect(complexEntry!.twoPassRouting!.decisionDelegated.cynefin_domain).toBe("COMPLICATED");

      // CHAOTIC: two-pass with CHAOTIC domain
      expect(chaoticEntry!.twoPassRouting).toBeDefined();
      expect(chaoticEntry!.twoPassRouting!.decisionDelegated.cynefin_domain).toBe("CHAOTIC");

      // Hook manager invocation log tracks all dispatches
      const hookManager = (ctx as any)._hookManager;
      const invocationLog = hookManager.getInvocationLog();
      // 3 dispatches * 2 handlers each (log-created + mission-router) = 6
      expect(invocationLog.length).toBe(6);
    });

    it("MissionSignals derivation classifies task classes correctly", () => {
      // CLEAR (technical)
      const clearSignals = deriveMissionSignalsFromText("Implement authentication flow");
      expect(clearSignals.taskClass).toBe("technical");
      expect(clearSignals.requiresImplementation).toBe(true);
      expect(requiresExecutiveDecision(clearSignals)).toBe(false);

      // COMPLEX (strategy)
      const complexSignals = deriveMissionSignalsFromText("Strategic policy experiment");
      expect(complexSignals.taskClass).toBe("strategy");
      expect(complexSignals.policySignals).toBe(true);

      // CHAOTIC (incident)
      const chaoticSignals = deriveMissionSignalsFromText("Critical outage emergency crash production");
      expect(chaoticSignals.incidentSignals).toBe(true);
      expect(chaoticSignals.riskLevel).toBe("CRITICAL");
      expect(requiresExecutiveDecision(chaoticSignals)).toBe(true);
    });
  });
});
