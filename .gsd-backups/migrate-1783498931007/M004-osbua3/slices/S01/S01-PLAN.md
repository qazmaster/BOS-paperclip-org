# S01: Import Doctrine Package

**Goal:** Add the v1.4.1 doctrine package to the repo and make the top-level handoff files point readers at it as the canonical update set.
**Demo:** The repository contains the new v1.4.1 doctrine docs, skill protocols, and updated handoff entrypoints, and the handoff validator can see the package inventory.

## Must-Haves

- The new v1.4.1 doctrine docs exist under docs/ with the expected filenames.
- The new v1.4.1 skill and protocol files exist under skills/.
- The top-level handoff docs and manifest point at the v1.4.1 package rather than leaving it buried in the old narrative.
- The handoff validator can enumerate the new package files without false positives about missing assets.

## Threat Surface

## Q3 exploitation analysis

### Abuse scenarios
- **Prompt-injection / instruction poisoning:** The imported `docs/BOS_Light_v1_4_1_*.md` and `skills/SKILL_*.md` files are intended to become canonical instructions for future agents. Malicious or stale content could instruct agents to bypass Div6-only external IO, disable quarantine, exfiltrate secrets, or treat historical v1.2/v1.3 rules as active.
- **Inventory confusion / stale-canonical risk:** If top-level handoff docs or `MANIFEST.md` point to legacy documents first, downstream agents may execute deprecated ownership/security rules even though the v1.4.1 package is present.
- **Validator trust-boundary drift:** `scripts/validate_handoff.py` should enumerate a static allowlist of expected package files and report missing/stale assets; it should not execute imported content, evaluate dynamic paths, or accept untrusted filenames that could create path traversal or false-positive validation.

### Data exposure risks
- No direct PII/token/secret exposure is introduced by static markdown import alone.
- The main exposure risk is **procedural**: poisoned skill/protocol text could direct future agents to reveal secrets or use external tools outside the approved Div6/Div5 boundaries.

### Input trust boundaries
- Imported markdown and skill protocol files must be treated as reviewed repository content, not executable logic.
- Validator inputs should remain repository-local static paths; no user-supplied path, shell command, network fetch, or markdown-driven execution should be introduced in this slice.

### Controls to verify during execution
- Keep the v1.4.1 package inventory explicit and static in `validate_handoff.py`.
- Verify entrypoint docs identify v1.4.1 as canonical and legacy material as historical/deprecated.
- Review imported skill/protocol files for instructions that weaken R013/R014 boundaries or request secret/token disclosure.

## Requirement Impact

## Q4 requirement impact analysis

Requirements source checked: `/home/qazanik/Documents/BOS_Chimera_Paperclip_Handoff/BOS_Chimera_Paperclip_Handoff/.gsd/REQUIREMENTS.md`.

### R-IDs touched
- **R012 — canonical v1.4.1 division map active; legacy v1.3 only historical/deprecated.** Directly touched. S01 imports the canonical v1.4.1 org/package docs and updates handoff entrypoints so new agents see this as the active contract.
- **R013 — only Div6.External may interact with the external world.** Indirectly touched. S01 imports the tool permission matrix and external IO gateway skill that define this boundary; later slices must enforce it in configs/contracts.
- **R014 — Div5 must quarantine, validate, and sanitize raw external evidence before internal use.** Indirectly touched. S01 imports the knowledge quarantine / Div5 protocol materials that become the policy source for later enforcement.
- **R015 — Div1.HCO owns routing, escalation, Circuit Breaker, and staffing/workload coordination.** Indirectly touched. S01 imports HCO routing, circuit breaker, staffing, and treasury/access protocols.
- **R011 — stable external integration boundaries; no Paperclip core internals.** Regression-sensitive but not directly changed by the planned file list. If `scripts/validate_handoff.py` is extended, it should remain repository-local and not add Paperclip core/private coupling.

### Requirements not materially touched
- **R009, R010** are validated M002 runtime/eval-gate/circuit-breaker requirements and are not directly affected by a doctrine import, except that imported protocol text may reference circuit-breaker concepts under R015.

### Must re-test after shipping S01
- `test -f docs/BOS_Light_v1_4_1_CANONICAL_ORG.md && test -f docs/BOS_Light_v1_4_1_Acceptance_Tests_A12_A20.md && test -f skills/SKILL_EXTERNAL_IO_GATEWAY.md`
- `python3 scripts/validate_handoff.py`
- Confirm `README.md`, `00_START_HERE_FOR_NEW_AI_AGENT.md`, `HANDOFF_PROMPT_FOR_NEW_AI_AGENT.md`, `BOS_M002_DEVELOPMENT_HANDOFF.md`, `HANDOFF_REAL_PAPERCLIP_IMPORT_TEST.md`, and `MANIFEST.md` point readers to the v1.4.1 package before legacy/M002 historical material.
- Confirm `validate_handoff.py` enumerates all planned v1.4.1 docs and skill protocol files and reports missing/stale files explicitly.

