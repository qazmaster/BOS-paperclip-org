# S08: Provider adapter execution remediation

**Goal:** Choose and prove a safe runtime execution remediation path for BOS Light agents without plaintext secrets, Paperclip core patches, direct database mutation, private internals, or fabricated execution evidence.
**Demo:** After this: The project has a selected provider or adapter remediation path for runtime execution, with read-only feasibility evidence and no plaintext-secret or core-patch workaround.

## Must-Haves

- Existing S02 Hermes blocker and S03 `gsdpi_local` blocker are rechecked from evidence without overclaiming.
- Codex CLI availability is assessed only as a provider or adapter candidate and not treated as Paperclip proof unless Paperclip can invoke it through a supported adapter boundary.
- A recommended path is selected from fixing `hermes_local` secret materialization, registering `gsdpi_local`, or implementing/registering a supported `codex_local` adapter.
- No plaintext provider key, Paperclip core patch, direct DB mutation, monkey patch, or private adapter registry import is used.
- After explicit human approval only: one bounded runtime smoke returns structured BOS evidence through the selected supported Paperclip adapter path.
- If execution remains blocked, the evidence clearly states why and leaves capability posture conservative.

## Threat Surface

## Q3 exploit analysis

### Abuse scenarios
- **Adapter-config tampering:** A selected `hermes_local`, `gsdpi_local`, or `codex_local` path could be abused if untrusted or stale configuration controls `adapterType`, command paths, provider base URLs, env bindings, result schema, or runtime arguments.
- **Command/provider invocation injection:** `gsdpi_local` and any future `codex_local` path imply host command execution; arguments, repo paths, prompt/task text, output paths, and provider options must be allowlisted and bounded before reaching a subprocess or provider API.
- **Privilege escalation through unsupported boundaries:** Private adapter registry imports, direct DB mutation, monkey patches, or Paperclip core patches would bypass the stable extension-boundary constraint and could turn a remediation into a privileged runtime modification.
- **Replay or duplicate execution:** T04's runtime smoke must record run id, duration, status, side effects, and no-duplicate-wake evidence; otherwise a repeated approval packet or stale registration evidence could trigger extra provider runs.
- **Fabricated capability evidence:** A local CLI success, Codex availability, markdown fallback, or blocked diagnostic artifact must not be promoted as Paperclip adapter proof unless Paperclip invokes it through a supported adapter boundary and returns the required structured BOS result shape.

### Data exposure risks
- Sensitive provider credentials may exist only as Paperclip company secrets and `{type:"secret_ref", secretId, version:"latest"}` bindings; inline plaintext provider keys in `adapterConfig.env`, logs, JSON evidence, reports, or docs would expose secrets.
- Redacted logs and evidence must avoid leaking tokens, API keys, provider auth headers, sandbox identifiers beyond approved fingerprints, and raw provider transcripts if they contain sensitive prompt or environment data.

### Input trust boundaries
- Human approval is the boundary between read-only feasibility/decision artifacts and any mutation or provider execution.
- Adapter configs, env bindings, CLI arguments, repository paths, task prompts, and smoke output are untrusted until validated before reaching Paperclip adapter APIs, subprocesses, provider APIs, filesystem writes, or capability-matrix promotions.

### Required guardrails before execution
- Keep T01/T02 read-only and set `approval_required=true`, `mutation_attempted=false`, and `provider_execution_attempted=false` until explicit human approval.
- Use supported Paperclip boundaries only: company-template, plugin API, agent configuration, or custom adapter interfaces.
- Require registry/testEnvironment/readback proof before smoke execution.
- Fail closed with conservative capability posture if registration, secret resolution, or structured BOS result evidence is missing.

## Requirement Impact

## Q4 requirements impact

