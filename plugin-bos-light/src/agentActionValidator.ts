import type {
  Division,
  GrantRequest,
  GrantDecision,
  DecisionRiskTier,
} from "./contracts";
import { validateGrantRequest } from "./grantPolicy";
import { InMemoryGrantLedger } from "./grantLedger";
import type { GrantLedgerEntry } from "./grantLedger";

/**
 * Agent Action Validator
 *
 * Connects GrantPolicy to agent action validation. Before any agent action
 * (tool call, secret access, cost-bearing operation) executes, this validator
 * checks:
 *
 * 1. Tool permission: Is the tool allowed for the acting division?
 * 2. Secret access: Are requested secrets within scope?
 * 3. Cost budget: Does the operation stay within token budget?
 * 4. Grant validity: Is the grant still active (not expired/revoked)?
 *
 * Denied actions are logged to the denial log for audit trail.
 */

export interface AgentActionRequest {
  /** Division performing the action */
  division: Division;
  /** Mission ID for grant lookup */
  missionId: string;
  /** Tool being invoked */
  toolName: string;
  /** Secrets requested (if any) */
  requestedSecrets?: string[];
  /** Estimated token cost */
  estimatedCost?: number;
  /** Risk level (defaults to LOW) */
  riskLevel?: DecisionRiskTier;
  /** TTL in minutes (defaults to 60) */
  ttlMinutes?: number;
  /** Purpose description */
  purpose?: string;
  /** Paperclip task ID (optional) */
  paperclipTaskId?: string;
}

export interface AgentActionValidationResult {
  allowed: boolean;
  decision: GrantDecision | null;
  grantId: string | null;
  reason: string;
  denialId?: string;
}

export interface DenialLogEntry {
  denialId: string;
  timestamp: string;
  division: Division;
  toolName: string;
  missionId: string;
  reason: string;
  decisionId: string | null;
}

/**
 * Validates agent actions against GrantPolicy and tracks grant lifecycle.
 */
export class AgentActionValidator {
  private ledger: InMemoryGrantLedger;
  private denialLog: DenialLogEntry[] = [];
  private grantDecisions: Map<string, GrantDecision> = new Map();

  constructor(ledger?: InMemoryGrantLedger) {
    this.ledger = ledger ?? new InMemoryGrantLedger();
  }

  /**
   * Validate an agent action request.
   * Returns whether the action is allowed and logs denials.
   */
  validate(request: AgentActionRequest): AgentActionValidationResult {
    const {
      division,
      missionId,
      toolName,
      requestedSecrets = [],
      estimatedCost = 0,
      riskLevel = "LOW",
      ttlMinutes = 60,
      purpose = `Agent action: ${toolName}`,
      paperclipTaskId,
    } = request;

    // Build a GrantRequest from the agent action
    const grantRequest: GrantRequest = {
      schema_version: "1.0",
      requested_by: "Div1.HCO",
      target_division: division,
      mission_id: missionId,
      paperclip_task_id: paperclipTaskId,
      purpose,
      requested_tools: [toolName],
      requested_secrets: requestedSecrets,
      estimated_cost: estimatedCost,
      risk_level: riskLevel,
      ttl_minutes: ttlMinutes,
      requested_at: new Date().toISOString(),
    };

    // Validate against grant policy
    const decision = validateGrantRequest(grantRequest);
    const decisionId = decision.decision_id;

    // Store decision for audit
    this.grantDecisions.set(decisionId, decision);

    if (decision.status === "denied") {
      const denialId = this.logDenial(division, toolName, missionId, decision.reason, decisionId);
      return {
        allowed: false,
        decision,
        grantId: null,
        reason: decision.reason,
        denialId,
      };
    }

    if (decision.status === "escalate") {
      const denialId = this.logDenial(
        division,
        toolName,
        missionId,
        `Escalated: ${decision.reason}`,
        decisionId
      );
      return {
        allowed: false,
        decision,
        grantId: null,
        reason: `Action requires escalation to ${decision.escalation_target}: ${decision.reason}`,
        denialId,
      };
    }

    // Approved - check if existing grant is still valid
    if (decision.status === "approved") {
      const grantId = decision.budget_grant_id;

      // Check ledger for existing grant validity
      const existingGrant = this.ledger.get(grantId);
      if (existingGrant) {
        if (existingGrant.revoked) {
          const denialId = this.logDenial(
            division,
            toolName,
            missionId,
            `Grant ${grantId} has been revoked.`,
            decisionId
          );
          return {
            allowed: false,
            decision,
            grantId,
            reason: `Grant ${grantId} is revoked.`,
            denialId,
          };
        }

        if (this.ledger.isExpired(grantId)) {
          const denialId = this.logDenial(
            division,
            toolName,
            missionId,
            `Grant ${grantId} has expired.`,
            decisionId
          );
          return {
            allowed: false,
            decision,
            grantId,
            reason: `Grant ${grantId} has expired.`,
            denialId,
          };
        }

        // Check cost overrun
        if (estimatedCost > 0 && this.ledger.checkOverrun(grantId, estimatedCost)) {
          const denialId = this.logDenial(
            division,
            toolName,
            missionId,
            `Grant ${grantId} would exceed token cap.`,
            decisionId
          );
          return {
            allowed: false,
            decision,
            grantId,
            reason: `Estimated cost ${estimatedCost} exceeds grant cap.`,
            denialId,
          };
        }
      }

      return {
        allowed: true,
        decision,
        grantId,
        reason: `Approved: ${purpose}`,
      };
    }

    // Should not reach here, but handle gracefully
    const denialId = this.logDenial(
      division,
      toolName,
      missionId,
      "Unknown decision status",
      decisionId
    );
    return {
      allowed: false,
      decision,
      grantId: null,
      reason: "Unknown decision status",
      denialId,
    };
  }

