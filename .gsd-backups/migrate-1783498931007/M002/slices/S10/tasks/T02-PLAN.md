---
estimated_steps: 5
estimated_files: 2
skills_used: []
---

# T02: Record Hermes supported smoke evidence

skills_used: verify-before-complete, observability, security-review

Why: D011 selects Paperclip-owned `hermes_local` execution with Hermes using Codex CLI as the internal backend, but S08 only proved CLI/environment remediation and then failed closed. S10 needs one fresh bounded attempt through supported Paperclip surfaces, not host-only diagnostics or plaintext secret workarounds.

Do: Add `scripts/run_s10_hermes_runtime_smoke.py`. Reuse the safe HTTP/redaction patterns from `scripts/run_s02_hermes_smoke.py` and the S08 selected-path artifacts. The runner must use only existing environment/config values if present, must not call `secure_env_collect`, must not log or serialize secret values, and must write a valid artifact even when the live Paperclip base URL, token, or supported provider boundary is absent. The runner should discover/read health/version/adapter or agent run endpoints through supported HTTP/admin routes only, confirm or attempt the approved `hermes_local_with_codex_cli_backend` configuration if supported, trigger at most one bounded smoke run, read back run status/history/result, count wake delta and side effects, and write `runtime-evidence/M002-S10-hermes-runtime-execution-proof.json`. If the run does not produce Paperclip-owned `resultJson.bos`, record `artifact_type: fail-closed-blocker`, exact blocker codes, `wakeCountDelta` if measurable, and `capability_promotions: []`.

Failure modes: missing env, 401/403, 404 unsupported endpoint, 422 unsupported config, timeout, malformed JSON, duplicate wake, adapter failed, and missing BOS result all produce redacted blocker evidence with non-promotion.

Done when the Hermes artifact validates in phase `hermes`; it may be passing proof or explicit fail-closed evidence, but it must not be ambiguous.

## Inputs

- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/scripts/run_s02_hermes_smoke.py`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/scripts/validate_s10_runtime_execution.py`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/runtime-evidence/M002-S08-execution-path-decision-packet.json`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/runtime-evidence/M002-S08-hermes-cli-environment-remediation.json`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/runtime-evidence/M002-S08-runtime-execution-smoke.json`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/docs/08_RUNTIME_CAPABILITY_HEALTH.md`

## Expected Output

- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/scripts/run_s10_hermes_runtime_smoke.py`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/runtime-evidence/M002-S10-hermes-runtime-execution-proof.json`

## Verification

python3 scripts/run_s10_hermes_runtime_smoke.py --output runtime-evidence/M002-S10-hermes-runtime-execution-proof.json && python3 scripts/validate_s10_runtime_execution.py --evidence runtime-evidence/M002-S10-hermes-runtime-execution-proof.json --phase hermes

## Observability Impact

Adds a fresh redacted Hermes runtime artifact with selected path, endpoint outcomes, run id when present, wake delta, side-effect counts, blocker codes, and proof/non-proof classification.
