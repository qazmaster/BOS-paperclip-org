# S05: Plugin and UI surface probes

**Goal:** Produce an evidence-gated classification of BOS Light Paperclip plugin registration, piko tool, data provider, action, dashboard widget, and issue detail tab surfaces without promoting any surface unless S05 has its own live version/build and surface-specific readback proof.
**Demo:** The capability matrix has concrete evidence for each plugin and UI surface that worked, failed, or remains fallback-only.

## Must-Haves

- Verification defined before execution:
- `npm --prefix plugin-bos-light test -- registrationProbe` passes.
- `python3 -m unittest scripts/test_run_s05_plugin_ui_surface_probe.py scripts/test_validate_s05_plugin_ui_surface_probe.py` passes.
- `python3 scripts/run_s05_plugin_ui_surface_probe.py --output runtime-evidence/M002-S05-plugin-ui-surface-probe.json && python3 scripts/validate_s05_plugin_ui_surface_probe.py --evidence runtime-evidence/M002-S05-plugin-ui-surface-probe.json --phase final` produces and validates canonical S05 evidence. If live Paperclip auth or supported plugin/UI readback routes are unavailable, the evidence must classify the surfaces as blocked, unsupported, fallback-only, or unvalidated and must not confirm them.
- `python3 -m unittest scripts/test_validate_runtime_capabilities.py && python3 scripts/validate_runtime_capabilities.py && npm --prefix plugin-bos-light run typecheck` passes after matrix/docs updates.
- Threat Surface Q3: malformed host readbacks, stale S04 evidence replay, route probing outside approved sandbox scope, or accidental native approval creation could overclaim capability. Live responses and manifest fields are untrusted; secrets must be redacted and no token, cookie, or secret-like value may be serialized.
- Requirement Impact Q4: touches active R011 plus runtime-proof constraints R003, R004, R011, R012, R013 and preserves R008 with zero native approvals. D008, D009, and D010 remain locked: no Paperclip core patch, private import, direct DB mutation, or worker subprocess executor.
- Failure Modes Q5: missing auth, 401/403, 404 plugin endpoints, timeouts, malformed JSON, missing render IDs, and absent registration readbacks become bounded diagnostics. Any secret-like value, S04-only proof reuse, nonzero native approval, or confirmed status without S05 proof fails validation.
- Load Profile Q6: one bounded probe run, small metadata reads, fixed route candidates, explicit timeouts, deterministic output size caps, no background polling, no recursive scans, and no load generation.
- Negative Tests Q7: missing env, unsupported route, 5xx/timeout, malformed readback, missing registered keys, missing UI render IDs, stale S04 evidence masquerading as S05 proof, and secret redaction.

## Threat Surface

## Q3 exploit analysis

S05 is not a user-facing production feature, but it intentionally probes live Paperclip plugin and UI surfaces, so it crosses several trust boundaries and should be treated as security-sensitive validation code.

### Abuse scenarios

- **Stale evidence replay / overclaiming:** Prior S04 native issue/document/comment proof could be replayed or copied into S05 evidence to mark plugin registration, piko tools, data providers, actions, dashboard widgets, or issue detail tabs as `confirmed` without S05-specific proof. Validation must require S05 phase timestamps, live Paperclip version/build, and surface-specific registration/invocation/render readback.
- **Malformed host readbacks:** Plugin registry responses, manifest fields, route bodies, render IDs, observed keys, and status codes are untrusted. A malformed or partial response could trick the matrix into promoting a surface if the validator accepts truthy fields or optional-chained local scaffolding instead of bounded readback evidence.
- **Route probing outside approved scope:** Fixed candidate routes are acceptable diagnostics, but unconstrained route discovery, recursive scans, or user-controlled URL/path construction could become unauthorized enumeration of the Paperclip sandbox.
- **Parameter tampering:** Untrusted manifest keys, plugin IDs, issue IDs, route names, render IDs, or capability names could be used to query unintended endpoints or write misleading evidence if not normalized against an allowlist.
- **Replay/duplication side effects:** Retrying mutating actions without idempotent guards could create duplicate comments, issues, action runs, or approvals. S05 explicitly requires zero native approval creation; any nonzero approval side-effect must fail validation.
- **Privilege escalation by environment misuse:** If auth headers, cookies, API keys, or admin credentials leak into probe output or logs, downstream agents could reuse them. The probe should never serialize token/cookie/secret-like values and should report only redacted auth posture.

### Data exposure risks

- Potentially sensitive inputs include Paperclip API credentials, cookies, host URLs, company identifiers, issue IDs, plugin registration payloads, and any live response bodies.
- Evidence artifacts must remain bounded and redacted: no token, cookie, secret-like env var, raw auth header, or unbounded response body should appear in `runtime-evidence/M002-S05-plugin-ui-surface-probe.json`, docs, logs, or validator errors.

