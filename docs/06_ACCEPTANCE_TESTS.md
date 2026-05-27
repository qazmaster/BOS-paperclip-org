# 06 - Acceptance Tests

| # | Component | Given | When | Then |
|---|---|---|---|---|
| A1 | Company Template | Fresh Paperclip company | Import BOS template | 7 agents created with AGENTS.md; org chart rendered |
| A2 | BPI Score | Issue created in backlog | Div2 calls `piko:bpi-score` | Score 0.0-1.0 stored in issue-scoped state and visible in UI |
| A3 | Blueprint Gen | Issue approved by BPI | `piko:blueprint-gen` invoked | Issue Document with identity, bpi, acceptance, resources, qa |
| A4 | Betting Table | 5+ issues with BPI score | Widget renders Pitch Deck | Table shows top-N by BPI; Approve button visible |
| A5 | Batch Approval | Betting Table with candidates | User clicks Approve Batch | Paperclip-native approval/request created; no plugin-side decision |
| A6 | Eval Gate Pass | Issue in `QA_REVIEW` | All blocking gates pass | Status `ACCEPTED`; gate results in issue document |
| A7 | Eval Gate Fail | Issue in `QA_REVIEW` | Blocking gate fails | Status `CORRECTION_REQUIRED`; guidance attached |
| A8 | Circuit Breaker Close | Issue with 1 failed attempt | Retry succeeds | State `CLOSED`; `attempt_count` reset |
| A9 | Circuit Breaker Open | Issue with 3 failed attempts | 3rd failure detected | State `OPEN`; escalation issue created; alert sent |
| A10 | CB Fallback | Events unavailable | Circuit Breaker active | Polling detects failures; transitions correct |
| A11a | State: Config | Plugin state cleared | Restart plugin | BOS config reloaded from Paperclip artifacts |
| A11b | State: BPI Scores | Plugin state cleared | Restart plugin | BPI scores restored from issue documents/state |
| A11c | State: Betting Table | Plugin state cleared | Restart plugin | Current cycle restored from native issue/project |
| A11d | State: Gate Results | Plugin state cleared | Restart plugin | Gate results restored from issue comments/docs |
| A11e | State: Decisions | Plugin state cleared | Restart plugin | Decision records restored from issue comments |

## Test strategy

- Unit-test pure logic: BPI, blueprint, gates, circuit breaker transitions.
- Integration-test Paperclip SDK adapters only after state/event spike.
- E2E-test demo script once a Paperclip instance is available.
