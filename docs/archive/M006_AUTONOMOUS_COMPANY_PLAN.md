# M006 — Autonomous Company Loop: Plan

> **Milestone:** M006  
> **Target autonomy level:** L3/L4 (Multi-division autonomous loop with controlled gates)  
> **Vision:** From one Human Owner mission submitted through Div7, BOS Light executes a bounded git/read-write smoke mission across the seven-division company loop without manual script patching, without Div4 direct external IO, without secret leakage, with plugin tool readback, Div5 qualification, Circuit Breaker behavior, and final Div7 executive report.  
> **Canonical doctrine:** BOS Light v1.4.1  

---

## 1. Summary of current blockers to autonomy

| # | Blocker | Why it blocks | Evidence |
|---|---|---|---|
| B1 | Plugin tools not live in Paperclip | `piko:*` tools exist in code (121 tests pass) but Paperclip runtime has never loaded them. Agents cannot invoke BOS Light tools natively. | `capabilities.paperclip-runtime.json`: `registration.tools` = fallback-only. S05 probe: `registered_tool_keys=[]`. |
| B2 | No live tool readback | No `piko:*` tool has ever been invoked through Paperclip. All invocations are local/subprocess scripts. | `runtime-evidence/M005-S01-plugin-ui-surface-probe.json`: readback_proof=null. |
| B3 | Secret materialization untested for custom names | `GITHUB_TOKEN_AIPAY` is configured in Paperclip secrets but never proven to materialize in agent env. Prior probes only checked `GITHUB_TOKEN`. | M005 S04 blocked: `missing_git_credentials`. |
| B4 | Div4 performs direct external IO | Current smoke tests run `git ls-remote` from Python scripts executed by Div4 context, bypassing Div6 gateway. | `scripts/run_m005_s04_git_hybrid_probe.py` runs git directly. |
| B5 | No Div5 quarantine on git evidence | Git clone results are used directly without Div5 sanitization step. | M005 S04: no quarantine envelope produced. |
| B6 | Circuit Breaker unproven at runtime | Circuit breaker logic passes 16 local tests but no live failure-stop behavior has been observed. | `runtime-evidence/M005-S05-e2e-governance-probe.json`: circuit_breaker_smoke ok only in simulation. |
| B7 | Human approval gates untested | HITL gates exist in code (18 tests) but no live human approval flow has been exercised. | `capabilities.paperclip-runtime.json`: `workflow.hitl_gates` = fallback-only. |
| B8 | Div7-only owner interface not enforced | Paperclip agents can comment on any issue; protocol relies on policy, not technical enforcement. | AGENTS.md defines behavior but Paperclip has no technical wall. |
| B9 | GSD-Pi execution unavailable | Local adapter exists but Paperclip runtime rejects `gsdpi_local` adapter type. | `runtime-evidence/M002-S10-gsdpi-runtime-execution-proof.json`: 422 Unknown adapter type. |
| B10 | Hermes execution blocked by auth | Xiaomi Mimo 2.5 Pro adapter registered but auth fails. | `runtime-evidence/M005-S01-hermes-xiaomi-runtime-probe.json`: adapter_registry_auth_denied. |

**Critical path:** B1 → B2 → B3 → B4/B5 → B6 → B7. Without B1/B2 resolved, agents cannot invoke plugin tools autonomously. Without B3 resolved, external git fails. Without B4/B5 resolved, trust boundaries collapse.

---

## 2. Proposed M006 architecture

### 2.1 Runtime layer

```
┌─────────────────────────────────────────┐
│         Paperclip Sandbox 0.3.1         │
│  ┌─────────────────────────────────────┐│
│  │   Plugin: bos-light (live)          ││
│  │   - piko:bpi-score                  ││
│  │   - piko:blueprint-gen              ││
│  │   - piko:eval-gate                  ││
│  │   - piko:circuit-breaker-observe    ││
│  │   - piko:bpi-blueprint-artifact     ││
│  │   - piko:eval-gate-evidence         ││
│  │   - piko:decide                     ││
│  └─────────────────────────────────────┘│
│  ┌─────────────────────────────────────┐│
│  │   7 Division Agents (visibility)    ││
│  │   - hermes_local adapter            ││
│  │   - heartbeat disabled              ││
│  └─────────────────────────────────────┘│
└─────────────────────────────────────────┘
```

### 2.2 Packet flow (autonomous mission)

