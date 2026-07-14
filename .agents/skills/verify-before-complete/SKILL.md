---
name: verify-before-complete
description: Block completion claims until verification evidence has been produced in the current message. Use before marking a task/slice/milestone complete, before creating a commit or PR, before saying "it works" or "tests pass", and any time you are about to claim work is done. The rule is: evidence before claims, always — running the verification must happen now, not "earlier in the session". Fresh output or no claim.
---

# Verify Before Complete

Evidence before claims. Always. The freshness rule is non-negotiable:
verification must be observable in the message that contains the
completion claim, not in a prior turn.

## When to Use This Skill

- Marking any task / slice / milestone complete
- Saying "works", "fixed", "green", "pass", or any synonym
- Creating a commit, PR, or release
- Handing off work between agents

## Discipline

### 1. One Verdict Per Claim

Every assertion that work is done must include:

| # | Command | Exit | Verdict | Duration |
|---|---------|------|---------|----------|

Pick the smallest set that proves the claim. No decorative checks.

### 2. Fresh Output, Not Memory

- Never cite "I ran X earlier in the session" as verification.
- Re-run the command, capture stdout/stderr hash, and record it.
- For long-running checks, capture last-N lines plus the duration.

### 3. Bind Evidence to the Verifier

- Each claim names the file:line or test:case that proves it.
- If a fixture was added, name it inline.
- If an `MEMnnn` was created, cite its ID.

### 4. Distinguish Automation Levels

- `runtime` (executed in this session)
- `artifact` (cross-checked against a known-good artifact)
- `browser` (Playwright/Cypress visible-flow evidence)
- `human-follow-up` (clearly bounded; do not silently substitute)

## Anti-Patterns

- "Trust me, I tested it"
- "Earlier in the session it passed"
- "The tests are in the repo, just run them" (without running them)
- "Green CI" (without a CI URL or fresh log)
- Citing evidence from another agent's session

## Best Practices

1. **Capture stdout paths** — most runners support persisted output
   (`stderr.txt`, `*.stdout`, `.gsd/exec/...`); reference them.
2. **Compare against the expected verdict line** — if your task says
   "expected output: GATE=pass, blockers=0", grep for that exact line.
3. **Fail-closed wording** — when a verifier exits non-zero, record
   the exit code and the failure summary; do not reinterpret.
4. **Bound blast radius of the verifier itself** — verification must not
   mutate state unless explicitly required by the verification plan.

## Authoritative References

Full examples of admissible evidence shapes and deprecation of historical
shortcuts live upstream. This file is a path anchor;
restore-from-checkout is required for full coverage.
