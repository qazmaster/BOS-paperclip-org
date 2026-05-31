import type {
  CynefinDomain,
  DecisionDiagnostics,
  DecisionDomainEvidence,
  DecisionMetadata,
  DecisionOODASections,
  DecisionRecordDetailLevel,
  DecisionResult,
  DecisionRiskTier,
  DecisionType,
  DecisionValidationFailure
} from "./contracts";

export interface DecisionInput {
  issue_id: string;
  signals: string[];
  confidence?: number;
  now?: string;
}

type DomainRule = {
  domain: CynefinDomain;
  keywords: string[];
  reasons: string[];
};

const DOMAIN_RULES: DomainRule[] = [
  {
    domain: "CLEAR",
    keywords: ["batch", "approve", "approval", "routine", "standard", "repeatable", "known", "playbook"],
    reasons: ["repeatable known-good approval or operating pattern"]
  },
  {
    domain: "COMPLICATED",
    keywords: ["policy", "rule", "budget", "expert", "compliance", "exception", "constraint", "review"],
    reasons: ["expert judgement or policy constraints are required"]
  },
  {
    domain: "COMPLEX",
    keywords: ["unknown", "ambiguous", "emerging", "experiment", "strategy", "hypothesis", "uncertain", "probe"],
    reasons: ["cause and effect are not yet stable enough for a fixed policy"]
  },
  {
    domain: "CHAOTIC",
    keywords: ["outage", "critical", "runaway", "incident", "emergency", "down", "breaker", "circuit", "stop"],
    reasons: ["active instability requires immediate containment before analysis"]
  }
];

const DOMAIN_PRIORITY: Record<CynefinDomain, number> = {
  CHAOTIC: 5,
  DISORDER: 4,
  COMPLEX: 3,
  COMPLICATED: 2,
  CLEAR: 1
};

function clampConfidence(confidence: number | undefined): number {
  if (confidence === undefined) return 0.6;
  return Math.max(0, Math.min(1, confidence));
}

function compactText(value: unknown): string {
  return String(value ?? "")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 160);
}

const SAFE_ISSUE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,79}$/;

function safeIssueId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (!SAFE_ISSUE_ID_PATTERN.test(trimmed) || trimmed.includes("..")) return null;
  return trimmed;
}

function validationFailure(input: unknown, validationErrors: string[], now: string): DecisionValidationFailure {
  const maybeInput = input && typeof input === "object" && !Array.isArray(input)
    ? input as Partial<DecisionInput>
    : {};

  return {
    schema_version: "1.0",
    accepted: false,
    error: "invalid_decision_input",
    issue_id: safeIssueId(maybeInput.issue_id) ?? null,
    decided_by: "Div7.MissionControl",
    decided_at: now,
    diagnostics: {
      validation_errors: validationErrors.map(compactText).slice(0, 8),
      sanitized: true
    }
  };
}

function validateInput(input: unknown): { input?: DecisionInput; errors: string[] } {
  const errors: string[] = [];

  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { errors: ["input must be an object"] };
  }

  const candidate = input as Partial<DecisionInput>;

  if (typeof candidate.issue_id !== "string" || candidate.issue_id.trim().length === 0) {
    errors.push("issue_id is required");
  } else if (!safeIssueId(candidate.issue_id)) {
    errors.push("issue_id must use only safe artifact identifier characters");
  }

  if (!Array.isArray(candidate.signals) || candidate.signals.length === 0) {
    errors.push("signals must contain at least one non-empty string");
  } else if (candidate.signals.some((signal) => typeof signal !== "string" || signal.trim().length === 0)) {
    errors.push("signals must contain only non-empty strings");
  }

  if (candidate.confidence !== undefined && (typeof candidate.confidence !== "number" || !Number.isFinite(candidate.confidence))) {
    errors.push("confidence must be a finite number when provided");
  }

  if (candidate.now !== undefined && typeof candidate.now !== "string") {
    errors.push("now must be an ISO timestamp string when provided");
  }

  if (errors.length > 0) return { errors };

  return {
    input: {
      issue_id: safeIssueId(candidate.issue_id!)!,
      signals: candidate.signals!.map((signal) => signal.trim()),
      confidence: candidate.confidence,
      now: candidate.now
    },
    errors: []
  };
}

function scoreDomain(text: string, rule: DomainRule): DecisionDomainEvidence {
  const matchedSignals = rule.keywords.filter((keyword) => text.includes(keyword));

  return {
    domain: rule.domain,
    matched_signals: matchedSignals,
    score: matchedSignals.length,
    reasons: matchedSignals.length > 0 ? rule.reasons : []
  };
}