### Existing requirements touched
- **R011 — stable external boundaries / no Paperclip core internals**: directly touched. S08's whole purpose is to select and prove a provider or adapter remediation path while avoiding Paperclip core patches, direct DB mutation, monkey patches, private adapter registry imports, and plaintext-secret workarounds.
- **R009 — Eval Gate validated fixture/fallback posture**: indirectly touched if S08 promotes GSD-Pi, Hermes, or Codex runtime execution evidence into capability docs/reports used by Eval Gate or Div4 narratives. Existing validated fixture evidence must remain distinct from live runtime proof.
- **R010 — Circuit Breaker validated fixture/fallback posture**: indirectly touched if S08 updates no-duplicate-wake, active-run, or runtime capability status in shared reports/capability matrix. Existing fixture validation must not be over-promoted by unrelated adapter proof.

### Must be re-tested after shipping S08
- Re-run the final M002 closeout validator: `python3 scripts/validate_m002_closeout.py --phase final`.
- Re-run runtime capability validation: `python3 scripts/validate_runtime_capabilities.py`.
- Re-run the closeout regression harness if capability/report files change: `python3 scripts/run_m002_regression_closure.py --output runtime-evidence/M002-S06-regression-closure.json`.
- Re-run the closeout unit coverage: `python3 -m unittest scripts/test_validate_m002_closeout.py` and `python3 -m unittest scripts/test_run_m002_regression_closure.py`.
- If plugin code or Eval Gate/Circuit Breaker evidence generation changes, also re-run the existing plugin tests/typecheck that validated R009/R010 in S05/S06.
- For any approved runtime smoke, verify the exact structured result contract for the selected path: Hermes `resultJson.bos`, GSD-Pi `BosAdapterResult`, or the explicitly specified `codex_local` BOS schema.

### Decisions to revisit
- No prior decision needs reversal if S08 stays within supported boundaries. Revisit/record a decision only if the selected path introduces a new `codex_local` adapter boundary, changes secret materialization behavior for `hermes_local`, or requires a new supported external-adapter registration mechanism.
- Any path requiring Paperclip core patches, private registry imports, direct DB mutation, or inline plaintext secrets must be rejected or escalated because it would violate R011.

## Proof Level

- This slice proves: Read-only feasibility first; implementation or runtime execution only after explicit human selection and approval for the selected path.

## Integration Closure

S08 consumes S07 agent visibility evidence or its blocked approval packet, S02 Hermes blocker evidence, and S03 GSD-Pi adapter blocker evidence. It must produce a selected execution remediation path and either passing runtime execution evidence or a conservative blocked evidence artifact that leaves M002 needs-attention.

## Verification

- Adds structured evidence for provider and adapter availability, secret handling posture, selected execution path, smoke run ids, returned structured result shape, and explicit blockers. Redacts provider credentials and never logs secret values.

## Tasks

- [x] **T01: Created the S08 provider-adapter feasibility inventory selecting codex_local as the safest next bounded remediation probe while keeping Hermes and gsdpi_local fail-closed.** `est:1h`
  Inspect S02/S03 evidence, adapter candidate code, Paperclip runtime health docs, and local environment availability for Hermes, GSD-Pi, and Codex CLI. Use repository-local reads and read-only commands only. Determine which execution paths are feasible from supported Paperclip boundaries and which are blocked by missing registry, secret materialization, or host availability. Do not mutate Paperclip or configure secrets.
  - Files: `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/runtime-evidence/M002-S08-provider-adapter-feasibility.json`
  - Verify: python3 -m json.tool runtime-evidence/M002-S08-provider-adapter-feasibility.json >/dev/null

- [x] **T02: Captured the approved S08 remediation decision packet selecting Paperclip-owned hermes_local execution with a Codex CLI-backed Hermes provider while leaving mutation and execution gated.** `est:1h`
  Prepare a decision packet comparing three paths: fix `hermes_local` secret materialization through supported secret refs, register `gsdpi_local` through a supported external-adapter mechanism, or implement/register `codex_local` using Codex CLI as a supported adapter boundary. Include tradeoffs, proof required, security risks, and exact human approval required before any mutation or provider execution. Stop after presenting the packet if no path is approved.
  - Files: `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/runtime-evidence/M002-S08-execution-path-decision-packet.json`
  - Verify: python3 -m json.tool runtime-evidence/M002-S08-execution-path-decision-packet.json >/dev/null && python3 - <<'PY'
