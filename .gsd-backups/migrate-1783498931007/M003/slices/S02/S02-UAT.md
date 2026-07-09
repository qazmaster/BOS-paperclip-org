# S02: Artifact envelope and fallback persistence — UAT

**Milestone:** M003
**Written:** 2026-05-31T03:50:46.900Z

# UAT: S02 Artifact envelope and fallback persistence

**UAT Type:** Contract/adapter fixture UAT; no live Paperclip runtime or human approval required.

## Preconditions

- Repository dependencies are installed for `plugin-bos-light`.
- S01 `DecisionResult` contract and fixtures are available.
- No live Paperclip credentials are required; tests use in-memory/fixture adapters only.
- Unsupported native approvals, plugin UI/actions, Hermes, GSD-Pi, host registration, activity logs, and events remain out of scope.

## Steps

1. Run `npm --prefix plugin-bos-light test -- tests/decisionArtifact.test.ts`.
2. Run `npm --prefix plugin-bos-light run typecheck`.
3. Run `npm --prefix plugin-bos-light test`.
4. Run `python3 scripts/validate_runtime_capabilities.py`.
5. Inspect the generated/fixture envelopes in the decision artifact tests for these cases:
   - confirmed native document success;
   - document unavailable or failed, comment fallback succeeds;
   - document and comment unavailable/failed, deterministic markdown-only fallback is returned;
   - invalid decision input fails closed without adapter/cache calls;
   - cache overlay failure is sanitized and non-blocking;
   - fallback paths do not call native approval APIs or mutate approval state.

## Expected Outcomes

- Targeted decision artifact tests pass with all fixture cases green.
- TypeScript typecheck completes with no contract errors.
- Full plugin regression suite passes.
- Runtime capability validator keeps unsupported runtime surfaces unpromoted.
- Envelopes identify `selected_surface`, `artifact_ref`, `cache_overlay`, fallback diagnostics, and invariants clearly enough for S03/S04 consumers.
- Secret-bearing adapter errors are redacted from diagnostics.
- Markdown fallback is deterministic and explicitly non-authoritative.

## Edge Cases

- Malformed document responses fall through to comments with sanitized `document_error`.
- Rejected document writes fall through to comments or markdown-only fallback.
- Missing, unsupported, rejected, or malformed comments produce markdown-only fallback with sanitized `comment_error`.
- Cache-overlay persistence failures do not prevent native document/comment mirroring.
- Invalid `DecisionValidationFailure` inputs do not invoke adapter or persistence seams.
- Fallback comments and markdown never create approval requests, change native approval status, or claim Paperclip approval authority.
