# S06: Capability report and regression closure

**Goal:** Close M002 by turning the existing S04 and S05 runtime evidence into a conservative, validator-backed capability report with an explicit no-core-modification audit, remaining gap ledger, and repeatable local regression closure artifact.
**Demo:** After this: The repository contains a validated live Paperclip evidence report, conservative capability matrix, passing local regressions, no-core-modification audit, and a remaining gap ledger that includes the S02 Hermes execution-time secret-materialization blocker unless remediated.

## Must-Haves

- Owned active requirement: R011. Supporting decisions: D008, D009, D010. Roadmap assumptions were checked against current evidence and remain valid: all planned S06 input paths exist, the capability matrix has 20 entries with 3 confirmed, 10 fallback-only, and 7 unvalidated, S04 carries runtime version/build proof for bounded issue/document/comment surfaces, and S05 remains fail-closed unsupported for plugin/UI surfaces. Success means the final report and health docs only claim S04-confirmed native issue/document/comment support, keep Hermes execution, GSD-Pi execution, approvals, plugin, piko, data/action, widget, and issue-tab surfaces unvalidated or fallback-only, explicitly record the S02 Hermes secret-materialization blocker, include an R011 no-core-modification audit, and pass the generated S06 regression closure runner plus underlying validators.

## Threat Surface

## Q3 exploitation analysis

### Abuse scenarios
- **Capability overclaiming / operational misuse:** The main abuse path is falsifying or overstating the capability report so future operators treat fallback-only or unvalidated surfaces as live Paperclip support. This is explicitly relevant because T03 says the docs may be copied into operational handoffs.
- **Evidence replay / stale proof:** S04/S05 evidence is consumed by S06; a stale or unrelated evidence artifact could be replayed to promote plugin/UI, Hermes, GSD-Pi, approval, or import/export support unless the closeout validator requires canonical paths, version/build/readback proof, and conservative matrix counts.
- **Filesystem/path tampering:** T02/T04 write `runtime-evidence/M002-S06-regression-closure.json`; if `--output` accepted arbitrary paths or created unexpected parents, it could overwrite files outside the intended repo evidence location. The runner must constrain output to repository-local expected paths or fail clearly.
- **Subprocess injection:** The regression runner invokes local Python/Node commands. It should use explicit command arrays without shell expansion, as planned, and must not derive command names/arguments from untrusted evidence or docs.
- **Boundary/privilege escalation by remediation pressure:** A failing closeout must not be "fixed" by Paperclip core patches, private imports, direct DB mutation, native approval fabrication, or broad capability promotion. The no-core/private/direct-DB/native-approval audit is therefore security-relevant, not just documentation hygiene.

### Data exposure risks
- **Secrets in command output:** Child process stdout/stderr digests and validator diagnostics could capture tokens, URLs with credentials, `.env` contents, or Paperclip secret materialization errors. T02's redaction requirement and T01's secret-looking-text negative tests must be retained.
- **Live environment details:** Reports should cite evidence paths and redacted runtime/version/build facts, not auth tokens, live credentials, or sensitive sandbox URLs.
- **Evidence JSON:** S04/S05/S06 artifacts may include command digests and live proof metadata; validators should avoid echoing full raw payloads on failure.

### Trust boundaries
- Inputs treated as data: capability JSON, TypeScript mirror, markdown docs/reports, S04/S05 evidence JSON, and local source files.
- Outputs: docs/report updates and S06 regression JSON artifact.
- Execution boundary: local subprocess runner over bounded command list; no live Paperclip network mutation should be needed for S06.

### Required mitigations to keep this non-blocking
- Fail closed on missing/malformed evidence and stale/non-canonical proof.
- Preserve fallback-only/unvalidated statuses unless independent live proof exists.
- Redact secret-looking text before persisting or printing regression digests.
- Use subprocess command arrays with no shell expansion.
- Keep all changes within BOS Light repo/plugin/docs/scripts; no Paperclip core/private/DB/native approval side effects.

## Requirement Impact

## Q4 requirement impact

### Source caveat
- Expected artifact `.gsd/milestones/M002/REQUIREMENTS.md` was not present in this worktree.
- Mapping below is derived from `.gsd/milestones/M002/slices/S06/S06-PLAN.md`, S06 task plans, `.gsd/STATE.md`, and prior slice summaries.

### Directly touched requirement
- **R011** — S06 owns this active requirement. It must prove M002 remains within supported Paperclip extension boundaries and does not use Paperclip core patches, private imports, direct DB mutation, monkey patches, or fabricated native approval side effects. It also requires conservative live-runtime proof language so docs/matrix do not overclaim support.

