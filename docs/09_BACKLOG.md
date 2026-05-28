# 09 - Initial Backlog

## Epic 1 - Company Template

- [ ] Create 7 division agent profiles.
- [ ] Create org chart and reporting lines.
- [ ] Create task routing rules.
- [ ] Create company rituals.
- [ ] Validate import/export against current Paperclip.
- [ ] Pass A1.

## Epic 2 - Minimal Plugin Spike

- [ ] Check SDK version and current plugin runtime.
- [ ] C2 event emission spike.
- [ ] C3 state spike.
- [ ] C7 capability set confirmation.
- [ ] Decide native artifacts for approvals, comments, issue docs.

## Epic 3 - BPI and Blueprint

- [ ] Implement BPI pure function.
- [ ] Implement BPI agent tool adapter.
- [ ] Implement issue annotation/storage as cache-overlay-only until `state.issue_scoped` read/write/restart proof exists.
- [ ] Implement 5-section blueprint generator.
- [ ] Mirror blueprint into Product Blueprint artifact envelope with native document preference, comment fallback, and markdown-only fallback diagnostics.
- [ ] Prove `documents.native` and `comments.native` create/read behavior in a live Paperclip runtime before treating Blueprint artifacts as native host support.
- [ ] Pass A2-A3.

## Epic 4 - Betting Table

- [ ] Implement top-N selection by BPI.
- [ ] Implement dashboard data provider.
- [ ] Carry S03 `blueprint_id` through as an opaque artifact reference (`paperclip://.../documents/...`, `paperclip://.../comments/...`, or `markdown-only://...`) without approval/request scope bleed.
- [ ] Implement Approve Batch action.
- [ ] Create Paperclip-native approval/request.
- [ ] Mirror cycle state to native issue/project.
- [ ] Pass A4-A5.

## Epic 5 - Safety Loop

- [ ] Implement Eval Gates.
- [ ] Implement gate results persistence.
- [ ] Implement Circuit Breaker pure state machine.
- [ ] Implement run polling fallback.
- [ ] Create escalation issue on OPEN.
- [ ] Pass A6-A10.

## Epic 6 - State Resilience

- [ ] Clear plugin state in test environment.
- [ ] Restore config.
- [ ] Restore BPI scores.
- [ ] Restore current cycle.
- [ ] Restore gate results.
- [ ] Restore decisions.
- [ ] Pass A11a-e.

## Epic 7 - Div7 Decision Protocol

- [ ] Collect usage traces.
- [ ] Define trigger conditions.
- [ ] Implement Cynefin classifier.
- [ ] Implement OODA recommendation.
- [ ] Store decision record in issue comments/documents.
