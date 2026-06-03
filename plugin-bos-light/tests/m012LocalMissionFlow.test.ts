/**
 * M012-S03/T02: Validate generated local seven-division mission flow
 * against existing BOS Light plugin contracts.
 *
 * This test suite exercises the plugin's routing, grant, HITL, branch policy,
 * and QA contracts using M012-shaped fixtures. It proves the generated flow
 * respects the plugin's local logic without claiming Hermes or plugin runtime
 * execution.
 *
 * Contracts validated:
 * - Div7 decision + Div1 two-pass routing (missionRouter.ts)
 * - Div3 grant policy (grantPolicy.ts)
 * - HITL branch policy enforcement (hitlGovernance.ts)
 * - Div5 QA review / eval gate contracts (qaReview.ts, evalGates.ts)
 * - Owner boundary enforcement (ownerBoundary.ts)
 * - Division packet router (divisionPacketRouter.ts)
 * - Decision delegation from Div7 to Div1 (decision.ts)
 */

import { describe, expect, it, beforeEach } from "vitest";
import { decide, isPolicyOnlyDecision, createDecisionDelegated, delegateDecisionToDiv1 } from "../src/decision";
import { routeApprovedMission, routeAfterDecision, requiresExecutiveDecision } from "../src/missionRouter";
import { validateGrantRequest } from "../src/grantPolicy";
import { HITLGovernance } from "../src/hitlGovernance";
import { reviewDiff, runEvalGate, isApprovedForMerge, QAReview } from "../src/qaReview";
import { runEvalGates } from "../src/evalGates";
import { enforceOwnerBoundary, isDiv7MissionControl } from "../src/ownerBoundary";
import { emitDivisionPacket, getDivisionInbox, peekDivisionInbox, clearPacketRouter } from "../src/divisionPacketRouter";
import { InMemoryPaperclipAdapter } from "../src/paperclipAdapter";
import { deriveMissionSignals, requiresExecutiveDecision as signalsRequiresExecutiveDecision } from "../src/missionSignals";
import type {
  Division,
  DecisionMetadata,
  DecisionRiskTier,
  DecisionResult,
  GrantRequest,
  GrantDecision,
  RoutingDecisionPacket,
  DecisionDelegatedPayload,
} from "../src/contracts";
import type { MissionEnvelope } from "../src/missionIntake";
import type { GitCommandEvidence } from "../src/gitOperations";

const NOW = "2026-06-03T00:00:00.000Z";

// ── M012-style mission fixtures ──

const M012_MISSION: MissionEnvelope = {
  schema_version: "1.0",
  mission_id: "m012_s03_test_mission",
  title: "Local Seven Division Mission Flow for BOS Chimera Paperclip Handoff",
  description: "Run the BOS Light mission flow locally against the live mission anchor and produce auditable artifacts without pretending Hermes or plugin runtime execution worked.",
  business_goal: "Explore opportunity or address technical debt",
  risk_level: "MEDIUM",
  requested_divisions: [
    "Div7.MissionControl",
    "Div1.HCO",
    "Div2.MasterPlanner",
    "Div3.Treasury",
    "Div4.Production",
    "Div5.QualificationsLibraryLearning",
  ],
  status: "APPROVED",
  created_at: NOW,
  updated_at: NOW,
};

const M012_ROUTINE_MISSION: MissionEnvelope = {
  ...M012_MISSION,
  mission_id: "m012_s03_routine_mission",
  title: "Standard local implementation task",
  description: "Routine build and verify a local feature implementation",
  risk_level: "LOW",
  requested_divisions: [
    "Div2.MasterPlanner",
    "Div4.Production",
    "Div5.QualificationsLibraryLearning",
  ],
};

const M012_INCIDENT_MISSION: MissionEnvelope = {
  ...M012_MISSION,
  mission_id: "m012_s03_incident_mission",
  title: "Emergency outage circuit breaker triggered",
  description: "Critical incident with runaway failure requiring immediate stabilization",
  risk_level: "CRITICAL",
  requested_divisions: [
    "Div7.MissionControl",
    "Div1.HCO",
    "Div3.Treasury",
    "Div5.QualificationsLibraryLearning",
  ],
};

function makeGitEvidence(overrides: Partial<GitCommandEvidence> = {}): GitCommandEvidence {
  return {
    command: "git",
    args: [],
    cwd: "/tmp/repo",
    env_keys: [],
    exit_code: 0,
    stdout_hash: "abc",
    stderr_hash: "def",
    duration_ms: 100,
    success: true,
    error_category: "none",
    redacted_diagnostics: "",
    ...overrides,
  };
}

beforeEach(() => {
  clearPacketRouter();
});

/** Type guard: true when the routing result is unauthorized. */
function isUnauthorized(result: ReturnType<typeof routeApprovedMission>): result is Extract<ReturnType<typeof routeApprovedMission>, { authorized: false }> {
  return "authorized" in result && result.authorized === false;
}

// ── Div7 Decision Contract ──

