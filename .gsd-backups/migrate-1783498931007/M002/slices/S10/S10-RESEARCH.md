# S10 Research: Runtime adapter execution proof remediation

## Summary
S10 does **not** start from a blank slate. M002 already has conservative S08/S09 artifacts, validators, and reader-facing docs that explicitly keep Hermes and GSD-Pi execution fail-closed unless fresh supported-boundary proof appears. The real decision point is whether S10 can produce a bounded Paperclip-owned runtime execution proof through an approved boundary, or whether the milestone must be re-scoped with explicit requirement updates.

The approved remediation path is still the D011 path: `hermes_local_with_codex_cli_backend`. That path is supported only if Paperclip still owns the agent/run lifecycle and the smoke produces BOS-shaped readback. It does **not** prove the original OpenAI/Xiaomi `secret_ref` materialization bug is fixed. By contrast, `gsdpi_local` remains blocked at registration/testEnvironment; in this worktree `adapters/gsdpi-local/` currently contains only `package.json` and `tsconfig.json`, with no checked-in `src/` tree, so any GSD-Pi proof would require building a real adapter implementation or explicitly re-scoping away from that path.

S10 is still pending in the milestone database with zero tasks planned, so the planner has room to split this into the proof path vs. the re-scope path.

## Active Requirements and Constraints
- **R011**: preserve Paperclip external boundaries; no core patch, private import, direct DB mutation, or plaintext secret workaround.
- **R009**: keep runtime capability posture conservative; do not promote Hermes/GSD-Pi execution without proof.
- **R010**: preserve the no-duplicate-wake story; S09 established `wakeCountDelta=1` and no live runtime execution.

No new active M004 requirement is directly owned by S10; any scope change should be explicit and approved rather than implied by evidence drift.

## Implementation Landscape
- `runtime-evidence/M002-S08-provider-adapter-feasibility.json` documents the candidate paths and their blockers. It marks `codex_local_builtin` as a feasible-but-unproven fallback, `gsdpi_local_external_candidate` as blocked, and the approved next path as `hermes_local_with_codex_cli_backend`.
- `runtime-evidence/M002-S08-execution-path-decision-packet.json` is the authoritative path-selection record. It states what the selected path proves, what it does not prove, and the fresh approval boundaries for any future smoke.
- `runtime-evidence/M002-S08-hermes-cli-environment-remediation.json` proves only CLI/environment remediation and host Codex availability; it is not runtime execution proof.
- `runtime-evidence/M002-S08-runtime-execution-smoke.json` is the current fail-closed runtime result: `adapter_failed`, `wakeCountDelta=1`, and no passing `resultJson.bos`.
- `runtime-evidence/M002-S03-gsdpi-registration.json` and `runtime-evidence/M002-S03-gsdpi-smoke.json` keep the GSD-Pi story blocked at `Unknown adapter type: gsdpi_local`.
- `plugin-bos-light/src/paperclipAdapter.ts`, `plugin-bos-light/src/livePaperclipAdapter.ts`, `plugin-bos-light/src/worker.ts`, and `plugin-bos-light/src/runtimeCapabilities.ts` already provide the safe adapter seam, redaction, diagnostics, and conservative capability vocabulary. They are the natural place to keep the boundary honest, not to overclaim host support.
- `docs/08_RUNTIME_CAPABILITY_HEALTH.md`, `PAPERCLIP_LIVE_VALIDATION_REPORT.md`, and `plugin-bos-light/capabilities.paperclip-runtime.json` are the three downstream surfaces that must stay synchronized with any proof or re-scope.
- Existing validators already enforce the conservative posture: `scripts/validate_s09_reconciliation.py`, `scripts/validate_m002_closeout.py`, `scripts/validate_runtime_capabilities.py`, and `scripts/run_m002_regression_closure.py`.

