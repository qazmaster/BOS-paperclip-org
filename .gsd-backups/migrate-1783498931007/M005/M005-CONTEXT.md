---
---

# M005: E2E BOS Light Live Runtime Proof

**Gathered:** 2026-05-31
**Status:** Ready for planning

## Project Description
Prove the full BOS Light 7-division organizational cycle end-to-end through the Paperclip GUI on a real startup (aipay.kz) with live customers. The plugin must register, the company template must import, Hermes agents must execute with xiaomi mimo 2.5 pro, git must modify the aipay.kz codebase, and one complete mission must flow from intake to completion with visible artifacts in Paperclip.

## Why This Milestone
All prior milestones (M001–M004) built local infrastructure, validators, and conservative capability matrices. The gap between "locally correct" and "live in Paperclip" remains large: plugin registration, tool/action registration, company template import, Hermes execution, and git integration are all unvalidated or fallback-only. M005 is the proof milestone that either promotes these surfaces or documents exactly why they remain blocked.

## User-Visible Outcome

### When this milestone is complete, the user can:
- Load the BOS Light plugin in Paperclip and see dashboard widget + issue tabs
- Import the v1.4.1 company template and see 7 divisions with correct routing
- Create a mission in Paperclip; the system proactively asks for missing credentials
- Watch the mission flow through divisions with Blueprint, BPI, code changes, and Eval Gate results visible in issues/documents/comments
- Approve or intervene at 3 human-in-the-loop gates

### Entry point / environment
- Entry point: Paperclip GUI at paperclip.osana.com
- Environment: Live Paperclip runtime + aipay.kz git repository
- Live dependencies: Paperclip API, Xiaomi AI API (mimo 2.5 pro), GitHub/GitLab (aipay.kz)

## Completion Class
- Contract complete means: Plugin builds, validators pass, all capability surfaces have evidence files with version/build
- Integration complete means: Plugin loads in Paperclip, company template imports, Hermes runs one bounded mission, git push succeeds
- Operational complete means: Hybrid state persists across restart, resource intake works, human approval gates function

## Final Integrated Acceptance
To call this milestone complete, we must prove:
- One real mission created in Paperclip flows through all 7 divisions
- Div4.Production commits and pushes changes to aipay.kz
- Div5.Qualifications runs Eval Gate and produces visible pass/fail evidence
- Circuit Breaker opens after 3 failures and escalates to Div7.Strategy
- All artifacts (documents, comments, issues) are readable in Paperclip UI

## Architectural Decisions

### Hermes with xiaomi mimo 2.5 pro
**Decision:** Use Hermes agent execution with xiaomi provider and mimo 2.5 pro model for all division agents.
**Rationale:** User explicitly chose this path. Prior M002 had auth blockers but memory suggests deployed wrapper fixes may resolve secret_ref materialization.
**Alternatives Considered:**
- GSD-Pi local adapter — rejected: `Unknown adapter type: gsdpi_local` in Paperclip registry
- Local CLI execution — rejected: bypasses Paperclip agent lifecycle, breaks org model

### Local git CLI for aipay.kz
**Decision:** Div4.Production uses local git CLI (clone/branch/commit/push) to modify aipay.kz codebase.
**Rationale:** User explicitly wants this. Simplest integration for a known repo.
**Alternatives Considered:**
- Paperclip native git integration — rejected: unvalidated, may not exist
- GitHub API via Div6.External — rejected: adds complexity, local git is direct

### Hybrid state persistence
**Decision:** In-memory cache for active operations with automatic mirroring to Paperclip native artifacts (issue documents/comments). Reconstruct from artifacts on restart.
**Rationale:** User choice. Balances performance with durability without depending on unvalidated state APIs.
**Alternatives Considered:**
- Paperclip company-scoped state only — rejected: `fallback-only`, no restart proof
- Native artifacts only — rejected: slower, no fast cache for active operations

## Error Handling Strategy
1. **Hermes 401 / auth failure:** Bounded retry (3 attempts) → createEscalationIssue → Div7.Strategy. No inline plaintext keys.
2. **Git push conflict:** Div4 detects conflict → Div1.HCO → Div7.Strategy decides: rebase, branch, or human intervention.
3. **Paperclip API rate limit / unavailable:** Exponential backoff + jitter → fallback to InMemoryPaperclipAdapter with markdown artifacts queued for sync.
4. **Eval Gate fail:** Div5 returns CORRECTION_REQUIRED → Div4 rework → 3rd fail triggers Circuit Breaker OPEN → Div7.Strategy.
5. **State loss on restart:** Reconstruct from latest issue documents/comments if state API unavailable.
6. **Budget overrun:** Div3.Treasury checks before each cycle → if projected cost > company_token_budget_ref, escalate to human.

