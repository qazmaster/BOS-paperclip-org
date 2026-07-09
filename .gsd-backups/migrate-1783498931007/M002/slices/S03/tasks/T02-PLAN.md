---
estimated_steps: 1
estimated_files: 6
skills_used: []
---

# T02: Built a standalone gsdpi_local adapter candidate with package-local tests and no Paperclip core/private dependency.

Build the smallest standalone gsdpi_local external adapter candidate in the repository, keeping it separate from plugin-bos-light runtime code. Implement createServerAdapter, testEnvironment, and execute semantics that run a configured GSD-Pi command with bounded timeout and parse/return BosAdapterResult JSON without spawning from the BOS plugin. Do not depend on Paperclip private source modules; use documented adapter contracts and package-local tests/mocks only.

## Inputs

- `PAPERCLIP_LIVE_VALIDATION_REPORT.md`
- `plugin-bos-light/package.json`
- `plugin-bos-light/tsconfig.json`

## Expected Output

- `adapters/gsdpi-local/package.json`
- `adapters/gsdpi-local/tsconfig.json`
- `adapters/gsdpi-local/src/index.ts`
- `adapters/gsdpi-local/src/server/execute.ts`
- `adapters/gsdpi-local/src/server/test.ts`
- `adapters/gsdpi-local/tests/execute.test.ts`

## Verification

npm --prefix adapters/gsdpi-local test && npm --prefix adapters/gsdpi-local run typecheck

## Observability Impact

Adapter logs command, cwd, timeout, exit status, parsed result class, and redacted env key names without logging secrets.
