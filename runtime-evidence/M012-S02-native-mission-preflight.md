# M012-S02 Native Mission Preflight

**Schema:** `m012-s02-native-mission-preflight/v1`
**Generated:** 2026-06-03T03:57:00.000Z
**Source Gate:** `runtime-evidence/M011-S03-reconciled-capability-gate.json`

---

## Target

| Field | Value |
|-------|-------|
| Company ID | `/BOS` |
| Company Name | BOS (Business Operating System) |
| Canonical Path | `/BOS` |

## Mission

**Title:** First Real Mission Through Native Paperclip Flow

**Posture:** Use native Paperclip issue/document/comment mission artifacts after auth and explicit confirmation; do not rely on plugin host tools or runtime execution adapters.

---

## Safety Constraints

| # | Constraint | Status |
|---|-----------|--------|
| 1 | Explicit confirmation required for all external mutations | **ENFORCED** |
| 2 | No plaintext secrets requested or logged | **ENFORCED** |
| 3 | No direct database mutation | **ENFORCED** |
| 4 | Zero external mutations without explicit user yes | **ENFORCED** |

---

## Allowed Routes

### 1. `local.mission_frame_route_grant_qa` — Local Only
Run BOS Light TypeScript mission framing, Div1 routing, Div3 grant policy, HITL artifact generation, branch policy, and QA review against local fixtures or generated artifacts.

**Constraints:**
- No external mutation
- No raw secret output
- Generated artifacts must record blockers when auth is absent

### 2. `paperclip.readonly_health_probe` — Live Read-Only
Probe Paperclip health and supported GET routes for observation.

**Constraints:**
- GET only
- No capability promotions from S02 alone
- No secret persistence

### 3. `paperclip.native_mission_artifacts` — Live Mutation (Explicit Confirmation Required)
Create a bounded Paperclip mission issue plus document/comment artifacts through native supported routes.

**Constraints:**
- Requires Paperclip auth present
- Requires explicit user yes immediately before mutation
- Must use canonical /BOS company id
- Must write live evidence readback artifact
- Must not use plugin host tools

### 4. `git.local_feature_branch` — Local or Explicit Confirmation for Push
Use local git operations on feature/bos-{mission_id} branches; push only with explicit confirmation and branch policy evidence.

**Constraints:**
- No direct main/master push
- No force push
- External push requires explicit user confirmation

---

## Blocked Surfaces

| # | Surface | Reason | Unblocked When |
|---|---------|--------|----------------|
| 1 | `plugin.host_registration` | No supported plugin route readback; fallback-only | Host readback observes bos-light plugin with version/build, no 404 |
| 2 | `plugin.piko_tools` | No piko tools observed; fallback-only | Tool registry readback observes piko:* tools with supported invocation |
| 3 | `runtime.hermes_xiaomi_execution` | Hermes runtime fallback-only; adapter/testEnv/auth blockers | Future runtime-execution-proof with adapter registry, testEnv, bounded run |
| 4 | `runtime.gsdpi_execution` | gsdpi_local unregistered/execution-blocked | Future runtime-execution-proof with registry readback and BosAdapterResult |
| 5 | `workflow.pr_merge_ci_live` | Live GitHub API unexercised; requires token + explicit confirmation | Dedicated milestone with GitHub auth, PR create/readback, CI evidence |
| 6 | `direct.main_push_or_force_push` | Branch policy blocks direct main/master and force-push | **NEVER** for autonomous flow; use feature branch + PR/CI/human gate |
| 7 | `telegram.secret_delivery` | External secret disclosure requires explicit confirmation | Only with user confirmation naming destination and payload class |

---

## Required Confirmations

### 1. `paperclip_mutation_yes`
**When:** Before creating or editing any live Paperclip mission issue/document/comment in M012.
**Wording:** User must explicitly confirm the live Paperclip mutation target and bounded test mission.

### 2. `github_external_yes`
**When:** Before any git push, GitHub PR, workflow trigger, merge, approval, or external API mutation.
**Wording:** User must explicitly confirm the remote repo/branch/action immediately before the action.

### 3. `secret_collection`
**When:** If Paperclip/GitHub auth is needed and absent.
**Wording:** Use secure_env_collect; never ask the user to paste secrets into chat or edit .env manually.

---

## Out of Scope

The following surfaces are explicitly **out of scope** for this mission:

1. **Plugin routes** (`plugin.host_registration`, `plugin.piko_tools`) — Plugin host readback and piko tool registry remain unobserved; fallback-only classification confirmed across S01 and S02.
2. **Hermes runtime execution** — Adapter/testEnvironment/auth blockers remain; runtime execution is fallback-only.
3. **GSD-Pi runtime execution** — gsdpi_local is unregistered and execution-blocked; package readiness is not runtime promotion.
4. **GitHub PR/merge/CI** — Live GitHub API path is unexercised and requires token plus explicit external confirmation gate not yet approved.
5. **Telegram secret delivery** — Telegram group is for external secret handoff only with explicit user confirmation; never autonomous.
6. **Unsupported document/comment APIs** — Only native Paperclip issue/document/comment routes proven in M011-S01 are in scope; any untested API surface is out of scope until separately validated.

---

## Current Blockers

- `missing_paperclip_auth`
- `paperclip_auth_unauthorized`
- `paperclip_auth_forbidden`
- `plugin_routes_not_found`
- `tool_routes_not_found`

---

## Proposed Flow

1. Collect/verify Paperclip auth via `secure_env_collect` if absent.
2. Ask for explicit yes before live Paperclip mutation.
3. Create one bounded mission issue in canonical `/BOS` company through supported native route.
4. Run local Div7 mission framing, Div1 routing, Div3 grant policy, Div2 blueprint stub/artifact generation, Div4 local production task, and Div5 QA review as BOS Light code paths.
5. Mirror each step to native Paperclip document/comment artifacts with readback.
6. Stop before GitHub PR/merge/CI unless a later explicit external-action gate is approved.

---

*This preflight artifact must be shown to the user before any live mutation occurs.*
