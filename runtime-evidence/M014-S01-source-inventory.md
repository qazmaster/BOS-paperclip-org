# M014-a9jj46 / S01 — Source Inventory and Runtime Truth Map Inputs

**Milestone:** M014-a9jj46 — Paperclip Runtime Stability Gate for BOS Light E2E
**Slice:** S01 — Source Inventory and Runtime Truth Map
**Task:** T01 — Inventory doctrine and forensic source inputs
**Author:** GSD auto-mode executor (T01)
**Generated:** 2026-07-11
**Scope:** Read-only inventory of doctrine, forensic, evidence, and project-memory inputs that the S01 truth map must classify.
**Out of scope for this file:** live Paperclip mutation, VPS shell access, fresh authentication reads — all deferred to S02/S03/S04.

---

## 0. Authority verdict at a glance

| Authority band | What lives there | Why |
|---|---|---|
| **Authoritative doctrine** | v1.4.1 + R026 patch (sibling packages + local mirrors) | Both sibling source packages converge on the same v1.4.1 baseline; R026 only adds a boundary invariant, does not remap divisions. |
| **Authoritative forensic handoff** | `docs/handoffs/HANDOFF_PAPERCLIP_RUNTIME_FORENSICS.md` + `.gsd/workflows/spikes/260607-1.../RECOMMENDATION.md` | Written from the same investigation window as the user's reported symptom; cited by M014 milestone context. |
| **Authoritative VPS operations contract** | `docs/archive/PAPERCLIP_SANDBOX_TESTING_HANDOFF.md` | VPS host paths, compose project name, container name, and the only approved safe restart command. |
| **Provisional runtime evidence** | `runtime-evidence/M012-S06-mission-issue-evidence.json`, `M012-S07-rescope-decision.json`, `M013-S02-T04-paperclip-issue.json`, `M005-S01-hermes-xiaomi-runtime-probe-live-proof.json`, `M002-S12-*-runtime-execution-proof.json` | Cites exact epochs and reads; freshness must be re-probed before mutation. |
| **Provisional company identity** | Three candidates: `43c...` (`/BOS`), `1a194762-...` (`/BOSA`), `9feb4c22-...` | All three are stale by different epochs. None is authoritative until fresh authenticated readback. |
| **Project memory** | `.gsd/KNOWLEDGE.md` (R1–R6 rules, P1 patterns) + GSD memory store (MEM046, MEM049, MEM053, MEM054, MEM056, MEM058, MEM071, MEM133, MEM139, MEM288, MEM295, MEM324, MEM325, MEM336) | Durable conventions and gotchas; mirrored from earlier session outputs. |
| **Hardcoded-target scripts (lifestyle of stale IDs)** | `scripts/create_bos_v141_agents.py`, `scripts/m012_s01_canonical_paperclip_readback.js`, `scripts/m013_s02_create_tech_debt_issue.js` | Encode prior company-id epochs inside mutation paths; S03 will need to land a runtime lockfile/preflight contract. |
| **Adjacent repo surfaces (not runtime authority on their own)** | `plugin-bos-light/`, `adapters/gsdpi-local/`, `company-template/`, `agents/`, `skills/`, `configs/`, `docs/archive/08_RUNTIME_CAPABILITY_HEALTH.md` | Provide capability shape and doctrine artifacts; live proof remains bounded. |

---

## 1. Doctrine sources — authoritative

### 1.1 BOS Light v1.4.1 (baseline doctrine)

Sibling package (offline checkout):

- `../BOS_Light_v1_4_1_Handoff/BOS_Light_v1_4_1_Handoff/README.md`
- `../BOS_Light_v1_4_1_Handoff/BOS_Light_v1_4_1_Handoff/docs/` (canonical org, function migration, tool permission, data contracts, A12–A20 acceptance, patch instructions)
- `../BOS_Light_v1_4_1_Handoff/BOS_Light_v1_4_1_Handoff/agents/` (Div7.MissionControl, Div1.HCO, Div2.MasterPlanner, Div3.Treasury, Div4.Production, Div5.QualificationsLibraryLearning, Div6.External)
- `../BOS_Light_v1_4_1_Handoff/BOS_Light_v1_4_1_Handoff/skills/` (HCO routing, External IO, Knowledge Quarantine, Div5 AutoResearch, Agent Staffing, Circuit Breaker, Treasury Budget)
- `../BOS_Light_v1_4_1_Handoff/BOS_Light_v1_4_1_Handoff/configs/` (`division_map_v1_4_1.json`, `tool_permission_matrix_v1_4_1.json`, `routing_modes_v1_4_1.json`)

In-repo mirror:

- `docs/BOS_Light_v1_4_1_CANONICAL_ORG.md`
- `docs/BOS_Light_v1_4_1_Function_Migration_Matrix.md`
- `docs/BOS_Light_v1_4_1_Tool_Permission_Matrix.md`
- `docs/BOS_Light_v1_4_1_Data_Contracts.md`
- `docs/BOS_Light_v1_4_1_Acceptance_Tests_A12_A20.md`

Entry point and integrity gate:

- `00_START_HERE_FOR_NEW_AI_AGENT.md` — onboarding order.
- `MANIFEST.md` — file hashes (treat as drift signal, not as cryptographic trust anchor).
- `scripts/validate_handoff.py` — required-files gate referenced in Tier 1 of M004 handoff.