describe("M012 flow: Div7 decision contract", () => {
  it("produces a valid DecisionResult for local mission signals", () => {
    const result = decide({
      issue_id: "m012_s03_test_mission",
      signals: ["local seven division flow", "implementation", "build", "code"],
      confidence: 0.75,
      now: NOW,
    });

    expect(result).toMatchObject({
      schema_version: "1.0",
      accepted: true,
      issue_id: "m012_s03_test_mission",
      decided_by: "Div7.MissionControl",
      decided_at: NOW,
      diagnostics: { sanitized: true },
    });
    if (!result.accepted) throw new Error("expected accepted decision");
    expect(result.decision_id).toBeTruthy();
    expect(result.record_markdown).toContain("# BOS Decision Record");
    expect(result.record_markdown).toContain("m012_s03_test_mission");
  });

  it("rejects a decision with empty signals", () => {
    const result = decide({
      issue_id: "m012_s03_test_mission",
      signals: [],
      now: NOW,
    });

    expect(result.accepted).toBe(false);
    if (result.accepted) throw new Error("expected rejected decision");
    expect(result.error).toBe("invalid_decision_input");
    expect(result.diagnostics.validation_errors.length).toBeGreaterThan(0);
  });

  it("rejects a decision with unsafe issue_id", () => {
    const result = decide({
      issue_id: "../../../etc/passwd",
      signals: ["routine batch approve"],
      now: NOW,
    });

    expect(result.accepted).toBe(false);
  });

  it("classifies chaotic incident signals as CHAOTIC domain with CRITICAL risk", () => {
    const result = decide({
      issue_id: "m012_s03_incident",
      signals: ["outage", "critical", "runaway", "circuit breaker triggered", "emergency down"],
      confidence: 0.5,
      now: NOW,
    });

    expect(result.accepted).toBe(true);
    if (!result.accepted) throw new Error("expected accepted decision");
    expect(result.cynefin_domain).toBe("CHAOTIC");
    expect(result.risk_tier).toBe("CRITICAL");
    expect(result.decision_type).toBe("SELF_HEALING");
    expect(result.record_detail).toBe("expanded");
    expect(result.ooda).toBeDefined();
  });

  it("classifies routine batch approval as CLEAR with LOW risk", () => {
    const result = decide({
      issue_id: "m012_s03_routine",
      signals: ["routine batch approve standard known playbook repeatable"],
      confidence: 0.9,
      now: NOW,
    });

    expect(result.accepted).toBe(true);
    if (!result.accepted) throw new Error("expected accepted decision");
    expect(result.cynefin_domain).toBe("CLEAR");
    expect(result.risk_tier).toBe("LOW");
    expect(result.record_detail).toBe("compact");
    expect(result.ooda).toBeUndefined();
  });

  it("isPolicyOnlyDecision returns true only for CLEAR/LOW/BATCH_APPROVAL", () => {
    const policyOnlyDecision: DecisionMetadata = {
      schema_version: "1.0",
      accepted: true,
      decision_id: "decision_test",
      issue_id: "m012_s03_test",
      cynefin_domain: "CLEAR",
      confidence: 0.9,
      risk_tier: "LOW",
      record_detail: "compact",
      decision_type: "BATCH_APPROVAL",
      emitted_events: [],
      recommended_action: "Use Betting Table.",
      decided_by: "Div7.MissionControl",
      decided_at: NOW,
      diagnostics: {
        domain_evidence: [],
        selected_domain_reasons: [],
        risk_reasons: [],
        validation_errors: [],
        uncertainty_reasons: [],
        sanitized: true,
      },
      record_markdown: "",
    };

    expect(isPolicyOnlyDecision(policyOnlyDecision)).toBe(true);

    const operationalDecision: DecisionMetadata = { ...policyOnlyDecision, cynefin_domain: "COMPLEX", risk_tier: "HIGH", decision_type: "EXPERIMENT" };
    expect(isPolicyOnlyDecision(operationalDecision)).toBe(false);
  });
});

// ── Decision Delegation (Div7 → Div1) ──