import json
p='runtime-evidence/M002-S08-execution-path-decision-packet.json'
d=json.load(open(p))
assert d.get('approval_required') is True
assert d.get('mutation_attempted') is False
assert d.get('provider_execution_attempted') is False
PY

- [x] **T03: Proved T03 registration readiness is blocked: hermes_local supports the Codex provider config in docs, but current Paperclip testEnvironment cannot find the Hermes CLI.** `est:2h`
  Execute only after the human explicitly approves one selected path. Implement or configure the selected adapter path through supported Paperclip boundaries only, using secret refs for sensitive provider credentials and never inline plaintext keys. Capture registry/testEnvironment/readback evidence before any smoke run. If approval or supported registration is missing, write a blocked evidence artifact and stop.
  - Files: `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/runtime-evidence/M002-S08-adapter-registration-evidence.json`, `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/PAPERCLIP_LIVE_VALIDATION_REPORT.md`, `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/docs/08_RUNTIME_CAPABILITY_HEALTH.md`
  - Verify: python3 -m json.tool runtime-evidence/M002-S08-adapter-registration-evidence.json >/dev/null

- [x] **T04: Approved runtime execution smoke** `est:2h`
  Execute only if T03 proves supported registry and testEnvironment readiness. Run one bounded Paperclip adapter smoke through the selected path and require structured BOS result evidence: Hermes `resultJson.bos`, GSD-Pi `BosAdapterResult`, or an explicitly specified `codex_local` BOS result schema. Capture run id, status, duration, side effects, redacted logs, no duplicate wake behavior when applicable, and conservative capability matrix updates. If the smoke fails, fail closed with diagnostics.
  - Files: `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/runtime-evidence/M002-S08-runtime-execution-smoke.json`, `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/PAPERCLIP_LIVE_VALIDATION_REPORT.md`, `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/plugin-bos-light/capabilities.paperclip-runtime.json`, `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/docs/08_RUNTIME_CAPABILITY_HEALTH.md`
  - Verify: python3 -m json.tool runtime-evidence/M002-S08-runtime-execution-smoke.json >/dev/null && python3 scripts/validate_m002_closeout.py --phase final

- [x] **T05: Hermes CLI environment remediation and T03 repeat** `est:2h`
  Use only supported Paperclip environment/admin surfaces to discover how the current Paperclip execution environment can install or expose the Hermes CLI. Do not patch Paperclip core, mutate the database, import private internals, or write plaintext secrets. If a supported package/environment administration path is available, apply the minimal Hermes CLI remediation and capture before/after diagnostics. If no supported path exists, write a blocked artifact and stop before runtime smoke.
  - Files: `runtime-evidence/M002-S08-hermes-cli-environment-remediation.json`, `runtime-evidence/M002-S08-adapter-registration-evidence.json`
  - Verify: python3 -m json.tool runtime-evidence/M002-S08-hermes-cli-environment-remediation.json >/dev/null && python3 -m json.tool runtime-evidence/M002-S08-adapter-registration-evidence.json >/dev/null

## Files Likely Touched

- /home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/runtime-evidence/M002-S08-provider-adapter-feasibility.json
- /home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/runtime-evidence/M002-S08-execution-path-decision-packet.json
- /home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/runtime-evidence/M002-S08-adapter-registration-evidence.json
- /home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/PAPERCLIP_LIVE_VALIDATION_REPORT.md
- /home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/docs/08_RUNTIME_CAPABILITY_HEALTH.md
- /home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/runtime-evidence/M002-S08-runtime-execution-smoke.json
- /home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/plugin-bos-light/capabilities.paperclip-runtime.json
- runtime-evidence/M002-S08-hermes-cli-environment-remediation.json
- runtime-evidence/M002-S08-adapter-registration-evidence.json
