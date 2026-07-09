# S11: Validation artifact repair

**Goal:** Repair the M002 validation artifact layer so milestone closeout consumers can audit S09 and S10 from canonical assessment artifacts, understand that S01 is historical baseline evidence, and run an executable gate that fails closed when those artifacts are missing or contradictory.
**Demo:** After this: S09 and S10 have canonical assessment artifacts, S01 assessment conflict is resolved or explicitly superseded, milestone context and closeout consumer evidence exist, and validation can audit slice delivery without missing artifacts.

## Must-Haves

- `.gsd/milestones/M002/M002-CONTEXT.md` and `.gsd/milestones/M002/M002-ASSESSMENT.md` exist, are non-empty, and summarize the current fail-closed M002 runtime posture without claiming Hermes or GSD-Pi execution proof.
- `.gsd/milestones/M002/slices/S09/S09-ASSESSMENT.md` and `.gsd/milestones/M002/slices/S10/S10-ASSESSMENT.md` exist, are non-empty, and cite their existing SUMMARY, UAT, and runtime evidence sources.
- The S01 assessment conflict is resolved by explicit supersession language in the new milestone artifacts, not by deleting or rewriting S01 historical evidence.
- A standard-library validation gate and unit tests prove the required artifacts, citations, no-promotion posture, and no-secret boundary.
- `scripts/run_m002_regression_closure.py` includes the S11 artifact gate so future M002 closeout runs catch missing validation artifacts.

## Threat Surface

## Abuse scenarios

- **Validation artifact tampering / replay:** S11 consumes and produces local Markdown and JSON evidence under `.gsd/milestones/M002/...` and `runtime-evidence/...`; stale, copied, or manually edited artifacts could be replayed as closeout proof unless the new validator checks required paths, current posture language, machine-evidence alignment, and writes a fresh audit.
- **Capability overclaim acceptance:** The validator and closure runner must fail closed if S09/S10 assessments, milestone context, or capability matrix text promotes Hermes or GSD-Pi execution from auth-denied/fail-closed blocker evidence.
- **Secret exposure:** The primary data exposure risk is accidental inclusion of tokens, auth values, private import paths, or command output secrets in docs, validator diagnostics, JSON audits, or regression closure digests.
- **Privilege escalation / DB mutation:** No direct privilege boundary is intentionally crossed; the slice must preserve no direct DB mutation, no Paperclip core patching, no private/internal imports, and no shell-enabled validator execution.

## Trust boundaries to enforce

- Treat all local Markdown/JSON evidence and runtime-evidence files as untrusted inputs to the S11 validator.
- Keep the validator standard-library-only, local-file-only, shell-disabled, and network-disabled.
- Redact suspicious secret-looking values from diagnostics and fail closed on plaintext secret patterns.
- Ensure `scripts/run_m002_regression_closure.py` invokes the S11 validator via a command array, not a shell string, and preserves redacted command digests.

## Requirement Impact

## Requirements touched

- **R009 — runtime capability promotion / Eval Gate posture:** S11 must preserve the conservative no-promotion posture by ensuring milestone and slice assessments do not treat fail-closed Hermes or GSD-Pi blocker evidence as runtime proof.
- **R010 — runtime execution side-effect / wake semantics:** S11 must preserve the `wakeCountDelta=1`/explicit non-proof posture for future Hermes proof and must not reinterpret auth-denied or failed execution evidence as successful Circuit Breaker/runtime behavior.
- **R011 — supported-boundary constraints:** S11 must continue enforcing no Paperclip core patches, no private/internal imports, no direct DB mutation, no plaintext secrets, and no unsupported capability promotion in docs, validators, and closure artifacts.

## Requirements not to reinterpret

- **R012-R015:** The S11 task plans explicitly say active M004 org-boundary requirements R012 through R015 must not be altered or reinterpreted by this M002 artifact repair slice.

## Re-test after shipping

- `python3 -m unittest scripts/test_validate_m002_validation_artifacts.py`
- `python3 scripts/validate_m002_validation_artifacts.py --root . --write-audit runtime-evidence/M002-S11-validation-artifact-repair.json`
- `python3 -m unittest scripts/test_validate_m002_validation_artifacts.py scripts/test_run_m002_regression_closure.py`
- `python3 scripts/run_m002_regression_closure.py --output runtime-evidence/M002-S06-regression-closure.json`
- Inspect/validate that `runtime-evidence/M002-S11-validation-artifact-repair.json` and the regression closure artifact report passing S11 checks without capability promotion or secret-bearing diagnostics.

## Decisions to revisit

No decision appears to need reopening; S11 should preserve D008-D011 rather than revisit them, and any implementation that requires Paperclip core patching, private imports, direct DB writes, plaintext secrets, or runtime-capability promotion should stop and escalate instead of changing those decisions.

## Proof Level

- This slice proves: Final-assembly artifact proof. Real Paperclip runtime is not required; this slice proves validation and closeout artifact completeness through deterministic filesystem and JSON checks.

## Integration Closure

Consumes completed S09 and S10 slice summaries and UAT artifacts, S10 runtime evidence, runtime health docs, and the capability matrix. Produces canonical milestone and slice assessment artifacts plus a regression-closure gate. Leaves S12 to attempt runtime proof or approved rescope and S13 to reconcile broader requirement coverage after this artifact layer is coherent.

## Verification

- Adds a durable S11 validator audit at `runtime-evidence/M002-S11-validation-artifact-repair.json` and a regression closure command entry so future agents can inspect pass/fail status, missing artifact diagnostics, and no-promotion evidence without re-reading every document.

## Tasks

- [x] **T01: Write canonical S11 repair artifacts** `est:1h`
  ---
  estimated_steps: 6
  estimated_files: 4
  skills_used:
    - write-docs
    - verify-before-complete
  ---
  Why: S09 and S10 are complete in the DB but lack canonical assessment artifacts, and the milestone root lacks the context and closeout assessment that future validators need. This task repairs the documentation source of truth before any validator encodes it. The exact artifact paths are intentionally listed here because this planning tool rejected relative paths in task file arrays during planning.
  - Verify: test -s .gsd/milestones/M002/M002-CONTEXT.md && test -s .gsd/milestones/M002/M002-ASSESSMENT.md && test -s .gsd/milestones/M002/slices/S09/S09-ASSESSMENT.md && test -s .gsd/milestones/M002/slices/S10/S10-ASSESSMENT.md

- [x] **T02: Add validation artifact completeness check** `est:1h 30m`
  ---
  estimated_steps: 7
  estimated_files: 3
  skills_used:
    - write-docs
    - verify-before-complete
  ---
  Why: The repaired artifacts need an executable gate so validation cannot silently regress back to missing S09 or S10 assessments, stale S01 interpretation, or accidental runtime-promotion language.
  - Verify: python3 -m unittest scripts/test_validate_m002_validation_artifacts.py && python3 scripts/validate_m002_validation_artifacts.py --root . --write-audit runtime-evidence/M002-S11-validation-artifact-repair.json

- [x] **T03: Wire S11 artifact gate into closeout** `est:1h`
  ---
  estimated_steps: 6
  estimated_files: 5
  skills_used:
    - verify-before-complete
  ---
  Why: A standalone validator is not enough for milestone closeout. M002 regression closure must run the S11 artifact gate so downstream validation and future closeout runs cannot skip repaired artifacts.
  - Verify: python3 -m unittest scripts/test_validate_m002_validation_artifacts.py scripts/test_run_m002_regression_closure.py && python3 scripts/run_m002_regression_closure.py --output runtime-evidence/M002-S06-regression-closure.json
