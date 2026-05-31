import type { PaperclipAdapter } from "./paperclipAdapter";
import type { GitCommandEvidence } from "./gitOperations";

export interface BranchPolicyViolation {
  violated: true;
  rule: "direct_main_push" | "naming_convention" | "non_fast_forward";
  reason: string;
  operation: string;
  blocked_at: string;
}

export interface BranchPolicyResult {
  allowed: boolean;
  violation?: BranchPolicyViolation;
}

export interface ResourceGrantRequest {
  resource_type: "token_budget" | "repo_access" | "api_key" | "compute";
  description: string;
  requested_amount?: string;
}

export interface BatchApprovalItem {
  item_id: string;
  title: string;
  description: string;
  estimated_cost?: string;
}

export interface DeployConfig {
  target_environment: "staging" | "production";
  branch: string;
  commit_sha: string;
  ci_workflow?: string;
}

export interface GateArtifact {
  gate_id: string;
  gate_type: "resource_grant" | "batch_approval" | "production_deploy";
  mission_id: string;
  artifact_id: string;
  artifact_type: "document" | "comment";
  status: "PENDING" | "APPROVED" | "REJECTED" | "TIMEOUT";
  created_at: string;
}

export interface GateDecision {
  gate_id: string;
  status: "APPROVED" | "REJECTED" | "TIMEOUT";
  reason?: string;
  decided_at: string;
}

export class HITLGovernance {
  private adapter: PaperclipAdapter;
  private blockedAttempts: BranchPolicyViolation[] = [];
  private gateArtifacts: Map<string, GateArtifact> = new Map();
  private pendingGates: Map<string, { resolve: (value: GateDecision) => void; timer: NodeJS.Timeout }> = new Map();

  constructor(adapter: PaperclipAdapter) {
    this.adapter = adapter;
  }

  private now(): string {
    return new Date().toISOString();
  }

  private generateGateId(gateType: string, missionId: string): string {
    return `gate_${gateType}_${missionId}_${Date.now()}`;
  }

  enforceBranchPolicy(operation: GitCommandEvidence): BranchPolicyResult {
    // Reject direct push to main/master
    const branch = operation.args.find((a) => a.includes("main") || a.includes("master"));
    if (branch && operation.args.includes("push") && !operation.args.includes("--force")) {
      // Actually we need to check if this is a push to main/master
      if (operation.args.some((a) => a === "main" || a === "master" || a === "refs/heads/main" || a === "refs/heads/master")) {
        const violation: BranchPolicyViolation = {
          violated: true,
          rule: "direct_main_push",
          reason: "Direct push to main/master is prohibited. Use feature branch + PR workflow.",
          operation: operation.command + " " + operation.args.join(" "),
          blocked_at: this.now(),
        };
        this.blockedAttempts.push(violation);
        return { allowed: false, violation };
      }
    }

    // Check for force push (non-fast-forward)
    if (operation.args.includes("--force") || operation.args.includes("-f")) {
      const violation: BranchPolicyViolation = {
        violated: true,
        rule: "non_fast_forward",
        reason: "Force push is prohibited. Non-fast-forward updates are not allowed.",
        operation: operation.command + " " + operation.args.join(" "),
        blocked_at: this.now(),
      };
      this.blockedAttempts.push(violation);
      return { allowed: false, violation };
    }

    // Enforce feature branch naming convention for pushes
    if (operation.args.includes("push")) {
      const branchArg = operation.args.find((a) => a.startsWith("feature/") || a.startsWith("refs/heads/feature/"));
      const nonFeatureBranch = operation.args.find((a) =>
        (a.startsWith("refs/heads/") || !a.startsWith("-")) &&
        !a.includes("feature/") &&
        !a.includes("origin") &&
        a !== "git" &&
        a !== "push"
      );
      // Simpler check: look for branch name in args that isn't main/master and doesn't start with feature/
      const allBranches = operation.args.filter((a) =>
        !a.startsWith("-") &&
        a !== "git" &&
        a !== "push" &&
        a !== "origin" &&
        a !== "main" &&
        a !== "master"
      );
      for (const b of allBranches) {
        if (!b.startsWith("feature/bos-")) {
          const violation: BranchPolicyViolation = {
            violated: true,
            rule: "naming_convention",
            reason: `Branch name '${b}' does not conform to required pattern 'feature/bos-{mission_id}'.`,
            operation: operation.command + " " + operation.args.join(" "),
            blocked_at: this.now(),
          };
          this.blockedAttempts.push(violation);
          return { allowed: false, violation };
        }
      }
    }

    return { allowed: true };
  }

  async requestResourceGrant(missionId: string, resources: ResourceGrantRequest[]): Promise<GateArtifact> {
    const gateId = this.generateGateId("resource", missionId);
    const markdown = this.buildResourceGrantMarkdown(missionId, resources);

    let artifact: GateArtifact;
    try {
      const doc = await this.adapter.createIssueDocument(
        missionId,
        `Resource Grant Request: ${missionId}`,
        markdown
      );
      artifact = {
        gate_id: gateId,
        gate_type: "resource_grant",
        mission_id: missionId,
        artifact_id: doc.document_id,
        artifact_type: "document",
        status: "PENDING",
        created_at: this.now(),
      };
    } catch (err) {
      const comment = await this.adapter.addIssueComment(missionId, markdown);
      artifact = {
        gate_id: gateId,
        gate_type: "resource_grant",
        mission_id: missionId,
        artifact_id: comment.comment_id,
        artifact_type: "comment",
        status: "PENDING",
        created_at: this.now(),
      };
    }

    this.gateArtifacts.set(gateId, artifact);
    return artifact;
  }

