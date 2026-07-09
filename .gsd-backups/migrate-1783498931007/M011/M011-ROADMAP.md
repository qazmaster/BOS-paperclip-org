# M011: Capability Ledger Reconciliation and Auth Reprobe

**Vision:** Make BOS Light's runtime capability story truthful by reconciling implemented code, existing live evidence, and a fresh safe Paperclip reprobe before planning additional autonomy work.

## Success Criteria

- A generated capability matrix classifies each BOS Light capability as confirmed, local-only, fallback-only, blocked, or unknown with a concrete evidence path or blocker reason.
- The matrix resolves contradictions between older fallback-only capability rows and newer live proof artifacts without promoting plugin host, Hermes, or GSD-Pi capabilities beyond evidence.
- A read-only live Paperclip reprobe records current health/auth/plugin/company observations without mutating Paperclip or exposing secrets.
- The next milestone recommendation is derived from the matrix and names which capabilities are safe to exercise in M012.

## Slices

- [x] **S01: Evidence Matrix from Implemented Code** `risk:high` `depends:[]`
  > After this: After this: a generated matrix shows which capabilities are confirmed by live artifacts, local tests, fallback-only code, blocked routes, or unknown state.

- [x] **S02: Read Only Paperclip Auth Reprobe** `risk:high` `depends:[S01]`
  > After this: After this: a fresh probe records current Paperclip health, auth-dependent company visibility when credentials exist, and plugin route status without remote mutation.

- [x] **S03: Reconciled Ledger and M012 Gate** `risk:medium` `depends:[S01,S02]`
  > After this: After this: BOS Light has a reconciled capability artifact and a concrete M012 execution gate naming safe native Paperclip surfaces and blocked plugin/runtime surfaces.

## Boundary Map

### S01 -> S02

Produces:
- `runtime-evidence/M011-S01-capability-matrix.json` with normalized capability statuses and evidence paths.
- `runtime-evidence/M011-S01-capability-matrix.md` readable summary.

Consumes:
- Existing plugin source, tests, `capabilities.paperclip-runtime.json`, and runtime-evidence artifacts.

### S02 -> S03

Produces:
- `runtime-evidence/M011-S02-paperclip-readonly-reprobe.json` with current Paperclip route/auth/plugin observations.

Consumes:
- S01 matrix to decide which live routes to check and which promotions are disallowed.

### S03 -> downstream M012

Produces:
- Updated/reconciled capability artifact and M012 recommendation describing safe native Paperclip mission flow boundaries.

Consumes:
- S01 matrix and S02 reprobe.
