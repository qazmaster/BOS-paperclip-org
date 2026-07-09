---
estimated_steps: 1
estimated_files: 1
skills_used: []
---

# T03: Create comprehensive div6ExternalGateway.test.ts

Write exhaustive unit tests for the Div6 External Gateway covering: (a) Caller authorization — rejects every non-Div6 division (Div1, Div2, Div3, Div4, Div5, Div7); (b) Grant lookup — fails when grant_id not found in Div6 inbox; (c) Grant validation — fails for grants with granted_by !== 'Div3.Treasury', expired grants, and grants missing required allowed_ops; (d) Operation enforcement — ls-remote rejected when allowed_ops lacks read/clone/fetch, clone rejected without clone permission, fetch rejected without fetch/pull; (e) Secret resolution — PaperclipSecretRef returns auth_failure evidence (not Unauthorized) with redacted diagnostics; InlineEnvRef success path; (f) Git execution — mock child_process spawn to test success, missing binary (ENOENT), and auth failure for ls-remote, clone, and fetch; (g) Packet emission — verify completion_report reaches Div5 inbox with ExternalGitEvidence payload, and status_update reaches Div1 inbox; (h) Evidence integrity — trust_level is always 'untrusted', no raw stdout/stderr in evidence (only SHA256 hashes), redacted_diagnostics present. Use vitest with vi.mock('child_process') following the gitOperations.test.ts and externalIO.test.ts pattern. Clear packet router in beforeEach.

## Inputs

- `plugin-bos-light/src/div6ExternalGateway.ts`
- `plugin-bos-light/src/contracts.ts`
- `plugin-bos-light/src/divisionPacketRouter.ts`
- `plugin-bos-light/tests/gitOperations.test.ts`
- `plugin-bos-light/tests/externalIO.test.ts`

## Expected Output

- `plugin-bos-light/tests/div6ExternalGateway.test.ts`

## Verification

cd plugin-bos-light && npx vitest run tests/div6ExternalGateway.test.ts