  /**
   * Log a denial to the audit trail.
   */
  private logDenial(
    division: Division,
    toolName: string,
    missionId: string,
    reason: string,
    decisionId: string | null
  ): string {
    const denialId = `den_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const entry: DenialLogEntry = {
      denialId,
      timestamp: new Date().toISOString(),
      division,
      toolName,
      missionId,
      reason,
      decisionId,
    };
    this.denialLog.push(entry);
    return denialId;
  }

  /**
   * Get all denial log entries.
   */
  getDenialLog(): ReadonlyArray<DenialLogEntry> {
    return this.denialLog;
  }

  /**
   * Get denials for a specific division.
   */
  getDenialsForDivision(division: Division): DenialLogEntry[] {
    return this.denialLog.filter((d) => d.division === division);
  }

  /**
   * Get denials for a specific mission.
   */
  getDenialsForMission(missionId: string): DenialLogEntry[] {
    return this.denialLog.filter((d) => d.missionId === missionId);
  }

  /**
   * Clear the denial log (for test isolation).
   */
  clearDenialLog(): void {
    this.denialLog = [];
  }

  /**
   * Get the underlying ledger for grant management.
   */
  getLedger(): InMemoryGrantLedger {
    return this.ledger;
  }
}

/**
 * Create a validated tool wrapper that enforces grant policy before execution.
 * Denied actions are logged and return a denial result instead of executing.
 */
export function createValidatedToolWrapper(
  validator: AgentActionValidator,
  division: Division,
  missionId: string,
  options: {
    requestedSecrets?: string[];
    estimatedCost?: number;
    riskLevel?: DecisionRiskTier;
    ttlMinutes?: number;
    paperclipTaskId?: string;
  } = {}
) {
  return function wrapTool<T extends (...args: any[]) => any>(
    toolName: string,
    handler: T
  ): T {
    const wrappedHandler = ((...args: any[]) => {
      const validation = validator.validate({
        division,
        missionId,
        toolName,
        requestedSecrets: options.requestedSecrets,
        estimatedCost: options.estimatedCost,
        riskLevel: options.riskLevel,
        ttlMinutes: options.ttlMinutes,
        paperclipTaskId: options.paperclipTaskId,
        purpose: `Execute tool: ${toolName}`,
      });

      if (!validation.allowed) {
        return {
          error: "grant_denied",
          tool: toolName,
          division,
          reason: validation.reason,
          denialId: validation.denialId,
          decision: validation.decision,
        };
      }

      return handler(...args);
    }) as T;

    return wrappedHandler;
  };
}