### Trust boundaries

- **Environment -> probe:** Env vars and credentials are trusted for authentication only, not for serialization.
- **Paperclip host -> local evidence:** All API responses are untrusted and must be schema-checked before influencing capability status.
- **Manifest/local plugin code -> matrix:** Local requested capabilities express intent only; they cannot confirm live support.
- **Probe runner -> filesystem:** The runner should write only the requested bounded evidence path and avoid recursive scans or arbitrary path writes.

### Required controls before task execution

- Allowlist route candidates and manifest/capability keys; do not derive arbitrary endpoints from host responses.
- Require S05-specific live version/build plus per-surface readback proof for `confirmed` statuses.
- Fail validation on stale S04-only evidence, missing render/registration IDs for confirmed surfaces, malformed JSON, secret-like output, or nonzero native approval side effects.
- Keep missing auth, 401/403, 404, timeout, and unsupported endpoints as bounded diagnostics rather than fabricated success.

## Requirement Impact

## Q4 requirement impact

### Requirements touched

- **R011 — stable Paperclip external-boundary integration:** Directly touched. S05 modifies/probes `plugin-bos-light`, runtime capability matrix/docs, and live probe evidence; it must preserve the constraint that BOS Light uses company-template assets, Paperclip plugin APIs, agent configuration, and custom adapter interfaces only. No Paperclip core patches, private imports, direct DB mutation, monkey patches, or worker subprocess executor may be introduced.
- **R003, R004, R012, R013 — runtime-proof constraints referenced by the S05 plan:** The slice plan says these are touched by S05 runtime-proof constraints, but the currently readable root requirements register only lists active **R011** and validated **R009/R010**. Treat these IDs as planned/legacy runtime-proof constraints that must be re-checked if their full definitions are available in the milestone DB/artifacts.
- **R008 — zero native approvals preservation referenced by the S05 plan:** S05 must preserve the S04 no-go guard that plugin/UI probing does not create native approvals. Even if R008 is not present in the readable requirements register, the S05 validator should fail on nonzero native approval side effects.

### Re-tests required after shipping S05

- `npm --prefix plugin-bos-light test -- registrationProbe`
- `python3 -m unittest scripts/test_run_s05_plugin_ui_surface_probe.py scripts/test_validate_s05_plugin_ui_surface_probe.py`
- `python3 scripts/run_s05_plugin_ui_surface_probe.py --output runtime-evidence/M002-S05-plugin-ui-surface-probe.json && python3 scripts/validate_s05_plugin_ui_surface_probe.py --evidence runtime-evidence/M002-S05-plugin-ui-surface-probe.json --phase final`
- `python3 -m unittest scripts/test_validate_runtime_capabilities.py && python3 scripts/validate_runtime_capabilities.py && npm --prefix plugin-bos-light run typecheck`
- S05 closeout regression chain from T05, including final S05 evidence validation and runtime capability validation.
- Manual/document review that `docs/14_PLUGIN_UI_SURFACE_PROBES.md`, `docs/08_RUNTIME_CAPABILITY_HEALTH.md`, `PAPERCLIP_LIVE_VALIDATION_REPORT.md`, and `plugin-bos-light/capabilities.paperclip-runtime.json` only mark a surface `confirmed` when S05 live version/build plus surface-specific readback proof exists.
- No-core-modification audit for R011: verify no Paperclip core source files, private imports, direct DB writes, monkey patches, or subprocess executor paths were introduced.
- Side-effect audit: verify approval counters remain zero and missing/unsupported auth/routes remain bounded diagnostics.

### Decisions to keep locked / revisit only with new evidence

- **D008** remains locked: do not implement Hermes/GSD-Pi execution through the BOS plugin worker as a subprocess executor.
- **D009** remains locked: do not patch or depend on Paperclip core internals.
- **D010** remains locked: S04 evidence promotes only bounded native issue/document/comment surfaces; it must not be reused to confirm S05 plugin registration or UI/data/action/tool surfaces.

### Coverage concern

The S05 plan references R003, R004, R008, R012, and R013, but the readable `.gsd/REQUIREMENTS.md` in the parent project currently exposes only R011 as active plus R009/R010 as validated. Before final milestone validation, ensure those referenced R-IDs are either present in the authoritative requirements store or the S05 plan/docs explain them as legacy/planning constraints to avoid traceability drift.

## Proof Level

- This slice proves: Operational classification proof. Confirmed status is allowed only for plugin or UI surfaces with S05 live Paperclip version/build plus surface-specific registration, invocation, or render readback. Otherwise the slice truthfully proves fallback, unsupported, blocked, or unvalidated posture.

## Integration Closure

