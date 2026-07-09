# S05: Eval Gates and Circuit Breaker Evidence — UAT

**Milestone:** M001-bo1jcm
**Written:** 2026-05-28T05:54:48.880Z

# S05 UAT: Eval Gates and Circuit Breaker Evidence

## UAT Type
Contract plus fixture integration UAT. No live Paperclip runtime support is claimed or required.

## Preconditions
- The BOS Light plugin workspace is available in `plugin-bos-light`.
- Fixture adapters may provide `addIssueComment`, `createEscalationIssue`, and `logActivity`; absence or failure of those seams must produce explicit fallback diagnostics.
- Runtime capability docs still mark comments, issues, activity, tool registration, and terminal run events as proof-gated/unvalidated unless live version/build evidence is added later.

## Steps
1. Run `npm --prefix plugin-bos-light test`.
2. Run `npm --prefix plugin-bos-light run typecheck`.
3. Run `python3 scripts/test_validate_runtime_capabilities.py`.
4. Run `python3 scripts/validate_runtime_capabilities.py`.
5. In fixture or acceptance tests, invoke `piko:eval-gate-evidence` or `evalGateEvidence` with passing, warning, blocking-fail, and incomplete inputs.
6. In fixture or acceptance tests, invoke `piko:circuit-breaker-observe` or `circuitBreakerFlow` with repeated failure observations until OPEN, then a HALF_OPEN retry and success recovery to CLOSED.
7. Repeat the same flows with missing adapters, failing comment writes, failing escalation issue writes, malformed IDs, malformed cache records, and failing activity logging.

## Expected Outcomes
- Eval Gate evidence returns bounded envelopes with gate result, guidance, selected surface, artifact reference or markdown-only fallback, cache-overlay save diagnostics, and sanitized fallback details.
- Circuit Breaker evidence returns bounded envelopes showing previous/next state, attempt count, threshold opening, escalation reference when native issue creation succeeds, comment or markdown fallback when it does not, ACTIVE_RUNS_ONLY polling posture, activity diagnostics, and CLOSED recovery after HALF_OPEN success.
- Worker registration remains optional: missing or failing `ctx.tools.register` does not crash plugin startup and does not prove live host support.
- Capability validators pass only while manifest, capability matrix, docs, and health report preserve proof-gated runtime posture.

## Edge Cases
- Empty or malformed issue IDs must return invalid/incomplete evidence without native writes.
- Missing required Eval Gate booleans must return incomplete guidance rather than fabricated pass/fail evidence.
- Cache get/save failures must be reported as cache-overlay diagnostics and must not block Paperclip-visible or markdown fallback evidence.
- Failing or malformed native comment/escalation responses must fall back deterministically and sanitize/bound error text.
- Activity logging failure must not become the durable evidence path and must not hide issue/comment/markdown fallback evidence.
- Existing OPEN records with an escalation issue ID must not create duplicate escalation issues.

## Operational Readiness
Health signal: the four closeout commands pass; evidence envelopes expose `selected_surface`, `artifact_ref`/`escalation_ref`, cache-overlay diagnostics, transition state, polling posture, and bounded fallback markdown; docs and validator output continue to say runtime surfaces are unvalidated unless proven. Failure signal: any verification command exits non-zero, validator drift reports manifest/capability/doc mismatch, worker registration logs warnings, or envelopes report invalid input, cache/comment/escalation/activity failures, markdown-only fallback, or OPEN circuits without escalation references. Recovery: inspect the returned envelope fields and capability health report, paste or attach the markdown-only fallback to the Paperclip issue when native writes fail, fix the adapter/persistence seam or runtime configuration, rerun the four closeout commands, and only then rerun the fixture flow. Monitoring gaps: there is no authoritative live Paperclip alert, dashboard, event listener, or activity scanner yet; S06 or a future runtime-proof slice must collect live version/build evidence before promoting those surfaces from fallback-only/unvalidated.
