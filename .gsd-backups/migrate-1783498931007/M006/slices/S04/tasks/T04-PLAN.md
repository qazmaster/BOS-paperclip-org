---
estimated_steps: 1
estimated_files: 2
skills_used: []
---

# T04: Wire SecretRef into git and external IO adapters

Modify gitOperations.ts DefaultGitOperations constructor to accept optional SecretRef parameter and thread it through all GitOperations methods. Modify internal runGit to resolve SecretRef via secretResolver.ts before execution; if unavailable, return auth_failure evidence with redacted diagnostics containing the blocker code. Modify buildAuthEnv to accept an optional envSource parameter so resolved tokens can be injected without mutating process.env. If no SecretRef provided, fall back to existing process.env behavior for backward compatibility. Modify externalIO.ts GitHubHttpAdapter and ExternalIOGateway constructors to accept optional SecretRef; resolve at construction or init time. Ensure redactSecrets still applies to all output. Verify existing adapter tests still pass unchanged.

## Inputs

- `plugin-bos-light/src/gitOperations.ts`
- `plugin-bos-light/src/externalIO.ts`
- `plugin-bos-light/src/secretResolver.ts`
- `plugin-bos-light/src/contracts.ts`

## Expected Output

- `plugin-bos-light/src/gitOperations.ts`
- `plugin-bos-light/src/externalIO.ts`

## Verification

npx --prefix plugin-bos-light vitest run tests/gitOperations.test.ts tests/externalIO.test.ts

## Observability Impact

GitCommandEvidence and ExternalIOEvidence now reflect secret resolution status in error_category; future agents examine evidence.redacted_diagnostics for 'secret_unavailable' blocker; auth_failure with redacted diagnostics when SecretRef resolution fails
