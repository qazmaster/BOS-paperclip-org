import type { PaperclipAdapter } from "./paperclipAdapter";
import type { Division } from "./contracts";
import { enforceOwnerBoundary } from "./ownerBoundary";

export type RiskLevel = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export interface MissionEnvelope {
  schema_version: "1.0";
  mission_id: string;
  title: string;
  description: string;
  business_goal: string;
  risk_level: RiskLevel;
  requested_divisions: Division[];
  status: "DRAFT" | "PENDING_APPROVAL" | "APPROVED" | "REJECTED";
  created_at: string;
  updated_at: string;
}

export interface HumanApprovalArtifact {
  artifact_id: string;
  artifact_type: "document" | "comment";
  issue_id: string;
  options: string[];
  created_at: string;
}

export interface ApprovalResponse {
  status: "APPROVED" | "REJECTED" | "CLARIFICATION_REQUESTED" | "TIMEOUT";
  reason?: string;
  responded_at: string;
}

export type MissionEventType = "mission_approved" | "mission_rejected";

export interface MissionEvent {
  type: MissionEventType;
  mission: MissionEnvelope;
  reason?: string;
  timestamp: string;
}

export type MissionEventHandler = (event: MissionEvent) => void;

export interface MissionIntakeUnauthorized {
  unauthorized: true;
  caller: Division;
  reason: string;
}

export class MissionIntake {
  private adapter: PaperclipAdapter;
  private missions: Map<string, MissionEnvelope> = new Map();
  private approvalArtifacts: Map<string, HumanApprovalArtifact> = new Map();
  private eventHandlers: Map<MissionEventType, MissionEventHandler[]> = new Map();
  private pendingApprovals: Map<string, { resolve: (value: ApprovalResponse) => void; timer: NodeJS.Timeout }> = new Map();

  constructor(adapter: PaperclipAdapter) {
    this.adapter = adapter;
  }

  private now(): string {
    return new Date().toISOString();
  }

  private generateMissionId(): string {
    return `mission_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  }

  frameMission(callerDivision: Division, vagueGoal: string): MissionEnvelope | MissionIntakeUnauthorized {
    const boundary = enforceOwnerBoundary(callerDivision, "Div7.MissionControl");
    if (!boundary.authorized) {
      return {
        unauthorized: true,
        caller: callerDivision,
        reason: `Mission framing is restricted to Div7.MissionControl. ${boundary.reason}`,
      };
    }

    const mission: MissionEnvelope = {
      schema_version: "1.0",
      mission_id: this.generateMissionId(),
      title: vagueGoal.slice(0, 120),
      description: vagueGoal,
      business_goal: this.inferBusinessGoal(vagueGoal),
      risk_level: this.inferRiskLevel(vagueGoal),
      requested_divisions: this.inferDivisions(vagueGoal),
      status: "DRAFT",
      created_at: this.now(),
      updated_at: this.now(),
    };
    this.missions.set(mission.mission_id, mission);
    return mission;
  }

  private inferBusinessGoal(goal: string): string {
    const lower = goal.toLowerCase();
    if (lower.includes("revenue") || lower.includes("sales") || lower.includes("monetize")) {
      return "Increase revenue or monetization";
    }
    if (lower.includes("cost") || lower.includes("reduce") || lower.includes("efficiency")) {
      return "Reduce cost or improve efficiency";
    }
    if (lower.includes("user") || lower.includes("customer") || lower.includes("experience")) {
      return "Improve user or customer experience";
    }
    if (lower.includes("security") || lower.includes("compliance") || lower.includes("risk")) {
      return "Reduce security or compliance risk";
    }
    return "Explore opportunity or address technical debt";
  }

  private inferRiskLevel(goal: string): RiskLevel {
    const lower = goal.toLowerCase();
    if (lower.includes("production") || lower.includes("deploy") || lower.includes("customer-facing")) {
      return "HIGH";
    }
    if (lower.includes("security") || lower.includes("payment") || lower.includes("compliance")) {
      return "CRITICAL";
    }
    if (lower.includes("experiment") || lower.includes("prototype") || lower.includes("spike")) {
      return "LOW";
    }
    return "MEDIUM";
  }

  private inferDivisions(goal: string): Division[] {
    const lower = goal.toLowerCase();
    const divisions: Division[] = ["Div7.MissionControl", "Div1.HCO", "Div2.MasterPlanner"];
    if (lower.includes("code") || lower.includes("feature") || lower.includes("implement") || lower.includes("build")) {
      divisions.push("Div3.Treasury", "Div4.Production", "Div5.QualificationsLibraryLearning", "Div6.External");
    } else if (lower.includes("review") || lower.includes("audit") || lower.includes("qa")) {
      divisions.push("Div5.QualificationsLibraryLearning");
    } else if (lower.includes("deploy") || lower.includes("release") || lower.includes("publish")) {
      divisions.push("Div3.Treasury", "Div4.Production", "Div5.QualificationsLibraryLearning", "Div6.External");
    }
    return divisions;
  }

  async requestHumanApproval(
    callerDivision: Division,
    mission: MissionEnvelope
  ): Promise<HumanApprovalArtifact | MissionIntakeUnauthorized> {
    const boundary = enforceOwnerBoundary(callerDivision, "Div7.MissionControl");
    if (!boundary.authorized) {
      return {
        unauthorized: true,
        caller: callerDivision,
        reason: `Human approval requests are restricted to Div7.MissionControl. ${boundary.reason}`,
      };
    }

    const updated: MissionEnvelope = { ...mission, status: "PENDING_APPROVAL", updated_at: this.now() };
    this.missions.set(mission.mission_id, updated);

    const markdown = this.buildApprovalMarkdown(updated);

    // Try document first, fallback to comment
    let artifact: HumanApprovalArtifact;
    try {
      const doc = await this.adapter.createIssueDocument(
        mission.mission_id,
        `Mission Approval Request: ${mission.title}`,
        markdown
      );
      artifact = {
        artifact_id: doc.document_id,
        artifact_type: "document",
        issue_id: mission.mission_id,
        options: ["approve", "reject", "request_clarification"],
        created_at: this.now(),
      };
    } catch (err) {
      const comment = await this.adapter.addIssueComment(mission.mission_id, markdown);
      artifact = {
        artifact_id: comment.comment_id,
        artifact_type: "comment",
        issue_id: mission.mission_id,
        options: ["approve", "reject", "request_clarification"],
        created_at: this.now(),
      };
    }

    this.approvalArtifacts.set(mission.mission_id, artifact);
    return artifact;
  }

  private buildApprovalMarkdown(mission: MissionEnvelope): string {
    return `# Mission Approval Request

**Mission ID:** ${mission.mission_id}
**Title:** ${mission.title}
**Risk Level:** ${mission.risk_level}
**Business Goal:** ${mission.business_goal}

## Description
${mission.description}

## Requested Divisions
${mission.requested_divisions.map((d) => `- ${d}`).join("\n")}

## Approval Options
Please respond with one of:
- \`approve\` — Proceed with mission execution
- \`reject\` — Cancel mission with reason
- \`request_clarification\` — Need more information before deciding

*Created at: ${mission.created_at}*`;
  }