describe("M012 flow: decision delegation from Div7 to Div1", () => {
  it("createDecisionDelegated produces a valid payload with routing directive", () => {
    const decision: DecisionMetadata = {
      schema_version: "1.0",
      accepted: true,
      decision_id: "decision_m012_complex",
      issue_id: "m012_s03_test_mission",
      cynefin_domain: "COMPLEX",
      confidence: 0.7,
      risk_tier: "HIGH",
      record_detail: "expanded",
      decision_type: "EXPERIMENT",
      emitted_events: [],
      recommended_action: "Probe with small safe-to-fail experiments.",
      decided_by: "Div7.MissionControl",
      decided_at: NOW,
      diagnostics: {
        domain_evidence: [],
        selected_domain_reasons: ["safe-to-fail probes"],
        risk_reasons: ["safe-to-fail probes are needed"],
        validation_errors: [],
        uncertainty_reasons: [],
        sanitized: true,
      },
      record_markdown: "",
    };

    const payload = createDecisionDelegated(decision);

    expect(payload).toMatchObject({
      schema_version: "1.0",
      decision_id: "decision_m012_complex",
      cynefin_domain: "COMPLEX",
      recommended_mode: "SAFE_TO_FAIL_EXPERIMENT",
      // HIGH risk + COMPLEX domain escalates per escalationLevelFor()
      escalation_level: "escalate",
    });
    expect(payload.routing_directive.targetDivisions).toContain("Div2.MasterPlanner");
    expect(payload.routing_directive.targetDivisions).toContain("Div3.Treasury");
    expect(payload.routing_directive.targetDivisions).toContain("Div4.Production");
    expect(payload.routing_directive.targetDivisions).toContain("Div5.QualificationsLibraryLearning");
    expect(payload.routing_directive.requiresBudgetGrant).toBe(true);
    expect(payload.routing_directive.requiresQA).toBe(true);
    expect(payload.required_followup_divisions).toEqual(payload.routing_directive.targetDivisions);
  });

  it("delegateDecisionToDiv1 skips emission for policy-only decisions", () => {
    const policyDecision: DecisionMetadata = {
      schema_version: "1.0",
      accepted: true,
      decision_id: "decision_m012_policy",
      issue_id: "m012_s03_test_mission",
      cynefin_domain: "CLEAR",
      confidence: 0.9,
      risk_tier: "LOW",
      record_detail: "compact",
      decision_type: "BATCH_APPROVAL",
      emitted_events: [],
      recommended_action: "Use Betting Table.",
      decided_by: "Div7.MissionControl",
      decided_at: NOW,
      diagnostics: {
        domain_evidence: [],
        selected_domain_reasons: [],
        risk_reasons: [],
        validation_errors: [],
        uncertainty_reasons: [],
        sanitized: true,
      },
      record_markdown: "",
    };

    const result = delegateDecisionToDiv1(policyDecision);
    expect(result).toBeNull();
  });

  it("delegateDecisionToDiv1 emits a decision_delegated packet for operational decisions", () => {
    const decision: DecisionMetadata = {
      schema_version: "1.0",
      accepted: true,
      decision_id: "decision_m012_operational",
      issue_id: "m012_s03_test_mission",
      cynefin_domain: "COMPLICATED",
      confidence: 0.7,
      risk_tier: "MEDIUM",
      record_detail: "expanded",
      decision_type: "POLICY_UPDATE",
      emitted_events: [],
      recommended_action: "Review expert constraints.",
      decided_by: "Div7.MissionControl",
      decided_at: NOW,
      diagnostics: {
        domain_evidence: [],
        selected_domain_reasons: ["expert review"],
        risk_reasons: ["expert or policy review required"],
        validation_errors: [],
        uncertainty_reasons: [],
        sanitized: true,
      },
      record_markdown: "",
    };

    const result = delegateDecisionToDiv1(decision);
    expect(result).not.toBeNull();
    expect(result!.payload.decision_id).toBe("decision_m012_operational");
    expect(result!.payload.cynefin_domain).toBe("COMPLICATED");
    expect(result!.diagnostic.emitted).toBe(true);
    expect(result!.diagnostic.routed_to).toBe("Div1.HCO");

    // Verify packet landed in Div1's inbox
    const inbox = getDivisionInbox("Div1.HCO");
    const delegatedPackets = inbox.filter((p) => p.packet_type === "decision_delegated");
    expect(delegatedPackets.length).toBeGreaterThanOrEqual(1);
    const lastPacket = delegatedPackets[delegatedPackets.length - 1];
    expect(lastPacket.from_division).toBe("Div7.MissionControl");
    expect(lastPacket.to_division).toBe("Div1.HCO");
  });

  it("delegateDecisionToDiv1 returns null for rejected decisions", () => {
    const rejectedDecision: DecisionResult = {
      schema_version: "1.0",
      accepted: false,
      error: "invalid_decision_input",
      issue_id: "m012_s03_test_mission",
      decided_by: "Div7.MissionControl",
      decided_at: NOW,
      diagnostics: { validation_errors: ["test"], sanitized: true },
    };

    const result = delegateDecisionToDiv1(rejectedDecision);
    expect(result).toBeNull();
  });
});

// ── Div1 Two-Pass Mission Routing ──