## Risks and Unknowns
- **Hermes secret_ref materialization (HIGH):** hermes-paperclip-adapter@0.2.0 uses persisted adapterConfig.env instead of resolved runtime config. Xiaomi API key may not reach the subprocess. May require Paperclip host-side fix or different provider.
- **Plugin registration (HIGH):** Zero live evidence. Paperclip may reject manifest schema, tools registration, or action registration.
- **Company template schema mismatch (MEDIUM):** Paperclip import schema may differ from v1.4.1 structure. May need field mapping or manual creation.
- **Git in Hermes container (MEDIUM):** Hermes execution environment may lack git binary or network access to clone aipay.kz.
- **aipay.kz credentials (MEDIUM):** Need SSH key or HTTPS token with write access. Must be requested through resource intake system.

## Existing Codebase / Prior Art
- `plugin-bos-light/src/worker.ts` — draft plugin registration with optional SDK chaining
- `plugin-bos-light/src/paperclipAdapter.ts` — InMemoryPaperclipAdapter + PaperclipAdapter interface
- `plugin-bos-light/src/persistence.ts` — InMemoryBOSPersistence (needs mirroring layer)
- `plugin-bos-light/capabilities.paperclip-runtime.json` — conservative capability matrix with evidence sources
- `company-template/bos-company-template.json` — v1.4.1 company template (locally validated)
- `agents/Div*_*/AGENTS.md` — 7 division agent profiles
- `runtime-evidence/M002-S04-live-artifact-flow.json` — confirmed native issue/document/comment evidence
- `runtime-evidence/M002-S05-plugin-ui-surface-probe.json` — fallback-only plugin registration evidence

## Relevant Requirements
- R017 — Plugin runtime registration (M005/S01)
- R018 — Company template v1.4.1 import (M005/S02)
- R019 — Hermes execution with xiaomi mimo 2.5 pro (M005/S01)
- R020 — Git CLI integration for aipay.kz (M005/S04)
- R021 — Resource/credential intake system (M005/S03)
- R022 — E2E mission cycle through Paperclip (M005/S05)
- R023 — Human-in-the-loop gates (M005/S05)
- R024 — Hybrid state persistence (M005/S04)
- R025 — Eval Gate + Circuit Breaker live proof (M005/S05)

## Scope

### In Scope
- Plugin registration in Paperclip with all tools/actions/widgets/tabs
- Company template v1.4.1 import and agent profile activation
- Resource intake system (pre-mission credential/budget checklist)
- Hermes execution with xiaomi mimo 2.5 pro (bounded proof)
- Git CLI integration for aipay.kz (clone/branch/commit/push)
- Hybrid state persistence (memory + native artifact mirroring)
- One complete E2E mission cycle with human approval at 3 gates
- Eval Gate and Circuit Breaker live evidence in Paperclip artifacts

### Out of Scope / Non-Goals
- Multi-mission batch scheduling
- GSD-Pi adapter registration (remains fallback-only)
- External customer-facing features
- Production CI/CD pipeline automation
- Full automated approval (Betting Table auto-approve deferred)

## Technical Constraints
- No inline plaintext credentials in code or logs
- No Paperclip core patches or private imports
- No direct database mutations
- Capability promotion requires live version/build evidence + surface-specific proof
- Fail-closed: unvalidated surfaces produce markdown fallback, not simulated success

## Integration Points
- Paperclip API (osana.com) — plugin load, company import, issue/document/comment APIs
- Xiaomi AI API (mimo 2.5 pro) — LLM backend for Hermes agents
- GitHub/GitLab — aipay.kz repository access
- Hermes adapter registry — agent execution lifecycle

## Testing Requirements
- Plugin build: `npm run build` in `plugin-bos-light/`
- Local validators: `python3 scripts/validate_company_template.py`, `python3 scripts/validate_runtime_capabilities.py`
- Live sandbox: S05-style probe with Paperclip base URL + API key
- E2E: One manual mission through Paperclip GUI with artifact verification
- Fallback evidence: Each unvalidated surface produces markdown-only fallback artifact

## Acceptance Criteria

### Per-slice:
- **S01:** Plugin loads in Paperclip, piko:* tools callable, version/build recorded
- **S02:** Company template imports, 7 divisions visible, routing rules active
- **S03:** Resource intake detects missing credentials, requests via Paperclip UI
- **S04:** Git clone/commit/push to aipay.kz works, hybrid state mirrors to artifacts
- **S05:** One mission flows E2E, Eval Gate passes, human approves at 3 gates

## Open Questions
- Exact Paperclip API key and company ID for live testing
- aipay.kz git access method (SSH vs HTTPS, which host)
- Xiaomi API key provisioning (secret_ref format for Paperclip)
- Budget limit for token consumption during M005 testing
