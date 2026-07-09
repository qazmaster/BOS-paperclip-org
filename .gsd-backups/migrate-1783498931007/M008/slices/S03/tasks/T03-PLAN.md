---
estimated_steps: 5
estimated_files: 1
skills_used: []
---

# T03: Define BosTaskMetadata type and storage interface

Create bosTaskMetadata.ts:
1. BosTaskMetadata type with: bosMissionId, currentDivision, requiredDivisions, routingPhase, cynefinDomain, decisionId, budgetGrantId, accessScope, qaRequired, externalWorldRequired, quarantineRequired
2. BosTaskMetadataStorage interface with: get(issueId), set(issueId, metadata), delete(issueId), getByMission(missionId)
3. InMemoryBosTaskMetadataStorage implementation for M008
4. Metadata versioning: schemaVersion field

## Inputs

- `plugin-bos-light/src/contracts.ts`

## Expected Output

- `plugin-bos-light/src/bosTaskMetadata.ts`

## Verification

TypeScript compiles. BosTaskMetadata has all required fields. InMemoryBosTaskMetadataStorage implements storage interface.