```
Human Owner
    ↕ creates issue in Div7 intake project
Div7.MissionControl
    ↕ MissionDirective artifact
Div1.HCO
    ↕ RoutingDecisionPacket
    ├─→ Div2.MasterPlanner ── Blueprint + BPI artifact ──┐
    ├─→ Div3.Treasury ───── BudgetAccessDecision + ToolGrant ─┤
    │                                                          ↓
    │                                                   Div1.HCO (re-assemble)
    │                                                          ↓
    │                                                   Div6.External
    │                                                   (git ls-remote/clone)
    │                                                          ↓
    │                                                   Div5.Qualifications
    │                                                   (QuarantineEnvelope)
    │                                                          ↓
    ├─→ Div4.Production ──── commit on test branch ────────┤
    │                                                          ↓
    │                                                   Div5.Qualifications
    │                                                   (EvalGateVerdict)
    │                                                          ↓
    └──────────────────── Div1.HCO (closure) ────────────────┘
                            ↕ ExecutiveStatusPacket
Div7.MissionControl
    ↕ FinalExecutiveReport
Human Owner
```

### 2.3 Tool invocation model

For M006, plugin tools are invoked **through Paperclip agent execution**, not through subprocess scripts.

| Tool | Invoked by | Purpose |
|---|---|---|
| `piko:eval-gate` | Div5 | Verify external evidence, verify Div4 output |
| `piko:circuit-breaker-observe` | Div1 | Record failure, check state, trigger escalation |
| `piko:bpi-blueprint-artifact` | Div2 | Produce blueprint document in issue |
| `piko:decide` | Div1/Div7 | Routing/escalation decision logic |

**Fallback:** If plugin tool registration fails, agents fall back to native issue/document/comment artifacts with markdown-structured packets. This is explicitly allowed by the fail-closed design.

### 2.4 External IO model

```
Div1 routes external IO request
    ↓
Div5 checks local knowledge (autoresearch)
    ↓ (if miss)
Div3 grants scoped access (token ref, URL, allowed ops)
    ↓
Div1 dispatches to Div6
    ↓
Div6 executes via plugin tool or approved gateway
    ↓
Div6 returns RawExternalEvidenceBundle to Div5 ONLY
    ↓
Div5 produces QuarantineEnvelope + SanitizedKnowledgePacket
    ↓
Div1 routes sanitized packet to consumer (Div4)
```

For git specifically:
- Div6 uses `git ls-remote` or `git clone` via shell command in agent context
- Token comes from `GITHUB_TOKEN_AIPAY` env var (materialized by Paperclip)
- Raw output = file list, branch list, commit SHAs
- Div5 verifies: no secrets in output, source is trusted repo, commit SHAs match expected
- Sanitized packet = file tree, branch refs, verified commit SHA
- Div4 receives sanitized packet, never raw git remote access

### 2.5 Secrets/access model

- Secrets stored in Paperclip company settings
- Secret names: `GITHUB_TOKEN_AIPAY`, `AIPAY_GIT_URL`
- Materialized into agent env vars by Paperclip runtime
- Div3 grants access by producing `BudgetAccessDecision` referencing secret scope
- No plaintext secret in any artifact, prompt, or log
- Secret redaction in all diagnostics

### 2.6 Approval gates

| Gate | What blocks | Who approves | Artifact |
|---|---|---|---|
| Mission intake | Unclear scope / ambiguous goal | Human (Div7 routes) | MissionDirective |
| Budget/access | Token/repo access needed | Div3 grants (human if exceeds policy) | BudgetAccessDecision |
| External IO | Web/git/external API | Div3 + Div5 criteria | ExternalIoRequest |
| Production | Push to branch / deploy | Div5 Eval Gate + Div3 if budget | EvalGateVerdict |
| Deploy/merge | Main branch / production | Human (Div7 routes) | ApprovalRequestPacket |

For M006 target L3/L4: **budget/access and external IO gates** are autonomous within policy. **Production deploy/merge to main** remains human-approved.

### 2.7 Failure handling

- **Transient failure:** Div1 retries with backoff (max 3 attempts)
- **Repeated failure:** Circuit Breaker opens after threshold
- **Auth failure:** Div3 re-evaluates grant; if revoked, escalate
- **Quarantine failure:** Div5 rejects; Div1 reroutes or escalates
- **Timeout:** Circuit Breaker opens; Div7 receives incident summary

### 2.8 Evidence model

Every packet produces a visible artifact:
- Paperclip issue comment (primary)
- Paperclip issue document (for structured data)
- Repo-local JSON (`runtime-evidence/M006-S##-*.json`)
- No hidden plugin state as sole source of truth

---

## 3. Autonomy level target

**M006 targets L3 with L4 gates.**

