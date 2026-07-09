# S05: E2E Mission Cycle Proof — UAT

**Milestone:** M005
**Written:** 2026-05-31T23:28:29.618Z

## S05 UAT: E2E Mission Cycle Proof

- UAT required: no
- UAT Type: Manual integration test (to be performed when live Paperclip auth is available)

### Preconditions
- Paperclip API key and base URL configured in environment.
- GitHub token with repo access for aipay.kz.
- BOS Light plugin loaded in Paperclip (S01 complete).
- Company template imported with 7 divisions visible (S02 complete).
- Resource intake checklist passed (S03 complete).
- Git operations configured (S04 complete).

### Steps
1. Create a mission in Paperclip UI with a vague goal (e.g., "Improve payment retry logic").
2. Verify Div7.MissionControl frames the mission into a structured envelope with risk level and requested divisions.
3. Verify a human approval artifact (document or comment) appears with Approve / Reject / Request Clarification options.
4. Approve the mission.
5. Verify Div1.HCO routes the mission to correct divisions.
6. Verify Div2.MasterPlanner produces a Blueprint and BPI.
7. Verify Div3.Treasury checks token budget.
8. Verify Div4.Production creates a feature branch (`feature/bos-{mission_id}`), commits changes, and pushes.
9. Verify direct push to main/master is blocked and recorded.
10. Verify Div5.Qualifications reviews the diff, runs Eval Gate, and produces a review artifact.
11. Verify Div6.External opens a PR from the feature branch to main after Div5 approval passes.
12. Verify the PR is merged and CI is triggered.
13. Verify all artifacts (documents, comments, issues) are readable in Paperclip UI.

### Expected Outcomes
- Mission flows through all 7 divisions without manual intervention except at HITL gates.
- Branch policy blocks are visible in Paperclip.
- QA review envelope shows diff hash, eval gate verdict, and security scan result.
- PR envelope shows PR number, merge commit SHA, and CI trigger ref.
- All artifacts are visible in Paperclip native UI.

### Edge Cases
- Missing GitHub token: system produces clean blocker artifact with no side effects.
- Missing Paperclip auth: mission intake halts with blocker artifact.
- Branch policy violation (direct main push): blocked with recorded reason.
- QA review fails eval gate: merge is blocked until issues resolved.
- Circuit Breaker opens after 3 failures: incident artifact created with 5 resolution options.
