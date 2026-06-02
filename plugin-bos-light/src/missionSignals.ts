import type { Division } from "./contracts";
import type { MissionEnvelope } from "./missionIntake";

/**
 * Mission signals extracted deterministically from mission metadata.
 * No LLM dependency - pure keyword and composition analysis.
 *
 * Used for pre-decision routing (before Div7 involvement).
 * Cynefin domain is NOT included here - that comes from Div7.decide().
 */
export interface MissionSignals {
  /** Task classification based on keywords */
  taskClass: "technical" | "research" | "compliance" | "budget" | "external" | "qa" | "strategy" | "unknown";

  /** Divisions requested in the mission */
  requestedDivisions: Division[];

  /** Whether external data/API access is needed */
  requiresExternalData: boolean;

  /** Whether budget or access grants are needed */
  requiresBudgetOrAccess: boolean;

  /** Whether implementation work is needed */
  requiresImplementation: boolean;

  /** Whether QA/verification is needed */
  requiresQA: boolean;

  /** Risk level from mission metadata */
  riskLevel: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

  /** Ambiguity level based on keyword signals */
  ambiguityLevel: "low" | "medium" | "high";

  /** Whether incident/chaotic signals are present */
  incidentSignals: boolean;

  /** Whether policy/strategy signals are present */
  policySignals: boolean;
}

const INCIDENT_KEYWORDS = ["outage", "incident", "emergency", "critical", "runaway", "breaker", "down", "crash", "fail"];
const POLICY_KEYWORDS = ["policy", "strategy", "strategic", "ambiguous", "uncertain", "experiment", "hypothesis", "compliance"];
const TECHNICAL_KEYWORDS = ["code", "feature", "implement", "build", "fix", "bug", "refactor", "deploy"];
const RESEARCH_KEYWORDS = ["research", "investigate", "analyze", "explore", "study", "spike"];
const BUDGET_KEYWORDS = ["budget", "cost", "funding", "resource", "allocate"];
const EXTERNAL_KEYWORDS = ["external", "api", "integration", "third-party", "partner", "webhook"];
const QA_KEYWORDS = ["test", "qa", "verify", "audit", "review", "security", "quality"];
const AMBIGUITY_KEYWORDS = ["uncertain", "ambiguous", "unclear", "explore", "experiment", "hypothesis", "maybe", "might"];
const ROUTINE_KEYWORDS = ["routine", "standard", "known", "playbook", "batch", "approve"];

/**
 * Extract deterministic mission signals from mission metadata.
 * This is the pre-decision analysis - no LLM, no Cynefin classification.
 */
export function deriveMissionSignals(mission: MissionEnvelope): MissionSignals {
  const text = `${mission.title} ${mission.description}`.toLowerCase();
  const divisions = mission.requested_divisions;

  return {
    taskClass: classifyTask(text),
    requestedDivisions: divisions,
    requiresExternalData: EXTERNAL_KEYWORDS.some(k => text.includes(k)) || divisions.includes("Div6.External"),
    requiresBudgetOrAccess: BUDGET_KEYWORDS.some(k => text.includes(k)) || divisions.includes("Div3.Treasury"),
    requiresImplementation: TECHNICAL_KEYWORDS.some(k => text.includes(k)) || divisions.includes("Div4.Production"),
    requiresQA: QA_KEYWORDS.some(k => text.includes(k)) || divisions.includes("Div5.QualificationsLibraryLearning"),
    riskLevel: mission.risk_level,
    ambiguityLevel: classifyAmbiguity(text),
    incidentSignals: INCIDENT_KEYWORDS.some(k => text.includes(k)),
    policySignals: POLICY_KEYWORDS.some(k => text.includes(k)),
  };
}

function classifyTask(text: string): MissionSignals["taskClass"] {
  if (TECHNICAL_KEYWORDS.some(k => text.includes(k))) return "technical";
  if (RESEARCH_KEYWORDS.some(k => text.includes(k))) return "research";
  if (COMPLIANCE_KEYWORDS.some(k => text.includes(k))) return "compliance";
  if (BUDGET_KEYWORDS.some(k => text.includes(k))) return "budget";
  if (EXTERNAL_KEYWORDS.some(k => text.includes(k))) return "external";
  if (QA_KEYWORDS.some(k => text.includes(k))) return "qa";
  if (POLICY_KEYWORDS.some(k => text.includes(k))) return "strategy";
  return "unknown";
}

const COMPLIANCE_KEYWORDS = ["compliance", "regulation", "audit", "governance", "policy"];

function classifyAmbiguity(text: string): MissionSignals["ambiguityLevel"] {
  const matches = AMBIGUITY_KEYWORDS.filter(k => text.includes(k)).length;
  if (matches >= 3) return "high";
  if (matches >= 1) return "medium";
  if (ROUTINE_KEYWORDS.some(k => text.includes(k))) return "low";
  return "low";
}

/**
 * Determine if a mission requires Div7 executive decision.
 * Based on MissionSignals analysis, not Cynefin domain.
 *
 * Div7 is needed when:
 * - Incident/chaotic signals present
 * - Policy/strategy signals present
 * - Critical risk level
 * - Div7 explicitly requested
 * - High ambiguity with multiple divisions
 *
 * Div7 is NOT needed for:
 * - Routine technical work
 * - Standard external requests
 * - Budget/access with clear owner
 */
export function requiresExecutiveDecision(signals: MissionSignals): boolean {
  // Incident/chaotic signals always need executive decision
  if (signals.incidentSignals) return true;

  // Policy/strategy signals need executive decision
  if (signals.policySignals) return true;

  // Critical risk needs executive decision
  if (signals.riskLevel === "CRITICAL") return true;

  // Div7 explicitly requested
  if (signals.requestedDivisions.includes("Div7.MissionControl")) return true;

  // Routine work does not need executive decision
  if (signals.ambiguityLevel === "low" && signals.taskClass !== "unknown") return false;

  // High ambiguity with multiple divisions may need executive decision
  if (signals.ambiguityLevel === "high" && signals.requestedDivisions.length > 3) return true;

  return false;
}