| Level | Definition | M006 status |
|---|---|---|
| L0 — Manual bootstrap | Humans run scripts | **Eliminated** |
| L1 — Tool-visible automation | Paperclip sees plugin tools | **Target: S01** |
| L2 — Single-issue autonomous task | Human creates one mission, system executes bounded task | **Target: S02-S08** |
| L3 — Multi-division autonomous loop | All 7 divisions participate through structured packets | **Target: S10** |
| L4 — Controlled autonomy with gates | System proceeds autonomously within budgets, stops at human gates | **Target: S10 with HITL gates** |
| L5 — Self-improving company loop | Div5 proposes improvements, Div1 operationalizes | **Out of scope** |

**Why not L5:** Self-improvement requires statistical evidence collection, pattern recognition, and policy mutation. M006 scope is bounded to one autonomous mission type (git smoke test). L5 is future design only.

---

## 4. Out-of-scope list

| Item | Why out of scope | Future milestone |
|---|---|---|
| Hermes Xiaomi live execution | Auth blocked; not required for L3 autonomy | M007 or unblock via Paperclip fix |
| GSD-Pi live execution | Adapter type rejected by Paperclip | M007 or external adapter path |
| Dashboard widget rendering | UI surfaces are fallback-only; not required for loop | Plugin UI milestone |
| Issue detail tabs rendering | Same as above | Plugin UI milestone |
| Native approval/request objects | Paperclip approvals API unvalidated | M007 |
| Company template live import | S02 blocked by auth in M005 | Operator manual import |
| AGENTS.md parser compatibility | Unvalidated; manual workaround exists | Operator manual |
| Self-improving loop (L5) | Requires evidence statistics + policy mutation | Future |
| Production deploy to main | Human gate required for safety | Always human-gated |
| Multi-mission parallel execution | Single mission only for M006 | Future |

---

## 5. Division responsibilities (M006)

| Division | M006 responsibility | M006 must NOT do |
|---|---|---|
| Div7.MissionControl | Intake owner mission, frame strategic intent, produce final executive report, escalate to human | Route internal work, perform external IO, ask human for routine clarifications |
| Div1.HCO | Route all internal packets, coordinate circuit breaker, compile operational closure, dispatch to divisions | Ask human directly, perform external IO, create budget grants |
| Div2.MasterPlanner | Shape mission into blueprint, define acceptance criteria, produce BPI | External IO, production implementation, budget decisions |
| Div3.Treasury | Evaluate budget/access requests, produce scoped ToolGrant/BudgetAccessDecision | External IO, expose plaintext secrets, wildcard permissions |
| Div4.Production | Implement bounded production work on sanitized snapshot, run smoke tests | Direct external IO, raw external evidence consumption, main branch push |
| Div5.QualificationsLibraryLearning | Quarantine external evidence, run eval gates, verify output, produce verdicts | Raw external collection, production implementation, budget grants |
| Div6.External | Execute scoped external git operations, return raw evidence to Div5 | Internal KB writes, direct delivery to Div2/Div4/Div7, final truth authority |

---

## 6. Required owner decisions

1. **Approval gate policy:** For M006, which gates require human approval vs autonomous Div3 grant?
   - Recommendation: Budget/access grants under $X (token-based) are autonomous. Production deploy/merge always human.

2. **External repo scope:** Which repos may Div6 access autonomously?
   - Recommendation: Only `AIPAY_GIT_URL` and explicitly allow-listed repos. No wildcard GitHub access.

3. **Circuit breaker threshold:** How many failures before open circuit?
   - Recommendation: 3 failures for external IO, 2 for auth failures, 5 for transient network.

4. **Secret naming:** Keep `GITHUB_TOKEN_AIPAY` or rename to `GITHUB_TOKEN`?
   - Recommendation: Keep `GITHUB_TOKEN_AIPAY` for clarity. Already patched in scripts.

5. **Failure simulation:** May M006 S09 simulate failures against live repo, or use mock?
   - Recommendation: Use mock/bad credentials for negative test to avoid repo pollution.

---

## 7. Minimum access/resources needed

| Resource | Purpose | Already have? |
|---|---|---|
| Paperclip sandbox access (API key) | Plugin install, agent execution, artifact creation | ✅ Yes |
| `GITHUB_TOKEN_AIPAY` secret in Paperclip | Div6 git auth | ✅ Yes |
| `AIPAY_GIT_URL` secret in Paperclip | Target repo | ✅ Yes |
| Plugin install path in Paperclip | `paperclipai plugin install` or equivalent | ❓ Unconfirmed — S00 validates |
| Paperclip agent execution with env var pass | Secrets materialize in agent context | ❓ Unconfirmed — S00 validates |
| Test branch write access | Div4 production commit | ✅ Yes (same repo) |

---

## 8. What can be done without additional access

