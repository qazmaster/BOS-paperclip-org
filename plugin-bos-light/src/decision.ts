import type { DecisionMetadata } from "./contracts";

export interface DecisionInput {
  issue_id: string;
  signals: string[];
  confidence?: number;
  now?: string;
}

export function decide(input: DecisionInput): DecisionMetadata {
  const text = input.signals.join(" ").toLowerCase();
  let cynefin: DecisionMetadata["cynefin_domain"] = "COMPLICATED";
  let decisionType: DecisionMetadata["decision_type"] = "EXPERIMENT";
  let action = "Run a bounded experiment, collect traces, then review.";

  if (text.includes("outage") || text.includes("critical") || text.includes("runaway")) {
    cynefin = "CHAOTIC";
    decisionType = "SELF_HEALING";
    action = "Stabilize first: stop runaway work, open escalation issue, restore control, then analyze.";
  } else if (text.includes("policy") || text.includes("rule")) {
    cynefin = "COMPLICATED";
    decisionType = "POLICY_UPDATE";
    action = "Review expert constraints, propose policy update, record decision in issue history.";
  } else if (text.includes("batch") || text.includes("approve")) {
    cynefin = "CLEAR";
    decisionType = "BATCH_APPROVAL";
    action = "Use Betting Table and Paperclip-native approval/request.";
  } else if (text.includes("unknown") || text.includes("ambiguous") || text.includes("emerging")) {
    cynefin = "COMPLEX";
    decisionType = "EXPERIMENT";
    action = "Probe with small safe-to-fail experiments and review traces.";
  }

  return {
    schema_version: "1.0",
    decision_id: `decision_${input.issue_id}_${Date.now()}`,
    issue_id: input.issue_id,
    cynefin_domain: cynefin,
    confidence: Math.max(0, Math.min(1, input.confidence ?? 0.6)),
    decision_type: decisionType,
    emitted_events: [],
    recommended_action: action,
    decided_by: "Div7.MissionControl",
    decided_at: input.now ?? new Date().toISOString()
  };
}
