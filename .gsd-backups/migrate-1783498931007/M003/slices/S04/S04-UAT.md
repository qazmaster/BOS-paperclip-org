# S04: Live proof and capability polish — UAT

**Milestone:** M003
**Written:** 2026-05-31T05:48:59.367Z

# UAT: S04 Live proof and capability polish

**UAT Type:** Automated operator-proof UAT with deterministic evidence validation. Human interactive UAT is not required.

## Preconditions

- Work from the M003 worktree.
- Do not provide secrets in logs, docs, or evidence.
- Paperclip credentials may be absent; absence must produce fail-closed blocker evidence rather than partial success.

## Steps

1. Run the targeted plugin decision artifact tests:
   - `npm --prefix plugin-bos-light test -- tests/liveDecisionArtifactReadback.test.ts tests/decisionArtifact.test.ts tests/majorFlowDecision.test.ts`
2. Run the Python runner/validator unit tests:
   - `python3 -m unittest scripts/test_run_m003_s04_live_decision_artifact_readback.py scripts/test_validate_m003_s04_live_decision_artifact_readback.py`
3. Attempt bounded live Paperclip decision-artifact readback:
   - `python3 scripts/run_m003_s04_live_decision_artifact_readback.py --output runtime-evidence/M003-S04-live-decision-artifact-readback.json`
4. Validate the produced evidence in final mode:
   - `python3 scripts/validate_m003_s04_live_decision_artifact_readback.py --evidence runtime-evidence/M003-S04-live-decision-artifact-readback.json --phase final`
5. Validate runtime capability posture:
   - `python3 scripts/validate_runtime_capabilities.py`
6. Run combined regression suites, typecheck, and the full plugin test suite:
   - `python3 -m unittest scripts/test_validate_runtime_capabilities.py scripts/test_validate_m003_s04_live_decision_artifact_readback.py scripts/test_run_m003_s04_live_decision_artifact_readback.py`
   - `npm --prefix plugin-bos-light run typecheck`
   - `npm --prefix plugin-bos-light test`

## Expected Outcomes

- Evidence exists at `runtime-evidence/M003-S04-live-decision-artifact-readback.json`.
- If Paperclip readback is supported and authorized, evidence may be `artifact_type=live-evidence` with native document/comment readback and matching content hash.
- If credentials/access are missing or denied, evidence is `artifact_type=fail-closed-blocker` with a clear blocker reason and deterministic markdown fallback metadata.
- In all cases, diagnostics are sanitized, snippets are bounded, hash mismatches fail closed, native approval mutation remains false, and unsupported side-effect counters remain zero.
- Docs and validators keep plugin UI, actions, tool registration, native approvals, Hermes, activity logs, events, and GSD-Pi runtime support unpromoted.

## Edge Cases

- Missing `PAPERCLIP_BASE_URL`, `PAPERCLIP_COMPANY_ID`, or `PAPERCLIP_API_KEY` stops at auth preflight before mutation.
- Denied document access may fall back only to supported comment/markdown handling, not approval mutation.
- Malformed responses, readback mismatches, secret-like strings, unsupported capability claims, or side-effect counters above zero cause validator failure.
- Markdown-only fallback evidence is accepted as blocker evidence, never as native live proof.