describe("M012 flow: Div1 mission routing contracts", () => {
  it("requiresExecutiveDecision returns true for missions with incident signals", () => {
    expect(requiresExecutiveDecision(M012_INCIDENT_MISSION)).toBe(true);
  });

  it("requiresExecutiveDecision returns false for routine missions without Div7", () => {
    expect(requiresExecutiveDecision(M012_ROUTINE_MISSION)).toBe(false);
  });

  it("requiresExecutiveDecision returns true when Div7 is explicitly requested", () => {
    const missionWithDiv7: MissionEnvelope = {
      ...M012_ROUTINE_MISSION,
      requested_divisions: [
        "Div7.MissionControl",
        "Div2.MasterPlanner",
        "Div4.Production",
      ],
    };
    expect(requiresExecutiveDecision(missionWithDiv7)).toBe(true);
  });

  it("routeApprovedMission rejects non-Div1 callers", () => {
    const result = routeApprovedMission("Div2.MasterPlanner", M012_MISSION);
    if (!isUnauthorized(result)) throw new Error("expected unauthorized");
    expect(result.required_role).toBe("Div1.HCO");
    expect(result.caller).toBe("Div2.MasterPlanner");
  });

  it("routeApprovedMission routes routine missions directly without Div7", () => {
    const result = routeApprovedMission("Div1.HCO", M012_ROUTINE_MISSION);
    if (isUnauthorized(result)) throw new Error("expected authorized routing");
    expect(result.status).toBe("ROUTED");
    expect(result.activated_divisions).toContain("Div2.MasterPlanner");
    expect(result.activated_divisions).toContain("Div4.Production");
    expect(result.activated_divisions).toContain("Div5.QualificationsLibraryLearning");
    // Div1 and Div7 should be excluded from operational routing
    expect(result.excluded_divisions).toContain("Div1.HCO");
    expect(result.excluded_divisions).toContain("Div7.MissionControl");
    expect(result.current_division).not.toBe("Div1.HCO");
    expect(result.current_division).not.toBe("Div7.MissionControl");
  });

  it("routeApprovedMission routes to Div7 for executive decision when mission has incident signals", () => {
    const result = routeApprovedMission("Div1.HCO", M012_INCIDENT_MISSION);
    if (isUnauthorized(result)) throw new Error("expected authorized routing");
    expect(result.status).toBe("ROUTED");
    expect(result.activated_divisions).toContain("Div7.MissionControl");
    expect(result.current_division).toBe("Div7.MissionControl");
    expect(result.excluded_divisions).toContain("Div1.HCO");
  });

  it("routeAfterDecision applies operational routing based on cynefin domain", () => {
    const complexDecision: DecisionDelegatedPayload = {
      schema_version: "1.0",
      decision_id: "decision_m012_complex",
      cynefin_domain: "COMPLEX",
      recommended_mode: "SAFE_TO_FAIL_EXPERIMENT",
      routing_directive: {
        targetDivisions: ["Div2.MasterPlanner", "Div3.Treasury", "Div4.Production", "Div5.QualificationsLibraryLearning"],
        routingRule: "complex_safe_to_fail",
        requiresBudgetGrant: true,
        requiresQA: true,
        requiresQuarantine: false,
        requiresHumanApproval: false,
      },
      constraints: ["safe-to-fail probes needed"],
      required_followup_divisions: ["Div2.MasterPlanner", "Div3.Treasury", "Div4.Production", "Div5.QualificationsLibraryLearning"],
      escalation_level: "monitor",
    };

    const result = routeAfterDecision("Div1.HCO", "m012_s03_test_mission", complexDecision);
    if (isUnauthorized(result)) throw new Error("expected authorized routing");
    expect(result.status).toBe("ROUTED");
    expect(result.activated_divisions).toEqual(
      expect.arrayContaining(["Div2.MasterPlanner", "Div3.Treasury", "Div4.Production", "Div5.QualificationsLibraryLearning"])
    );
    expect(result.excluded_divisions).toContain("Div1.HCO");
    expect(result.excluded_divisions).toContain("Div7.MissionControl");
  });

  it("routeAfterDecision rejects non-Div1 callers", () => {
    const decision: DecisionDelegatedPayload = {
      schema_version: "1.0",
      decision_id: "decision_test",
      cynefin_domain: "COMPLICATED",
      recommended_mode: "EXPERT_REVIEW",
      routing_directive: {
        targetDivisions: ["Div2.MasterPlanner"],
        routingRule: "complicated_expert_review",
        requiresBudgetGrant: false,
        requiresQA: true,
        requiresQuarantine: false,
        requiresHumanApproval: false,
      },
      constraints: [],
      required_followup_divisions: ["Div2.MasterPlanner"],
      escalation_level: "none",
    };

    const result = routeAfterDecision("Div4.Production", "m012_s03_test_mission", decision);
    if (!isUnauthorized(result)) throw new Error("expected unauthorized");
  });

  it("CHAOTIC decision routes to Div1, Div3, and Div5 (not Div2 or Div4)", () => {
    const chaoticDecision: DecisionDelegatedPayload = {
      schema_version: "1.0",
      decision_id: "decision_m012_chaotic",
      cynefin_domain: "CHAOTIC",
      recommended_mode: "STABILIZE_FIRST",
      routing_directive: {
        targetDivisions: ["Div1.HCO", "Div3.Treasury", "Div5.QualificationsLibraryLearning"],
        routingRule: "chaotic_incident_flow",
        requiresBudgetGrant: false,
        requiresQA: true,
        requiresQuarantine: false,
        requiresHumanApproval: false,
      },
      constraints: ["active incident"],
      required_followup_divisions: ["Div1.HCO", "Div3.Treasury", "Div5.QualificationsLibraryLearning"],
      escalation_level: "critical",
    };

    const result = routeAfterDecision("Div1.HCO", "m012_s03_test_mission", chaoticDecision);
    if (isUnauthorized(result)) throw new Error("expected authorized routing");
    expect(result.activated_divisions).toContain("Div1.HCO");
    expect(result.activated_divisions).toContain("Div3.Treasury");
    expect(result.activated_divisions).toContain("Div5.QualificationsLibraryLearning");
    expect(result.activated_divisions).not.toContain("Div2.MasterPlanner");
    expect(result.activated_divisions).not.toContain("Div4.Production");
  });
});

// ── Mission Signals ──

describe("M012 flow: mission signals contract", () => {
  it("derives correct signals for the M012 mission envelope", () => {
    const signals = deriveMissionSignals(M012_MISSION);

    // "auditable" in description matches "audit" compliance keyword before technical keywords
    expect(signals.taskClass).toBe("compliance");
    expect(signals.requiresImplementation).toBe(true);
    expect(signals.requiresQA).toBe(true);
    expect(signals.requiresBudgetOrAccess).toBe(true);
    expect(signals.riskLevel).toBe("MEDIUM");
    expect(signals.requestedDivisions).toContain("Div7.MissionControl");
  });

  it("detects incident signals in the incident mission", () => {
    const signals = deriveMissionSignals(M012_INCIDENT_MISSION);

    expect(signals.incidentSignals).toBe(true);
    expect(signals.riskLevel).toBe("CRITICAL");
    expect(signalsRequiresExecutiveDecision(signals)).toBe(true);
  });

  it("does not require executive decision for routine technical work", () => {
    const signals = deriveMissionSignals(M012_ROUTINE_MISSION);

    expect(signals.incidentSignals).toBe(false);
    expect(signals.policySignals).toBe(false);
    expect(signals.ambiguityLevel).toBe("low");
    expect(signalsRequiresExecutiveDecision(signals)).toBe(false);
  });
});

