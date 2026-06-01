import type { Division } from "./contracts";

export type DivisionPacketType =
  | "status_update"
  | "escalation"
  | "resource_request"
  | "gate_decision"
  | "completion_report";

export interface DivisionPacketEnvelope {
  schema_version: "1.0";
  packet_id: string;
  packet_type: DivisionPacketType;
  from_division: Division;
  to_division: Division;
  payload: unknown;
  timestamp: string;
}

export interface DivisionPacketDiagnostic {
  emitted: true;
  packet_id: string;
  routed_to: Division;
}

const packetStore: Map<string, DivisionPacketEnvelope> = new Map();
const divisionInbox: Map<Division, string[]> = new Map();

function generatePacketId(): string {
  return `pkt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function now(): string {
  return new Date().toISOString();
}

/**
 * Emit a typed division packet to the designated recipient division.
 * Non-Div7 divisions must use this route instead of direct human-facing adapter calls.
 * All packets are stored in an in-memory router for retrieval by the receiving division.
 */
export function emitDivisionPacket(
  fromDivision: Division,
  toDivision: Division,
  packetType: DivisionPacketType,
  payload: unknown
): DivisionPacketDiagnostic {
  const packet: DivisionPacketEnvelope = {
    schema_version: "1.0",
    packet_id: generatePacketId(),
    packet_type: packetType,
    from_division: fromDivision,
    to_division: toDivision,
    payload,
    timestamp: now(),
  };

  packetStore.set(packet.packet_id, packet);

  const inbox = divisionInbox.get(toDivision) ?? [];
  inbox.push(packet.packet_id);
  divisionInbox.set(toDivision, inbox);

  return {
    emitted: true,
    packet_id: packet.packet_id,
    routed_to: toDivision,
  };
}

/** Retrieve a single packet by its ID. */
export function getPacket(packetId: string): DivisionPacketEnvelope | undefined {
  return packetStore.get(packetId);
}

/** Retrieve all packet IDs in a division's inbox. */
export function getDivisionInbox(division: Division): DivisionPacketEnvelope[] {
  const ids = divisionInbox.get(division) ?? [];
  return ids.map((id) => packetStore.get(id)).filter((p): p is DivisionPacketEnvelope => p !== undefined);
}

/** Peek at the latest packet for a division without removing it. */
export function peekDivisionInbox(division: Division): DivisionPacketEnvelope | undefined {
  const ids = divisionInbox.get(division) ?? [];
  const latestId = ids[ids.length - 1];
  return latestId ? packetStore.get(latestId) : undefined;
}

/** Clear all packets (intended for test isolation). */
export function clearPacketRouter(): void {
  packetStore.clear();
  divisionInbox.clear();
}
