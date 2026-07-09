---
estimated_steps: 1
estimated_files: 2
skills_used: []
---

# T03: Create Div5 QA review + Eval Gate integration TypeScript module

Why: Div5 must review Div4 code changes before Div6 can open PR and merge. Do: Create plugin-bos-light/src/qaReview.ts with QAReview class. Implement reviewDiff(diffText: string) → produces review envelope (diff_hash, files_changed, lines_added, lines_removed, security_flags[]). Implement runEvalGate(reviewEnvelope, criteria[]) → produces eval gate result (verdict: pass/flag/fail, rationale, evidence). Implement produceReviewArtifact(reviewResult, issueId) → mirrors review result to Paperclip document/comment. Implement isApprovedForMerge(reviewResult) → returns true only if eval gate verdict is pass and no critical security flags. Create qaReview.test.ts covering: diff review hashing, eval gate pass/fail, security flag detection, merge approval logic, artifact mirroring. Done when: unit tests pass.

## Inputs

- `plugin-bos-light/src/paperclipAdapter.ts`
- `plugin-bos-light/src/hybridPersistence.ts`
- `plugin-bos-light/src/evalGates.ts`

## Expected Output

- `plugin-bos-light/src/qaReview.ts`
- `plugin-bos-light/tests/qaReview.test.ts`

## Verification

cd plugin-bos-light && npx vitest run tests/qaReview.test.ts
