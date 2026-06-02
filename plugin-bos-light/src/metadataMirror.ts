import type { BosTaskMetadata } from "./bosTaskMetadata";

const METADATA_START = "<!-- BOS_LIGHT_METADATA_START -->";
const METADATA_END = "<!-- BOS_LIGHT_METADATA_END -->";

/**
 * Format BosTaskMetadata as a structured markdown comment block.
 * This is the mirror format for Paperclip task comments.
 *
 * Source of truth is BosTaskMetadataStorage, not the comment.
 * Comments provide audit trail and human visibility.
 */
export function formatBosMetadataComment(metadata: BosTaskMetadata): string {
  const json = JSON.stringify(metadata, null, 2);
  return `${METADATA_START}\n\`\`\`json\n${json}\n\`\`\`\n${METADATA_END}`;
}

/**
 * Parse BosTaskMetadata from a structured markdown comment block.
 * Returns null if no valid metadata block found.
 *
 * Round-trip safe: format then parse returns original metadata.
 */
export function parseBosMetadataComment(comment: string): BosTaskMetadata | null {
  const startIndex = comment.indexOf(METADATA_START);
  if (startIndex === -1) return null;

  const endIndex = comment.indexOf(METADATA_END, startIndex);
  if (endIndex === -1) return null;

  const block = comment.slice(startIndex + METADATA_START.length, endIndex);
  const jsonMatch = block.match(/```json\s*([\s\S]*?)\s*```/);
  if (!jsonMatch) return null;

  try {
    const parsed = JSON.parse(jsonMatch[1]);
    if (!isValidBosTaskMetadata(parsed)) return null;
    return parsed;
  } catch {
    return null;
  }
}

/**
 * Type guard for BosTaskMetadata.
 */
function isValidBosTaskMetadata(value: unknown): value is BosTaskMetadata {
  if (!value || typeof value !== "object") return false;
  const obj = value as Record<string, unknown>;
  return (
    obj.schemaVersion === "bos-light.metadata.v1" &&
    typeof obj.bosMissionId === "string" &&
    typeof obj.currentDivision === "string" &&
    Array.isArray(obj.requiredDivisions) &&
    typeof obj.routingPhase === "string" &&
    typeof obj.qaRequired === "boolean" &&
    typeof obj.externalWorldRequired === "boolean" &&
    typeof obj.quarantineRequired === "boolean"
  );
}

/**
 * Check if a comment contains BOS metadata.
 */
export function hasBosMetadata(comment: string): boolean {
  return comment.includes(METADATA_START) && comment.includes(METADATA_END);
}
