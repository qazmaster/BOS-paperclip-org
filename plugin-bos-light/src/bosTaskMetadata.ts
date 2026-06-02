import type { Division, CynefinDomain, RoutingPhase } from "./contracts";

/**
 * BOS Task Metadata - governance layer over Paperclip tasks.
 * Source of truth for routing state and mission context.
 *
 * Paperclip tasks are the physical execution unit.
 * BosTaskMetadata is the semantic governance layer.
 */
export interface BosTaskMetadata {
  schemaVersion: "bos-light.metadata.v1";
  bosMissionId: string;
  currentDivision: Division;
  requiredDivisions: Division[];
  routingPhase: RoutingPhase;
  cynefinDomain?: CynefinDomain;
  decisionId?: string;
  budgetGrantId?: string;
  accessScope?: string[];
  qaRequired: boolean;
  externalWorldRequired: boolean;
  quarantineRequired: boolean;
}

/**
 * Storage interface for BosTaskMetadata.
 * M008: In-memory implementation.
 * M007B: Will add persistent storage (SQLite/plugin data dir).
 */
export interface BosTaskMetadataStorage {
  get(issueId: string): BosTaskMetadata | undefined;
  set(issueId: string, metadata: BosTaskMetadata): void;
  delete(issueId: string): void;
  getByMission(missionId: string): Array<{ issueId: string; metadata: BosTaskMetadata }>;
}

/**
 * In-memory implementation of BosTaskMetadataStorage.
 * Suitable for testing and M008 development.
 */
export class InMemoryBosTaskMetadataStorage implements BosTaskMetadataStorage {
  private store = new Map<string, BosTaskMetadata>();

  get(issueId: string): BosTaskMetadata | undefined {
    return this.store.get(issueId);
  }

  set(issueId: string, metadata: BosTaskMetadata): void {
    this.store.set(issueId, metadata);
  }

  delete(issueId: string): void {
    this.store.delete(issueId);
  }

  getByMission(missionId: string): Array<{ issueId: string; metadata: BosTaskMetadata }> {
    const results: Array<{ issueId: string; metadata: BosTaskMetadata }> = [];
    for (const [issueId, metadata] of this.store.entries()) {
      if (metadata.bosMissionId === missionId) {
        results.push({ issueId, metadata });
      }
    }
    return results;
  }

  /**
   * Clear all stored metadata (for test isolation).
   */
  clear(): void {
    this.store.clear();
  }
}

/**
 * Create a BosTaskMetadata with sensible defaults.
 */
export function createBosTaskMetadata(
  missionId: string,
  currentDivision: Division,
  requiredDivisions: Division[],
  overrides: Partial<Omit<BosTaskMetadata, "schemaVersion" | "bosMissionId" | "currentDivision" | "requiredDivisions">> = {}
): BosTaskMetadata {
  return {
    schemaVersion: "bos-light.metadata.v1",
    bosMissionId: missionId,
    currentDivision,
    requiredDivisions,
    routingPhase: "operational",
    qaRequired: false,
    externalWorldRequired: false,
    quarantineRequired: false,
    ...overrides,
  };
}
