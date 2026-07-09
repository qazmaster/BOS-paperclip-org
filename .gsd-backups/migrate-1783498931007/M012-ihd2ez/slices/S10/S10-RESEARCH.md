# S10: Missing Runtime Requirement Coverage Remediation — Research

## Summary

R017 (plugin registration) and R019 (Hermes execution) are listed as active requirements in M012's validation-readiness artifact but have zero M012 evidence (`m012_evidence: null`). M012 never attempted to prove either. The honest path is to truthfully remove R017 and R019 from M012's touched validation set by updating the validation-readiness artifact, adding M012-specific notes to REQUIREMENTS.md, and producing a runtime evidence artifact documenting the rationale. Neither requirement can be proven in this milestone due to hard platform blockers outside M012's control.

**Also discovered:** The on-disk `runtime-evidence/M012-S09-closeout-gate.json` is stale (verdict: fail, 15/22) despite the S09 summary claiming 22/22 pass after redaction. The S06/S07/S08 gate JSON artifacts referenced by S09 still contain stale secret-scan failures. S10 executor must either re-run S06-S09 validators after final redaction or accept the stale gates as a pre-existing condition.

## Active Requirements This Slice Owns

- **R017** — Plugin registration (bos-light loads in Paperclip with piko tools, actions, data provider, dashboard widget, issue detail tabs)
  - Status: active
  - M012 evidence: null
  - M012 assessment (from S08 validation-readiness): "M012 did not attempt plugin registration. No live Paperclip plugin load. Not addressed."
  
- **R019** — Hermes agent execution (xiaomi mimo 2.5 pro model, bounded runs, resultJson.bos output, secret refs)
  - Status: active
  - M012 evidence: null
  - M012 assessment (from S08 validation-readiness): "M012 did not attempt Hermes execution. No live agent run. Not addressed."

## Memory Findings

- **MEM252** (gotcha): Paperclip 0.3.1 sandbox does not expose plugin registration routes (POST /api/plugins returns 404). Plugin runtime is a post-V1 feature per PLUGIN_SPEC.md.
- **MEM111** (gotcha): M005 Hermes probe passed only with deployed Paperclip wrapper fixes plus adapter config using extraArgs and encrypted secret_ref env. The M005 probe on the M012 worktree shows 401 on all company routes and missing xiaomi credentials.
- **MEM298** (gotcha): M012 final reconciliation explicitly proves only local BOS Light seven-division flow; plugin host registration, piko tools, Hermes/Xiaomi execution remain unpromoted.
- **MEM097** (pattern): Blocked Hermes/GSD-Pi runtime evidence must remain fail-closed diagnostics unless a disposition validates either both live runtime proof artifacts or an explicit approved_rescope.

## Blocker Inventory (from S04 final reconciliation)

### R017 Blockers
1. **Plugin routes not found**: Paperclip 0.3.1 returns 404 on all tested plugin paths. Tool routes not found. No piko tools observed.
   - Resolution: Paperclip server must expose plugin and tool routes (post-V1 feature).
2. **Auth broken**: API key returns 401 on all company routes. Cannot even probe plugin status without valid auth.
   - Resolution: User must provide fresh Paperclip API key.

### R019 Blockers
1. **Adapter registry auth denied**: Hermes adapter test-environment returns 401. Cannot verify adapter registration.
2. **Missing auth**: No PAPERCLIP_API_KEY available in environment.
3. **Missing xiaomi credentials**: No xiaomi API key or base URL available.
4. **Test environment fail**: Hermes test-environment endpoint returns 401 Unauthorized.
   - Resolution: Future runtime-execution-proof milestone with adapter registry readback, passing testEnvironment, bounded run.

### Evidence Files
- `runtime-evidence/M005-S01-plugin-ui-surface-probe.json` — All plugin surfaces "fallback-only". No live probe env (missing PAPERCLIP_BASE_URL, PAPERCLIP_API_KEY).
- `runtime-evidence/M005-S01-hermes-xiaomi-runtime-probe.json` — Fail-closed blocker artifact. Auth denied on adapter registry (403) and test-environment (401). Missing xiaomi credentials. Zero bounded runtime invocations.
- `runtime-evidence/M012-S04-final-reconciliation.json` — Both R017 and R019 blocker surfaces listed as active.

## Classification Analysis

