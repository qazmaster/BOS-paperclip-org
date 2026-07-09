---
estimated_steps: 10
estimated_files: 1
skills_used: []
---

# T02: Add fail-closed validator for restored validation artifacts

Expected executor task-plan frontmatter: estimated_steps: 8; estimated_files: 2; skills_used: [test, lint, security-review, verify-before-complete].

Why: Restored docs need executable proof so validation does not depend on manual inspection. S06 established the pattern: standard-library-only validator, fixture-rooted unit tests, shaped diagnostics, local JSON audit, and no `.gsd` reads from tests.

Do: Add `scripts/validate_m004_s07_validation_artifacts.py` as a standard-library-only validator. It should accept a repository root and phase such as `artifact`/`final`, read explicit milestone artifact paths, verify the Boundary Map is populated, verify context, assessment, S07 assessment, and final validation artifact presence as appropriate for phase, confirm R012-R016 are all represented, confirm required evidence citations include the S06 ledger and final audit, reject live runtime capability promotion or plaintext secret-like values, and emit concise diagnostics with artifact path, problem kind, validation class, and requirement id where applicable. Add `scripts/test_validate_m004_s07_validation_artifacts.py` with temporary fixture roots only; tests must not read local `.gsd`, `.planning`, `.audits`, or other ignored planning paths. Cover passing artifact/final phases and negative cases for empty Boundary Map, missing docs, missing requirement IDs, missing S06 evidence citations, capability-promotion language, malformed audit JSON, and secret-like values.

Done when: Unit tests pass from temporary fixtures, validator has deterministic local-only behavior, diagnostics are actionable but redacted, and the validator can be used by T03 to generate `runtime-evidence/M004-S07-validation-artifacts-audit.json`.

Threat Surface (Q3): The validator is a local file parser that reads markdown/JSON paths; risks are unsafe path traversal, secret echoing, and false-positive runtime promotion. Keep root-bounded path resolution, no network/subprocess/database access, and redact diagnostic values.

Requirement Impact (Q4): Supports R012-R016 validation evidence without mutating requirement records. Re-verifies artifact traceability, security boundaries, and no-promotion posture. Decisions preserved: D012-D014 and D015.

Failure Modes (Q5): Missing file -> fail closed with artifact path. Malformed JSON -> fail closed without echoing raw secret-like content. Timeout is not expected because input size is bounded. Malformed markdown -> fail closed on missing required headings/tokens.

Load Profile (Q6): O(total markdown bytes + ledger JSON bytes); expected artifacts are small and local. At 10x documentation size, memory remains bounded by reading a handful of files; no concurrent shared resources.

Negative Tests (Q7): Empty Boundary Map, omitted R014/R016, omitted S06 audit citation, unsupported `live_runtime_capability_promoted: true`, secret-like token in docs, missing validation artifact in final phase, and malformed audit JSON.

Path note: create `scripts/validate_m004_s07_validation_artifacts.py` and `scripts/test_validate_m004_s07_validation_artifacts.py`; consume the restored artifacts and `runtime-evidence/M004-S06-*` files named in T01.

## Inputs

- None specified.

## Expected Output

- Update the implementation and proof artifacts needed for this task.

## Verification

python3 -m unittest scripts/test_validate_m004_s07_validation_artifacts.py

## Observability Impact

Adds a local diagnostic surface that explains which artifact, requirement, validation class, or security/no-promotion rule failed, without requiring DB inspection or runtime services.
