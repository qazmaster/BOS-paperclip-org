import { describe, it, expect } from "vitest";
import {
  generateExecutiveReport,
  toMarkdown,
  type ExecutiveReportOutput,
} from "../src/executiveReport";
import type { MissionEnvelope } from "../src/missionIntake";
import type { DivisionPacketEnvelope } from "../src/divisionPacketRouter";
import type { EvalGateResult } from "../src/contracts";

function makeMission(overrides: Partial<MissionEnvelope> = {}): MissionEnvelope {
  return {
    schema_version: "1.0",
    mission_id: "mission_test_001",
    title: "Test Mission",
    description: "A test mission for executive report generation",
    business_goal: "Increase revenue or monetization",
    risk_level: "MEDIUM",
    requested_divisions: [
      "Div7.MissionControl",
      "Div4.Production",
      "Div5.QualificationsLibraryLearning",
    ],
    status: "APPROVED",
    created_at: "2026-06-01T00:00:00.000Z",
    updated_at: "2026-06-01T00:00:00.000Z",
    ...overrides,
  };
}

function makePacket(
  from: DivisionPacketEnvelope["from_division"],
  type: DivisionPacketEnvelope["packet_type"],
  payload: unknown = {}
): DivisionPacketEnvelope {
  return {
    schema_version: "1.0",
    packet_id: `pkt_${from}_${type}`,
    packet_type: type,
    from_division: from,
    to_division: "Div7.MissionControl",
    payload,
    timestamp: "2026-06-01T00:00:00.000Z",
  };
}

function makeGate(overrides: Partial<EvalGateResult> = {}): EvalGateResult {
  return {
    schema_version: "1.0",
    issue_id: "issue_001",
    run_id: "run_001",
    gates: [
      {
        gate_id: "LARS.Deterministic",
        status: "PASSED",
        evidence: null,
        is_blocking: true,
      },
      {
        gate_id: "LARS.SecurityPolicy",
        status: "PASSED",
        evidence: null,
        is_blocking: true,
      },
    ],
    overall: "PASSED",
    blocking_failure_count: 0,
    warning_count: 0,
    not_run_count: 0,
    evaluated_at: "2026-06-01T00:00:00.000Z",
    evaluated_by: "Div5.QualificationsLibraryLearning",
    ...overrides,
  };
}

