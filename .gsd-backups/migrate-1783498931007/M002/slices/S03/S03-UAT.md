# S03: GSD-Pi local adapter smoke — UAT

**Milestone:** M002
**Written:** 2026-05-29T02:39:32.437Z

# UAT: S03 GSD-Pi local adapter smoke

## UAT Type
Fail-closed operational integration UAT for a supported Paperclip external adapter boundary.

## Preconditions
- Worktree is the M002 validation worktree.
- S01 sandbox/container preflight evidence exists.
- S03 artifacts exist under runtime-evidence/, docs/, adapters/gsdpi-local/, and plugin-bos-light/.
- No Paperclip API tokens, provider keys, cookies, or local credentials are required to read committed evidence.

## Steps
1. Run `python3 -m unittest scripts/test_validate_s03_gsdpi_smoke.py`.
2. Run `npm --prefix adapters/gsdpi-local test` and `npm --prefix adapters/gsdpi-local run typecheck`.
3. Validate environment evidence with `python3 scripts/validate_s03_gsdpi_smoke.py --phase environment --evidence runtime-evidence/M002-S03-gsdpi-environment.json --allow-blocker`.
4. Validate registration evidence with `python3 scripts/validate_s03_gsdpi_smoke.py --phase registration --evidence runtime-evidence/M002-S03-gsdpi-registration.json --allow-blocker`.
5. Validate execute evidence with `python3 scripts/validate_s03_gsdpi_smoke.py --phase execute --evidence runtime-evidence/M002-S03-gsdpi-smoke.json --allow-blocker`.
6. Validate final docs and capability posture with `python3 scripts/validate_s03_gsdpi_smoke.py --phase final --evidence runtime-evidence/M002-S03-gsdpi-smoke.json` and `python3 scripts/validate_runtime_capabilities.py`.
7. Read docs/12_GSDPI_LOCAL_ADAPTER_SMOKE.md and PAPERCLIP_LIVE_VALIDATION_REPORT.md to confirm the reader-facing conclusion.
8. Inspect plugin-bos-light/capabilities.paperclip-runtime.json for gsdpi_local/GSD-Pi runtime status.

## Expected Outcomes
- All commands exit 0.
- The adapter package tests pass locally and typecheck without Paperclip private dependencies.
- Environment evidence proves `gsd --version` availability in the Paperclip container.
- Registration evidence is accepted as a valid fail-closed blocker with `422 Unknown adapter type: gsdpi_local` unless future proof replaces it.
- Execute evidence is accepted as a valid fail-closed blocker and states no Paperclip agent/run was started.
- Side-effect counts remain safe: zero approvals, zero source writes, zero duplicate side effects, and no capability promotions.
- Docs and capability matrix say GSD-Pi/Div4 automation is unvalidated/blocked, not supported.
- S04 guidance says to use document/comment/markdown fallbacks unless future registry, testEnvironment, and BosAdapterResult execution proof exists.

## Edge Cases
- If `gsdpi_local` becomes registered in a future Paperclip runtime, the execute artifact must be regenerated with one bounded no-source-write Paperclip invocation and valid BosAdapterResult/resultJson.bos before any capability promotion.
- If registration requires Paperclip core patches, direct DB mutation, monkey patches, or private imports, the correct result remains fail-closed.
- If evidence contains unredacted secret-like values, nonzero approvals/source writes, or capability promotions without proof, UAT fails.
- If the company id used by the smoke harness differs from the S01 sandbox id, docs must scope the evidence to adapter-type readback only unless company-specific artifact proof is separately recorded.
