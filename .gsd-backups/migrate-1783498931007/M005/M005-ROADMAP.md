# M005: E2E BOS Light Live Runtime Proof

**Vision:** Prove the full BOS Light 7-division organizational cycle end-to-end through the Paperclip GUI on a real startup (aipay.kz) with live customers. The plugin must register, the company template must import, Hermes agents must execute with xiaomi mimo 2.5 pro, git must modify the aipay.kz codebase, and one complete mission must flow from intake to completion with visible artifacts in Paperclip.

## Success Criteria

- One complete mission flows through all 7 divisions in Paperclip GUI
- Div4.Production commits and pushes changes to aipay.kz
- Div5.Qualifications produces visible Eval Gate pass/fail evidence
- Circuit Breaker opens after 3 failures with visible escalation record
- All artifacts (documents, comments, issues) readable in Paperclip UI
- Plugin version/build recorded in live evidence
- Fail-closed blocker artifacts for any unvalidated surface

## Slices

- [x] **S01: Plugin Registration + Hermes Xiaomi Runtime Proof** `risk:HIGH` `depends:[]`
  > After this: The BOS Light plugin is loaded in Paperclip, dashboard widget and issue tabs are visible, and a bounded Hermes agent run with xiaomi mimo 2.5 pro produces resultJson.bos output.

- [x] **S02: Company Template Import + Agent Profile Activation** `risk:HIGH` `depends:[S01]`
  > After this: The v1.4.1 company template is imported into Paperclip, 7 divisions are visible in the org chart, and each division's AGENTS.md profile is parsed and active. Routing rules route a test task to the correct division.

- [x] **S03: Resource Intake + Pre-Mission Credential Checklist** `risk:MEDIUM` `depends:[S01,S02]`
  > After this: Before mission execution, the system detects missing credentials (Paperclip API key, token budget, git access, Xiaomi API key) and creates visible requests in Paperclip for the user to fulfill. Mission does not start until checklist passes.

- [x] **S04: Git Integration + Hybrid State Persistence** `risk:MEDIUM` `depends:[S01,S02,S03]`
  > After this: Div4.Production clones the aipay.kz repository, creates a branch, commits changes, and pushes. Hybrid state mirrors betting table, gate results, and circuit breaker state to Paperclip native artifacts. On simulated restart, state reconstructs from artifacts.

- [x] **S05: E2E Mission Cycle Proof** `risk:MEDIUM` `depends:[S01,S02,S03,S04]`
  > After this: A human creates a mission in Paperclip. The system flows through all 7 divisions, produces a Blueprint, modifies aipay.kz code, passes Eval Gate, and completes. Human approves at mission creation, system failure (if any), and strategy decision points. All artifacts visible in Paperclip.

## Boundary Map

### S01 → S02
Produces:
- Plugin registration status (loaded: boolean, registered_tools: string[], registered_actions: string[], registered_widgets: string[], registered_tabs: string[])
- Hermes runtime evidence (version, build, resultJson.bos sample)
- Capability matrix update (plugin_registration, registration.tools, registration.actions, ui.dashboard_widgets, ui.issue_detail_tabs)

Consumes:
- nothing (first slice)

### S01 → S03
Produces: Plugin action registration (approve-batch, resource-request)
Consumes: Hermes execution confirmed from S01

### S01 → S04
Produces: Hermes execution environment confirmed (git availability, network)
Consumes: Plugin tool registration from S01

### S02 → S03
Produces:
- Company template import evidence (schema_version, divisions_count, routing_rules_active)
- BOS config (company_token_budget_ref, bpi_cutline, betting_table_top_n)

Consumes: Plugin registration from S01

### S02 → S04
Produces: Division routing active (test task routes to correct division)
Consumes: Agent profiles parsed from S02

### S02 → S05
Produces: Full 7-division org model active in Paperclip
Consumes: Company template import evidence from S02

### S03 → S04
Produces: Resource intake checklist (missing_resources, request_artifacts)
Consumes: BOS config budget from S02, Hermes env from S01

### S03 → S05
Produces: Mission unblock signal (checklist_passed: boolean)
Consumes: Resource requests fulfilled by user

### S04 → S05
Produces:
- Git operation evidence (clone_ref, branch_name, commit_sha, push_ref)
- Hybrid state evidence (cache_snapshot, artifact_mirror_refs, reconstruction_status)
- Eval Gate and Circuit Breaker artifacts

Consumes: Git credentials from S03, division routing from S02, plugin tools from S01