function classify(evidence: DecisionDomainEvidence[], confidence: number): { domain: CynefinDomain; reasons: string[]; uncertainty: string[] } {
  const positive = evidence.filter((item) => item.score > 0);
  const uncertainty: string[] = [];

  if (confidence < 0.5 && positive.length >= 2) {
    uncertainty.push("low confidence with mixed domain evidence");
    return { domain: "DISORDER", reasons: ["mixed low-confidence signals require triage before classification"], uncertainty };
  }

  if (confidence < 0.35 && positive.length === 0) {
    uncertainty.push("low confidence without domain evidence");
    return { domain: "DISORDER", reasons: ["insufficient evidence to select a Cynefin domain"], uncertainty };
  }

  if (positive.length === 0) {
    return { domain: "COMPLICATED", reasons: ["defaulting to expert review because no domain keyword dominated"], uncertainty };
  }

  const selected = [...positive].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return DOMAIN_PRIORITY[b.domain] - DOMAIN_PRIORITY[a.domain];
  })[0];

  return { domain: selected.domain, reasons: selected.reasons, uncertainty };
}

function decisionTypeFor(domain: CynefinDomain, text: string): DecisionType {
  if (domain === "CHAOTIC") return "SELF_HEALING";
  if (domain === "CLEAR") return "BATCH_APPROVAL";
  if (text.includes("rush") || text.includes("authorization")) return "RUSH_AUTHORIZATION";
  if (domain === "COMPLICATED") return "POLICY_UPDATE";
  return "EXPERIMENT";
}

function recommendedActionFor(domain: CynefinDomain, decisionType: DecisionType): string {
  if (domain === "CHAOTIC") {
    return "Stabilize first: stop runaway work, open escalation issue, restore control, then analyze.";
  }
  if (domain === "DISORDER") {
    return "Pause automation, separate conflicting signals, gather one decisive observation, then reclassify.";
  }
  if (domain === "COMPLEX") {
    return "Probe with small safe-to-fail experiments and review traces before committing policy.";
  }
  if (decisionType === "POLICY_UPDATE") {
    return "Review expert constraints, propose policy update, and record the decision in issue history.";
  }
  if (decisionType === "RUSH_AUTHORIZATION") {
    return "Authorize the minimum reversible rush action, then require after-action review.";
  }
  return "Use Betting Table and Paperclip-native approval/request.";
}

function riskFor(domain: CynefinDomain, confidence: number, text: string): { risk: DecisionRiskTier; reasons: string[] } {
  const reasons: string[] = [];
  let risk: DecisionRiskTier;

  if (domain === "CHAOTIC") {
    risk = "CRITICAL";
    reasons.push("active incident or runaway signal");
  } else if (domain === "DISORDER") {
    risk = "HIGH";
    reasons.push("domain uncertainty can route work to the wrong control loop");
  } else if (domain === "COMPLEX") {
    risk = "HIGH";
    reasons.push("safe-to-fail probes are needed before scaling the decision");
  } else if (domain === "COMPLICATED") {
    risk = "MEDIUM";
    reasons.push("expert or policy review required before action");
  } else {
    risk = "LOW";
    reasons.push("repeatable batch approval path with known controls");
  }

  if (confidence < 0.5 && risk !== "CRITICAL") {
    risk = risk === "LOW" ? "MEDIUM" : "HIGH";
    reasons.push("confidence below 0.5 increases review risk");
  }

  if ((text.includes("budget") || text.includes("security") || text.includes("outage")) && risk === "LOW") {
    risk = "MEDIUM";
    reasons.push("budget, security, or outage terms require extra scrutiny");
  }

  return { risk, reasons };
}

function recordDetailFor(domain: CynefinDomain, risk: DecisionRiskTier, confidence: number): DecisionRecordDetailLevel {
  return domain === "CLEAR" && risk === "LOW" && confidence >= 0.75 ? "compact" : "expanded";
}

function oodaFor(domain: CynefinDomain, action: string, evidence: DecisionDomainEvidence[], uncertainty: string[]): DecisionOODASections | undefined {
  if (domain === "CLEAR" || domain === "COMPLICATED") return undefined;

  const matched = evidence
    .filter((item) => item.score > 0)
    .flatMap((item) => item.matched_signals)
    .slice(0, 8);

  return {
    observe: matched.length > 0 ? matched.map((signal) => `Matched signal: ${signal}`) : ["No dominant domain signal matched."],
    orient: uncertainty.length > 0 ? uncertainty : [`Classified as ${domain} based on current evidence.`],
    decide: [action],
    act: domain === "CHAOTIC"
      ? ["Contain the instability before deeper diagnosis."]
      : ["Keep the next action bounded and inspectable."]
  };
}