Core one-liner that drives every downstream decision:

```text
Paperclip gives the rails.  BOS Light gives the doctrine.
Div7 = mission direction.   Div1.HCO = routing, escalation, Circuit Breaker, hats, staffing.
Div2 = shaping.   Div3 = budget/access/resources.   Div4 = production + self-check.
Div5 = qualify, learn, recommend.   Div6 = only external-world interface.
```

Non-negotiable rules (10 listed in v1.4.1 README) — must be preserved verbatim; any future mutation script that violates them is invalid by doctrine.

### 1.2 R026 boundary patch (v1.4.2)

Sibling package:

- `../BOS_Light_v1_4_2_R026_Agent_Boundary_Update/BOS_Light_v1_4_2_R026_Agent_Boundary_Update/README.md`

In-repo mirror:

- `docs/BOS_Light_v1_4_2_R026_Agent_Boundary_Patch.md`

R026 invariant:

```text
Div7 decision output is not an operational terminal route.
Every non-policy-only Div7 decision MUST emit DecisionDelegated to Div1.HCO.
Div1.HCO MUST perform all operational routing after Div7 decision.
```

Canonical flow expected after R026:

```text
Human -> Div7.MissionControl  (frame or decide)
     -> DecisionDelegated packet (cynefinDomain, recommendedMode, routingDirective,
                                  constraints, requiredFollowupDivisions, escalationLevel)
     -> Div1.HCO  (validates boundary, performs operational routing)
     -> Div2 / Div3 / Div4 / Div5 / Div6  (executed via Paperclip runtime)
     -> Div1.HCO  (monitor, route corrections, escalate)
     -> Div7.MissionControl  (only when another strategic/policy/regime decision is needed)
```

**Required code behavior** (from patch): the before/after pattern plus the
`emitDivisionPacket({ from: "Div7.MissionControl", to: "Div1.HCO", type:
"DecisionDelegated", payload: {...} })` shape must be encoded by any agent
that would otherwise act as a terminal operational route from Div7.

**Tests to add (8 listed in patch):** Div7 must not produce a terminal
operational route; technical COMPLEX reaches Div7 -> Div1 -> Div2 -> Div3 -> Div4 -> Div5;
CHAOTIC reaches Div7 -> Div1 incident routing; Div2/Div3/Div4/Div5/Div6 reject direct
operational asks from Div7 unless routed by Div1.

### 1.3 R026 boundary inputs that S01 must cite downstream

Already inventoried as authoritative doctrine inputs:

| Input | Source | Where it must surface |
|---|---|---|
| R026 invariant text | `docs/BOS_Light_v1_4_2_R026_Agent_Boundary_Patch.md` §"R026 invariant" | S01 truth map §"doctrine" |
| `DecisionDelegated` packet shape | patch §"Required code behavior" | S01 truth map §"doctrine packet catalog" |
| Required canonical flow | patch §"Canonical flow" | S01 truth map §"authoritative path" |
| Eight boundary tests | patch §"Tests to add" | S01 truth map §"boundary test surface" (must be visible to T02 and to S03 hardening) |

---

## 2. Forensic handoff inputs — authoritative for M014 scope

### 2.1 Current forensic handoff (in-repo)

- **`docs/handoffs/HANDOFF_PAPERCLIP_RUNTIME_FORENSICS.md`** (9713 B, dated 2026-06-06, status "Forensics in progress").
  - Captures the seven local confirmed findings and the seven "not confirmed yet" gaps.
  - Names the exact company-id drifts: `/BOS` `43c74adb-…`, `/BOSA` `1a194762-…`, later `9feb4c22-…`.
  - Names the four `runtime-evidence` reads that anchor the failures window:
    `M012-S06-mission-issue-evidence.json`,
    `M013-S02-T04-paperclip-issue.json`,
    `M005-S01-hermes-xiaomi-runtime-probe-live-proof.json`,
    `M012-S07-rescope-decision.json`.
  - Enumerates the "Do not" list that constrains S02 (no live E2E yet, no destructive Docker,
    no `/api/health`-as-proof, no `9feb…` or `43c…` as canonical without fresh auth).
  - Prescribes the seven follow-up fixes; S03 of M014 implements the first five (lockfile, mandatory
    `PAPERCLIP_COMPANY_ID`, preflight, persistence canary, tightened Hermes criteria).

### 2.2 M014 spike recommendation

- **`.gsd/workflows/spikes/260607-1-start-a-gsd-milestone-for-paperclip-runt/RECOMMENDATION.md`** — 7101 B.
  - Verdict: "Go" on a stability gate milestone; "Do not" on auto-mode or live E2E.
  - Comparison matrix (Options A/B/C) — Option B (full stability gate) is the selected posture; the
    comparison language is reusable in the S01 truth map's "decision posture" section.
  - Five-slice contract: S01 source truth, S02 VPS forensics, S03 lockfile + script hardening,
    S04 persistence canary, S05 bounded E2E — exactly the slice ordering M014 follows.
  - Anti-goals list is the S01 negative surface: no Docker wipe claim, no plugin/piko/GSD-Pi/Hermes
    E2E promotion, no secret disclosure, no broker Telegram/external creds without explicit confirmation.

### 2.3 Spike research files (ANGLE 1–3)

