# M002: Runtime Adapter Validation for Paperclip

**Vision:** Prove BOS Light against the live Paperclip sandbox using Paperclip native extension boundaries: company templates define organization, Paperclip plugin APIs expose BOS tools and UI, Paperclip agents run Hermes through hermes_local, Div4 quality and verification runs through standalone gsdpi_local custom adapter, and existing BOS Light A1-A10 flows are tested only through Paperclip visible artifacts with proof gated capability updates.

## Success Criteria

- Paperclip sandbox health, admin access, runtime version/build, approved mutation scope, and supported extension boundaries are recorded without exposing secrets.
- Hermes based BOS agents are configured as Paperclip agents using adapterType hermes_local and complete bounded smoke tasks with resultJson.bos evidence.
- A standalone gsdpi_local adapter passes testEnvironment, runs a bounded GSD-Pi headless verification job, and returns BosAdapterResult gate evidence for Div4 without the BOS plugin spawning it.
- Existing BOS Light BPI, Blueprint, Betting Table, Eval Gate, and Circuit Breaker functionality is exercised against Paperclip visible issue artifacts or explicitly documented fallbacks.
- All changes stay at Paperclip company-template, plugin API, agent configuration, or external/custom adapter boundaries; no Paperclip core patch, direct DB mutation, or private internal dependency is introduced.
- plugin-bos-light/capabilities.paperclip-runtime.json and docs are updated only for surfaces with live version/build/readback proof, and all local regression commands pass.

## Slices

- [x] **S01: Sandbox and adapter preflight** `risk:high` `depends:[]`
  > After this: The next agent has a redacted sandbox fingerprint, local baseline proof, adapter readiness facts, supported extension-boundary inventory, and a go or no-go checklist for Hermes and GSD-Pi launch.

- [x] **S02: Hermes BOS agents smoke** `risk:high` `depends:[S01]`
  > After this: Paperclip sandbox shows Hermes backed BOS agents completing safe smoke tasks with captured resultJson.bos evidence and no duplicate wake behavior.

- [x] **S03: GSD-Pi local adapter smoke** `risk:high` `depends:[S01]`
  > After this: Paperclip can invoke gsdpi_local for a harmless Div4 quality job and receive BosAdapterResult gate evidence or a fail-closed diagnostic artifact.

- [x] **S04: Live BOS artifact flow with Hermes no-go guard** `risk:medium` `depends:[S02,S03]`
  > After this: After this: A sandbox issue or project contains visible BPI, Blueprint, Betting Table, Eval Gate, and Circuit Breaker evidence using native or fallback surfaces, explicitly excluding any assumption that Hermes agents are available until the S02 blocker is remediated.

- [x] **S05: Plugin and UI surface probes** `risk:medium` `depends:[S04]`
  > After this: The capability matrix has concrete evidence for each plugin and UI surface that worked, failed, or remains fallback-only.

- [x] **S06: Capability report and regression closure** `risk:low` `depends:[S05]`
  > After this: After this: The repository contains a validated live Paperclip evidence report, conservative capability matrix, passing local regressions, no-core-modification audit, and a remaining gap ledger that includes the S02 Hermes execution-time secret-materialization blocker unless remediated.

- [x] **S07: Live company template import and agent visibility** `risk:high` `depends:[S06]`
  > After this: After this: The agent has read-only evidence for the supported Paperclip company-template import or agent creation path, and after explicit human approval the sandbox can be mutated to create or import seven BOS Light agents with readback evidence.

- [x] **S08: Provider adapter execution remediation** `risk:high` `depends:[S07]`
  > After this: After this: The project has a selected provider or adapter remediation path for runtime execution, with read-only feasibility evidence and no plaintext-secret or core-patch workaround.

- [x] **S09: Validation artifact reconciliation and requirement coverage repair** `risk:high` `depends:[S08]`
  > After this: After this: S08 has canonical SUMMARY, ASSESSMENT, and UAT artifacts or has been reopened and re-completed; M002 has a consistent context and verification-class source; closeout validators and git/filesystem audits prove DB and rendered artifacts agree.

- [x] **S10: Runtime adapter execution proof remediation** `risk:high` `depends:[S09]`
  > After this: After this: Hermes and gsdpi_local runtime execution proof is either produced through supported Paperclip boundaries with no plaintext secrets or core patches, or the milestone requirements and success criteria are explicitly re-scoped with approved requirement updates and conservative validation evidence.

- [x] **S11: Validation artifact repair** `risk:high` `depends:[S10]`
  > After this: After this: S09 and S10 have canonical assessment artifacts, S01 assessment conflict is resolved or explicitly superseded, milestone context and closeout consumer evidence exist, and validation can audit slice delivery without missing artifacts.

- [x] **S12: Runtime proof or approved rescope** `risk:high` `depends:[S11]`
  > After this: After this: Hermes resultJson.bos and gsdpi_local BosAdapterResult proof is produced through supported Paperclip boundaries with no plaintext secrets or core patches, or approved requirement and success criterion updates explicitly rescope the runtime execution goals.

- [x] **S13: Requirement coverage reconciliation** `risk:medium` `depends:[S12]`
  > After this: After this: M002 requirement coverage is coherent with current active requirements, including explicit out of scope notes or validation evidence for R012 through R015, and Contract Integration Operational and UAT checks are rerun for validation round 1.

## Boundary Map

### S01 → S02

Produces:
- Sandbox runtime fingerprint: health, version/build, environment type, approved mutation scope, adapter registry evidence path, and supported extension-boundary inventory.
- Local baseline verification output and live proof boundary.

Consumes:
- M001 fixture baseline and sandbox handoff.

### S01 → S03

Produces:
- Runtime and host preflight facts needed by gsdpi_local: Node version, gsd command availability, repo path, .gsd writability, git state policy, structured output support expectation, and custom adapter registration boundary.

Consumes:
- M001 GSD state and v1.3 gsdpi_local contract.

### S02 → S04

Produces:
- Hermes Paperclip agent IDs, role profiles, toolset restrictions, heartbeat smoke evidence, and resultJson.bos sample shape, all configured through Paperclip agent and adapter interfaces.

Consumes:
- S01 runtime fingerprint and approved sandbox scope.

### S03 → S04

Produces:
- gsdpi_local external adapter package or adapter config, testEnvironment evidence, bounded execute evidence, failure diagnostics, and Div4 gate result schema.

Consumes:
- S01 runtime and repo preflight.

### S04 → S05

Produces:
- Paperclip visible BOS artifacts for BPI, Blueprint, Betting Table, Eval Gate, and Circuit Breaker using native or fallback surfaces with readback evidence.

Consumes:
- S02 Hermes agents and S03 GSD-Pi quality agent evidence.

### S05 → S06

Produces:
- Plugin registration, piko tool invocation, data/action/UI surface evidence, or explicit unsupported/fallback records, without Paperclip core patches.

Consumes:
- S04 native artifact flow and existing plugin-bos-light manifest/runtime capability matrix.

### S06 → milestone closeout

Produces:
- Updated capability matrix, runtime health docs, validation report, regression outputs, remaining gap ledger, and explicit no-core-modification audit.

Consumes:
- All prior live evidence and M001 fixture baseline.