function buildDecisionId(issueId: string, decidedAt: string): string {
  const timestamp = decidedAt.replace(/[^0-9A-Za-z]/g, "").slice(0, 32) || "now";
  return `decision_${safeIssueId(issueId) ?? "unknown"}_${timestamp}`;
}

function markdownValue(value: unknown): string {
  const compact = compactText(value);
  return compact.length > 0 ? compact.replace(/\|/g, "\\|") : "none";
}

function bulletList(lines: string[], label: string, values: string[]): void {
  lines.push(`- ${label}: ${values.length > 0 ? values.map(markdownValue).join("; ") : "none"}`);
}

function matchedSignals(decision: Omit<DecisionMetadata, "record_markdown">): string[] {
  return decision.diagnostics.domain_evidence
    .flatMap((item) => item.matched_signals)
    .filter((signal, index, all) => all.indexOf(signal) === index)
    .sort();
}

function hasSignal(decision: Omit<DecisionMetadata, "record_markdown">, ...signals: string[]): boolean {
  const matched = new Set(matchedSignals(decision));
  return signals.some((signal) => matched.has(signal));
}

function pushRecordHeader(lines: string[], decision: Omit<DecisionMetadata, "record_markdown">): void {
  lines.push(
    "# BOS Decision Record",
    "",
    `- Schema version: ${decision.schema_version}`,
    `- Decision: ${markdownValue(decision.decision_id)}`,
    `- Issue: ${markdownValue(decision.issue_id)}`,
    `- Domain: ${decision.cynefin_domain}`,
    `- Confidence: ${decision.confidence}`,
    `- Risk tier: ${decision.risk_tier}`,
    `- Record detail: ${decision.record_detail}`,
    `- Type: ${decision.decision_type}`,
    `- Decided by: ${decision.decided_by}`,
    `- Decided at: ${markdownValue(decision.decided_at)}`,
    `- Recommendation: ${markdownValue(decision.recommended_action)}`
  );
}

function pushFallbackAndValidation(lines: string[], decision: Omit<DecisionMetadata, "record_markdown">): void {
  lines.push("", "## Fallback-Ready Fields");
  lines.push(`- Selected surface: markdown-only`);
  lines.push(`- Issue ref: ${markdownValue(decision.issue_id)}`);
  lines.push(`- Decision ref: ${markdownValue(decision.decision_id)}`);
  lines.push(`- Emitted events: ${decision.emitted_events.length > 0 ? decision.emitted_events.map(markdownValue).join("; ") : "none"}`);
  lines.push(`- Recommended action: ${markdownValue(decision.recommended_action)}`);

  lines.push("", "## Validation Diagnostics");
  lines.push(`- Sanitized: ${decision.diagnostics.sanitized}`);
  bulletList(lines, "Validation errors", decision.diagnostics.validation_errors);
}

function pushCompactDiagnostics(lines: string[], decision: Omit<DecisionMetadata, "record_markdown">): void {
  lines.push("", "## Compact Rationale");
  bulletList(lines, "Domain reasons", decision.diagnostics.selected_domain_reasons);
  bulletList(lines, "Risk reasons", decision.diagnostics.risk_reasons);
}

function pushExpandedDiagnostics(lines: string[], decision: Omit<DecisionMetadata, "record_markdown">): void {
  lines.push("", "## Domain Evidence");
  const positiveEvidence = decision.diagnostics.domain_evidence.filter((item) => item.score > 0);
  if (positiveEvidence.length === 0) {
    lines.push("- none");
  } else {
    for (const evidence of positiveEvidence) {
      lines.push(`- ${evidence.domain}: score ${evidence.score}; matched ${evidence.matched_signals.map(markdownValue).join(", ")}; reasons ${evidence.reasons.map(markdownValue).join("; ")}`);
    }
  }

  lines.push("", "## Diagnostics");
  bulletList(lines, "Selected domain reasons", decision.diagnostics.selected_domain_reasons);
  bulletList(lines, "Risk reasons", decision.diagnostics.risk_reasons);
  bulletList(lines, "Uncertainty reasons", decision.diagnostics.uncertainty_reasons);
  bulletList(lines, "Matched signals", matchedSignals(decision));
}

