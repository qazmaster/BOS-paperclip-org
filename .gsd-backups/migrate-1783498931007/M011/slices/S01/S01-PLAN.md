# S01: Evidence Matrix from Implemented Code

**Goal:** Generate a reproducible capability matrix from current BOS Light source, tests, capability ledger, and runtime evidence artifacts.
**Demo:** After this: a generated matrix shows which capabilities are confirmed by live artifacts, local tests, fallback-only code, blocked routes, or unknown state.

## Must-Haves

- Matrix includes key surfaces: company/divisions, mission lifecycle, resource secrets, native issue/document/comment, git local/hybrid, mission intake, HITL gates, QA, PR/merge/CI, plugin registration/tools, Hermes, and GSD-Pi.
- Every row includes status, evidence path or blocker, and source category.
- Validator prevents plugin host, Hermes, or GSD-Pi promotion without runtime-execution-proof.

## Proof Level

- This slice proves: Contract plus local evidence integration proof.

## Integration Closure

Consumes current repo files only; produces matrix artifacts used by S02 and S03.

## Verification

- Adds durable runtime-evidence artifacts with generated_at, source paths, status counts, and blocker codes.

## Tasks

- [x] **T01: Generate capability matrix from current evidence** `est:45m`
  Create a deterministic Node.js script that reads plugin-bos-light/capabilities.paperclip-runtime.json, selected runtime-evidence artifacts, and key source/test files, then writes runtime-evidence/M011-S01-capability-matrix.json plus a markdown summary. The script must classify capabilities as confirmed, local-only, fallback-only, blocked, or unknown and preserve blocker reasons for unsupported plugin/runtime surfaces.
  - Files: `scripts/generate_m011_capability_matrix.js`, `runtime-evidence/M011-S01-capability-matrix.json`, `runtime-evidence/M011-S01-capability-matrix.md`
  - Verify: node scripts/generate_m011_capability_matrix.js

- [x] **T02: Validate matrix proof gates** `est:35m`
  Create a validator that checks matrix shape, required capabilities, evidence references, and proof-gate invariants. It must fail if plugin host, piko tools, Hermes, or GSD-Pi are classified as confirmed without runtime-execution-proof evidence. Run generator and validator to produce S01 evidence.
  - Files: `scripts/validate_m011_capability_matrix.js`, `runtime-evidence/M011-S01-capability-matrix.json`
  - Verify: node scripts/validate_m011_capability_matrix.js

## Files Likely Touched

- scripts/generate_m011_capability_matrix.js
- runtime-evidence/M011-S01-capability-matrix.json
- runtime-evidence/M011-S01-capability-matrix.md
- scripts/validate_m011_capability_matrix.js