  private buildResourceGrantMarkdown(missionId: string, resources: ResourceGrantRequest[]): string {
    return `# Resource Grant Request

**Mission ID:** ${missionId}

## Requested Resources
${resources.map((r) => `- **${r.resource_type}**: ${r.description}${r.requested_amount ? ` (amount: ${r.requested_amount})` : ""}`).join("\n")}

## Approval Options
- \`approve\` — Grant all requested resources
- \`reject\` — Deny resource request with reason
- \`approve_partial\` — Grant subset with notes

*Created at: ${this.now()}*`;
  }

  async requestBatchApproval(missionId: string, batchItems: BatchApprovalItem[]): Promise<GateArtifact> {
    const gateId = this.generateGateId("batch", missionId);
    const markdown = this.buildBatchApprovalMarkdown(missionId, batchItems);

    let artifact: GateArtifact;
    try {
      const doc = await this.adapter.createIssueDocument(
        missionId,
        `Batch Approval Request: ${missionId}`,
        markdown
      );
      artifact = {
        gate_id: gateId,
        gate_type: "batch_approval",
        mission_id: missionId,
        artifact_id: doc.document_id,
        artifact_type: "document",
        status: "PENDING",
        created_at: this.now(),
      };
    } catch (err) {
      const comment = await this.adapter.addIssueComment(missionId, markdown);
      artifact = {
        gate_id: gateId,
        gate_type: "batch_approval",
        mission_id: missionId,
        artifact_id: comment.comment_id,
        artifact_type: "comment",
        status: "PENDING",
        created_at: this.now(),
      };
    }

    this.gateArtifacts.set(gateId, artifact);
    return artifact;
  }

  private buildBatchApprovalMarkdown(missionId: string, items: BatchApprovalItem[]): string {
    return `# Batch Approval Request

**Mission ID:** ${missionId}

## Items
${items.map((i) => `- **${i.item_id}**: ${i.title}\n  ${i.description}${i.estimated_cost ? `\n  *Est. cost: ${i.estimated_cost}*` : ""}`).join("\n")}

## Approval Options
- \`approve_all\` — Approve all items in batch
- \`reject_all\` — Reject entire batch
- \`approve_selected\` — Approve specific items (list IDs)

*Created at: ${this.now()}*`;
  }

  async requestProductionDeploy(missionId: string, deployConfig: DeployConfig): Promise<GateArtifact> {
    const gateId = this.generateGateId("deploy", missionId);
    const markdown = this.buildDeployMarkdown(missionId, deployConfig);

    let artifact: GateArtifact;
    try {
      const doc = await this.adapter.createIssueDocument(
        missionId,
        `Production Deploy Request: ${missionId}`,
        markdown
      );
      artifact = {
        gate_id: gateId,
        gate_type: "production_deploy",
        mission_id: missionId,
        artifact_id: doc.document_id,
        artifact_type: "document",
        status: "PENDING",
        created_at: this.now(),
      };
    } catch (err) {
      const comment = await this.adapter.addIssueComment(missionId, markdown);
      artifact = {
        gate_id: gateId,
        gate_type: "production_deploy",
        mission_id: missionId,
        artifact_id: comment.comment_id,
        artifact_type: "comment",
        status: "PENDING",
        created_at: this.now(),
      };
    }

    this.gateArtifacts.set(gateId, artifact);
    return artifact;
  }

  private buildDeployMarkdown(missionId: string, config: DeployConfig): string {
    return `# Production Deploy Request

**Mission ID:** ${missionId}
**Environment:** ${config.target_environment}
**Branch:** ${config.branch}
**Commit:** ${config.commit_sha}
${config.ci_workflow ? `**CI Workflow:** ${config.ci_workflow}` : ""}

## Approval Options
- \`approve\` — Trigger deployment
- \`reject\` — Cancel deployment with reason
- \`approve_with_monitoring\` — Deploy with enhanced monitoring

*Created at: ${this.now()}*`;
  }

  async awaitGateDecision(gateId: string, timeoutMs: number): Promise<GateDecision> {
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.pendingGates.delete(gateId);
        resolve({
          gate_id: gateId,
          status: "TIMEOUT",
          reason: `No human response within ${timeoutMs}ms`,
          decided_at: this.now(),
        });
      }, timeoutMs);

      this.pendingGates.set(gateId, { resolve, timer });
    });
  }

  /** Simulate a human gate decision (for testing and orchestration). */
  simulateGateDecision(gateId: string, decision: GateDecision): boolean {
    const pending = this.pendingGates.get(gateId);
    if (!pending) return false;

    clearTimeout(pending.timer);
    this.pendingGates.delete(gateId);

    const artifact = this.gateArtifacts.get(gateId);
    if (artifact) {
      this.gateArtifacts.set(gateId, { ...artifact, status: decision.status });
    }

    pending.resolve(decision);
    return true;
  }

  getBlockedAttempts(): BranchPolicyViolation[] {
    return [...this.blockedAttempts];
  }

  getGateArtifact(gateId: string): GateArtifact | undefined {
    return this.gateArtifacts.get(gateId);
  }

  getGateArtifactsForMission(missionId: string): GateArtifact[] {
    return Array.from(this.gateArtifacts.values()).filter((g) => g.mission_id === missionId);
  }
}