function pushExpandedDecisionSections(lines: string[], decision: Omit<DecisionMetadata, "record_markdown">): void {
  if (decision.decision_type === "POLICY_UPDATE" || hasSignal(decision, "policy", "rule", "compliance", "constraint", "review", "expert")) {
    lines.push("", "## Policy / Expert Review");
    lines.push("- Required control: confirm policy owner, expert constraint, and reversible next step before action.");
  }

  if (hasSignal(decision, "budget")) {
    lines.push("", "## Budget Review");
    lines.push("- Required control: tie the recommendation to the current token or cash budget before approval.");
  }

  if (decision.decision_type === "SELF_HEALING" || hasSignal(decision, "outage", "incident", "emergency", "down", "breaker", "critical", "runaway", "stop")) {
    lines.push("", "## Incident / Containment");
    lines.push("- Required control: contain the active failure first, then record recovery evidence and after-action analysis.");
  }

  if (hasSignal(decision, "strategy", "hypothesis", "experiment", "probe", "emerging")) {
    lines.push("", "## Strategic Probe");
    lines.push("- Required control: choose one safe-to-fail probe with observable success and rollback criteria.");
  }

  if (decision.cynefin_domain === "DISORDER" || decision.diagnostics.uncertainty_reasons.length > 0 || hasSignal(decision, "ambiguous", "unknown", "uncertain")) {
    lines.push("", "## Ambiguity / Disorder Handling");
    lines.push("- Required control: separate conflicting evidence and collect one decisive observation before automation proceeds.");
  }

  if (decision.cynefin_domain === "COMPLEX") {
    lines.push("", "## Complex Decision Control");
    lines.push("- Required control: run bounded probes and inspect traces before turning the pattern into policy.");
  }

  if (decision.cynefin_domain === "CHAOTIC") {
    lines.push("", "## Chaotic Decision Control");
    lines.push("- Required control: act to restore control immediately, then reclassify once stable.");
  }

  if (decision.risk_tier === "HIGH" || decision.risk_tier === "CRITICAL") {
    lines.push("", "## High-Risk Safeguards");
    lines.push("- Required control: keep the next step bounded, owner-visible, and auditable with fallback-ready markdown.");
  }
}

function pushOoda(lines: string[], decision: Omit<DecisionMetadata, "record_markdown">): void {
  if (!decision.ooda) return;

  lines.push("", "## OODA");
  bulletList(lines, "Observe", decision.ooda.observe);
  bulletList(lines, "Orient", decision.ooda.orient);
  bulletList(lines, "Decide", decision.ooda.decide);
  bulletList(lines, "Act", decision.ooda.act);
}

export function renderDecisionRecord(decision: Omit<DecisionMetadata, "record_markdown">): string {
  const lines: string[] = [];
  pushRecordHeader(lines, decision);
  pushFallbackAndValidation(lines, decision);

  if (decision.record_detail === "compact") {
    pushCompactDiagnostics(lines, decision);
  } else {
    pushExpandedDiagnostics(lines, decision);
    pushExpandedDecisionSections(lines, decision);
  }

  pushOoda(lines, decision);

  return lines.join("\n");
}

export function decide(input: unknown): DecisionResult {
  const decidedAt = typeof input === "object" && input !== null && !Array.isArray(input) && typeof (input as Partial<DecisionInput>).now === "string"
    ? (input as Partial<DecisionInput>).now!
    : new Date().toISOString();
  const validation = validateInput(input);

  if (!validation.input) {
    return validationFailure(input, validation.errors, decidedAt);
  }

  const normalized = validation.input;
  const confidence = clampConfidence(normalized.confidence);
  const text = normalized.signals.join(" ").toLowerCase();
  const domainEvidence = DOMAIN_RULES.map((rule) => scoreDomain(text, rule));
  const classification = classify(domainEvidence, confidence);
  const decisionType = decisionTypeFor(classification.domain, text);
  const recommendedAction = recommendedActionFor(classification.domain, decisionType);
  const risk = riskFor(classification.domain, confidence, text);
  const recordDetail = recordDetailFor(classification.domain, risk.risk, confidence);
  const diagnostics: DecisionDiagnostics = {
    domain_evidence: domainEvidence,
    selected_domain_reasons: classification.reasons,
    risk_reasons: risk.reasons,
    validation_errors: [],
    uncertainty_reasons: classification.uncertainty,
    sanitized: true
  };

  const base: Omit<DecisionMetadata, "record_markdown"> = {
    schema_version: "1.0",
    accepted: true,
    decision_id: buildDecisionId(normalized.issue_id, decidedAt),
    issue_id: normalized.issue_id,
    cynefin_domain: classification.domain,
    confidence,
    risk_tier: risk.risk,
    record_detail: recordDetail,
    decision_type: decisionType,
    emitted_events: [],
    recommended_action: recommendedAction,
    decided_by: "Div7.MissionControl",
    decided_at: decidedAt,
    diagnostics,
    ooda: oodaFor(classification.domain, recommendedAction, domainEvidence, classification.uncertainty)
  };

  return {
    ...base,
    record_markdown: renderDecisionRecord(base)
  };
}