  async awaitHumanApproval(missionId: string, timeoutMs: number): Promise<ApprovalResponse> {
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.pendingApprovals.delete(missionId);
        resolve({
          status: "TIMEOUT",
          reason: `No human response within ${timeoutMs}ms`,
          responded_at: this.now(),
        });
      }, timeoutMs);

      this.pendingApprovals.set(missionId, { resolve, timer });
    });
  }

  /** Simulate a human response (for testing and orchestration). Returns true if a pending promise was resolved. */
  simulateHumanResponse(missionId: string, response: ApprovalResponse): boolean {
    const pending = this.pendingApprovals.get(missionId);
    if (!pending) return false;

    clearTimeout(pending.timer);
    this.pendingApprovals.delete(missionId);
    pending.resolve(response);

    const mission = this.missions.get(missionId);
    if (mission) {
      if (response.status === "APPROVED") {
        this.onApproval(mission);
      } else if (response.status === "REJECTED") {
        this.onRejection(mission, response.reason);
      }
    }

    return true;
  }

  onApproval(mission: MissionEnvelope): void {
    const updated: MissionEnvelope = { ...mission, status: "APPROVED", updated_at: this.now() };
    this.missions.set(mission.mission_id, updated);
    this.emit("mission_approved", { type: "mission_approved", mission: updated, timestamp: this.now() });
  }

  onRejection(mission: MissionEnvelope, reason?: string): void {
    const updated: MissionEnvelope = { ...mission, status: "REJECTED", updated_at: this.now() };
    this.missions.set(mission.mission_id, updated);
    this.emit("mission_rejected", { type: "mission_rejected", mission: updated, reason, timestamp: this.now() });
  }

  private emit(type: MissionEventType, event: MissionEvent): void {
    const handlers = this.eventHandlers.get(type) ?? [];
    for (const handler of handlers) {
      try {
        handler(event);
      } catch {
        // Ignore handler errors to preserve isolation
      }
    }
  }

  addEventListener(type: MissionEventType, handler: MissionEventHandler): void {
    const handlers = this.eventHandlers.get(type) ?? [];
    handlers.push(handler);
    this.eventHandlers.set(type, handlers);
  }

  removeEventListener(type: MissionEventType, handler: MissionEventHandler): void {
    const handlers = this.eventHandlers.get(type) ?? [];
    const idx = handlers.indexOf(handler);
    if (idx >= 0) {
      handlers.splice(idx, 1);
      this.eventHandlers.set(type, handlers);
    }
  }

  getMission(missionId: string): MissionEnvelope | undefined {
    return this.missions.get(missionId);
  }

  getApprovalArtifact(missionId: string): HumanApprovalArtifact | undefined {
    return this.approvalArtifacts.get(missionId);
  }
}