Consumes S04 only as the upstream native issue/document/comment artifact baseline and no-go guard; S04 evidence must not promote S05 plugin/UI surfaces. Produces runtime-evidence/M002-S05-plugin-ui-surface-probe.json, a validator, a reader-facing probe ledger, and matrix/docs updates for S06 milestone closeout. The remaining end-to-end gap after S05 is S06 final report/regression closure plus unresolved Hermes and GSD-Pi blockers unless separately remediated.

## Verification

- Adds a canonical S05 evidence artifact with runtime version/build, requested manifest keys, observed registration/tool/data/action/UI keys, route attempts, status codes, phase timestamps, redaction flags, side-effect counters, fallback reasons, and validation errors. Future agents can inspect the evidence JSON and docs/14_PLUGIN_UI_SURFACE_PROBES.md instead of inferring support from optional chaining or local React scaffolds.

## Tasks

- [x] **T01: Add registration contract harness** `est:1h`
  Expected executor skills for task-plan frontmatter: tdd, verify-before-complete.
  - Files: `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/plugin-bos-light/src/registrationProbe.ts`, `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/plugin-bos-light/tests/registrationProbe.test.ts`, `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/plugin-bos-light/src/worker.ts`
  - Verify: npm --prefix plugin-bos-light test -- registrationProbe

- [x] **T02: Build live probe runner and validator** `est:2h`
  Expected executor skills for task-plan frontmatter: tdd, error-handling-patterns, verify-before-complete.
  - Files: `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/scripts/run_s05_plugin_ui_surface_probe.py`, `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/scripts/validate_s05_plugin_ui_surface_probe.py`, `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/scripts/test_run_s05_plugin_ui_surface_probe.py`, `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/scripts/test_validate_s05_plugin_ui_surface_probe.py`
  - Verify: python3 -m unittest scripts/test_run_s05_plugin_ui_surface_probe.py scripts/test_validate_s05_plugin_ui_surface_probe.py

- [x] **T03: Generate canonical probe evidence** `est:45m`
  Expected executor skills for task-plan frontmatter: verify-before-complete, error-handling-patterns.
  - Files: `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/runtime-evidence/M002-S05-plugin-ui-surface-probe.json`
  - Verify: python3 scripts/run_s05_plugin_ui_surface_probe.py --output runtime-evidence/M002-S05-plugin-ui-surface-probe.json && python3 scripts/validate_s05_plugin_ui_surface_probe.py --evidence runtime-evidence/M002-S05-plugin-ui-surface-probe.json --phase final

- [x] **T04: Publish matrix and probe ledger** `est:1.5h`
  Expected executor skills for task-plan frontmatter: write-docs, verify-before-complete.
  - Files: `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/plugin-bos-light/capabilities.paperclip-runtime.json`, `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/scripts/validate_runtime_capabilities.py`, `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/scripts/test_validate_runtime_capabilities.py`, `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/docs/14_PLUGIN_UI_SURFACE_PROBES.md`, `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/docs/08_RUNTIME_CAPABILITY_HEALTH.md`, `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/PAPERCLIP_LIVE_VALIDATION_REPORT.md`
  - Verify: python3 -m unittest scripts/test_validate_runtime_capabilities.py && python3 scripts/validate_runtime_capabilities.py && npm --prefix plugin-bos-light run typecheck

- [x] **T05: Run closeout regression chain** `est:30m`
  Expected executor skills for task-plan frontmatter: verify-before-complete, review.
  - Verify: npm --prefix plugin-bos-light test -- registrationProbe && python3 -m unittest scripts/test_run_s05_plugin_ui_surface_probe.py scripts/test_validate_s05_plugin_ui_surface_probe.py scripts/test_validate_runtime_capabilities.py && python3 scripts/validate_s05_plugin_ui_surface_probe.py --evidence runtime-evidence/M002-S05-plugin-ui-surface-probe.json --phase final && python3 scripts/validate_runtime_capabilities.py && npm --prefix plugin-bos-light run typecheck

## Files Likely Touched

- /home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/plugin-bos-light/src/registrationProbe.ts
- /home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/plugin-bos-light/tests/registrationProbe.test.ts
- /home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/plugin-bos-light/src/worker.ts
- /home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/scripts/run_s05_plugin_ui_surface_probe.py
- /home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/scripts/validate_s05_plugin_ui_surface_probe.py
- /home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/scripts/test_run_s05_plugin_ui_surface_probe.py
- /home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/scripts/test_validate_s05_plugin_ui_surface_probe.py
- /home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/runtime-evidence/M002-S05-plugin-ui-surface-probe.json
- /home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/plugin-bos-light/capabilities.paperclip-runtime.json
- /home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/scripts/validate_runtime_capabilities.py
- /home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/scripts/test_validate_runtime_capabilities.py
- /home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/docs/14_PLUGIN_UI_SURFACE_PROBES.md
- /home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/docs/08_RUNTIME_CAPABILITY_HEALTH.md
- /home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/PAPERCLIP_LIVE_VALIDATION_REPORT.md
