import { describe, it, expect, beforeEach } from "vitest";
import {
  emitDivisionPacket,
  getPacket,
  getDivisionInbox,
  peekDivisionInbox,
  clearPacketRouter,
  type DivisionPacketType,
} from "../src/divisionPacketRouter";

describe("DivisionPacketRouter", () => {
  beforeEach(() => {
    clearPacketRouter();
  });

  it("emits a status_update packet and returns diagnostic", () => {
    const diag = emitDivisionPacket(
      "Div3.Treasury",
      "Div7.MissionControl",
      "status_update",
      { progress: 42, milestone: "M006" }
    );
    expect(diag.emitted).toBe(true);
    expect(diag.routed_to).toBe("Div7.MissionControl");
    expect(diag.packet_id).toMatch(/^pkt_\d+_[a-z0-9]+$/);
  });

  it("emits an escalation packet", () => {
    const diag = emitDivisionPacket(
      "Div4.Production",
      "Div7.MissionControl",
      "escalation",
      { severity: "HIGH", reason: "Blocked by external dependency" }
    );
    const packet = getPacket(diag.packet_id);
    expect(packet).toBeDefined();
    expect(packet!.packet_type).toBe("escalation");
    expect(packet!.from_division).toBe("Div4.Production");
    expect(packet!.to_division).toBe("Div7.MissionControl");
  });

  it("emits a resource_request packet", () => {
    const diag = emitDivisionPacket(
      "Div5.QualificationsLibraryLearning",
      "Div7.MissionControl",
      "resource_request",
      { resource: "additional_qa_capacity", urgency: "MEDIUM" }
    );
    const packet = getPacket(diag.packet_id);
    expect(packet!.packet_type).toBe("resource_request");
  });

  it("emits a gate_decision packet", () => {
    const diag = emitDivisionPacket(
      "Div5.QualificationsLibraryLearning",
      "Div7.MissionControl",
      "gate_decision",
      { gate: "LARS.SecurityPolicy", verdict: "PASSED" }
    );
    const packet = getPacket(diag.packet_id);
    expect(packet!.packet_type).toBe("gate_decision");
  });

  it("emits a completion_report packet", () => {
    const diag = emitDivisionPacket(
      "Div4.Production",
      "Div7.MissionControl",
      "completion_report",
      { deliverables: ["feature-x", "feature-y"], validated: true }
    );
    const packet = getPacket(diag.packet_id);
    expect(packet!.packet_type).toBe("completion_report");
  });

  it("stores packets in division inbox", () => {
    emitDivisionPacket("Div3.Treasury", "Div7.MissionControl", "status_update", { step: 1 });
    emitDivisionPacket("Div4.Production", "Div7.MissionControl", "status_update", { step: 2 });
    emitDivisionPacket("Div3.Treasury", "Div7.MissionControl", "escalation", { step: 3 });

    const div7Inbox = getDivisionInbox("Div7.MissionControl");
    expect(div7Inbox).toHaveLength(3);
    expect(div7Inbox[0].from_division).toBe("Div3.Treasury");
    expect(div7Inbox[1].from_division).toBe("Div4.Production");
    expect(div7Inbox[2].packet_type).toBe("escalation");
  });

  it("peekDivisionInbox returns the latest packet without removing it", () => {
    emitDivisionPacket("Div3.Treasury", "Div7.MissionControl", "status_update", { step: 1 });
    emitDivisionPacket("Div4.Production", "Div7.MissionControl", "completion_report", { step: 2 });

    const latest = peekDivisionInbox("Div7.MissionControl");
    expect(latest).toBeDefined();
    expect(latest!.packet_type).toBe("completion_report");

    // Inbox should still have both packets
    expect(getDivisionInbox("Div7.MissionControl")).toHaveLength(2);
  });

  it("clearPacketRouter empties all state", () => {
    const diag = emitDivisionPacket("Div3.Treasury", "Div7.MissionControl", "status_update", {});
    expect(getPacket(diag.packet_id)).toBeDefined();

    clearPacketRouter();
    expect(getPacket(diag.packet_id)).toBeUndefined();
    expect(getDivisionInbox("Div7.MissionControl")).toHaveLength(0);
  });
});
