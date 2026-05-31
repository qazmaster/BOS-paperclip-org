import type { PaperclipAdapter } from "./paperclipAdapter";
import type { CircuitBreakerRecord } from "./contracts";

export type ResolutionDecision =
  | "abort_mission"
  | "resume_with_limits"
  | "create_correction_work_order"
  | "escalate_to_div7"
  | "open_new_mission";

export interface IncidentArtifact {
  incident_id: string;
  artifact_id: string;
  artifact_type: "document" | "comment";
  issue_id: string;
  options: ResolutionDecision[];
  created_at: string;
}

export interface HumanDecision {
  decision: ResolutionDecision;
  reason?: string;
  decided_at: string;
}

export interface ResolutionResult {
  decision: ResolutionDecision;
  executed: boolean;
  payload?: Record<string, unknown>;
  message: string;
}

export class CircuitBreakerHumanResolution {
  private adapter: PaperclipAdapter;
  private incidents: Map<string, IncidentArtifact> = new Map();
  private pendingDecisions: Map<string, { resolve: (value: HumanDecision) => void; timer: NodeJS.Timeout }> = new Map();
  private resolutions: Map<string, ResolutionResult> = new Map();

  constructor(adapter: PaperclipAdapter) {
    this.adapter = adapter;
  }

  private now(): string {
    return new Date().toISOString();
  }

  private generateIncidentId(issueId: string): string {
    return `incident_${issueId}_${Date.now()}`;
  }

  async onOpen(circuitState: CircuitBreakerRecord): Promise<IncidentArtifact> {
    const incidentId = this.generateIncidentId(circuitState.issue_id);
    const markdown = this.buildIncidentMarkdown(incidentId, circuitState);

    let artifact: IncidentArtifact;
    try {
      const doc = await this.adapter.createIssueDocument(
        circuitState.issue_id,
        `Circuit Breaker OPEN: ${circuitState.issue_id}`,
        markdown
      );
      artifact = {
        incident_id: incidentId,
        artifact_id: doc.document_id,
        artifact_type: "document",
        issue_id: circuitState.issue_id,
        options: [
          "abort_mission",
          "resume_with_limits",
          "create_correction_work_order",
          "escalate_to_div7",
          "open_new_mission",
        ],
        created_at: this.now(),
      };
    } catch (err) {
      const comment = await this.adapter.addIssueComment(circuitState.issue_id, markdown);
      artifact = {
        incident_id: incidentId,
        artifact_id: comment.comment_id,
        artifact_type: "comment",
        issue_id: circuitState.issue_id,
        options: [
          "abort_mission",
          "resume_with_limits",
          "create_correction_work_order",
          "escalate_to_div7",
          "open_new_mission",
        ],
        created_at: this.now(),
      };
    }

    this.incidents.set(incidentId, artifact);
    return artifact;
  }

  private buildIncidentMarkdown(incidentId: string, state: CircuitBreakerRecord): string {
    return `# Circuit Breaker Incident

**Incident ID:** ${incidentId}
**Issue:** ${state.issue_id}
**State:** OPEN
**Opened at:** ${state.opened_at ?? this.now()}
**Failure count:** ${state.attempt_count} / ${state.max_attempts}
**Last failure reason:** ${state.last_failure_reason ?? "unknown"}

## Human Resolution Options
Please respond with one of:
- \`abort_mission\` — Clean shutdown, revoke all access
- \`resume_with_limits\` — Reset counters and resume with reduced limits
- \`create_correction_work_order\` — Spawn a new work order to fix the root cause
- \`escalate_to_div7\` — Notify Div7.MissionControl for strategic decision
- \`open_new_mission\` — Close this incident and start a new mission intake

*Incident created at: ${this.now()}*`;
  }

  async awaitHumanDecision(incidentId: string, timeoutMs: number): Promise<HumanDecision> {
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.pendingDecisions.delete(incidentId);
        resolve({
          decision: "abort_mission",
          reason: `No human response within ${timeoutMs}ms; defaulting to abort_mission`,
          decided_at: this.now(),
        });
      }, timeoutMs);

      this.pendingDecisions.set(incidentId, { resolve, timer });
    });
  }

  /** Simulate a human decision (for testing and orchestration). */
  simulateHumanDecision(incidentId: string, decision: HumanDecision): boolean {
    const pending = this.pendingDecisions.get(incidentId);
    if (!pending) return false;

    clearTimeout(pending.timer);
    this.pendingDecisions.delete(incidentId);
    pending.resolve(decision);
    return true;
  }

  executeResolution(decision: HumanDecision): ResolutionResult {
    let result: ResolutionResult;

    switch (decision.decision) {
      case "abort_mission":
        result = {
          decision: "abort_mission",
          executed: true,
          message: "Mission aborted. All active work halted and access revoked.",
          payload: { action: "shutdown", access_revoked: true },
        };
        break;
      case "resume_with_limits":
        result = {
          decision: "resume_with_limits",
          executed: true,
          message: "Circuit breaker reset with reduced limits. Resuming under constrained mode.",
          payload: { action: "reset", limit_factor: 0.5 },
        };
        break;
      case "create_correction_work_order":
        result = {
          decision: "create_correction_work_order",
          executed: true,
          message: "New correction work order spawned. Root cause remediation scheduled.",
          payload: { action: "spawn_work_order", type: "correction" },
        };
        break;
      case "escalate_to_div7":
        result = {
          decision: "escalate_to_div7",
          executed: true,
          message: "Escalated to Div7.MissionControl for strategic resolution.",
          payload: { action: "escalate", target: "Div7.MissionControl" },
        };
        break;
      case "open_new_mission":
        result = {
          decision: "open_new_mission",
          executed: true,
          message: "Incident closed. New mission intake initiated.",
          payload: { action: "new_mission", previous_incident: decision.reason },
        };
        break;
      default:
        result = {
          decision: decision.decision,
          executed: false,
          message: `Unknown resolution decision: ${decision.decision}`,
        };
    }

    this.resolutions.set(decision.decision, result);
    return result;
  }

  async logResolution(incidentId: string, decision: HumanDecision): Promise<{ artifact_id: string; artifact_type: "document" | "comment" }> {
    const markdown = `## Circuit Breaker Resolution

**Incident ID:** ${incidentId}
**Decision:** ${decision.decision}
**Reason:** ${decision.reason ?? "none provided"}
**Decided at:** ${decision.decided_at}

*Resolution logged at: ${this.now()}*`;

    const incident = this.incidents.get(incidentId);
    const issueId = incident?.issue_id ?? "unknown";

    try {
      const doc = await this.adapter.createIssueDocument(issueId, `Resolution: ${incidentId}`, markdown);
      return { artifact_id: doc.document_id, artifact_type: "document" };
    } catch (err) {
      const comment = await this.adapter.addIssueComment(issueId, markdown);
      return { artifact_id: comment.comment_id, artifact_type: "comment" };
    }
  }

  getIncident(incidentId: string): IncidentArtifact | undefined {
    return this.incidents.get(incidentId);
  }

  getResolution(decision: ResolutionDecision): ResolutionResult | undefined {
    return this.resolutions.get(decision);
  }
}