// ── Div3 Grant Policy ──

describe("M012 flow: Div3 grant policy contract", () => {
  function makeGrantRequest(overrides: Partial<GrantRequest> = {}): GrantRequest {
    return {
      schema_version: "1.0",
      requested_by: "Div1.HCO",
      target_division: "Div4.Production",
      mission_id: "m012_s03_test_mission",
      purpose: "Local production work for seven-division flow",
      requested_tools: ["repo_read", "repo_write", "test_runner", "build"],
      requested_secrets: [],
      estimated_cost: 50000,
      risk_level: "MEDIUM",
      ttl_minutes: 240,
      requested_at: NOW,
      ...overrides,
    };
  }

  it("auto-approves Div4 production grant within limits", () => {
    const request = makeGrantRequest();
    const decision = validateGrantRequest(request);

    expect(decision.status).toBe("approved");
    expect(decision.decided_by).toBe("Div3.Treasury");
    if (decision.status !== "approved") throw new Error("expected approved");
    expect(decision.allowed_tools).toContain("repo_read");
    expect(decision.allowed_tools).toContain("repo_write");
    expect(decision.allowed_tools).toContain("test_runner");
    expect(decision.token_cap).toBe(50000);
  });

  it("denies external tools to non-Div6 divisions", () => {
    const request = makeGrantRequest({
      target_division: "Div4.Production",
      requested_tools: ["repo_read", "web_search", "external_api"],
    });
    const decision = validateGrantRequest(request);

    expect(decision.status).toBe("denied");
    if (decision.status !== "denied") throw new Error("expected denied");
    expect(decision.reason).toContain("external-world access");
    expect(decision.required_route).toContain("Div6.External");
  });

  it("escalates cost above human approval limit to HumanOwner", () => {
    const request = makeGrantRequest({
      estimated_cost: 600_000,
    });
    const decision = validateGrantRequest(request);

    expect(decision.status).toBe("escalate");
    if (decision.status !== "escalate") throw new Error("expected escalation");
    expect(decision.escalation_target).toBe("HumanOwner");
  });

  it("escalates cost above auto-approve limit to Div1.HCO", () => {
    const request = makeGrantRequest({
      estimated_cost: 200_000,
    });
    const decision = validateGrantRequest(request);

    expect(decision.status).toBe("escalate");
    if (decision.status !== "escalate") throw new Error("expected escalation");
    expect(decision.escalation_target).toBe("Div1.HCO");
  });

  it("denies TTL exceeding maximum", () => {
    const request = makeGrantRequest({
      ttl_minutes: 600,
    });
    const decision = validateGrantRequest(request);

    expect(decision.status).toBe("denied");
    if (decision.status !== "denied") throw new Error("expected denied");
    expect(decision.reason).toContain("TTL");
  });

  it("denies forbidden tools for the target division", () => {
    const request = makeGrantRequest({
      target_division: "Div5.QualificationsLibraryLearning",
      requested_tools: ["quarantine", "verification", "repo_write"],
    });
    const decision = validateGrantRequest(request);

    expect(decision.status).toBe("denied");
    if (decision.status !== "denied") throw new Error("expected denied");
    expect(decision.reason).toContain("repo_write");
  });

  it("escalates CRITICAL risk regardless of cost", () => {
    const request = makeGrantRequest({
      estimated_cost: 1000,
      risk_level: "CRITICAL",
    });
    const decision = validateGrantRequest(request);

    expect(decision.status).toBe("escalate");
    if (decision.status !== "escalate") throw new Error("expected escalation");
    expect(decision.escalation_target).toBe("Div7.MissionControl");
  });

  it("approves Div5 QA tools within limits", () => {
    const request = makeGrantRequest({
      target_division: "Div5.QualificationsLibraryLearning",
      requested_tools: ["quarantine", "verification", "scanning"],
      estimated_cost: 30000,
    });
    const decision = validateGrantRequest(request);

    expect(decision.status).toBe("approved");
  });

  it("approves Div6 external tools (external access is allowed for Div6)", () => {
    const request = makeGrantRequest({
      target_division: "Div6.External",
      requested_tools: ["web_search", "external_api", "git_gateway", "fetch"],
      estimated_cost: 30000,
    });
    const decision = validateGrantRequest(request);

    expect(decision.status).toBe("approved");
    if (decision.status !== "approved") throw new Error("expected approved");
    expect(decision.allowed_tools).toEqual(expect.arrayContaining(["web_search", "external_api"]));
  });
});

// ── HITL Branch Policy ──