All under `.gsd/workflows/spikes/260607-1-start-a-gsd-milestone-for-paperclip-runt/research/`:

- **`ANGLE-1-source-truth-map.md`** — directly feeds S01. Lists the same three candidate companies,
  same Hermes/GSD-Pi/plugin blockers, same governance breach reference. Use for S01 cross-checks.
- **`ANGLE-2-vps-forensics-plan.md`** — feeds S02. Read-only VPS commands: container identity,
  mounts/volumes, compose config, Docker events window `2026-06-03 08:00Z` through
  `2026-06-04 09:00Z`, daemon logs via `journalctl`, Paperclip data directory inspection.
- **`ANGLE-3-gsd-milestone-hardening.md`** — feeds S03 (lockfile schema, preflight contract,
  script migration list). S01 should preserve the migration list as a downstream pointer.

Plus the supporting spike tracking files:

- `SCOPE.md` (6300 B), `STATE.json` (3291 B) — historical, treat as orientation only.

### 2.4 Adjacent historical handoffs (in-repo)

- `docs/archive/PAPERCLIP_SANDBOX_TESTING_HANDOFF.md` — VPS live state snapshot, admin email
  redacted, browser tunnel mechanics, "do not expose Paperclip container port" rule. Authority
  for the safe-restart Docker compose command.
- `docs/archive/BOS_M004_DEVELOPMENT_HANDOFF.md` — state snapshot as of 2026-05-31 with the eight-
  agent /BOS visibility claim and the Tier 1–4 testing guide. S01 must note that this document
  was already superseded by `BOS_M005_DEVELOPMENT_HANDOFF.md` for proof posture, then by the live
  drift captured in the spike and HANDOFF_PAPERCLIP_RUNTIME_FORENSICS.md.
- `docs/archive/BOS_M005_DEVELOPMENT_HANDOFF.md` — supersedes M004 handoff; documents live-proof
  claims to treat with caution because paperclip `9feb…` and `43c…` were both attempted.
- `docs/archive/BOS_M002_DEVELOPMENT_HANDOFF.md` — M002 handoff, file: `docs/archive/BOS_M002_DEVELOPMENT_HANDOFF.md`.
- `docs/archive/PAPERCLIP_LIVE_VALIDATION_REPORT.md` — long-form live validation log; cite only as
  cross-check; do not treat as authoritative since several company ids and epochs coexist.
- `docs/handoffs/HANDOFF_M006_COMPLETE.md` … `HANDOFF_M011_COMPLETE.md` — M006–M011 handoff
  closures; relevant to scenario drift, not to the current canonical company claim.
- `docs/archive/M006_RUNTIME_CAPABILITY_INVENTORY.md` — runtime capability list snapshot; reads
  in tandem with `plugin-bos-light/capabilities.paperclip-runtime.json`.
- `docs/archive/08_RUNTIME_CAPABILITY_HEALTH.md` — full historical runtime-capability ledger;
  informs S01's "blocked / fallback-only / unvalidated" classification default.

---

## 3. Runtime-evidence inputs that S01 must classify downstream

The S01 truth map (`M014-S01-runtime-truth-map.json`, T02) needs to mark each of the following
artifacts with classification and freshness. Listed in the same shape that HANDOFF_PAPERCLIP_RUNTIME_FORENSICS.md
cites them, plus the M002/M011 follow-ons that ANGLES-1/3 reference.

### 3.1 Failure-window evidence (HANDOFF-cited core)

| File | Recorded epoch | Schema | Read S01 must make | Gap for T02 |
|---|---|---|---|---|
| `runtime-evidence/M005-S01-hermes-xiaomi-runtime-probe-live-proof.json` | 2026-06-01T02:33Z | `runtime-execution-proof` | `passing=true`, but `run.resultJson={}` and proof relied on Hermes stdout/session/exit. | No `resultJson.bos` — Hermes promotion remains **fallback-only**. |
| `runtime-evidence/M012-S06-mission-issue-evidence.json` | 2026-06-03T08:07Z | `mission-issue-live-verification` | session auth succeeded; issue BOS-3 read back on `9feb4c22-…`. | `deviation_note` confirms BOS-3 created without explicit user confirmation. |
| `runtime-evidence/M012-S07-rescope-decision.json` | 2026-06-03T08:15Z | `milestone-criterion-rescope` | formally records the governance breach as part of M012 acceptance. | Re-scopes criterion to readback-only — does not restore explicit user confirmation. |
| `runtime-evidence/M013-S02-T04-paperclip-issue.json` | 2026-06-04T08:30Z | `paperclip-blocker` (informal) | session auth 401, API-key auth 401, issue create false. | explicitly demands `.env` refresh before any further read. |

### 3.2 M002 fail-closed proofs (cited by GSD memory MEM046/MEM049/MEM058 + HANDOFF)

