# S01: Company Template Import Proof — UAT

**Milestone:** M001-bo1jcm
**Written:** 2026-05-28T02:53:44.297Z

# UAT: S01 Company Template Import Proof

**UAT Type:** Contract / integration-adjacent repository validation.

## Preconditions

- Use a fresh checkout or fixture copy of the repository at milestone `M001-bo1jcm` after S01 task completion.
- Python 3 is available locally.
- No Paperclip runtime, network service, credentials, or external import API is required for this UAT.

## Steps

1. From the repository root, run:
   ```bash
   python3 scripts/validate_company_template.py
   ```
2. Confirm the validator exits 0 and prints the OK line for seven divisions, seven agent profiles, org chart, routing, rituals, and agents README compatibility.
3. Run:
   ```bash
   python3 scripts/validate_handoff.py
   ```
4. Confirm the handoff package validator exits 0.
5. Open `company-template/a1-validation-evidence.md` and verify it names the validation command, lists validated assets, explains the proof boundary, and states that live Paperclip import/export compatibility remains an S02 unknown.
6. Optional negative check in a disposable copy: remove one required division field, break one `agent_profile` path, or change a routing target to an unknown division; rerun `python3 scripts/validate_company_template.py`.

## Expected Outcomes

- The valid package passes local company-template validation without contacting external services.
- The valid package passes handoff validation.
- A1 evidence is present, non-empty, and reusable by downstream slices.
- Negative checks fail with contextual messages that identify the relevant file, division id, field, route, missing profile, or compatibility issue without printing secrets.

## Edge Cases

- If a division count is not exactly seven or a canonical division id is missing, validation must fail.
- If a route targets an unknown division or malformed target, validation must fail.
- If an AGENTS profile is missing or incompatible with its division id, validation must fail.
- Live Paperclip schema import success is not expected from this UAT; that unknown is intentionally carried into S02.