describe("M012 flow: HITL branch policy contract", () => {
  function makeHITL(): HITLGovernance {
    return new HITLGovernance(new InMemoryPaperclipAdapter());
  }

  it("allows feature branch push following naming convention", () => {
    const hitl = makeHITL();
    const result = hitl.enforceBranchPolicy(makeGitEvidence({
      args: ["push", "origin", "feature/bos-m012_s03_test_mission"],
    }));

    expect(result.allowed).toBe(true);
    expect(result.violation).toBeUndefined();
  });

  it("blocks direct push to main branch", () => {
    const hitl = makeHITL();
    const result = hitl.enforceBranchPolicy(makeGitEvidence({
      args: ["push", "origin", "main"],
    }));

    expect(result.allowed).toBe(false);
    expect(result.violation).toBeDefined();
    expect(result.violation!.rule).toBe("direct_main_push");
  });

  it("blocks force push", () => {
    const hitl = makeHITL();
    const result = hitl.enforceBranchPolicy(makeGitEvidence({
      args: ["push", "--force", "origin", "feature/bos-test"],
    }));

    expect(result.allowed).toBe(false);
    expect(result.violation).toBeDefined();
    expect(result.violation!.rule).toBe("non_fast_forward");
  });

  it("blocks push with non-conforming branch name", () => {
    const hitl = makeHITL();
    const result = hitl.enforceBranchPolicy(makeGitEvidence({
      args: ["push", "origin", "random-branch-name"],
    }));

    expect(result.allowed).toBe(false);
    expect(result.violation).toBeDefined();
    expect(result.violation!.rule).toBe("naming_convention");
  });

  it("records blocked attempts", () => {
    const hitl = makeHITL();

    hitl.enforceBranchPolicy(makeGitEvidence({
      args: ["push", "origin", "main"],
    }));

    hitl.enforceBranchPolicy(makeGitEvidence({
      args: ["push", "--force", "origin", "feature/bos-test"],
    }));

    const blocked = hitl.getBlockedAttempts();
    expect(blocked).toHaveLength(2);
    expect(blocked[0].rule).toBe("direct_main_push");
    expect(blocked[1].rule).toBe("non_fast_forward");
  });
});

// ── Div5 QA Review Contract ──

describe("M012 flow: Div5 QA review contract", () => {
  const SAFE_DIFF = `diff --git a/src/feature.ts b/src/feature.ts
--- a/src/feature.ts
+++ b/src/feature.ts
@@ -1,3 +1,4 @@
+// New feature implementation
 export function feature() {
   return true;
 }
`;

  const DANGEROUS_DIFF = `diff --git a/src/config.ts b/src/config.ts
--- a/src/config.ts
+++ b/src/config.ts
@@ -1,3 +1,4 @@
+const password = "supersecretpassword123"
 export function config() {
   return true;
 }
`;

  it("produces a valid ReviewEnvelope from a safe diff", () => {
    const envelope = reviewDiff(SAFE_DIFF);

    expect(envelope).toMatchObject({
      schema_version: "1.0",
      reviewed_by: "Div5.QualificationsLibraryLearning",
    });
    expect(envelope.diff_hash).toBeTruthy();
    expect(envelope.files_changed).toContain("src/feature.ts");
    expect(envelope.lines_added).toBeGreaterThan(0);
    expect(envelope.security_flags).toHaveLength(0);
  });

  it("detects critical security flags in a dangerous diff", () => {
    const envelope = reviewDiff(DANGEROUS_DIFF);

    expect(envelope.security_flags.length).toBeGreaterThan(0);
    const criticalFlags = envelope.security_flags.filter((f) => f.severity === "critical");
    expect(criticalFlags.length).toBeGreaterThan(0);
    expect(criticalFlags[0].category).toBe("secret_leak");
  });

  it("isApprovedForMerge blocks on critical security flags", () => {
    const envelope = reviewDiff(DANGEROUS_DIFF);
    const criteria = [
      {
        gate_id: "LARS.Deterministic",
        description: "Output present",
        is_blocking: true,
        check: () => true,
      },
    ];
    const evalGate = runEvalGate(envelope, criteria);
    const result = { schema_version: "1.0" as const, envelope, eval_gate: evalGate, approved_for_merge: false };

    expect(isApprovedForMerge(result)).toBe(false);
  });

  it("isApprovedForMerge passes for clean diff with all gates passed", () => {
    const envelope = reviewDiff(SAFE_DIFF);
    const criteria = [
      {
        gate_id: "LARS.Deterministic",
        description: "Output present",
        is_blocking: true,
        check: () => true,
      },
    ];
    const evalGate = runEvalGate(envelope, criteria);
    const result = { schema_version: "1.0" as const, envelope, eval_gate: evalGate, approved_for_merge: false };

    expect(isApprovedForMerge(result)).toBe(true);
  });

  it("runEvalGate produces PASSED overall when all blocking gates pass", () => {
    const envelope = reviewDiff(SAFE_DIFF);
    const result = runEvalGate(envelope, [
      { gate_id: "LARS.Deterministic", description: "Output present", is_blocking: true, check: () => true },
      { gate_id: "LARS.SecurityPolicy", description: "No violations", is_blocking: true, check: () => true },
      { gate_id: "LARS.Budget", description: "Budget OK", is_blocking: false, check: () => true },
    ]);

    expect(result.overall).toBe("PASSED");
    expect(result.blocking_failure_count).toBe(0);
    expect(result.warning_count).toBe(0);
    expect(result.evaluated_by).toBe("Div5.QualificationsLibraryLearning");
  });

  it("runEvalGate produces FAILED_BLOCKING when any blocking gate fails", () => {
    const envelope = reviewDiff(SAFE_DIFF);
    const result = runEvalGate(envelope, [
      { gate_id: "LARS.Deterministic", description: "Output present", is_blocking: true, check: () => true },
      { gate_id: "LARS.SecurityPolicy", description: "Violation detected", is_blocking: true, check: () => false },
    ]);

    expect(result.overall).toBe("FAILED_BLOCKING");
    expect(result.blocking_failure_count).toBe(1);
  });

  it("runEvalGate produces PASSED_WITH_WARNINGS when only non-blocking gates fail", () => {
    const envelope = reviewDiff(SAFE_DIFF);
    const result = runEvalGate(envelope, [
      { gate_id: "LARS.Deterministic", description: "Output present", is_blocking: true, check: () => true },
      { gate_id: "LARS.Budget", description: "Budget warning", is_blocking: false, check: () => false },
    ]);

    expect(result.overall).toBe("PASSED_WITH_WARNINGS");
    expect(result.blocking_failure_count).toBe(0);
    expect(result.warning_count).toBe(1);
  });

  it("QAReview.fullReview produces a valid ReviewResult", () => {
    const adapter = new InMemoryPaperclipAdapter();
    const qa = new QAReview(adapter);
    const result = qa.fullReview(SAFE_DIFF, [
      { gate_id: "LARS.Deterministic", description: "Output present", is_blocking: true, check: () => true },
    ]);

    expect(result.schema_version).toBe("1.0");
    expect(result.envelope.reviewed_by).toBe("Div5.QualificationsLibraryLearning");
    expect(result.eval_gate.evaluated_by).toBe("Div5.QualificationsLibraryLearning");
    expect(result.approved_for_merge).toBe(true);
  });
});

