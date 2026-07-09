# S02: Runtime Capability Adapter Health

**Goal:** Produce an evidence-backed Runtime Capability Adapter Health contract for BOS Light that classifies Paperclip import/export, AGENTS syntax, plugin runtime, registration APIs, native issue/document/comment/approval APIs, state/config/entities/activity/events/UI slots as confirmed, unsupported, fallback-only, or unvalidated, without simulating support that the runtime has not proven.
**Demo:** The plugin has a capability health report and adapter contract showing which Paperclip surfaces are available, unsupported, or fallback-only.

## Must-Haves

- Owned/supporting requirements: R003 and R004 are primary for this slice; R011 is supported by contract-level proof plus the S01 A1 baseline; R008 and R010 consume the results later. Threat Surface (Q3): the new probe accepts local runtime paths and may inspect Paperclip metadata, so it must avoid shell interpolation, must not log secrets/tokens, and must not treat arbitrary files as trusted SDK proof. Requirement Impact (Q4): D001/D002 remain intact; D003 governs conservative capability evidence; S01 local import-readiness proof must continue to pass. Done means: (1) a machine-readable capability matrix covers every manifest-requested and adapter-assumed surface; (2) validators fail any claimed confirmed/native support without runtime version/build and proof evidence; (3) a no-runtime-safe probe records unavailable/unvalidated surfaces rather than failing into simulated success; (4) adapter/manifest/docs explicitly preserve native artifacts first, plugin state as cache/overlay, and polling/activity fallback for missing events; (5) downstream S03/S04/S05 can tell which surfaces are usable, fallback-only, or blockers. Slice verification: `python3 scripts/test_validate_runtime_capabilities.py && python3 scripts/test_probe_paperclip_runtime.py && python3 scripts/validate_runtime_capabilities.py && python3 scripts/validate_company_template.py && python3 scripts/test_validate_company_template.py`.

## Threat Surface

## Threat model

S02 does not add a public network/auth surface, but it does add a local probe and capability matrix that later slices will trust before using Paperclip-native APIs.

## Abuse scenarios

- **Parameter tampering / filesystem over-read:** `scripts/probe_paperclip_runtime.py --paperclip-dir` will accept a local path; if it recursively scans or follows arbitrary symlinks, a caller could cause it to inspect unrelated files or sensitive local metadata.
- **Shell injection:** `scripts/import-company-template.sh` and the probe must not interpolate a supplied runtime path into shell commands. The slice plan explicitly requires standard-library inspection only and no external process spawning.
- **Forged runtime evidence / replay:** A malicious or stale Paperclip metadata file could claim a runtime version/build or API capability that is not actually present. The validator must require proof command/runtime evidence fields for `confirmed` statuses and keep unproven surfaces `unvalidated`, `unsupported`, or `fallback-only`.
- **Privilege/ownership confusion:** Overclaiming native issue/document/comment/approval APIs could let later S03/S04/S05 code treat plugin-side cache or optional-chained SDK calls as durable Paperclip truth, violating Paperclip ownership of approvals and system-of-record state.
- **Secret/PII leakage:** Probe output and health reports may include runtime metadata, paths, env-like strings, tokens, issue data, or configuration values. Tests must cover redaction of secret-like values and docs must avoid logging tokens, credentials, or PII.
- **Trust-boundary collapse:** Arbitrary files in a supplied Paperclip directory are untrusted input, not SDK proof. The matrix/report should name the exact evidence source and blocker/fallback for each surface.

## Required guardrails before task execution can be considered safe

- Do not spawn shell commands with user-supplied paths; use safe filesystem APIs and bounded, non-recursive or allowlisted metadata reads.
- Do not follow symlinks into unexpected locations without explicit intent and documentation.
- Redact token/env/secret-like strings in probe output, validation errors, and health reports.
- Treat missing, malformed, stale, or unverifiable metadata as `unvalidated` rather than success.
- Require runtime version/build and proof evidence for every `confirmed`/native-support claim.
- Preserve native-first ownership: plugin state remains cache/overlay; approvals/requests remain Paperclip-owned; polling/activity fallback remains mandatory for missing event surfaces.

## Requirement Impact

## Requirements touched

- **R003 — Paperclip as system of record:** Primary. The capability contract must prevent BOS Light from treating plugin state, in-memory adapters, or optional SDK calls as durable truth.
- **R004 — Runtime assumptions validated before trusted SDK behavior:** Primary. The matrix, validator, and probe are the direct implementation of this requirement.
- **R011 — Balanced proof for M001:** Supported. This slice provides contract-level/repository-local executable proof and records live runtime absence as explicit unvalidated evidence.
- **R008 — Native approval/request creation without plugin-side approval engine:** Downstream consumer. S02 must classify approval/request APIs so S04 can either use native support or record a blocker/fallback.
- **R010 — Circuit Breaker fallback behavior:** Downstream consumer. S02 must classify events/activity/state surfaces so S05 can choose polling/activity fallback when events are unavailable.
- **R012/R013 — Adapter/persistence seams and native-first durable artifact mirroring:** Affected by T03/T04 source/docs alignment even though not named as primary in the S02 must-haves.

