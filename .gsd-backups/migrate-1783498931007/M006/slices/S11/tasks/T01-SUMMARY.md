---
id: T01
parent: S11
milestone: M006
key_files:
  - agents/Div1_HCO/AGENTS.md
  - agents/Div2_MasterPlanner/AGENTS.md
  - agents/Div3_Treasury/AGENTS.md
  - agents/Div4_Production/AGENTS.md
  - agents/Div5_QualificationsLibraryLearning/AGENTS.md
  - agents/Div6_External/AGENTS.md
  - agents/Div7_MissionControl/AGENTS.md
key_decisions:
  - Used existing skills (SKILL_TREASURY_BUDGET_ACCESS, SKILL_EXTERNAL_IO_GATEWAY, SKILL_KNOWLEDGE_QUARANTINE, SKILL_HCO_ROUTING_CONTROL) as source of truth for security invariants and tool boundaries
  - Kept content concise and actionable - each section has 4-7 bullet points
duration: 
verification_result: passed
completed_at: 2026-06-01T12:10:24.954Z
blocker_discovered: false
---

# T01: Enhanced all 7 division AGENTS.md with Allowed Tools, Forbidden Tools, Runtime Boundary, Security Invariants, and Acceptance Checks sections

**Enhanced all 7 division AGENTS.md with Allowed Tools, Forbidden Tools, Runtime Boundary, Security Invariants, and Acceptance Checks sections**

## What Happened

Added 5 new sections to all 7 division AGENTS.md files:

**Div1.HCO**: Allowed Tools (DivisionPacketRouter, MissionRouter, CircuitBreaker), Forbidden Tools (ExternalGitGateway, Treasury, Quarantine, Production), Runtime Boundary (read all inboxes, emit to all), Security Invariants (all external IO through Div6, all budget through Div3), Acceptance Checks (deterministic routing, Circuit Breaker behavior).

**Div2.MasterPlanner**: Allowed Tools (BPI, Blueprint, BettingTable), Forbidden Tools (ExternalGitGateway, Treasury, Quarantine, Production, web/search), Runtime Boundary (read own inbox, emit to Div1 only), Security Invariants (all knowledge from Div5-sanitized packets), Acceptance Checks (deterministic BPI, acceptance criteria).

**Div3.Treasury**: Allowed Tools (ScopedAccessGrant, BudgetSnapshot, SecretRef), Forbidden Tools (ExternalGitGateway, Production, Quarantine, web/search), Runtime Boundary (read own inbox, emit to Div1/Div6), Security Invariants (no plaintext secrets, no wildcard grants), Acceptance Checks (complete grant fields, redacted refs).

**Div4.Production**: Allowed Tools (GitOperations read-only, filesystem within local_path), Forbidden Tools (ExternalGitGateway, Treasury, Quarantine, web/search, git push), Runtime Boundary (read own inbox, emit to Div1/Div5), Security Invariants (test branches only, no main modification, no push), Acceptance Checks (branch naming, smoke file, commit SHA).

**Div5.QualificationsLibraryLearning**: Allowed Tools (verifyAndQuarantine, verifyProductionWork, evalGateFlow, secret scanning), Forbidden Tools (ExternalGitGateway, Treasury, Production, web/search), Runtime Boundary (read own inbox, emit to Div1/Div4/Div7), Security Invariants (quarantine before use, secret scan all evidence), Acceptance Checks (complete verdict, actionable diagnostics).

**Div6.External**: Allowed Tools (GitOperations clone/fetch/lsRemote, external API calls, web/search), Forbidden Tools (Quarantine, Treasury, Production, routing, KB writes), Runtime Boundary (read own inbox, emit to Div5/Div1, access external network with grant), Security Invariants (raw evidence only to Div5, no secrets in logs), Acceptance Checks (ExternalGitEvidence structure, risk flags).

**Div7.MissionControl**: Allowed Tools (MissionIntake, ExecutiveReport, Decision functions), Forbidden Tools (ExternalGitGateway, Treasury, Quarantine, Production, web/search, routing), Runtime Boundary (read all inboxes, emit to Div1), Security Invariants (all external knowledge from Div5, evidence-based decisions), Acceptance Checks (mission envelope, executive report structure).

## Verification

All 7 AGENTS.md files have 5/5 required sections (Allowed Tools, Forbidden Tools, Runtime Boundary, Security Invariants, Acceptance Checks).

## Verification Evidence

| # | Command | Exit Code | Verdict | Duration |
|---|---------|-----------|---------|----------|
| 1 | `for f in agents/*/AGENTS.md; do echo "$f: $(grep -c 'Allowed Tools\|Forbidden Tools\|Runtime Boundary\|Security Invariants\|Acceptance Checks' $f) sections"; done` | 0 | ✅ pass (all 7 files have 5 sections each) | 100ms |

## Deviations

None

## Known Issues

None

## Files Created/Modified

- `agents/Div1_HCO/AGENTS.md`
- `agents/Div2_MasterPlanner/AGENTS.md`
- `agents/Div3_Treasury/AGENTS.md`
- `agents/Div4_Production/AGENTS.md`
- `agents/Div5_QualificationsLibraryLearning/AGENTS.md`
- `agents/Div6_External/AGENTS.md`
- `agents/Div7_MissionControl/AGENTS.md`