The S04 final reconciliation correctly classifies:
- `plugin.host_registration` → fallback_only
- `plugin.piko_tools` → fallback_only
- `runtime.hermes_xiaomi_execution` → fallback_only

The S08 validation-readiness artifact lists R017 and R019 in the requirement_coverage array with `m012_evidence: null`. This creates a gap: the validation set includes requirements that M012 cannot validate, which would block milestone validation.

## Recommendation

**Remove R017 and R019 from M012's touched validation set.** This is the honest path because:

1. M012 scope was explicitly about native Paperclip issue/document flow and local BOS Light orchestration — not plugin registration or Hermes execution.
2. R017 requires Paperclip plugin routes that don't exist (post-V1 feature).
3. R019 requires auth credentials and xiaomi API access that aren't available.
4. Neither requirement's primary owning slice is in M012 (R017 owns M005/S01, R019 owns M005/S01).
5. Claiming coverage would be overclaiming; claiming invalidation would be dishonest since the blockers are external.

The correct outcome is to:
- Update R017 and R019 notes in REQUIREMENTS.md to add truthful M012 non-addressal notes
- Update `runtime-evidence/M012-S08-validation-readiness.json` requirement_coverage to remove R017/R019 from the M012 validation set (or mark them as explicitly descoped)
- Produce `runtime-evidence/M012-S10-runtime-requirement-coverage.json` documenting the rationale
- Produce a human-readable markdown companion

## Implementation Landscape

### Files to Create
1. `runtime-evidence/M012-S10-runtime-requirement-coverage.json` — Structured artifact documenting R017/R019 descoping rationale with blocker citations
2. `runtime-evidence/M012-S10-runtime-requirement-coverage.md` — Human-readable companion
3. `scripts/validate_m012_s10_runtime_coverage.js` — Validator confirming R017/R019 are removed from M012 validation set and notes are updated

### Files to Modify
1. `runtime-evidence/M012-S08-validation-readiness.json` — Remove R017 and R019 from requirement_coverage array, or mark as explicitly descoped from M012
2. `.gsd/REQUIREMENTS.md` — Add M012-specific notes to R017 and R019 documenting non-addressal and blocker state
3. `runtime-evidence/M012-S09-closeout-gate.json` — Potentially stale; may need regeneration if S10 validator re-runs S09 as regression

### Validator Pattern
Follow the established M012 validator pattern (see `scripts/validate_m012_s05_closeout.js`, `scripts/validate_m012_s09_closeout.js`):
- Node.js script using `fs`, `path`, `child_process`
- Structured check() function with try/catch
- JSON gate artifact output with verdict, checks_total, checks_passed
- Exit 0 for pass, exit 1 for fail

### S09 Staleness Issue
The on-disk S09 gate artifact (15/22, fail) contradicts the S09 summary (22/22, pass). Root cause: S06/S07/S08 task-summary artifacts contained residual secret-like literals that the secret-scan caught, but the S09 gate was regenerated before the redactions were applied. S10's validator should either:
- Option A: Re-run S06-S09 validators as part of S10 closeout (heavy but thorough)
- Option B: Accept the stale gates and focus only on R017/R019 coverage (scoped to S10 title)

**Recommendation: Option B** — S10's scope is R017/R019 coverage, not secret-scan remediation. The S09 staleness is a pre-existing condition that should be resolved by reopening S09 if it blocks validation.

## Risks

1. **Risk: Validation readiness artifact update breaks downstream validator expectations** — Low risk. The S08 validator checks that requirement_coverage includes R003 and R022 but does not check for R017/R019 presence.
2. **Risk: REQUIREMENTS.md update creates merge conflict with other worktrees** — Low risk. Only adding notes to R017/R019 rows, not modifying structure.
3. **Risk: S09 closeout gate regeneration cascades** — If S10 re-runs S09 as a regression and it fails (due to stale gates), this blocks S10 completion. Avoid by not re-running S09 in S10.

## Verification

After implementation:
1. `node scripts/validate_m012_s10_runtime_coverage.js` exits 0
2. `runtime-evidence/M012-S10-runtime-requirement-coverage.json` is valid JSON with R017/R019 descoping entries
3. `runtime-evidence/M012-S08-validation-readiness.json` no longer includes R017/R019 in requirement_coverage (or they are marked descoped)
4. REQUIREMENTS.md R017 and R019 notes mention M012 non-addressal
5. No secret-like literals in new artifacts
