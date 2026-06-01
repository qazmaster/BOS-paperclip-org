import type { MissionEnvelope } from "./missionIntake";
import type { DivisionPacketEnvelope } from "./divisionPacketRouter";
import type { EvalGateResult, Division } from "./contracts";

export interface DivisionActivity {
  division: Division;
  packets_received: number;
  packet_types: string[];
  latest_status: string;
  gate_overall?: string;
  detail: string;
}

export interface ExecutiveReportOutput {
  schema_version: "1.0";
  report_id: string;
  issued_by: "Div7.MissionControl";
  issued_at: string;
  mission_summary: string;
  division_activity: DivisionActivity[];
  verdict: string;
  recommendations: string[];
}

function generateReportId(): string {
  return `exec_rpt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function now(): string {
  return new Date().toISOString();
}

function aggregateDivisionActivity(
  packets: DivisionPacketEnvelope[],
  gates: EvalGateResult[]
): DivisionActivity[] {
  const byDivision = new Map<Division, DivisionPacketEnvelope[]>();

  for (const packet of packets) {
    const list = byDivision.get(packet.from_division) ?? [];
    list.push(packet);
    byDivision.set(packet.from_division, list);
  }

  // Ensure every requested division appears, even with zero packets
  const activities: DivisionActivity[] = [];

  for (const [division, divPackets] of byDivision) {
    const packetTypes = Array.from(new Set(divPackets.map((p) => p.packet_type)));
    const latest = divPackets[divPackets.length - 1];
    const gate = gates.find((g) => {
      // Best-effort match: if packet payload contains an issue_id, match it
      const payload = latest.payload as { issue_id?: string } | undefined;
      return payload?.issue_id ? g.issue_id === payload.issue_id : false;
    });

    activities.push({
      division,
      packets_received: divPackets.length,
      packet_types: packetTypes,
      latest_status: latest ? `${latest.packet_type}` : "no_activity",
      gate_overall: gate?.overall,
      detail: `Received ${divPackets.length} packet(s). Latest: ${latest?.packet_type ?? "none"}.`,
    });
  }

  return activities.sort((a, b) => a.division.localeCompare(b.division));
}

function deriveVerdict(
  mission: MissionEnvelope,
  activities: DivisionActivity[],
  gates: EvalGateResult[]
): string {
  const gateBlockers = gates.filter((g) => g.overall === "FAILED_BLOCKING").length;
  const gateWarnings = gates.filter((g) => g.overall === "PASSED_WITH_WARNINGS").length;

  if (mission.status === "REJECTED") {
    return `Mission ${mission.mission_id} was REJECTED. No further action recommended.`;
  }

  if (mission.status === "DRAFT") {
    return `Mission ${mission.mission_id} remains in DRAFT. Await human approval before execution.`;
  }

  if (mission.status === "PENDING_APPROVAL") {
    return `Mission ${mission.mission_id} is PENDING_APPROVAL. Div7.MissionControl awaits Human Owner response.`;
  }

  if (gateBlockers > 0) {
    return `Mission ${mission.mission_id} is APPROVED but ${gateBlockers} gate(s) failed blocking evaluation. Corrections required before release.`;
  }

  if (gateWarnings > 0) {
    return `Mission ${mission.mission_id} is APPROVED with ${gateWarnings} gate warning(s). Proceed with caution.`;
  }

  return `Mission ${mission.mission_id} is APPROVED. All gates passed. Ready for release.`;
}

function deriveRecommendations(
  mission: MissionEnvelope,
  activities: DivisionActivity[],
  gates: EvalGateResult[]
): string[] {
  const recommendations: string[] = [];

  if (mission.status === "DRAFT") {
    recommendations.push("Submit mission for Human Owner approval via Div7.MissionControl intake.");
  }

  if (mission.status === "PENDING_APPROVAL") {
    recommendations.push("Monitor Human Owner response; escalate if timeout threshold is reached.");
  }

  if (mission.risk_level === "CRITICAL") {
    recommendations.push("CRITICAL risk: enforce additional manual review by Div1.HCO before production deployment.");
  }

  if (mission.risk_level === "HIGH") {
    recommendations.push("HIGH risk: require Div5.QualificationsLibraryLearning gate re-evaluation after corrections.");
  }

  for (const gate of gates) {
    if (gate.overall === "FAILED_BLOCKING") {
      for (const g of gate.gates) {
        if (g.is_blocking && g.status === "FAILED") {
          recommendations.push(`Address blocking gate ${g.gate_id}: ${g.evidence ?? "no evidence"}`);
        }
      }
    }
  }

  const inactiveDivisions = mission.requested_divisions.filter(
    (d) => !activities.some((a) => a.division === d)
  );
  if (inactiveDivisions.length > 0) {
    recommendations.push(`No packets received from ${inactiveDivisions.join(", ")}. Verify division engagement.`);
  }

  if (recommendations.length === 0) {
    recommendations.push("No outstanding recommendations. Mission may proceed to release.");
  }

  return recommendations;
}

/**
 * Generate a structured executive report for the Human Owner.
 * Only Div7.MissionControl should invoke this at mission closure.
 */
export function generateExecutiveReport(
  mission: MissionEnvelope,
  packets: DivisionPacketEnvelope[],
  gates: EvalGateResult[]
): ExecutiveReportOutput {
  const activities = aggregateDivisionActivity(packets, gates);

  return {
    schema_version: "1.0",
    report_id: generateReportId(),
    issued_by: "Div7.MissionControl",
    issued_at: now(),
    mission_summary: `Mission ${mission.mission_id} — "${mission.title}" [${mission.risk_level}]\n` +
      `Business Goal: ${mission.business_goal}\n` +
      `Status: ${mission.status}\n` +
      `Requested Divisions: ${mission.requested_divisions.join(", ")}`,
    division_activity: activities,
    verdict: deriveVerdict(mission, activities, gates),
    recommendations: deriveRecommendations(mission, activities, gates),
  };
}

/**
 * Fallback markdown renderer for executive reports.
 * Use when native document/comment surfaces are unavailable.
 */
export function toMarkdown(report: ExecutiveReportOutput): string {
  const lines: string[] = [];

  lines.push(`# Executive Report: ${report.report_id}`);
  lines.push("");
  lines.push(`**Issued by:** ${report.issued_by}`);
  lines.push(`**Issued at:** ${report.issued_at}`);
  lines.push("");

  lines.push("## Mission Summary");
  lines.push(report.mission_summary);
  lines.push("");

  lines.push("## Division Activity");
  if (report.division_activity.length === 0) {
    lines.push("_No division activity recorded._");
  } else {
    for (const act of report.division_activity) {
      lines.push(`### ${act.division}`);
      lines.push(`- **Packets received:** ${act.packets_received}`);
      lines.push(`- **Packet types:** ${act.packet_types.join(", ") || "none"}`);
      lines.push(`- **Latest status:** ${act.latest_status}`);
      if (act.gate_overall) {
        lines.push(`- **Gate result:** ${act.gate_overall}`);
      }
      lines.push(`- **Detail:** ${act.detail}`);
      lines.push("");
    }
  }
  lines.push("");

  lines.push("## Verdict");
  lines.push(report.verdict);
  lines.push("");

  lines.push("## Recommendations");
  for (const rec of report.recommendations) {
    lines.push(`- ${rec}`);
  }

  return lines.join("\n");
}
