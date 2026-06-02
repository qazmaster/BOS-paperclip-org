import type {
  Division,
  GrantRequest,
  GrantDecision,
  GrantApproved,
  GrantDenied,
  GrantEscalated,
  DecisionRiskTier,
} from "./contracts";

/**
 * Deterministic grant policy for Div3.Treasury.
 * Routine low-risk grants are auto-approved or auto-denied.
 * LLM agent is used only for exceptions.
 */

interface GrantPolicy {
  autoApproveLimit: number;
  humanApprovalLimit: number;
  allowedToolsByDivision: Record<Division, string[]>;
  deniedToolsByDivision: Record<Division, string[]>;
  maxTtlMinutes: number;
  externalAccessDivisions: Division[];
}

const DEFAULT_POLICY: GrantPolicy = {
  autoApproveLimit: 100_000, // tokens
  humanApprovalLimit: 500_000, // tokens
  allowedToolsByDivision: {
    "Div1.HCO": ["routing", "dispatch", "packet_emission"],
    "Div2.MasterPlanner": ["planning", "scoring", "analysis"],
    "Div3.Treasury": ["budget_snapshot", "grant_creation", "secret_ref_resolution"],
    "Div4.Production": ["repo_read", "repo_write", "test_runner", "build"],
    "Div5.QualificationsLibraryLearning": ["quarantine", "verification", "scanning"],
    "Div6.External": ["web_search", "external_api", "git_gateway", "fetch"],
    "Div7.MissionControl": ["decision", "packet_emission"],
  },
  deniedToolsByDivision: {
    "Div1.HCO": ["external_api", "repo_write"],
    "Div2.MasterPlanner": ["external_api", "repo_write", "web_search"],
    "Div3.Treasury": ["external_api", "repo_write", "web_search", "production"],
    "Div4.Production": ["web_search", "external_api", "external_api_call", "production"],
    "Div5.QualificationsLibraryLearning": ["repo_write", "external_api", "web_search"],
    "Div6.External": [],
    "Div7.MissionControl": ["external_api", "repo_write", "production"],
  },
  maxTtlMinutes: 480, // 8 hours
  externalAccessDivisions: ["Div6.External"],
};

/**
 * Validate a grant request against deterministic policy.
 * Returns GrantDecision: approved, denied, or escalate.
 */
export function validateGrantRequest(
  request: GrantRequest,
  policy: GrantPolicy = DEFAULT_POLICY
): GrantDecision {
  const now = new Date();

  // Check if external tools requested by non-Div6 division
  const externalTools = ["web_search", "external_api", "external_api_call", "fetch"];
  const requestedExternal = request.requested_tools.filter(t => externalTools.includes(t));
  if (requestedExternal.length > 0 && !policy.externalAccessDivisions.includes(request.target_division)) {
    return denied(
      `Division ${request.target_division} cannot receive external-world access. Route through Div6.External.`,
      ["Div6.External"],
      now
    );
  }

  // Check TTL
  if (request.ttl_minutes > policy.maxTtlMinutes) {
    return denied(
      `TTL ${request.ttl_minutes}m exceeds maximum ${policy.maxTtlMinutes}m.`,
      undefined,
      now
    );
  }

  // Check cost against escalation threshold
  if (request.estimated_cost > policy.humanApprovalLimit) {
    return escalated(
      `Estimated cost ${request.estimated_cost} exceeds human approval limit ${policy.humanApprovalLimit}.`,
      "HumanOwner",
      now
    );
  }

  // Check cost against auto-approve threshold
  if (request.estimated_cost > policy.autoApproveLimit) {
    return escalated(
      `Estimated cost ${request.estimated_cost} exceeds auto-approve limit ${policy.autoApproveLimit}. Requires Div1 or Div7 review.`,
      "Div1.HCO",
      now
    );
  }

  // Check tool permissions
  const deniedTools = policy.deniedToolsByDivision[request.target_division] ?? [];
  const forbiddenRequested = request.requested_tools.filter(t => deniedTools.includes(t));
  if (forbiddenRequested.length > 0) {
    return denied(
      `Division ${request.target_division} is denied tools: ${forbiddenRequested.join(", ")}.`,
      undefined,
      now
    );
  }

  // Critical risk always escalates
  if (request.risk_level === "CRITICAL") {
    return escalated(
      `Critical risk level requires Div7 or human review.`,
      "Div7.MissionControl",
      now
    );
  }

  // High risk with high cost escalates
  if (request.risk_level === "HIGH" && request.estimated_cost > policy.autoApproveLimit * 0.5) {
    return escalated(
      `High risk with significant cost requires review.`,
      "Div1.HCO",
      now
    );
  }

  // Auto-approve low/medium risk within limits
  return approved(request, policy, now);
}

function approved(request: GrantRequest, policy: GrantPolicy, now: Date): GrantApproved {
  const grantId = `grant_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const expiresAt = new Date(now.getTime() + request.ttl_minutes * 60_000).toISOString();

  const allowedTools = request.requested_tools.filter(
    t => !(policy.deniedToolsByDivision[request.target_division] ?? []).includes(t)
  );

  return {
    schema_version: "1.0",
    decision_id: `gdec_${Date.now()}`,
    status: "approved",
    budget_grant_id: grantId,
    allowed_tools: allowedTools,
    denied_tools: request.requested_tools.filter(t => !allowedTools.includes(t)),
    token_cap: request.estimated_cost,
    ttl_minutes: request.ttl_minutes,
    rationale: `Approved: ${request.purpose}`,
    decided_by: "Div3.Treasury",
    decided_at: now.toISOString(),
  };
}

function denied(reason: string, requiredRoute: Division[] | undefined, now: Date): GrantDenied {
  return {
    schema_version: "1.0",
    decision_id: `gdec_${Date.now()}`,
    status: "denied",
    reason,
    required_route: requiredRoute,
    rationale: `Denied: ${reason}`,
    decided_by: "Div3.Treasury",
    decided_at: now.toISOString(),
  };
}

function escalated(reason: string, target: GrantEscalated["escalation_target"], now: Date): GrantEscalated {
  return {
    schema_version: "1.0",
    decision_id: `gdec_${Date.now()}`,
    status: "escalate",
    reason,
    escalation_target: target,
    rationale: `Escalated: ${reason}`,
    decided_by: "Div3.Treasury",
    decided_at: now.toISOString(),
  };
}