// ── Eval Gates Contract ──

describe("M012 flow: eval gates contract", () => {
  it("runEvalGates passes when all inputs are valid", () => {
    const result = runEvalGates({
      issue_id: "m012_s03_test_mission",
      blueprintMarkdown: "# Blueprint\nContent here",
      outputMarkdown: "# Output\nDelivered work",
      toolScopeRespected: true,
      budgetWarning: false,
    });

    expect(result.schema_version).toBe("1.0");
    expect(result.overall).toBe("PASSED");
    expect(result.evaluated_by).toBe("Div5.QualificationsLibraryLearning");
    expect(result.blocking_failure_count).toBe(0);
    expect(result.issue_id).toBe("m012_s03_test_mission");
  });

  it("runEvalGates fails when output is missing", () => {
    const result = runEvalGates({
      issue_id: "m012_s03_test_mission",
      blueprintMarkdown: "# Blueprint\nContent here",
      outputMarkdown: "",
      toolScopeRespected: true,
      budgetWarning: false,
    });

    expect(result.overall).toBe("FAILED_BLOCKING");
    expect(result.blocking_failure_count).toBeGreaterThan(0);
  });

  it("runEvalGates fails blocking when tool scope is violated", () => {
    const result = runEvalGates({
      issue_id: "m012_s03_test_mission",
      blueprintMarkdown: "# Blueprint",
      outputMarkdown: "# Output",
      toolScopeRespected: false,
      budgetWarning: false,
    });

    expect(result.overall).toBe("FAILED_BLOCKING");
  });

  it("runEvalGates produces PASSED_WITH_WARNINGS for budget warning only", () => {
    const result = runEvalGates({
      issue_id: "m012_s03_test_mission",
      blueprintMarkdown: "# Blueprint",
      outputMarkdown: "# Output",
      toolScopeRespected: true,
      budgetWarning: true,
    });

    expect(result.overall).toBe("PASSED_WITH_WARNINGS");
    expect(result.warning_count).toBe(1);
    expect(result.blocking_failure_count).toBe(0);
  });
});

// ── Owner Boundary Contract ──

describe("M012 flow: owner boundary contract", () => {
  it("allows same-division access", () => {
    const result = enforceOwnerBoundary("Div4.Production", "Div4.Production");
    expect(result.authorized).toBe(true);
  });

  it("allows Div7 to cross any boundary", () => {
    const result = enforceOwnerBoundary("Div7.MissionControl", "Div4.Production");
    expect(result.authorized).toBe(true);
  });

  it("blocks cross-division access for non-Div7 callers", () => {
    const result = enforceOwnerBoundary("Div2.MasterPlanner", "Div4.Production");
    expect(result.authorized).toBe(false);
    if (!result.authorized) {
      expect(result.reason).toContain("Div7.MissionControl");
    }
  });

  it("isDiv7MissionControl identifies Div7 correctly", () => {
    expect(isDiv7MissionControl("Div7.MissionControl")).toBe(true);
    expect(isDiv7MissionControl("Div1.HCO")).toBe(false);
    expect(isDiv7MissionControl("Div4.Production")).toBe(false);
  });
});

// ── Division Packet Router Contract ──

