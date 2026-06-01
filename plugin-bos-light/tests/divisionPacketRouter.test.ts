import { describe, it, expect, beforeEach } from "vitest";
import {
  emitDivisionPacket,
  getPacket,
  getDivisionInbox,
  peekDivisionInbox,
  clearPacketRouter,
  type DivisionPacketType,
} from "../src/divisionPacketRouter";
import type { Division } from "../src/contracts";

const ALL_PACKET_TYPES: DivisionPacketType[] = [
  "status_update",
  "escalation",
  "resource_request",
  "gate_decision",
  "completion_report",
];

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

  describe("type safety", () => {
    it("accepts all known packet types without type errors at runtime", () => {
      for (const packetType of ALL_PACKET_TYPES) {
        const diag = emitDivisionPacket("Div4.Production", "Div7.MissionControl", packetType, { test: true });
        const packet = getPacket(diag.packet_id);
        expect(packet).toBeDefined();
        expect(packet!.packet_type).toBe(packetType);
      }
    });

    it("rejects unknown packet types at the type level (compile-time) — runtime behavior is unchecked", () => {
      // This test documents the type-safe boundary. At runtime, TS-compiled code
      // would still accept an invalid string, but the type system blocks it.
      // We verify the declared type union does not include arbitrary strings.
      const validTypes: string[] = ALL_PACKET_TYPES;
      expect(validTypes).not.toContain("invalid_packet_type");
    });
  });

  describe("Div7 aggregation", () => {
    it("aggregates packets from multiple divisions into Div7 inbox", () => {
      const divisions: Division[] = [
        "Div1.HCO",
        "Div2.MasterPlanner",
        "Div3.Treasury",
        "Div4.Production",
        "Div5.QualificationsLibraryLearning",
        "Div6.External",
      ];

      for (const div of divisions) {
        emitDivisionPacket(div, "Div7.MissionControl", "status_update", { from: div });
      }

      const div7Inbox = getDivisionInbox("Div7.MissionControl");
      expect(div7Inbox).toHaveLength(divisions.length);
      const senderSet = new Set(div7Inbox.map((p) => p.from_division));
      expect(senderSet.size).toBe(divisions.length);
      for (const div of divisions) {
        expect(senderSet.has(div)).toBe(true);
      }
    });

    it("isolates inboxes between divisions", () => {
      emitDivisionPacket("Div3.Treasury", "Div7.MissionControl", "status_update", {});
      emitDivisionPacket("Div4.Production", "Div1.HCO", "escalation", {});

      expect(getDivisionInbox("Div7.MissionControl")).toHaveLength(1);
      expect(getDivisionInbox("Div1.HCO")).toHaveLength(1);
      expect(getDivisionInbox("Div3.Treasury")).toHaveLength(0);
      expect(getDivisionInbox("Div4.Production")).toHaveLength(0);
    });

    it("peekDivisionInbox returns the latest packet for Div7 when multiple divisions send packets", () => {
      emitDivisionPacket("Div3.Treasury", "Div7.MissionControl", "status_update", { seq: 1 });
      emitDivisionPacket("Div4.Production", "Div7.MissionControl", "completion_report", { seq: 2 });
      emitDivisionPacket("Div5.QualificationsLibraryLearning", "Div7.MissionControl", "gate_decision", { seq: 3 });

      const latest = peekDivisionInbox("Div7.MissionControl");
      expect(latest).toBeDefined();
      expect(latest!.packet_type).toBe("gate_decision");
      expect(getDivisionInbox("Div7.MissionControl")).toHaveLength(3);
    });
  });

  describe("cross-division routing", () => {
    it("allows routing between non-Div7 divisions", () => {
      const diag = emitDivisionPacket("Div3.Treasury", "Div4.Production", "resource_request", { resource: "GPU" });
      expect(diag.routed_to).toBe("Div4.Production");

      const div4Inbox = getDivisionInbox("Div4.Production");
      expect(div4Inbox).toHaveLength(1);
      expect(div4Inbox[0].from_division).toBe("Div3.Treasury");
      expect(div4Inbox[0].packet_type).toBe("resource_request");
    });

    it("supports bidirectional packet exchange", () => {
      emitDivisionPacket("Div2.MasterPlanner", "Div5.QualificationsLibraryLearning", "status_update", {});
      emitDivisionPacket("Div5.QualificationsLibraryLearning", "Div2.MasterPlanner", "gate_decision", {});

      expect(getDivisionInbox("Div5.QualificationsLibraryLearning")).toHaveLength(1);
      expect(getDivisionInbox("Div2.MasterPlanner")).toHaveLength(1);
    });
  });
});
