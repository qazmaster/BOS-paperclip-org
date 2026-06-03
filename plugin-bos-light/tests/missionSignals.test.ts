import { describe, expect, it } from "vitest";
import { deriveMissionSignals, requiresExecutiveDecision } from "../src/missionSignals";
import type { MissionEnvelope } from "../src/missionIntake";

function baseMission(overrides: Partial<MissionEnvelope> = {}): MissionEnvelope {
  return {
    mission_id: "mission_1",
    title: "Implement feature",
    description: "Build the new dashboard component",
    requested_divisions: ["Div4.Production"],
    risk_level: "LOW",
    ...overrides
  } as MissionEnvelope;
}

describe("deriveMissionSignals", () => {
  it("classifies technical tasks", () => {
    const signals = deriveMissionSignals(baseMission({
      title: "Fix login bug",
      description: "The login form has a bug that needs to be fixed"
    }));

    expect(signals.taskClass).toBe("technical");
    expect(signals.requiresImplementation).toBe(true);
  });

  it("classifies research tasks", () => {
    const signals = deriveMissionSignals(baseMission({
      title: "Research new framework",
      description: "Investigate and analyze alternative approaches"
    }));

    expect(signals.taskClass).toBe("research");
  });

  it("classifies budget tasks", () => {
    const signals = deriveMissionSignals(baseMission({
      title: "Budget allocation review",
      description: "Review cost and funding for Q3"
    }));

    expect(signals.taskClass).toBe("budget");
    expect(signals.requiresBudgetOrAccess).toBe(true);
  });

  it("classifies external tasks", () => {
    const signals = deriveMissionSignals(baseMission({
      title: "Third-party API integration",
      description: "Connect to external partner webhook"
    }));

    expect(signals.taskClass).toBe("external");
    expect(signals.requiresExternalData).toBe(true);
  });

  it("classifies QA tasks", () => {
    const signals = deriveMissionSignals(baseMission({
      title: "Quality verification",
      description: "Run qa checks and security review"
    }));

    expect(signals.taskClass).toBe("qa");
    expect(signals.requiresQA).toBe(true);
  });

  it("classifies strategy tasks", () => {
    const signals = deriveMissionSignals(baseMission({
      title: "Strategic direction",
      description: "Evaluate ambiguous uncertain approach"
    }));

    expect(signals.taskClass).toBe("strategy");
    expect(signals.policySignals).toBe(true);
  });

  it("detects incident signals", () => {
    const signals = deriveMissionSignals(baseMission({
      title: "Critical outage response",
      description: "System crash detected, emergency failover needed"
    }));

    expect(signals.incidentSignals).toBe(true);
    expect(signals.riskLevel).toBe("LOW"); // from mission metadata, not keywords
  });

  it("detects high ambiguity", () => {
    const signals = deriveMissionSignals(baseMission({
      title: "Uncertain exploration",
      description: "This is ambiguous and unclear, maybe we should experiment with a hypothesis"
    }));

    expect(signals.ambiguityLevel).toBe("high");
  });

  it("detects low ambiguity for routine work", () => {
    const signals = deriveMissionSignals(baseMission({
      title: "Standard batch deployment",
      description: "Routine playbook execution for known process"
    }));

    expect(signals.ambiguityLevel).toBe("low");
  });

  it("includes requested divisions", () => {
    const signals = deriveMissionSignals(baseMission({
      requested_divisions: ["Div4.Production", "Div5.QualificationsLibraryLearning"]
    }));

    expect(signals.requestedDivisions).toEqual(["Div4.Production", "Div5.QualificationsLibraryLearning"]);
    expect(signals.requiresQA).toBe(true);
  });

  it("detects external data requirement from Div6", () => {
    const signals = deriveMissionSignals(baseMission({
      requested_divisions: ["Div6.External"]
    }));

    expect(signals.requiresExternalData).toBe(true);
  });
});

describe("requiresExecutiveDecision", () => {
  it("requires decision for incident signals", () => {
    const signals = deriveMissionSignals(baseMission({
      title: "Outage response",
      description: "Critical system failure"
    }));

    expect(requiresExecutiveDecision(signals)).toBe(true);
  });

  it("requires decision for policy signals", () => {
    const signals = deriveMissionSignals(baseMission({
      title: "Strategic policy review",
      description: "Update compliance strategy"
    }));

    expect(requiresExecutiveDecision(signals)).toBe(true);
  });

  it("requires decision for critical risk", () => {
    const signals = deriveMissionSignals(baseMission({
      risk_level: "CRITICAL"
    }));

    expect(requiresExecutiveDecision(signals)).toBe(true);
  });

  it("requires decision when Div7 is requested", () => {
    const signals = deriveMissionSignals(baseMission({
      requested_divisions: ["Div7.MissionControl", "Div4.Production"]
    }));

    expect(requiresExecutiveDecision(signals)).toBe(true);
  });

  it("does not require decision for routine technical work", () => {
    const signals = deriveMissionSignals(baseMission({
      title: "Fix known bug",
      description: "Standard code fix for known issue",
      risk_level: "LOW"
    }));

    expect(requiresExecutiveDecision(signals)).toBe(false);
  });

  it("requires decision for high ambiguity with many divisions", () => {
    const signals = deriveMissionSignals(baseMission({
      title: "Unclear ambiguous uncertain exploration",
      description: "Maybe we should experiment with this hypothesis",
      requested_divisions: ["Div1.HCO", "Div3.Treasury", "Div4.Production", "Div5.QualificationsLibraryLearning"]
    }));

    expect(requiresExecutiveDecision(signals)).toBe(true);
  });
});
