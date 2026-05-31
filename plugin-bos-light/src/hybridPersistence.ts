import type {
  BPIScore,
  BosStatusOverlay,
  BettingTableItem,
  EvalGateResult,
  CircuitBreakerRecord,
  DecisionMetadata,
} from "./contracts";
import type { BOSPersistence, PaperclipAdapter } from "./paperclipAdapter";
import { InMemoryBOSPersistence } from "./persistence";

export interface MirrorArtifactRef {
  type: "document" | "comment";
  issue_id: string;
  ref_id: string;
  created_at: string;
}

export interface MirrorDiagnostics {
  last_mirror_at: string | null;
  last_error: string | null;
  last_error_at: string | null;
  total_documents: number;
  total_comments: number;
  artifact_refs: MirrorArtifactRef[];
}

export interface HybridBOSPersistence extends BOSPersistence {
  readonly diagnostics: MirrorDiagnostics;
}

export class DefaultHybridBOSPersistence implements HybridBOSPersistence {
  private memory = new InMemoryBOSPersistence();
  private adapter: PaperclipAdapter;
  private _diagnostics: MirrorDiagnostics;

  constructor(adapter: PaperclipAdapter) {
    this.adapter = adapter;
    this._diagnostics = {
      last_mirror_at: null,
      last_error: null,
      last_error_at: null,
      total_documents: 0,
      total_comments: 0,
      artifact_refs: [],
    };
  }

  get diagnostics(): MirrorDiagnostics {
    return { ...this._diagnostics, artifact_refs: [...this._diagnostics.artifact_refs] };
  }

  private now(): string {
    return new Date().toISOString();
  }

  private recordRef(type: "document" | "comment", issue_id: string, ref_id: string): void {
    this._diagnostics.artifact_refs.push({
      type,
      issue_id,
      ref_id,
      created_at: this.now(),
    });
    if (type === "document") this._diagnostics.total_documents++;
    if (type === "comment") this._diagnostics.total_comments++;
    this._diagnostics.last_mirror_at = this.now();
  }

  private recordError(err: unknown): void {
    const message = err instanceof Error ? err.message : String(err);
    this._diagnostics.last_error = this.redactSecrets(message);
    this._diagnostics.last_error_at = this.now();
  }

  private redactSecrets(input: string): string {
    return input
      .replace(/ghp_[a-zA-Z0-9]{36}/g, "[REDACTED]")
      .replace(/glpat-[a-zA-Z0-9\-]{20}/g, "[REDACTED]")
      .replace(/-----BEGIN (OPENSSH|RSA|EC) PRIVATE KEY-----[\s\S]*?-----END (OPENSSH|RSA|EC) PRIVATE KEY-----/g, "[REDACTED]");
  }

  private safeMirror(label: string, fn: () => Promise<void>): void {
    fn().catch((err) => {
      this.recordError(err);
    });
  }

  async saveBPI(score: BPIScore): Promise<void> {
    await this.memory.saveBPI(score);
    this.safeMirror("saveBPI", async () => {
      const doc = await this.adapter.createIssueDocument(
        score.source_issue_id,
        `BPI Score: ${score.source_issue_id}`,
        this.bpiMarkdown(score)
      );
      this.recordRef("document", score.source_issue_id, doc.document_id);
    });
  }

  async getBPI(issueId: string): Promise<BPIScore | null> {
    return this.memory.getBPI(issueId);
  }

  async saveStatus(status: BosStatusOverlay): Promise<void> {
    await this.memory.saveStatus(status);
    this.safeMirror("saveStatus", async () => {
      const comment = await this.adapter.addIssueComment(
        status.issue_id,
        `## BOS Status Update\n\n- Issue: ${status.issue_id}\n- Status: ${status.bos_status}\n- Producer: ${status.producer_division}\n- Blueprint: ${status.blueprint_id ?? "none"}\n- BPI: ${status.bpi_score ?? "unscored"}\n- Updated: ${status.updated_at}`
      );
      this.recordRef("comment", status.issue_id, comment.comment_id);
    });
  }

  async saveBettingTable(cycleId: string, items: BettingTableItem[]): Promise<void> {
    await this.memory.saveBettingTable(cycleId, items);
    this.safeMirror("saveBettingTable", async () => {
      const doc = await this.adapter.createIssueDocument(
        `cycle-${cycleId}`,
        `Betting Table: ${cycleId}`,
        this.bettingTableMarkdown(cycleId, items)
      );
      this.recordRef("document", `cycle-${cycleId}`, doc.document_id);
    });
  }

