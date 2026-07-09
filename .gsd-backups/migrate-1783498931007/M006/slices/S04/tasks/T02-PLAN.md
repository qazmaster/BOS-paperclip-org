---
estimated_steps: 1
estimated_files: 2
skills_used: []
---

# T02: Create secret resolver seam

Create secretResolver.ts with resolveSecretRef(ref) that returns a discriminated union: {status:'resolved', value:string} | {status:'unavailable', blocker:string, code:string}. InlineEnvRef resolves by reading process.env[env_key]; if missing, returns code 'missing_secret_env'. PaperclipSecretRef returns fail-closed unavailable with code 'secret_unavailable'. Add redactSecretRef(ref) helper that returns a safe string representation for logging and diagnostics without exposing values. Export from index.ts. This seam allows adapters to accept SecretRef without knowing Paperclip internals.

## Inputs

- `plugin-bos-light/src/contracts.ts`
- `plugin-bos-light/src/index.ts`

## Expected Output

- `plugin-bos-light/src/secretResolver.ts`
- `plugin-bos-light/src/index.ts`

## Verification

npm run typecheck --prefix plugin-bos-light

## Observability Impact

resolveSecretRef return shape makes secret availability explicit; future agents inspect the status and code fields; 'unavailable' exposes precise blocker codes like 'secret_unavailable' and 'missing_secret_env'