### Decisions to revisit
- No explicit project decision needs revisiting for S01 before task execution. The implementation should preserve the existing stable-boundary decision behind R011 by avoiding any Paperclip core/private/runtime dependency in the validator.

## Proof Level

- This slice proves: contract

## Integration Closure

The repository has a discoverable canonical v1.4.1 doctrine package, and the handoff inventory is machine-checkable for downstream work.

## Verification

- validate_handoff.py reports missing or stale package files explicitly, so future agents can see exactly what was not imported.

## Tasks

- [x] **T01: Import v1.4.1 doctrine docs and protocols** `est:1h 30m`
  Import the new v1.4.1 doctrine docs and protocol files into the repository. The new package should become the canonical reference set for the updated org model, permissions, contracts, and A12-A20 acceptance set, while the older v1.2-era docs remain available only as historical context.
  - Files: `docs/BOS_Light_v1_4_1_CANONICAL_ORG.md`, `docs/BOS_Light_v1_4_1_Function_Migration_Matrix.md`, `docs/BOS_Light_v1_4_1_Tool_Permission_Matrix.md`, `docs/BOS_Light_v1_4_1_Data_Contracts.md`, `docs/BOS_Light_v1_4_1_Acceptance_Tests_A12_A20.md`, `skills/SKILL_HCO_ROUTING_CONTROL.md`, `skills/SKILL_EXTERNAL_IO_GATEWAY.md`, `skills/SKILL_KNOWLEDGE_QUARANTINE.md`, `skills/SKILL_DIV5_AUTORESEARCH.md`, `skills/SKILL_AGENT_STAFFING_AND_HATS.md`, `skills/SKILL_CIRCUIT_BREAKER_HCO.md`, `skills/SKILL_TREASURY_BUDGET_ACCESS.md`
  - Verify: test -f docs/BOS_Light_v1_4_1_CANONICAL_ORG.md && test -f docs/BOS_Light_v1_4_1_Acceptance_Tests_A12_A20.md && test -f skills/SKILL_EXTERNAL_IO_GATEWAY.md

- [x] **T02: Refresh handoff entrypoints and inventory** `est:1h`
  Update the repo root handoff docs and manifest so the v1.4.1 package is the first thing a new agent sees. Keep the older M002 and legacy BOS Chimera material as historical context, but make the README, start-here note, handoff prompt, and import-test guidance clearly point to the new canonical v1.4.1 doctrine package and its validation order. Extend the handoff validator so it checks the new package inventory rather than only the original baseline files.
  - Files: `README.md`, `00_START_HERE_FOR_NEW_AI_AGENT.md`, `HANDOFF_PROMPT_FOR_NEW_AI_AGENT.md`, `BOS_M002_DEVELOPMENT_HANDOFF.md`, `HANDOFF_REAL_PAPERCLIP_IMPORT_TEST.md`, `MANIFEST.md`, `scripts/validate_handoff.py`
  - Verify: python3 scripts/validate_handoff.py

## Files Likely Touched

- docs/BOS_Light_v1_4_1_CANONICAL_ORG.md
- docs/BOS_Light_v1_4_1_Function_Migration_Matrix.md
- docs/BOS_Light_v1_4_1_Tool_Permission_Matrix.md
- docs/BOS_Light_v1_4_1_Data_Contracts.md
- docs/BOS_Light_v1_4_1_Acceptance_Tests_A12_A20.md
- skills/SKILL_HCO_ROUTING_CONTROL.md
- skills/SKILL_EXTERNAL_IO_GATEWAY.md
- skills/SKILL_KNOWLEDGE_QUARANTINE.md
- skills/SKILL_DIV5_AUTORESEARCH.md
- skills/SKILL_AGENT_STAFFING_AND_HATS.md
- skills/SKILL_CIRCUIT_BREAKER_HCO.md
- skills/SKILL_TREASURY_BUDGET_ACCESS.md
- README.md
- 00_START_HERE_FOR_NEW_AI_AGENT.md
- HANDOFF_PROMPT_FOR_NEW_AI_AGENT.md
- BOS_M002_DEVELOPMENT_HANDOFF.md
- HANDOFF_REAL_PAPERCLIP_IMPORT_TEST.md
- MANIFEST.md
- scripts/validate_handoff.py
