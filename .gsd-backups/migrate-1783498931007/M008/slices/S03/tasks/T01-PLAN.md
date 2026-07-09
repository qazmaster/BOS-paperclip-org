---
estimated_steps: 8
estimated_files: 1
skills_used: []
---

# T01: Define PaperclipTaskPort interface

Create paperclipTaskPort.ts:
1. PaperclipTaskPort interface with methods:
   - createIssue(input: CreateIssueInput): Promise<PaperclipIssueRef>
   - updateIssue(input: UpdateIssueInput): Promise<void>
   - addComment(input: AddCommentInput): Promise<void>
   - createChildIssue(input: CreateChildIssueInput): Promise<PaperclipIssueRef>
2. Supporting types: CreateIssueInput, UpdateIssueInput, AddCommentInput, CreateChildIssueInput, PaperclipIssueRef
3. All inputs include idempotencyKey for safe retry

## Inputs

- `plugin-bos-light/src/contracts.ts`

## Expected Output

- `plugin-bos-light/src/paperclipTaskPort.ts`

## Verification

TypeScript compiles. Interface has all required methods. All inputs have idempotencyKey.
