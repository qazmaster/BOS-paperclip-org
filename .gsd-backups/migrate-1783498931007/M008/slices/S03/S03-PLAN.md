# S03: PaperclipAction Mapper and BosTaskMetadata

**Goal:** Implement PaperclipTaskPort interface with dry-run mapper. Define BosTaskMetadata type and storage interface. Prepare structured metadata mirror formatter for comments/documents.
**Demo:** After this: dry-run PaperclipAction mapper produces structured action objects. BosTaskMetadata type and storage interface ready for M007B.

## Must-Haves

- 1. PaperclipTaskPort interface with createIssue, updateIssue, addComment, createChildIssue. 2. DryRunPaperclipTaskPort returns deterministic action objects without HTTP calls. 3. BosTaskMetadata type with all required fields. 4. BosTaskMetadataStorage interface with get/set/delete. 5. Structured metadata mirror formatter produces markdown block for Paperclip comments. 6. Integration test: routing decision -> PaperclipAction -> BosTaskMetadata -> mirror comment.

## Proof Level

- This slice proves: Unit tests for mapper output shape and metadata round-trip.

## Integration Closure

PaperclipTaskPort is interface only - no live Paperclip calls. BosTaskMetadata storage is in-memory for M008.

## Verification

- Dry-run actions logged for debugging.

## Tasks

- [x] **T01: Define PaperclipTaskPort interface** `est:1h`
  Create paperclipTaskPort.ts:
  1. PaperclipTaskPort interface with methods:
     - createIssue(input: CreateIssueInput): Promise<PaperclipIssueRef>
     - updateIssue(input: UpdateIssueInput): Promise<void>
     - addComment(input: AddCommentInput): Promise<void>
     - createChildIssue(input: CreateChildIssueInput): Promise<PaperclipIssueRef>
  2. Supporting types: CreateIssueInput, UpdateIssueInput, AddCommentInput, CreateChildIssueInput, PaperclipIssueRef
  3. All inputs include idempotencyKey for safe retry
  - Files: `plugin-bos-light/src/paperclipTaskPort.ts`
  - Verify: TypeScript compiles. Interface has all required methods. All inputs have idempotencyKey.

- [x] **T02: Implement DryRunPaperclipTaskPort** `est:1h`
  Create dryRunPaperclipTaskPort.ts:
  1. Implements PaperclipTaskPort interface
  2. Each method returns deterministic action objects instead of HTTP calls
  3. Actions include: actionType, targetDivision, labels, metadata, blockers, idempotencyKey
  4. Stores actions in memory for test inspection
  5. getEmittedActions(): PaperclipAction[] for verification
  - Files: `plugin-bos-light/src/dryRunPaperclipTaskPort.ts`
  - Verify: DryRunPaperclipTaskPort returns structured action objects. getEmittedActions() returns all actions for inspection.

- [x] **T03: Define BosTaskMetadata type and storage interface** `est:1h`
  Create bosTaskMetadata.ts:
  1. BosTaskMetadata type with: bosMissionId, currentDivision, requiredDivisions, routingPhase, cynefinDomain, decisionId, budgetGrantId, accessScope, qaRequired, externalWorldRequired, quarantineRequired
  2. BosTaskMetadataStorage interface with: get(issueId), set(issueId, metadata), delete(issueId), getByMission(missionId)
  3. InMemoryBosTaskMetadataStorage implementation for M008
  4. Metadata versioning: schemaVersion field
  - Files: `plugin-bos-light/src/bosTaskMetadata.ts`
  - Verify: TypeScript compiles. BosTaskMetadata has all required fields. InMemoryBosTaskMetadataStorage implements storage interface.

- [x] **T04: Implement structured metadata mirror formatter** `est:1h`
  Create metadataMirror.ts:
  1. formatBosMetadataComment(metadata: BosTaskMetadata): string - produces markdown block
  2. Format: <!-- BOS_LIGHT_METADATA_START --> JSON block <!-- BOS_LIGHT_METADATA_END -->
  3. parseBosMetadataComment(comment: string): BosTaskMetadata | null - extracts metadata
  4. Round-trip safe: format then parse returns original metadata
  5. Compact JSON with schemaVersion for forward compatibility
  - Files: `plugin-bos-light/src/metadataMirror.ts`
  - Verify: formatBosMetadataComment() produces valid markdown. parseBosMetadataComment() round-trips correctly.

- [x] **T05: Add integration test for routing to PaperclipAction to metadata flow** `est:2h`
  Create test file testing:
  1. Mission intake -> routing decision -> PaperclipAction -> BosTaskMetadata -> mirror comment
  2. DryRunPaperclipTaskPort produces correct actions for each routing rule
  3. BosTaskMetadata round-trips through storage
  4. Metadata mirror format/parse round-trips
  5. COMPLEX mission: Div7 -> DecisionDelegated -> Div1 -> Div2/Div4/Div5 actions
  6. CHAOTIC mission: Div7 -> DecisionDelegated -> Div1 -> incident flow actions
  - Files: `plugin-bos-light/tests/paperclip-mapper.test.ts`
  - Verify: All tests pass. Full flow from routing to PaperclipAction to metadata works.

## Files Likely Touched

- plugin-bos-light/src/paperclipTaskPort.ts
- plugin-bos-light/src/dryRunPaperclipTaskPort.ts
- plugin-bos-light/src/bosTaskMetadata.ts
- plugin-bos-light/src/metadataMirror.ts
- plugin-bos-light/tests/paperclip-mapper.test.ts
