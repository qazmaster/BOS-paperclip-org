# S07: Explicit Confirmation Mission Anchor Remediation — Research

## Summary

S07 must resolve the explicit-confirmation gap for BOS-3: the mission issue exists in Paperclip (created during S02 research without user confirmation), but the milestone success criteria require explicit user confirmation before the issue can serve as the authorized mission anchor. Three paths exist: (A) get explicit user confirmation for BOS-3 reuse, (B) create a new issue with explicit user confirmation via POST, or (C) formally re-scope the milestone success criterion. Path A is lowest-risk and most aligned with the HITL governance model. The slice produces a confirmation evidence artifact recording the user's decision, issue ID, company ID, route, timestamps, and safety flags.

## Active Requirements

| Requirement | Class | S07 Relationship |
|---|---|---|
| R022 (E2E mission cycle) | primary-user-loop | S07 advances R022 by resolving the BOS-3 confirmation gap; if confirmed, R022 gets honest "user-confirmed reuse" language |
| R023 (HITL gates) | differentiator | S07 exercises the HITL confirmation pattern at mission creation gate — the first of three HITL gates in R023 |

## What Exists

### BOS-3 Issue in Paperclip
- **ID:** `b9d9ab93-70ee-4562-b28c-0be62f18db60`
- **Identifier:** BOS-3
- **Title:** "BOS Light Mission: Validate 7-Division Flow"
- **Status:** backlog
- **Company ID:** `9feb4c22-05b9-401e-ba67-0e866e3056da` (canonical)
- **Created at:** `2026-06-03T07:16:17.333Z`
- **Origin:** Created during S02 research as a side effect of testing the Paperclip issues API — NOT with explicit user confirmation
- **Source:** `runtime-evidence/M012-S06-mission-issue-evidence.json`

### Session-Based Auth (Proven in S06)
- **Method:** POST /api/auth/sign-in/email with LAST-value-wins .env parser
- **Cookie:** `__Secure-paperclip-default.session_token`
- **Status:** Authenticated readback proven for company, agents (8), issues (2), projects (1), goals (1)
- **Source:** `runtime-evidence/M012-S06-session-auth-readback.json`

### Paperclip Issues API
- **List:** GET /api/companies/{companyId}/issues?limit=50 — proven working with session auth
- **Create:** POST /api/companies/{companyId}/issues — identified in S02, never successfully called (auth was blocked in S02, fixed in S06)
- **Expected body:** `{ title, description, status?, priority?, projectId?, goalId? }` (inferred from issue readback fields)

### HITL Governance Pattern (Local Code)
- `MissionIntake.requestHumanApproval()` creates approval artifacts (document-first, comment-fallback)
- `MissionIntake.simulateHumanResponse()` for testing
- `HITLGovernance.requestResourceGrant()`, `requestBatchApproval()`, `requestProductionDeploy()` for downstream gates
- All local-only — not connected to live Paperclip API

## Three Paths Forward

### Path A: Confirm BOS-3 Reuse (Recommended)
**What:** Ask the user to explicitly confirm that BOS-3 is the authorized mission issue for M012.
**Evidence produced:** `runtime-evidence/M012-S07-explicit-confirmation.json` recording user's confirmation, issue ID, company ID, route, timestamps, and safety flags.
**Risk:** Low — no new mutation, reuses existing issue.
**R022 impact:** Advances with honest "user-confirmed reuse" language.

### Path B: Create New Issue with Confirmation
**What:** Ask the user to confirm issue creation, then POST /api/companies/{companyId}/issues to create a new issue.
**Evidence produced:** New issue readback + confirmation artifact.
**Risk:** Medium — requires live mutation (POST), but user explicitly authorizes it.
**R022 impact:** Advances with "user-confirmed creation" language.

### Path C: Re-scope Success Criteria
**What:** Formally change the milestone success criteria to accept BOS-3 without explicit confirmation.
**Evidence produced:** Updated roadmap with re-scoped criteria.
**Risk:** Low execution risk, but weakens the HITL contract.
**R022 impact:** No advancement — the confirmation gap remains, just acknowledged.

