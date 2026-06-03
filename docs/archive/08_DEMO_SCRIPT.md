# 08 - 5-Minute Demo Script

## Goal

Demonstrate BOS Light's visible value quickly: organization, prioritization, batch governance, quality and safety loop.

## Script

1. Import, 30 sec
   - Import BOS company template.
   - 7 agents appear.
   - Org chart visible.

2. Create Issue, 30 sec
   - User creates a vague issue.
   - Div2 triggers `piko:bpi-score`.
   - Score appears in issue tab.

3. Blueprint, 30 sec
   - Approve issue for shaping.
   - `piko:blueprint-gen` creates issue document.
   - Acceptance criteria visible.

4. Betting Table, 60 sec
   - Create 4-5 more issues.
   - Dashboard shows Pitch Deck sorted by BPI.
   - Click Approve Batch.
   - Paperclip approval request is created.

5. Safety Loop, 90 sec
   - Agent completes work.
   - Eval Gates run.
   - Gate results appear in issue document.
   - Circuit Breaker visible in dashboard.

6. Failure, 60 sec
   - Trigger 3 failures.
   - Circuit Breaker goes OPEN.
   - Escalation issue auto-created.

## Demo success criteria

- User sees why BOS reduces cognitive load.
- User sees that Paperclip remains ground truth.
- User sees no separate BOS runtime.