- `runtime-evidence/M002-S02-hermes-environment.json`
- `runtime-evidence/M002-S02-hermes-smoke.json`
- `runtime-evidence/M002-S03-gsdpi-environment.json`
- `runtime-evidence/M002-S03-gsdpi-registration.json`
- `runtime-evidence/M002-S03-gsdpi-smoke.json`
- `runtime-evidence/M002-S04-live-artifact-flow.json`
- `runtime-evidence/M002-S05-plugin-ui-surface-probe.json`
- `runtime-evidence/M002-S06-regression-closure.json`
- `runtime-evidence/M002-S07-agent-discovery-readonly.json`
- `runtime-evidence/M002-S07-agent-mutation-approval-packet.json`
- `runtime-evidence/M002-S07-agent-template-map.json`
- `runtime-evidence/M002-S07-agent-visibility.json`
- `runtime-evidence/M002-S08-adapter-registration-evidence.json`
- `runtime-evidence/M002-S08-execution-path-decision-packet.json`
- `runtime-evidence/M002-S08-hermes-cli-environment-remediation.json`
- `runtime-evidence/M002-S08-provider-adapter-feasibility.json`
- `runtime-evidence/M002-S08-runtime-execution-smoke.json`
- `runtime-evidence/M002-S09-reconciliation-audit.json`
- `runtime-evidence/M002-S09-s08-artifact-reconstruction.json`
- `runtime-evidence/M002-S10-gsdpi-runtime-execution-proof.json`
- `runtime-evidence/M002-S10-hermes-runtime-execution-proof.json`
- `runtime-evidence/M002-S10-requirement-scope-resolution.json`
- `runtime-evidence/M002-S10-runtime-execution-closeout.json`
- `runtime-evidence/M002-S11-validation-artifact-repair.json`
- `runtime-evidence/M002-S12-gsdpi-runtime-execution-proof.json`
- `runtime-evidence/M002-S12-hermes-runtime-execution-proof.json`
- `runtime-evidence/M002-S12-rescope-approval.json`
- `runtime-evidence/M002-S12-runtime-proof-or-rescope.json`
- `runtime-evidence/M002-S12-validation-closeout.json`
- `runtime-evidence/M002-S13-requirement-coverage.json`
- `runtime-evidence/M002-S13-validation-closeout.json`

The `M002-S12-*runtime-execution-proof.json` files are the **anchor for
Hermes/GSD-Pi = fail-closed** classification. Combined with `M005-S01-hermes-xiaomi-runtime-probe-live-proof.json`,
this is why MEM046/MEM049/MEM058/MEM139 mark Hermes/GSD-Pi as not promotable.

### 3.3 M011/M012/M013 follow-on evidence

- `runtime-evidence/M011-S01-capability-matrix.json` and `.md`
- `runtime-evidence/M011-S02-paperclip-readonly-reprobe.json`
- `runtime-evidence/M011-S03-reconciled-capability-gate.json` and `.md`
- `runtime-evidence/M003-S04-live-decision-artifact-readback.json`
- `runtime-evidence/M004-S06-coverage-validation.json`
- `runtime-evidence/M004-S06-requirement-coverage.json`
- `runtime-evidence/M004-S07-restored-artifact-inventory.json`
- `runtime-evidence/M004-S07-validation-artifacts-audit.json`
- `runtime-evidence/M004-S08-requirement-scope-audit.json`
- `runtime-evidence/M004-S08-requirement-scope-reconciliation.json`
- `runtime-evidence/M004-S08-scope-reconciliation-validation.json`
- **M012 series (full chronologic inventory is captured in HANDOFF_PAPERCLIP_RUNTIME_FORENSICS.md); key files**:
  `M012-S01-canonical-paperclip-readback.{json,md}`,
  `M012-S02-artifact-route-probe.{json,md}`,
  `M012-S02-native-mission-issue.{json,md}`,
  `M012-S02-native-mission-preflight.{json,md}`,
  `M012-S03-artifact-mirror-status.{json,md}`,
  `M012-S03-local-seven-division-flow.{json,md}`,
  `M012-S03-verification-baseline.json`,
  `M012-S04-*-reconciliation.{json,md}`,
  `M012-S05-*-requirement-outcomes-correction.{json,md}`,
  `M012-S06-mission-issue-evidence.{json,md}` (already cited),
  `M012-S06-session-auth-readback.{json,md}`,
  `M012-S07-requirement-update-evidence.json`,
  `M012-S07-rescope-decision.{json,md}` (already cited),
  `M012-S08-validation-readiness.json`,
  `M012-S09-contract-uat-evidence.json`,
  `M012-S10-closeout-gate.json` and `M012-S10-runtime-coverage.json`.
- `runtime-evidence/bos-v141-agent-creation.json` — claimed seven-agent v1.4.1 visibility creation
  artifact. Cited by the M004 handoff as live-evidence reference but references `43c…` epoch.

### 3.4 M013 evidence (current research-cycle technical-debt scratch)

- `runtime-evidence/M013-S01-T01-competitors.json`
- `runtime-evidence/M013-S01-T0[1-4]-paperclip-blocker.json`
- `runtime-evidence/M013-S01-T02-positioning.json`
- `runtime-evidence/M013-S01-T03-report.md`
- `runtime-evidence/M013-S01-T04-routing-evidence.json`
- `runtime-evidence/M013-S02-T0[1-3]-*.json`
- `runtime-evidence/M013-S02-T04-paperclip-issue.json` (HANDOFF-cited failure artifact)
- `runtime-evidence/M013-S02-T04-paperclip-routing.md`
- `runtime-evidence/M013-S02-T04-report.md`
- `runtime-evidence/M013-S02-T05-paperclip-integration.json`
- `runtime-evidence/M013-S02-T05-paperclip-routing.md`