## Findings
1. **Hermes is the only approved remediation path with a plausible supported boundary.** S08 already proved the Hermes CLI/remediation side and observed host Codex availability. The remaining blocker is runtime/provider readiness inside the Paperclip-owned Hermes run, not mere local tool presence.
2. **The current Hermes failure mode is fail-closed and specific.** The smoke failed with `adapter_failed`, `wakeCountDelta=1`, and no passing `resultJson.bos`. That means the next proof must demonstrate a supported config/readback boundary, not just repeat host diagnostics.
3. **`codex_local` was only a feasibility fallback, not the selected remediation.** It is useful as a mental alternative, but it does not prove Hermes remediation and should not be conflated with D011.
4. **`gsdpi_local` is still a separate adapter-registration project.** The live runtime returns `422 Unknown adapter type: gsdpi_local`, and the local worktree does not currently contain adapter source for it. A real GSD-Pi proof would therefore require adapter implementation plus supported registration/readback, not a quick retry.
5. **The documentation layer is already conservative.** Current docs correctly distinguish historical blockers from the current fail-closed runtime story, so the main risk is regression drift or overclaiming, not missing narrative context.
6. **S09 established the right validation pattern.** The milestone now has a precedent for a small fail-closed validator plus redacted audit JSON. Any new runtime proof should follow that pattern instead of relying on prose-only assertions.

## Risks and Constraints
- Do **not** use plaintext secrets, direct DB mutation, private imports, or Paperclip core patches. Those paths are explicitly disallowed by the current decision set and validators.
- Do **not** treat `codex_local` as proof of Hermes execution; it is only a fallback candidate from the inventory.
- Do **not** infer `gsdpi_local` support from the package name alone. Registration/readback and execution proof are still absent.
- Any new runtime evidence must preserve redaction, bounded side effects, and exact wake/result contracts; otherwise validation should fail closed.

## Natural Seams
- **Seam 1: Hermes proof vs. GSD-Pi proof.** They are independent, but S10 should prioritize Hermes because it is the already-approved remediation path and has the highest chance of producing the required evidence without building a new adapter package.
- **Seam 2: Proof collection vs. docs/matrix updates.** Generate the runtime artifact first, then update `PAPERCLIP_LIVE_VALIDATION_REPORT.md`, `docs/08_RUNTIME_CAPABILITY_HEALTH.md`, and only then adjust `plugin-bos-light/capabilities.paperclip-runtime.json` if the proof genuinely promotes a row.
- **Seam 3: Proof vs. re-scope.** If the supported boundary cannot be made to pass, stop and update requirements/success criteria explicitly rather than inventing another workaround.
- **Seam 4: GSD-Pi implementation if the scope shifts.** Split into package bootstrap, adapter contract tests (`testEnvironment`, parse/timeout/redaction), and finally registration/readback probes.

## First Proof
The highest-value first proof is a single supported-boundary Hermes/Codex readiness + bounded smoke attempt that either yields `resultJson.bos` or produces an explicit blocked artifact naming the missing supported config boundary.

Why this first: it is the only currently approved path with an existing decision and it determines whether runtime execution proof is achievable without re-scoping. If it fails again, the next move should be approved re-scope, not an unsupported workaround or an unplanned GSD-Pi rebuild.

## Verification
For any proof attempt, require fresh run evidence and check it immediately:
- `python3 scripts/validate_runtime_capabilities.py`
- `python3 scripts/validate_m002_closeout.py --phase final`
- `python3 scripts/validate_s09_reconciliation.py` if the S08 story/docs are touched
- `python3 scripts/run_m002_regression_closure.py --output runtime-evidence/M002-S06-regression-closure.json` if closeout docs/matrix change

If new `gsdpi_local` source is added, run local adapter tests and typecheck before any Paperclip registration attempt. Any completion claim should be blocked on fresh evidence, not prior-session output.

## Planner Notes
Useful installed process skills for follow-on work: `verify-before-complete` for evidence-before-claims, `write-docs` for the reader-facing updates, and `observability` if a new validator/audit artifact is added. If the scope shifts into secure runtime config or auth surfaces, a security review pass is warranted before promotion.
