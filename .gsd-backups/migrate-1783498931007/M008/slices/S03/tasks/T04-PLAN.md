---
estimated_steps: 6
estimated_files: 1
skills_used: []
---

# T04: Implement structured metadata mirror formatter

Create metadataMirror.ts:
1. formatBosMetadataComment(metadata: BosTaskMetadata): string - produces markdown block
2. Format: <!-- BOS_LIGHT_METADATA_START --> JSON block <!-- BOS_LIGHT_METADATA_END -->
3. parseBosMetadataComment(comment: string): BosTaskMetadata | null - extracts metadata
4. Round-trip safe: format then parse returns original metadata
5. Compact JSON with schemaVersion for forward compatibility

## Inputs

- `plugin-bos-light/src/bosTaskMetadata.ts`

## Expected Output

- `plugin-bos-light/src/metadataMirror.ts`

## Verification

formatBosMetadataComment() produces valid markdown. parseBosMetadataComment() round-trips correctly.