M013 was the technical-debt register produced during the same drift window; cited
in HANDOFF as the second failure anchor but the artifacts themselves are not scope of paperclip runtime surface.

### 3.5 M005 evidence (Hermes, company template, e2e governance)

- `runtime-evidence/M005-S01-hermes-xiaomi-runtime-probe.json`
- `runtime-evidence/M005-S01-hermes-xiaomi-runtime-probe-live*.json` (many live-variants)
- `runtime-evidence/M005-S01-hermes-xiaomi-runtime-probe-live-proof.json` (HANDOFF-cited)
- `runtime-evidence/M005-S01-plugin-ui-surface-probe.json`
- `runtime-evidence/M005-S01-evidence-summary.json`
- `runtime-evidence/M005-S01-hermes-xiaomi-live*.log` (multiple variants)
- `runtime-evidence/M005-S02-company-template-probe*.json` and `.log`
- `runtime-evidence/M005-S03-resource-intake-probe*.json`
- `runtime-evidence/M005-S04-git-hybrid-probe*.json`
- `runtime-evidence/M005-S05-e2e-governance-probe*.json`
- `runtime-evidence/M005-browser-screenshot.png`

M005 S02 ("company-template-closeout" + "company-template-probe-live") marks the
earliest fresh evidence post-failure window. S01 must surface it but must not allow the
BOS-3 `deviation_note` lineage to slip back into "promoted" state.

---

## 4. Hardcoded-target scripts (lifestyle of stale IDs)

These three scripts encode prior company-id epochs and are the S03 "scripts with hardcoded
company fallback" targets per HANDOFF_PAPERCLIP_RUNTIME_FORENSICS.md:

| Script | Hardcoded ID | Epoch default | Status |
|---|---|---|---|
| `scripts/create_bos_v141_agents.py` | `43c74adb-…` | earlier | mutation-capable; targets `/BOS` from v1.4.1 era |
| `scripts/m012_s01_canonical_paperclip_readback.js` | `9feb4c22-…`, with hard replacement of `43c…` as stale | M012 era | mixed read+cleanup; encodes the M012 promotion |
| `scripts/m013_s02_create_tech_debt_issue.js` | `9feb4c22-…` | M013 era | mutation-capable; later canonical default |

For S01 the listing is enough; S03 must add a runtime-lockfile/preflight contract that turns any
of these scripts into a fail-closed one when the lockfile or `PAPERCLIP_COMPANY_ID` env var is missing.

---

## 5. Project memory and durable conventions

### 5.1 `.gsd/KNOWLEDGE.md` (R-1 to R-6 rules, P-1 pattern)

Authoritative for the local rules observed across GSD sessions:

- **R1** — after every `gsd_milestone_complete` / `gsd_slice_complete`, run `gsd_checkpoint_db` so
  `ROADMAP.md` reflects DB status; missing this caused M012 `[ ]` state to persist past completion.
- **R2** — never call `POST /api/auth/sign-up` directly against public host for recon; use SSH tunnel
  to `127.0.0.1:3131`. Public sign-up is the documented footgun.
- **R3** — re-verify company / issue / agent UUIDs via Postgres before any API call or script. Stale
  IDs found 2026-07-08: `9feb4c22-…`, `43c74adb-…`, `1a194762-…`, `7595fd85-…`, `7eede16c-…`,
  `8233ea7b-…` were all dead at that point.
- **R4** — capability rows marked `fallback-only` or `blocker` are snapshots, not state. `hermes.execution.xiaomi`
  was fallback-only after M002/M005 probes, yet `04e4d2b6` heartbeat succeeded 2026-06-05.
- **R5** — before stress-test slices, check whether an earlier live mission covered the same deliverable type.
- **R6** — phantom milestones with no phase dir / no plan-milestone event / corrupt title block `gsd auto`
  dispatch via base-name prefix matching.

Patterns:

- **P1** — lockdown via reverse-proxy at `paperclip.oysana.com` via `nginx location ^/api/auth/sign-up
  { allow 127.0.0.1/::1; deny all; }` ahead of the catch-all.

### 5.2 GSD memory store — relevant durable items

