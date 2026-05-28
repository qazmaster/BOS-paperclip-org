import type { BettingTableItem, BPIScore, BosStatusOverlay, CircuitBreakerRecord, DecisionMetadata, EvalGateResult } from "./contracts";
import type { BOSPersistence, PaperclipAdapter } from "./paperclipAdapter";
import { PAPERCLIP_RUNTIME_BOUNDARY_RULES } from "./runtimeCapabilities";

// Draft in-memory persistence for tests and local logic only. It is cache/overlay
// behavior, not durable Paperclip state proof; native issue documents/comments
// remain the recovery path until issue/company state round trips are proven.
export const BOS_PERSISTENCE_BOUNDARY = PAPERCLIP_RUNTIME_BOUNDARY_RULES;

export class InMemoryBOSPersistence implements BOSPersistence {
  bpi = new Map<string, BPIScore>();
  status = new Map<string, BosStatusOverlay>();
  betting = new Map<string, BettingTableItem[]>();
  gates = new Map<string, EvalGateResult>();
  circuits = new Map<string, CircuitBreakerRecord>();
  decisions = new Map<string, DecisionMetadata>();

  async saveBPI(score: BPIScore): Promise<void> { this.bpi.set(score.source_issue_id, score); }
  async getBPI(issueId: string): Promise<BPIScore | null> { return this.bpi.get(issueId) ?? null; }
  async saveStatus(status: BosStatusOverlay): Promise<void> { this.status.set(status.issue_id, status); }
  async saveBettingTable(cycleId: string, items: BettingTableItem[]): Promise<void> { this.betting.set(cycleId, items); }
  async getBettingTable(cycleId: string): Promise<BettingTableItem[]> { return this.betting.get(cycleId) ?? []; }
  async saveGateResult(result: EvalGateResult): Promise<void> { this.gates.set(result.issue_id, result); }
  async saveCircuitBreaker(record: CircuitBreakerRecord): Promise<void> { this.circuits.set(record.issue_id, record); }
  async getCircuitBreaker(issueId: string): Promise<CircuitBreakerRecord | null> { return this.circuits.get(issueId) ?? null; }
  async saveDecision(decision: DecisionMetadata): Promise<void> { this.decisions.set(decision.decision_id, decision); }
}

export async function mirrorGateResultToNativeArtifact(adapter: PaperclipAdapter, result: EvalGateResult): Promise<void> {
  const lines = result.gates.map((gate) => `- ${gate.gate_id}: ${gate.status} (${gate.is_blocking ? "blocking" : "non-blocking"}) - ${gate.evidence ?? "no evidence"}`);
  await adapter.addIssueComment(result.issue_id, `# BOS Eval Gate Result\n\nOverall: ${result.overall}\n\n${lines.join("\n")}`);
}

export async function mirrorDecisionToNativeArtifact(adapter: PaperclipAdapter, decision: DecisionMetadata): Promise<void> {
  await adapter.addIssueComment(decision.issue_id, `# BOS Decision Record\n\n- Decision: ${decision.decision_id}\n- Domain: ${decision.cynefin_domain}\n- Confidence: ${decision.confidence}\n- Type: ${decision.decision_type}\n- Recommendation: ${decision.recommended_action}`);
}