describe("generateExecutiveReport", () => {
  it("generates a report with all required sections", () => {
    const report = generateExecutiveReport(makeMission(), [], []);
    expect(report.schema_version).toBe("1.0");
    expect(report.report_id).toMatch(/^exec_rpt_\d+_[a-z0-9]+$/);
    expect(report.issued_by).toBe("Div7.MissionControl");
    expect(report.issued_at).toBeDefined();
    expect(report.mission_summary).toContain("mission_test_001");
    expect(report.mission_summary).toContain("Test Mission");
    expect(report.division_activity).toEqual([]);
    expect(report.verdict).toBeDefined();
    expect(report.recommendations).toBeInstanceOf(Array);
  });

  it("aggregates division activity from packets", () => {
    const packets: DivisionPacketEnvelope[] = [
      makePacket("Div4.Production", "status_update", { step: 1 }),
      makePacket("Div4.Production", "completion_report", { step: 2 }),
      makePacket("Div5.QualificationsLibraryLearning", "gate_decision", { gate: "LARS.SecurityPolicy", verdict: "PASSED" }),
    ];

    const report = generateExecutiveReport(makeMission(), packets, []);
    expect(report.division_activity).toHaveLength(2);

    const prodActivity = report.division_activity.find((a) => a.division === "Div4.Production");
    expect(prodActivity).toBeDefined();
    expect(prodActivity!.packets_received).toBe(2);
    expect(prodActivity!.packet_types).toContain("status_update");
    expect(prodActivity!.packet_types).toContain("completion_report");
    expect(prodActivity!.latest_status).toBe("completion_report");

    const qualActivity = report.division_activity.find((a) => a.division === "Div5.QualificationsLibraryLearning");
    expect(qualActivity).toBeDefined();
    expect(qualActivity!.packets_received).toBe(1);
    expect(qualActivity!.packet_types).toEqual(["gate_decision"]);
  });

  it("matches gate results to division activity via issue_id", () => {
    const packets: DivisionPacketEnvelope[] = [
      makePacket("Div4.Production", "status_update", { issue_id: "issue_001" }),
    ];
    const gates: EvalGateResult[] = [
      makeGate({ issue_id: "issue_001", overall: "PASSED_WITH_WARNINGS" }),
    ];

    const report = generateExecutiveReport(makeMission(), packets, gates);
    const activity = report.division_activity.find((a) => a.division === "Div4.Production");
    expect(activity).toBeDefined();
    expect(activity!.gate_overall).toBe("PASSED_WITH_WARNINGS");
  });

  it("verdict says REJECTED when mission status is REJECTED", () => {
    const report = generateExecutiveReport(makeMission({ status: "REJECTED" }), [], []);
    expect(report.verdict).toContain("REJECTED");
    expect(report.verdict).toContain("No further action recommended");
  });

  it("verdict says DRAFT when mission status is DRAFT", () => {
    const report = generateExecutiveReport(makeMission({ status: "DRAFT" }), [], []);
    expect(report.verdict).toContain("DRAFT");
    expect(report.verdict).toContain("Await human approval");
  });

  it("verdict says PENDING_APPROVAL when mission status is PENDING_APPROVAL", () => {
    const report = generateExecutiveReport(makeMission({ status: "PENDING_APPROVAL" }), [], []);
    expect(report.verdict).toContain("PENDING_APPROVAL");
    expect(report.verdict).toContain("awaits Human Owner response");
  });

  it("verdict reports blocking gate failures for APPROVED missions", () => {
    const gates: EvalGateResult[] = [
      makeGate({
        overall: "FAILED_BLOCKING",
        blocking_failure_count: 1,
        gates: [
          { gate_id: "LARS.Deterministic", status: "FAILED", evidence: "Determinism check failed", is_blocking: true },
          { gate_id: "LARS.SecurityPolicy", status: "PASSED", evidence: null, is_blocking: true },
        ],
      }),
    ];
    const report = generateExecutiveReport(makeMission({ status: "APPROVED" }), [], gates);
    expect(report.verdict).toContain("1 gate(s) failed blocking evaluation");
    expect(report.verdict).toContain("Corrections required");
  });

  it("verdict reports warnings for APPROVED missions", () => {
    const gates: EvalGateResult[] = [
      makeGate({ overall: "PASSED_WITH_WARNINGS", warning_count: 1 }),
    ];
    const report = generateExecutiveReport(makeMission({ status: "APPROVED" }), [], gates);
    expect(report.verdict).toContain("1 gate warning(s)");
    expect(report.verdict).toContain("Proceed with caution");
  });

  it("recommends submission for DRAFT missions", () => {
    const report = generateExecutiveReport(makeMission({ status: "DRAFT" }), [], []);
    expect(report.recommendations.some((r) => r.includes("Submit mission"))).toBe(true);
  });

  it("recommends monitoring for PENDING_APPROVAL missions", () => {
    const report = generateExecutiveReport(makeMission({ status: "PENDING_APPROVAL" }), [], []);
    expect(report.recommendations.some((r) => r.includes("Monitor Human Owner response"))).toBe(true);
  });

  it("recommends manual review for CRITICAL risk", () => {
    const report = generateExecutiveReport(makeMission({ risk_level: "CRITICAL" }), [], []);
    expect(report.recommendations.some((r) => r.includes("CRITICAL risk") && r.includes("Div1.HCO"))).toBe(true);
  });

  it("recommends re-evaluation for HIGH risk", () => {
    const report = generateExecutiveReport(makeMission({ risk_level: "HIGH" }), [], []);
    expect(report.recommendations.some((r) => r.includes("HIGH risk") && r.includes("Div5.QualificationsLibraryLearning"))).toBe(true);
  });

  it("recommends addressing blocking gate failures", () => {
    const gates: EvalGateResult[] = [
      makeGate({
        overall: "FAILED_BLOCKING",
        blocking_failure_count: 1,
        gates: [
          { gate_id: "LARS.Deterministic", status: "FAILED", evidence: "Flaky test suite", is_blocking: true },
          { gate_id: "LARS.SecurityPolicy", status: "PASSED", evidence: null, is_blocking: true },
        ],
      }),
    ];
    const report = generateExecutiveReport(makeMission(), [], gates);
    expect(report.recommendations.some((r) => r.includes("LARS.Deterministic") && r.includes("Flaky test suite"))).toBe(true);
  });

  it("recommends verifying inactive divisions", () => {
    const report = generateExecutiveReport(
      makeMission({ requested_divisions: ["Div7.MissionControl", "Div4.Production", "Div6.External"] }),
      [],
      []
    );
    expect(report.recommendations.some((r) => r.includes("Div4.Production") && r.includes("Div6.External") && r.includes("No packets received"))).toBe(true);
  });

  it("falls back to a default recommendation when nothing else applies", () => {
    // Limit requested_divisions to only those with packets so no inactive-division warning fires
    const packets: DivisionPacketEnvelope[] = [
      makePacket("Div4.Production", "status_update"),
      makePacket("Div5.QualificationsLibraryLearning", "completion_report"),
    ];
    const report = generateExecutiveReport(
      makeMission({ requested_divisions: ["Div4.Production", "Div5.QualificationsLibraryLearning"] }),
      packets,
      []
    );
    expect(report.recommendations.some((r) => r.includes("No outstanding recommendations"))).toBe(true);
  });
});

describe("toMarkdown", () => {
  it("renders a complete markdown report", () => {
    const report = generateExecutiveReport(makeMission(), [], []);
    const md = toMarkdown(report);
    expect(md).toContain(`# Executive Report: ${report.report_id}`);
    expect(md).toContain("**Issued by:** Div7.MissionControl");
    expect(md).toContain("## Mission Summary");
    expect(md).toContain("## Division Activity");
    expect(md).toContain("## Verdict");
    expect(md).toContain("## Recommendations");
  });

  it("renders a no-activity placeholder when there are no packets", () => {
    const report = generateExecutiveReport(makeMission(), [], []);
    const md = toMarkdown(report);
    expect(md).toContain("_No division activity recorded._");
  });

  it("renders division activity details", () => {
    const packets: DivisionPacketEnvelope[] = [
      makePacket("Div4.Production", "status_update"),
    ];
    const report = generateExecutiveReport(makeMission(), packets, []);
    const md = toMarkdown(report);
    expect(md).toContain("### Div4.Production");
    expect(md).toContain("**Packets received:** 1");
    expect(md).toContain("**Packet types:** status_update");
    expect(md).toContain("**Latest status:** status_update");
    expect(md).toContain("**Detail:**");
  });

  it("renders gate results when present", () => {
    const packets: DivisionPacketEnvelope[] = [
      makePacket("Div4.Production", "status_update", { issue_id: "issue_001" }),
    ];
    const gates: EvalGateResult[] = [
      makeGate({ issue_id: "issue_001", overall: "FAILED_BLOCKING" }),
    ];
    const report = generateExecutiveReport(makeMission(), packets, gates);
    const md = toMarkdown(report);
    expect(md).toContain("**Gate result:** FAILED_BLOCKING");
  });
});