### Indirectly preserved / regression-covered requirements
- **R003** — Preserved by ensuring Paperclip-visible issue/document/comment artifacts remain the system-of-record evidence and cache/markdown fallbacks are not misrepresented as native truth.
- **R004** — Preserved by requiring proof-gated runtime assumptions: only S04 version/build/readback-backed issue/document/comment surfaces may be confirmed; plugin/UI/agent/approval/import surfaces remain fallback-only or unvalidated without independent proof.
- **R005-R010** — Not directly changed by S06 implementation, but their prior BPI, Blueprint, Betting Table, Eval Gate, and Circuit Breaker evidence is consumed in the final report/regression closure; the closeout runner should re-run the relevant S04/S05 validators so these are not accidentally regressed or overclaimed.

### Must be re-tested after shipping
- `python3 -m unittest scripts/test_validate_m002_closeout.py`
- `python3 scripts/validate_m002_closeout.py --phase final`
- `python3 scripts/validate_runtime_capabilities.py`
- `python3 -m unittest scripts/test_run_m002_regression_closure.py`
- `python3 scripts/run_m002_regression_closure.py --output runtime-evidence/M002-S06-regression-closure.json`
- The runner should include S04 and S05 evidence validators/tests plus plugin-bos-light local typecheck/tests as planned.

### Decisions to preserve / revisit triggers
- **D008** stays in force: use Paperclip native adapters/agents and supported extension boundaries, not BOS-side subprocess shortcuts for live claims.
- **D009** stays in force: Paperclip core is read-only; no core patch, private dependency, direct DB mutation, or monkey patch is allowed.
- **D010** stays in force: promote only S04-bounded native issue/document/comment create/readback surfaces; all other runtime/plugin/agent surfaces need independent proof.
- Revisit these decisions only if S06 implementation discovers that closeout cannot be completed without a core/private/DB/native-approval workaround; until then the correct action is to keep the gap ledger explicit.

## Proof Level

- This slice proves: Final-assembly and operational proof using repository-local executable checks over canonical evidence artifacts. No fresh live Paperclip runtime is required for this closeout slice; live runtime claims must come only from already captured S04/S05 evidence with version/build/readback proof. Human UAT is not required.

## Integration Closure

Consumes S04 live artifact evidence, S05 plugin/UI probe evidence, the runtime capability matrix, runtimeCapabilities TypeScript mirror, runtime health doc, and the live validation report. Introduces no new runtime integration wiring, no Paperclip core patch, no private import, no direct DB mutation, and no native approval side effect. Closes the milestone by adding a final closeout validator, a regression closure runner, updated reader-facing report sections, and a canonical S06 regression artifact. Remaining end-to-end gaps stay explicit rather than being promoted.

## Verification

- Adds agent-inspectable closure signals: a closeout validator for report and R011 drift, a regression closure JSON artifact with per-command exit codes and redacted digests, and docs/report sections that localize unsupported surfaces and remediation steps without exposing secrets.

## Tasks

- [x] **T01: Closeout validator and no core audit guard** `est:2h`
  Expected executor skills_used: verify-before-complete, review.
  - Files: `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/scripts/validate_m002_closeout.py`, `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/scripts/test_validate_m002_closeout.py`
  - Verify: python3 -m unittest scripts/test_validate_m002_closeout.py && python3 scripts/validate_m002_closeout.py --phase preflight

- [x] **T02: Regression closure runner and evidence artifact** `est:2h`
  Expected executor skills_used: verify-before-complete, tdd.
  - Files: `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/scripts/run_m002_regression_closure.py`, `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/scripts/test_run_m002_regression_closure.py`
  - Verify: python3 -m unittest scripts/test_run_m002_regression_closure.py

- [x] **T03: Capability report and gap ledger alignment** `est:2h`
  Expected executor skills_used: write-docs, verify-before-complete.
  - Files: `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/PAPERCLIP_LIVE_VALIDATION_REPORT.md`, `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/docs/08_RUNTIME_CAPABILITY_HEALTH.md`, `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/plugin-bos-light/capabilities.paperclip-runtime.json`
  - Verify: python3 scripts/validate_m002_closeout.py --phase final && python3 scripts/validate_runtime_capabilities.py

- [x] **T04: Final closeout regression pass** `est:1h`
  Expected executor skills_used: verify-before-complete, review.
  - Files: `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/runtime-evidence/M002-S06-regression-closure.json`
  - Verify: python3 scripts/run_m002_regression_closure.py --output runtime-evidence/M002-S06-regression-closure.json

## Files Likely Touched

- /home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/scripts/validate_m002_closeout.py
- /home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/scripts/test_validate_m002_closeout.py
- /home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/scripts/run_m002_regression_closure.py
- /home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/scripts/test_run_m002_regression_closure.py
- /home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/PAPERCLIP_LIVE_VALIDATION_REPORT.md
- /home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/docs/08_RUNTIME_CAPABILITY_HEALTH.md
- /home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/plugin-bos-light/capabilities.paperclip-runtime.json
- /home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/runtime-evidence/M002-S06-regression-closure.json