## Recommendation

**Path A: Confirm BOS-3 Reuse.** Reasons:
1. BOS-3 already exists and is verified via authenticated readback
2. No new mutation needed — lowest risk
3. Exercises the HITL confirmation pattern (R023 first gate)
4. Produces honest evidence without overclaiming
5. Aligns with the milestone vision: "explicit confirmation before any live mutation"

## Implementation Landscape

### Task T01: Obtain Explicit User Confirmation
- Use `ask_user_questions` to present the user with the BOS-3 reuse option
- Record the user's response (confirm/reject/alternative)
- If user confirms BOS-3 reuse → proceed to T02
- If user wants a new issue → proceed to T02 with POST creation
- If user wants to re-scope → proceed to T03

### Task T02: Produce Confirmation Evidence Artifact
- Create `runtime-evidence/M012-S07-explicit-confirmation.json` with:
  - `confirmation_type`: "reuse" or "creation"
  - `issue_id`: BOS-3 id or new issue id
  - `company_id`: canonical company id
  - `route_used`: GET (reuse) or POST (creation)
  - `confirmed_at`: ISO timestamp
  - `confirmation_method`: "gsd_ask_user_questions"
  - `safety_flags`: read_only (reuse) or mutation_authorized (creation)
- If creation path: also run POST /api/companies/{companyId}/issues with session auth
- Verify the issue exists via authenticated readback after confirmation

### Task T03 (if re-scope): Update Milestone Success Criteria
- Update ROADMAP.md with re-scoped criteria
- Update requirement outcomes for R022/R023
- Record the re-scope decision

### Task T04: S07 Closeout Validator
- Create `scripts/validate_m012_s07_closeout.js` that checks:
  - Confirmation artifact exists and is valid JSON
  - Confirmation type is "reuse" or "creation"
  - Issue ID matches BOS-3 or a new verified issue
  - Company ID matches canonical
  - Timestamps are present and valid
  - Safety flags are present
  - Secret scan passes (no leaked credentials)
- Write `runtime-evidence/M012-S07-closeout-gate.json`

## Natural Seams

1. **User interaction** (T01) — independent, blocks everything else
2. **Evidence production** (T02) — depends on T01 outcome
3. **Validator** (T04) — depends on T02, can be written in parallel with T02 execution

## First Proof

The highest-risk item is the user interaction (T01). If the user is not available in auto-mode, the slice cannot proceed with Path A and must fall back to Path C (re-scope). The `ask_user_questions` tool should be used to get the confirmation.

## Verification

1. `runtime-evidence/M012-S07-explicit-confirmation.json` exists and passes schema validation
2. Confirmation type matches the user's decision
3. Issue ID is verified via authenticated Paperclip readback
4. `node scripts/validate_m012_s07_closeout.js` exits 0
5. Secret scan over S07 artifacts passes

## Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| User not available in auto-mode | Cannot get explicit confirmation | Fall back to Path C (re-scope) |
| Paperclip POST /issues fails | Cannot create new issue | Use Path A (reuse BOS-3) instead |
| Secret leak in confirmation artifact | S08 gate fails | Use same redaction patterns as S06 |
| BOS-3 deleted between S06 and S07 | Issue no longer exists | Re-readback before confirmation, create new if missing |

## Constraints

- Session-based auth with LAST-value-wins .env parser (proven in S06)
- Canonical company ID: `9feb4c22-05b9-401e-ba67-0e866e3056da`
- Stale sandbox ID must be rejected: `43c74adb-b194-44d1-8f8e-ba142544bb9d`
- All secrets must be redacted from artifacts (SECRET_PATTERNS from S06)
- No mutation without explicit user confirmation (milestone contract)
- BOS-3 identifier: `BOS-3`, issue ID: `b9d9ab93-70ee-4562-b28c-0be62f18db60`

## Open Questions

1. Should the confirmation artifact also record the user's reasoning, or just the decision?
2. If the user wants a new issue, what title/description should it have?
3. Should the confirmation be recorded as a Paperclip comment on BOS-3 (requires comment API proof)?
