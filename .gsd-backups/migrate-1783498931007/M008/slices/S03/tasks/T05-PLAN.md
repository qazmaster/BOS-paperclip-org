---
estimated_steps: 8
estimated_files: 1
skills_used: []
---

# T05: Add integration test for routing to PaperclipAction to metadata flow

Create test file testing:
1. Mission intake -> routing decision -> PaperclipAction -> BosTaskMetadata -> mirror comment
2. DryRunPaperclipTaskPort produces correct actions for each routing rule
3. BosTaskMetadata round-trips through storage
4. Metadata mirror format/parse round-trips
5. COMPLEX mission: Div7 -> DecisionDelegated -> Div1 -> Div2/Div4/Div5 actions
6. CHAOTIC mission: Div7 -> DecisionDelegated -> Div1 -> incident flow actions

Note: Uses routingPolicy.ts from S02 (S03 depends on S01+S02)

## Inputs

- `plugin-bos-light/src/paperclipTaskPort.ts`
- `plugin-bos-light/src/dryRunPaperclipTaskPort.ts`
- `plugin-bos-light/src/bosTaskMetadata.ts`
- `plugin-bos-light/src/metadataMirror.ts`

## Expected Output

- `plugin-bos-light/tests/paperclip-mapper.test.ts`

## Verification

All tests pass. Full flow from routing to PaperclipAction to metadata works.