## Retest requirements after shipping S02

- Re-run the full S02 verification command: `python3 scripts/test_validate_runtime_capabilities.py && python3 scripts/test_probe_paperclip_runtime.py && python3 scripts/validate_runtime_capabilities.py && python3 scripts/validate_company_template.py && python3 scripts/test_validate_company_template.py`.
- Re-test **S01 A1 import-readiness proof** so D001/D002 remain intact: `python3 scripts/validate_company_template.py` and `python3 scripts/test_validate_company_template.py`.
- Verify the capability matrix covers every manifest-requested and adapter-assumed surface and rejects `confirmed` support without runtime version/build plus proof evidence.
- Verify probe no-runtime behavior records unavailable/unvalidated/fallback-only posture instead of simulating success.
- Verify docs and source comments preserve native artifacts first, plugin state as cache/overlay, and polling/activity fallback for missing event surfaces.

## Decisions to revisit

- **D001:** No change expected; S01 validator must remain repository-local and standard-library-only.
- **D002:** No change expected; S02 should link to live/runtime capability health without weakening the S01 proof boundary.
- **D003:** Governs this slice; revisit only if executor obtains real Paperclip runtime evidence that justifies moving specific surfaces from `unvalidated`/`fallback-only` to `confirmed`.

## Proof Level

- This slice proves: Contract-level and repository-local executable proof. Real Paperclip runtime proof is included only if the executor has a live Paperclip path/version to probe; otherwise the correct proof outcome is explicit unvalidated/fallback-only status, not a support claim. Human/UAT is not required for this slice.

## Integration Closure

Consumes the S01 validated company template and A1 evidence. Produces the S02 capability matrix, no-runtime-safe probe, adapter/manifest boundary notes, and health report that S03, S04, and S05 must consume before implementing native artifact flow, approvals/requests, Eval Gates, and Circuit Breaker behavior. Leaves real BPI/Blueprint/Betting Table/Gate implementation for later slices and final A1-A10 assembly for S06.

## Verification

- Adds inspection surfaces for future agents: a capability matrix with status/evidence/fallback/blocker fields, a validator that pinpoints unsupported or overclaimed surfaces, a probe that reports runtime availability/version/build when present, and a health report that records fallback posture without exposing secrets.

## Tasks

- [x] **T01: Define capability matrix and validation guardrails** `est:1h`
  Expected executor skills for task-plan frontmatter: api-design, write-docs, verify-before-complete.
  - Files: `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/plugin-bos-light/manifest.paperclip-plugin.json`, `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/plugin-bos-light/src/worker.ts`, `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/plugin-bos-light/src/paperclipAdapter.ts`, `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/docs/05_PERSISTENCE_MATRIX.md`, `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/docs/07_RISKS_AND_SPIKES.md`
  - Verify: python3 scripts/test_validate_runtime_capabilities.py

- [x] **T02: Add no-runtime-safe Paperclip probe command** `est:1h`
  Expected executor skills for task-plan frontmatter: error-handling-patterns, observability, verify-before-complete.
  - Files: `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/scripts/import-company-template.sh`, `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/scripts/validate_company_template.py`
  - Verify: python3 scripts/test_probe_paperclip_runtime.py

- [x] **T03: Align adapter and manifest boundaries with capability statuses** `est:1h`
  Expected executor skills for task-plan frontmatter: api-design, observability, verify-before-complete.
  - Files: `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/plugin-bos-light/src/paperclipAdapter.ts`, `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/plugin-bos-light/src/persistence.ts`, `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/plugin-bos-light/src/worker.ts`, `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/plugin-bos-light/manifest.paperclip-plugin.json`
  - Verify: python3 scripts/validate_runtime_capabilities.py

- [x] **T04: Publish capability health report and downstream closure docs** `est:45m`
  Expected executor skills for task-plan frontmatter: write-docs, verify-before-complete.
  - Files: `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/company-template/import-notes.md`, `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/company-template/a1-validation-evidence.md`, `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/docs/05_PERSISTENCE_MATRIX.md`, `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/docs/07_RISKS_AND_SPIKES.md`
  - Verify: python3 scripts/test_validate_runtime_capabilities.py && python3 scripts/test_probe_paperclip_runtime.py && python3 scripts/validate_runtime_capabilities.py && python3 scripts/validate_company_template.py && python3 scripts/test_validate_company_template.py

## Files Likely Touched

- /home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/plugin-bos-light/manifest.paperclip-plugin.json
- /home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/plugin-bos-light/src/worker.ts
- /home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/plugin-bos-light/src/paperclipAdapter.ts
- /home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/docs/05_PERSISTENCE_MATRIX.md
- /home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/docs/07_RISKS_AND_SPIKES.md
- /home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/scripts/import-company-template.sh
- /home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/scripts/validate_company_template.py
- /home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/plugin-bos-light/src/persistence.ts
- /home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/company-template/import-notes.md
- /home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/company-template/a1-validation-evidence.md
