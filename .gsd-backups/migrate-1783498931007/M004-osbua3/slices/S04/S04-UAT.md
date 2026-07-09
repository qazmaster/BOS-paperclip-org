# S04: Update Acceptance And Runtime — UAT

**Milestone:** M004-osbua3
**Written:** 2026-05-31T10:11:01.516Z

## UAT Type

Documentation and contract UAT for acceptance/runtime posture.

## Preconditions

- Milestone `M004-osbua3` has S01-S03 complete.
- S04 task summaries for T07 and T08 are present and marked passed.
- The repository is evaluated from the worktree root without requiring a live Paperclip runtime.

## Steps

1. Open `docs/05_PERSISTENCE_MATRIX.md`.
   - Confirm it names the v1.4.1 routing, quarantine, and external-world ownership surfaces.
   - Confirm Div1.HCO controls routing/escalation, Div5.QualificationsLibraryLearning quarantines/sanitizes raw external evidence, and Div6.External is the only external-world actor.
2. Open `docs/06_ACCEPTANCE_TESTS.md`.
   - Confirm A12, A13, A14, A15, A16, A17, A18, A19, and A20 are present.
   - Confirm A12-A20 are described as conservative repo-local/doctrine/fixture acceptance unless the runtime capability matrix cites live Paperclip proof.
3. Open `docs/07_RISKS_AND_SPIKES.md`, `docs/08_RUNTIME_CAPABILITY_HEALTH.md`, and `docs/09_BACKLOG.md`.
   - Confirm they preserve the v1.4.1 security posture and call out unvalidated or fallback-only runtime surfaces.
   - Confirm they do not claim live Paperclip support for plugin UI/actions, state, events, approvals, Hermes, GSD-Pi, external API access, or other unproven surfaces.
4. Run `python3 scripts/validate_runtime_capabilities.py`.
   - Confirm the validator exits 0 and reports that manifest surfaces, adapter assumptions, and guardrail fields are mapped.
5. Run or inspect an equivalent semantic docs invariant check across the five S04 docs.
   - Confirm the docs mention A12-A20, v1.4.1 ownership, Div1 routing, Div5 quarantine, Div6 external IO, and conservative runtime language.

## Expected Outcomes

- The acceptance/runtime docs consistently describe the v1.4.1 model: Div1.HCO routes and controls escalation, Div5 quarantines and sanitizes raw evidence, Div6 performs external-world interaction, and Div3 controls budget/access grants.
- A12-A20 are visible in the acceptance suite and map to the handoff doctrine without replacing A1-A11.
- Runtime posture remains conservative: surfaces without live Paperclip version/build and surface-specific proof remain unvalidated, blocked, or fallback-only.
- The runtime capability validator passes and remains the first-line guard against overclaiming confirmed Paperclip support.

## Edge Cases

- If a doc says a runtime surface is `confirmed`, verify the capability matrix has matching live Paperclip evidence for that exact surface; otherwise the claim is invalid.
- If external evidence appears to flow directly to an internal division, the doc fails the v1.4.1 security boundary; raw evidence must return to Div5 quarantine first.
- If acceptance text treats A12-A20 as live runtime proof instead of doctrine/fixture-local contract proof, the doc fails the conservative posture requirement.

## Operational Readiness

- Health signal: `python3 scripts/validate_runtime_capabilities.py` exits 0 and `docs/08_RUNTIME_CAPABILITY_HEALTH.md` continues to describe unvalidated/fallback-only surfaces accurately.
- Failure signal: validator failures, missing A12-A20 rows, or docs that promote unsupported live Paperclip surfaces.
- Recovery procedure: revert the overclaiming doc text or capability status, restore live-proof gating language, then rerun the runtime capability validator and the semantic docs invariant check.
- Monitoring gaps: live Paperclip runtime coverage remains a downstream S05/future-runtime concern; this slice only closes the repo-local documentation and contract posture.