  async getBettingTable(cycleId: string): Promise<BettingTableItem[]> {
    return this.memory.getBettingTable(cycleId);
  }

  async saveGateResult(result: EvalGateResult): Promise<void> {
    await this.memory.saveGateResult(result);
    this.safeMirror("saveGateResult", async () => {
      const comment = await this.adapter.addIssueComment(
        result.issue_id,
        this.gateResultMarkdown(result)
      );
      this.recordRef("comment", result.issue_id, comment.comment_id);
    });
  }

  async saveCircuitBreaker(record: CircuitBreakerRecord): Promise<void> {
    await this.memory.saveCircuitBreaker(record);
    this.safeMirror("saveCircuitBreaker", async () => {
      const doc = await this.adapter.createIssueDocument(
        record.issue_id,
        `Circuit Breaker: ${record.issue_id}`,
        this.circuitBreakerMarkdown(record)
      );
      this.recordRef("document", record.issue_id, doc.document_id);
    });
  }

  async getCircuitBreaker(issueId: string): Promise<CircuitBreakerRecord | null> {
    return this.memory.getCircuitBreaker(issueId);
  }

  async saveDecision(decision: DecisionMetadata): Promise<void> {
    await this.memory.saveDecision(decision);
    this.safeMirror("saveDecision", async () => {
      const comment = await this.adapter.addIssueComment(
        decision.issue_id,
        this.decisionMarkdown(decision)
      );
      this.recordRef("comment", decision.issue_id, comment.comment_id);
    });
  }

  private bpiMarkdown(score: BPIScore): string {
    return `# BPI Score

- Issue: ${score.source_issue_id}
- Score: ${score.score}
- Formula: ${score.formula}
- Scored by: ${score.scored_by}
- Scored at: ${score.scored_at}

## Components
${Object.entries(score.components).map(([k, v]) => `- ${k}: ${v}`).join("\n")}

## Hard Gates
${Object.entries(score.hard_gates).map(([k, v]) => `- ${k}: ${v}`).join("\n")}
`;
  }

  private bettingTableMarkdown(cycleId: string, items: BettingTableItem[]): string {
    return `# Betting Table: ${cycleId}

| Issue | BPI | Status | Approval |
|-------|-----|--------|----------|
${items.map(i => `| ${i.issue_id} | ${i.bpi_score} | ${i.status} | ${i.native_approval_status ?? "none"} |`).join("\n")}

*Updated: ${new Date().toISOString()}*
`;
  }

  private gateResultMarkdown(result: EvalGateResult): string {
    const gateLines = result.gates.map(g =>
      `- **${g.gate_id}**: ${g.status}${g.is_blocking ? " (blocking)" : ""}${g.evidence ? ` — ${g.evidence}` : ""}`
    ).join("\n");
    return `## Eval Gate Result

- Run: ${result.run_id ?? "N/A"}
- Overall: **${result.overall}**
- Blocking failures: ${result.blocking_failure_count}
- Warnings: ${result.warning_count}
- Not run: ${result.not_run_count}

${gateLines}

*Evaluated at: ${result.evaluated_at} by ${result.evaluated_by}*
`;
  }

  private circuitBreakerMarkdown(record: CircuitBreakerRecord): string {
    return `# Circuit Breaker State

- Issue: ${record.issue_id}
- State: **${record.state}**
- Attempts: ${record.attempt_count} / ${record.max_attempts}
- Half-open threshold: ${record.half_open_threshold}
- Last failure: ${record.last_failure_at ?? "never"}
- Last failure reason: ${record.last_failure_reason ?? "none"}
- Opened at: ${record.opened_at ?? "not opened"}
- Escalation issue: ${record.escalation_issue_id ?? "none"}

*Updated: ${record.updated_at}*
`;
  }

  private decisionMarkdown(decision: DecisionMetadata): string {
    return `## Decision Record

- Decision: ${decision.decision_id}
- Issue: ${decision.issue_id}
- Domain: ${decision.cynefin_domain}
- Confidence: ${decision.confidence}
- Risk tier: ${decision.risk_tier}
- Type: ${decision.decision_type}
- Recommended action: ${decision.recommended_action}
- Decided by: ${decision.decided_by}
- Decided at: ${decision.decided_at}

${decision.ooda ? `### OODA
- Observe: ${decision.ooda.observe.join("; ")}
- Orient: ${decision.ooda.orient.join("; ")}
- Decide: ${decision.ooda.decide.join("; ")}
- Act: ${decision.ooda.act.join("; ")}
` : ""}
`;
  }
}