Top-of-mind memories to cite in S01 truth map (per `gsd memory_query` for "Paperclip company ID
runtime evidence auth drift"):

- **MEM046** — `gsd` available in Paperclip container; `gsdpi_local` unregistered and execution-blocked
  because supported readback returns `Unknown adapter type: gsdpi_local`.
- **MEM049** — BOS Light S04 final live artifact-flow validation must be fail-closed.
- **MEM053** — Telegram delivery group config (`TELEGRAM_CHAT_ID=-1003930272893`, `TELEGRAM_BOT_TOKEN` in
  local `.env`). Treats as external-secret disclosure unless explicit user confirmation.
- **MEM054** — S04 promotion is bounded to native Paperclip issue/document/comment create/readback
  surfaces only; do not reuse for approvals, plugin registration, UI/data/action/tool, state, activity,
  events, Hermes, GSD-Pi.
- **MEM056** — same promotion rule as MEM054; reinforce in S01 truth map.
- **MEM058** — only bounded live Paperclip issue/document/comment evidence may promote native artifact
  surfaces. Same evidence must not confirm approvals, plugin registration, or runtime surfaces.
- **MEM071** — `/BOS` (`43c74adb-…`) is canonical company for the seven division agents per M002
  human validation. `/BOSA` is historical only.
- **MEM133** — M003 S04 fail-closed posture; absent Paperclip base URL / company id / token produces
  validator-accepted `fail-closed-blocker` markdown-only fallback metadata with zero native approval /
  plugin / Hermes / GSD-Pi side effects.
- **MEM139** — maintain a capability no-promotion ledger across docs, JSON manifests, validator wording,
  evidence artifacts.
- **MEM288** — Paperclip agent API key `pcp_7c334e03…` with `9feb4c22-…`. Plugin routes return 403.
- **MEM295** — Paperclip session-based auth (`POST /api/auth/sign-in/email`), not API-key bearer.
  `PAPERCLIP_API_KEY` returns 401. Registration open but accounts cannot be re-registered. No password
  reset endpoint.
- **MEM324** — Paperclip issue/comment routes are non-company-scoped (`GET/POST /api/issues/:id`).
  Company-scoped variants return 404. Session cookie name `__Secure-paperclip-default.session_token`.
- **MEM325** — architecture decision: stability gate before BOS Light E2E; chose M014-a9jj46 as the
  stability gate milestone.
- **MEM336** — Paperclip API live quirks: `Origin` header required for `POST /api/auth/sign-in/email`
  (else 403); session-cookie URL decoding; issues read via cookie but list GET behind `Board access
  required`; `DELETE` returns 500 with cookie-auth, board keys revoked as of 2026-07-08 M014 lockdown.

The S01 truth map should treat these memories as a **default truth for live API quirks**; any
S02/S03 result that contradicts them needs fresh evidence with `gsd_capture_thought` updates.

---

## 6. VPS infrastructure reference inputs (read-only targets for S02)

S02 needs these inputs but **must not run them in T01**. They are inventoried for S01 so that
S01 can mark "VPS forensic target surface" as an open slice rather than a closed one.

| Field | Value | Source |
|---|---|---|
| VPS IP | `87.99.146.178` | `docs/archive/PAPERCLIP_SANDBOX_TESTING_HANDOFF.md` |
| Sandbox path | `/opt/paperclip-sandbox` | same |
| Compose project | `paperclip_sandbox` | same |
| Container | `paperclip_sandbox-paperclip-1` | same |
| Container binding | `127.0.0.1:3131->3100/tcp` on VPS only | same |
| Public ingress | `https://paperclip.oysana.com` (nginx + TLS) | same |
| Base compose | `/opt/paperclip-sandbox/docker/docker-compose.quickstart.yml` | same |
| Override | `/opt/paperclip-sandbox/docker-compose.sandbox-override.yml` | same |
| Auth override env | `BETTER_AUTH_TRUSTED_ORIGINS=http://127.0.0.1:3131` | same |
| Admin email (already in repo knowledge) | `kabidenov.a@gmail.com` (password in `/root/paperclip-sandbox-admin.env`, do **not** print or commit) | same |
| Browser tunnel | local `127.0.0.1:3131` → VPS `127.0.0.1:3131` via SSH local-forward | same |
| Safe restart command | `cd /opt/paperclip-sandbox/docker && docker compose -p paperclip_sandbox --env-file /opt/paperclip-sandbox/.env.sandbox -f docker-compose.quickstart.yml -f /opt/paperclip-sandbox/docker-compose.sandbox-override.yml up -d --no-build paperclip` | HANDOFF_PAPERCLIP_RUNTIME_FORENSICS.md |
| Forbidden commands | `docker compose down -v`, `docker volume prune`, `docker system prune`, `docker rm`, `docker volume rm` — forbidden on VPS unless explicitly approved for destructive recovery | same |
| Failure window events filter | `docker events --since '2026-06-03T08:00:00' --until '2026-06-04T09:00:00' --filter container=paperclip_sandbox-paperclip-1` | same / ANGLE-2 |

For S01 these are listed under the S01 truth map "open question" section; no execution in T01.

---

## 7. Adjacent repo surfaces (capability / shape / proof lanes, not runtime authority)

These are inventoried to keep the S01 truth map honest about what is **not** runtime authority:

- `plugin-bos-light/manifest.paperclip-plugin.json` — 12 capabilities_requested + 3 tabs + 7 piko
  tools. Self-flagged as "draft requested-capability manifest only".
- `plugin-bos-light/capabilities.paperclip-runtime.json` — large 58 KB capability ledger sourced
  from `docs/archive/08_RUNTIME_CAPABILITY_HEALTH.md`. S01 should treat `passing=true` rows with
  R4 caution (capability ledger is a snapshot, not state).
- `plugin-bos-light/runtime-evidence/M010-S04-e2e-workflow.json` — bounded plugin-level evidence.
- `plugin-bos-light/src/`, `plugin-bos-light/tests/` — TypeScript source + vitest suite (121/121
  expected per M004 handoff).
- `adapters/gsdpi-local/` — gsdpi_local adapter package; not in Paperclip registry (MEM046).
- `company-template/` — `bos-company-template.json`, `org-chart.mmd`, `rituals.md`,
  `task-routing.md`, `a1-validation-evidence.md`, `import-notes.md`. Live import/export remains
  unproven.
- `agents/` — Div7/Div1–Div6 markdown profiles (in-repo copy of v1.4.1 agents).
- `skills/` — in-repo skill protocols for v1.4.1 (HCO routing, External IO, Knowledge Quarantine,
  Div5 AutoResearch, Agent Staffing, Circuit Breaker, Treasury Budget).
- `configs/` — likely carry `division_map_v1_4_1.json`, `tool_permission_matrix_v1_4_1.json`,
  `routing_modes_v1_4_1.json`. Mirror of sibling v1.4.1 configs.
- `docs/archive/08_RUNTIME_CAPABILITY_HEALTH.md` — historical capability ledger (large file).
- `MANIFEST.md` — file-hash manifest, drift signal only.

---

## 8. Provenance assumptions and freshness caveats

These are the assumptions T02 must encode in the runtime-truth-map JSON and that T03's
validator must enforce:

1. **No company ID is currently authoritative.** `/BOS` `43c…` was canonical in M002; `/BOSA` is
   historical runtime-gate; `9feb…` was the M012/M013 mission issue target. All three require
   fresh authenticated readback via the runtime truth map (per MEM071 + ANGLE-1).
2. **Paperclip auth is at best session-based.** MEM295 + MEM336 dictate the request shape.
   `PAPERCLIP_API_KEY` exists in MEM288 but MEM295 documents it returns 401 in the current build.
3. **Hermes execution proof is partial.** M005 S01 evidence was `resultJson={}`; until
   `resultJson.bos` reads back, hermes.xiaomi is fallback-only (R4, MEM046, MEM049, MEM058).
4. **GSD-Pi execution is fail-closed.** `gsdpi_local` is not registered (MEM046). No path should
   promote it without registry + testEnvironment + BosAdapterResult proof.
5. **Plugin/piko/UI/data/action surfaces are unproven.** `manifest.paperclip-plugin.json` lists
   capabilities_requested; the runtime ledger shows most rows as fallback-only or unvalidated.
6. **Live mutation governance already failed once.** BOS-3 created without user confirmation is
   recorded in `M012-S07-rescope-decision.json`. The S03 preflight contract must require explicit
   confirmation for any POST/PUT/PATCH/DELETE.
7. **Public sign-up is forbidden for recon** (R2). Future S02 work must not call
   `POST /api/auth/sign-up` directly on `paperclip.oysana.com`.
8. **Telegram delivery group requires explicit user confirmation** before any external credential
   disclosure (MEM053).
9. **Live evidence date stamps are bounded.** Anything 2026-06-04 or later is post-failure-window
   and must be re-probed before relying on it.
10. **`/api/health` is not a runtime persistence proof.** Health alone does not prove company,
    agent, auth, or plugin state — explicit rule from HANDOFF_PAPERCLIP_RUNTIME_FORENSICS.md and
    MEM046/MEM071.

---

## 9. Required inputs downstream S01 → S02/T02/T03/S03

This table is the single handoff interface that T02 will inherit:

| Downstream slice / task | Inputs S01 must surface (this file) | Classification cell in truth map |
|---|---|---|
| S01 T02 (runtime truth map) | §1 (doctrine + R026), §3 (evidence), §4 (hardcoded scripts), §5 (project memory), §6 (VPS), §8 (assumptions) | full JSON keys for: doctrine, runtime_identity_claims, runtime_surfaces, proof_gaps, governance_risks, vps_targets |
| S01 T03 (validator) | §3 (key evidence files with epoch), §4 (hardcoded scripts), §5 (rules R1–R6, MEM IDs), §8 (assumptions) | validator class list: doctrine_fields, hermes_promotion_requires, gsdpi_promotion_requires, stale_id_must_appear, governance_gates |
| S02 (VPS forensics) | §6 (VPS targets + safe-restart command + event window) | truth map §"vps_forensic_targets" |
| S03 (lockfile + script hardening) | §1 (doctrine), §4 (hardcoded scripts), §5 (R2 + MEM336), §8 (assumptions 6, 7) | truth map §"scripts_to_harden" |
| S04 (persistence canary) | §1 doctrine (markers must be Paperclip-native), §5 R4, §8 assumption 10 | truth map §"canary_prerequisites" |
| S05 (bounded E2E gate) | §1 (v1.4.1 + R026), §5 (MEM046/058/336), §8 (assumptions 3, 4, 5) | truth map §"e2e_gate_requirements" |

---

## 10. Cited next steps (per S01 PLAN, taken from slices 14-02 through 14-05)

These mirror `14-02-PLAN.md` … `14-05-PLAN.md` authoritatively:

- **T02 (Classify runtime identities and capability surfaces)** consumes §3 + §4 + §5 + §8 and
  emits `runtime-evidence/M014-S01-runtime-truth-map.json` plus a markdown twin. No fresh live
  reads required for T02; T03's validator renders the read-only POST-state of T02 fail-closed.
- **T03 (Add source truth validator)** consumes §5 rules and §8 assumptions, encodes the
  no-promotion ledger (MEM139), and emits `scripts/validate_m014_s01_truth_map.js` runnable via
  `node --test`.
- **S02 (VPS read-only forensics)** is read-only: only the seven ARTIFICIAL commands inventoried
  in §6 are acceptable inputs, plus the shell-history search; nothing destructive until S03 lockfile
  is in place AND S04 confirmation is granted.
- **S03 (lockfile + script hardening)** uses §4 + §5 R2 + MEM336 to produce the preflight contract
  and the runtime lockfile schema.
- **S04 (persistence canary)** only after S01–S03 proof gates; uses §6 for the safe restart command
  and §8 assumption 10 as the explicit health-not-enough rule.
- **S05 (bounded E2E gate)** only after S01–S04; uses §1 + §5 MEM046/MEM058/MEM336 + §8 assumptions
  3, 4, 5 to require terminal run status + `resultJson.bos` + native Paperclip artifact readback.

---

## 11. Self-check (read-only, no live commands run)

- Confirmed `runtime-evidence/M014-S01-source-inventory.md` exists and is the only T01 file
  emitted (per S01 PLAN, Files field).
- Did not run any Paperclip, VPS, Docker, or Telegram commands. (`docs/archive/PAPERCLIP_SANDBOX_TESTING_HANDOFF.md`
  and `.gsd/workflows/spikes/260607-1-.../RECOMMENDATION.md` were read as files only.)
- Did not write or rewrite any of the doctrine / evidence files; only T01 output is the inventory file itself.
- Did not patch any hardcoded-target script (§4); S03 will own that.
- All seven company-id candidates cited are recorded with their source file and epoch; none is
  promoted to "authoritative".
- R026 boundary invariant is quoted verbatim from the in-repo mirror; sibling package README
  is used only to cross-check the v1.4.2 patch text.
- No secret value, session cookie, password, API key, or Telegram chat id is committed to this
  inventory (MEM053 + R2 honored).

---

## 12. Evidence path index (single-page reference for future agents)

Doctrine:

- `docs/BOS_Light_v1_4_1_CANONICAL_ORG.md`
- `docs/BOS_Light_v1_4_1_Function_Migration_Matrix.md`
- `docs/BOS_Light_v1_4_1_Tool_Permission_Matrix.md`
- `docs/BOS_Light_v1_4_1_Data_Contracts.md`
- `docs/BOS_Light_v1_4_1_Acceptance_Tests_A12_A20.md`
- `docs/BOS_Light_v1_4_2_R026_Agent_Boundary_Patch.md`
- `../BOS_Light_v1_4_1_Handoff/BOS_Light_v1_4_1_Handoff/README.md`
- `../BOS_Light_v1_4_2_R026_Agent_Boundary_Update/BOS_Light_v1_4_2_R026_Agent_Boundary_Update/README.md`

Forensic handoffs:

- `docs/handoffs/HANDOFF_PAPERCLIP_RUNTIME_FORENSICS.md`
- `docs/handoffs/HANDOFF_M006_COMPLETE.md`
- `docs/handoffs/HANDOFF_M008_COMPLETE.md`
- `docs/handoffs/HANDOFF_M009_COMPLETE.md`
- `docs/handoffs/HANDOFF_M010_COMPLETE.md`
- `docs/handoffs/HANDOFF_M011_COMPLETE.md`
- `.gsd/workflows/spikes/260607-1-start-a-gsd-milestone-for-paperclip-runt/RECOMMENDATION.md`
- `.gsd/workflows/spikes/260607-1-start-a-gsd-milestone-for-paperclip-runt/research/ANGLE-1-source-truth-map.md`
- `.gsd/workflows/spikes/260607-1-start-a-gsd-milestone-for-paperclip-runt/research/ANGLE-2-vps-forensics-plan.md`
- `.gsd/workflows/spikes/260607-1-start-a-gsd-milestone-for-paperclip-runt/research/ANGLE-3-gsd-milestone-hardening.md`
- `docs/archive/PAPERCLIP_SANDBOX_TESTING_HANDOFF.md`
- `docs/archive/BOS_M002_DEVELOPMENT_HANDOFF.md`
- `docs/archive/BOS_M004_DEVELOPMENT_HANDOFF.md`
- `docs/archive/BOS_M005_DEVELOPMENT_HANDOFF.md`

Project memory:

- `.gsd/KNOWLEDGE.md`
- `.gsd/REQUIREMENTS.md`
- GSD memory store: MEM046, MEM049, MEM053, MEM054, MEM056, MEM058, MEM071, MEM133, MEM139,
  MEM288, MEM295, MEM324, MEM325, MEM336

Scripts with hardcoded company IDs:

- `scripts/create_bos_v141_agents.py`
- `scripts/m012_s01_canonical_paperclip_readback.js`
- `scripts/m013_s02_create_tech_debt_issue.js`

VPS infrastructure target:

- VPS `87.99.146.178`, `/opt/paperclip-sandbox/`, container `paperclip_sandbox-paperclip-1`,
  base compose `docker-compose.quickstart.yml`, override `docker-compose.sandbox-override.yml`,
  safe restart `up -d --no-build paperclip`.

Failure-window evidence:

- `runtime-evidence/M005-S01-hermes-xiaomi-runtime-probe-live-proof.json`
- `runtime-evidence/M012-S06-mission-issue-evidence.json`
- `runtime-evidence/M012-S07-rescope-decision.json`
- `runtime-evidence/M013-S02-T04-paperclip-issue.json`
- `runtime-evidence/M002-S12-hermes-runtime-execution-proof.json`
- `runtime-evidence/M002-S12-gsdpi-runtime-execution-proof.json`