| Work | Status |
|---|---|
| All plugin pure logic (BPI, Blueprint, Eval Gate, Circuit Breaker) | ✅ Complete — 121 tests pass |
| Hybrid persistence simulation | ✅ Complete — 19 tests pass |
| State reconstruction simulation | ✅ Complete — 17 tests pass |
| Mission intake logic | ✅ Complete — 18 tests pass |
| HITL gate logic | ✅ Complete — 18 tests pass |
| QA review logic | ✅ Complete — 21 tests pass |
| External IO gateway logic | ✅ Complete — 28 tests pass |
| Circuit breaker human resolution | ✅ Complete — 16 tests pass |
| Packet contract definitions (markdown schemas) | ✅ Complete — v1.4.1 contracts exist |
| Script patching for GITHUB_TOKEN_AIPAY | ✅ Complete |
| Division AGENTS.md profiles | ✅ Complete |

---

## 9. What cannot be honestly claimed until live readback exists

| Claim | Blocker | What would prove it |
|---|---|---|
| "Plugin tools are live" | `registration.tools` = fallback-only | S01: plugin install + tool registry readback + invocation |
| "Div6 can authenticate to git" | Secret materialization untested for custom names | S00: agent env contains `GITHUB_TOKEN_AIPAY` |
| "Div6 performs external git through Paperclip" | No plugin tool for git; scripts bypass Div6 | S05: Div6 agent executes git via approved path |
| "Div5 quarantines live external evidence" | No live external evidence has been produced | S06: QuarantineEnvelope from live git output |
| "Circuit Breaker stops live mission" | Only simulated failures exist | S09: Live or mock-repeated failure triggers open circuit |
| "Div7-only owner interface" | Policy only, no technical enforcement | S02: All owner-facing artifacts route through Div7 |
| "Autonomous company loop" | B1-B8 unresolved | S10: Full E2E mission without manual patching |

---

## 10. Risk register

| ID | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| R1 | Paperclip 0.3.1 does not support `tools.register` | Medium | **Critical** | S00 validates first. If unsupported, use native artifact fallback (issue/document/comment) for all packet flow. |
| R2 | Agent env does not pass `GITHUB_TOKEN_AIPAY` | Medium | **Critical** | S00 tests secret materialization. If fails, rename secret to `GITHUB_TOKEN` or use manual env injection. |
| R3 | Plugin install requires board access | Medium | High | Document install path for operator. If automated install unavailable, operator installs once. |
| R4 | Human approval gate requires UI click | High | Medium | Design gate as native approval request or explicit human comment. Document manual step. |
| R5 | Div7-only interface conflicts with Paperclip model | Medium | Medium | Protocol-level enforcement through issue labels/routing rules. Technical wall does not exist — policy + audit only. |
| R6 | Circuit breaker false-positive stops valid mission | Low | Medium | Half-open state with bounded retry. Human can resume via Div7. |
| R7 | Secret leak in git evidence (e.g., .env file in repo) | Medium | High | Div5 quarantine scans for secret patterns. Reject if found. |
| R8 | Paperclip runtime upgrade breaks plugin | Low | Medium | Pin to tested version. Version check in S00. |
| R9 | Test branch pollution from repeated missions | Medium | Low | Use unique branch names per mission. Cleanup policy in Div7. |
| R10 | aipay.kz repo is private or inaccessible | Medium | High | S00 tests `git ls-remote` first. If blocked, use public test repo for S10. |

---

## 11. Evidence requirements per slice

| Slice | Required evidence |
|---|---|
| S00 | `runtime-evidence/M006-S00-runtime-capability-inventory.json` with version/build, tool registry state, secret materialization test |
| S01 | `runtime-evidence/M006-S01-plugin-registration.json` with registered tool keys, invocation result |
| S02 | Issue/document artifacts showing Div7 intake and final report |
| S03 | RoutingDecisionPacket artifacts in issue comments |
| S04 | BudgetAccessDecision + ToolGrant artifacts |
| S05 | ExternalIoRequest + RawExternalEvidenceBundle artifacts |
| S06 | QuarantineEnvelope + SanitizedKnowledgePacket artifacts |
| S07 | Git commit evidence (branch, SHA) + Div4 artifact |
| S08 | EvalGateVerdict artifact |
| S09 | CircuitBreakerIncident artifact |
| S10 | Full chain: MissionDirective → RoutingDecision → BudgetAccess → ExternalIO → Quarantine → Production → EvalGate → CircuitBreaker (if tested) → ExecutiveReport |

---

*Plan produced: 2026-06-01*  
*Canonical doctrine: BOS Light v1.4.1*  
*Status: planning complete, awaiting owner confirmation before implementation*