describe("M012 flow: division packet router contract", () => {
  it("emits and retrieves packets between divisions", () => {
    const diagnostic = emitDivisionPacket(
      "Div1.HCO",
      "Div4.Production",
      "work_assignment",
      { mission_id: "m012_s03_test_mission", task: "local_implementation" }
    );

    expect(diagnostic.emitted).toBe(true);
    expect(diagnostic.routed_to).toBe("Div4.Production");

    const inbox = getDivisionInbox("Div4.Production");
    expect(inbox.length).toBeGreaterThanOrEqual(1);
    const packet = inbox[inbox.length - 1];
    expect(packet.from_division).toBe("Div1.HCO");
    expect(packet.to_division).toBe("Div4.Production");
    expect(packet.packet_type).toBe("work_assignment");
    expect(packet.schema_version).toBe("1.0");
  });

  it("maintains separate inboxes per division", () => {
    emitDivisionPacket("Div1.HCO", "Div4.Production", "work_assignment", { id: 1 });
    emitDivisionPacket("Div1.HCO", "Div5.QualificationsLibraryLearning", "qa_review_requested", { id: 2 });
    emitDivisionPacket("Div1.HCO", "Div3.Treasury", "budget_grant", { id: 3 });

    expect(getDivisionInbox("Div4.Production")).toHaveLength(1);
    expect(getDivisionInbox("Div5.QualificationsLibraryLearning")).toHaveLength(1);
    expect(getDivisionInbox("Div3.Treasury")).toHaveLength(1);
  });

  it("peekDivisionInbox returns latest packet without removing", () => {
    emitDivisionPacket("Div1.HCO", "Div4.Production", "work_assignment", { first: true });
    emitDivisionPacket("Div1.HCO", "Div4.Production", "work_assignment", { second: true });

    const peeked = peekDivisionInbox("Div4.Production");
    expect(peeked).toBeDefined();
    expect((peeked!.payload as { second: boolean }).second).toBe(true);

    const fullInbox = getDivisionInbox("Div4.Production");
    expect(fullInbox).toHaveLength(2);
  });

  it("clearPacketRouter resets all inboxes", () => {
    emitDivisionPacket("Div1.HCO", "Div4.Production", "work_assignment", {});
    emitDivisionPacket("Div1.HCO", "Div3.Treasury", "budget_grant", {});

    clearPacketRouter();

    expect(getDivisionInbox("Div4.Production")).toHaveLength(0);
    expect(getDivisionInbox("Div3.Treasury")).toHaveLength(0);
  });
});

// ── Full M012 Local Flow Integration ──

describe("M012 flow: full local seven-division integration", () => {
  it("exercises the complete Div7 → Div1 → workers routing chain", () => {
    // Step 1: Div7 makes a decision
    const decision = decide({
      issue_id: "m012_s03_test_mission",
      signals: ["local seven division flow", "implementation", "build", "code", "review"],
      confidence: 0.75,
      now: NOW,
    });
    expect(decision.accepted).toBe(true);
    if (!decision.accepted) throw new Error("expected accepted decision");

    // Step 2: Div7 delegates to Div1 (unless policy-only)
    const delegation = delegateDecisionToDiv1(decision);
    if (!isPolicyOnlyDecision(decision)) {
      expect(delegation).not.toBeNull();
      expect(delegation!.diagnostic.emitted).toBe(true);
      expect(delegation!.diagnostic.routed_to).toBe("Div1.HCO");
    }

    // Step 3: Div1 receives and applies operational routing
    if (delegation) {
      const routingResult = routeAfterDecision(
        "Div1.HCO",
        "m012_s03_test_mission",
        delegation.payload
      );
      if (isUnauthorized(routingResult)) throw new Error("expected authorized routing");

      // Step 4: Verify worker divisions are activated
      expect(routingResult.status).toBe("ROUTED");
      expect(routingResult.activated_divisions.length).toBeGreaterThan(0);

      // Step 5: Verify Div3 grant can be issued for an activated division
      const targetDiv = routingResult.activated_divisions.find(
        (d: Division) => d === "Div4.Production" || d === "Div5.QualificationsLibraryLearning"
      );
      if (targetDiv) {
        const grantRequest: GrantRequest = {
          schema_version: "1.0",
          requested_by: "Div1.HCO",
          target_division: targetDiv,
          mission_id: "m012_s03_test_mission",
          purpose: "Local mission flow execution",
          requested_tools: targetDiv === "Div4.Production"
            ? ["repo_read", "repo_write", "test_runner"]
            : ["quarantine", "verification", "scanning"],
          requested_secrets: [],
          estimated_cost: 50000,
          risk_level: decision.risk_tier === "CRITICAL" ? "CRITICAL" : "MEDIUM",
          ttl_minutes: 240,
          requested_at: NOW,
        };
        const grantDecision = validateGrantRequest(grantRequest);
        // Grant should either be approved or escalated (never rejected for valid tools)
        expect(["approved", "escalate"]).toContain(grantDecision.status);
      }

      // Step 6: Verify division packets were emitted to worker divisions
      for (const div of routingResult.activated_divisions) {
        const inbox = getDivisionInbox(div);
        expect(inbox.length).toBeGreaterThanOrEqual(1);
        const workPacket = inbox.find(
          (p) => p.packet_type === "work_assignment" || p.packet_type === "decision_delegated"
        );
        expect(workPacket).toBeDefined();
      }
    }
  });

  it("validates a Div4 production diff passes QA review", () => {
    const diff = `diff --git a/src/localFlow.ts b/src/localFlow.ts
--- a/src/localFlow.ts
+++ b/src/localFlow.ts
@@ -0,0 +1,5 @@
+export function localSevenDivisionFlow() {
+  return {
+    status: "local_execution",
+  };
+}`;

    const adapter = new InMemoryPaperclipAdapter();
    const qa = new QAReview(adapter);
    const result = qa.fullReview(diff, [
      { gate_id: "LARS.Deterministic", description: "Output present", is_blocking: true, check: (e) => e.files_changed.length > 0 },
      { gate_id: "LARS.SecurityPolicy", description: "No secrets", is_blocking: true, check: (e) => e.security_flags.filter((f) => f.severity === "critical").length === 0 },
      { gate_id: "LARS.ArtifactIntegrity", description: "Diff hash", is_blocking: true, check: (e) => e.diff_hash.length > 0 },
    ]);

    expect(result.approved_for_merge).toBe(true);
    expect(result.eval_gate.overall).toBe("PASSED");
    expect(result.envelope.reviewed_by).toBe("Div5.QualificationsLibraryLearning");
    expect(result.envelope.files_changed).toContain("src/localFlow.ts");
  });
});
