import type { SecretRef, PaperclipSecretRef, InlineEnvRef } from "./contracts";

export interface ResolvedSecret {
  status: "resolved";
  value: string;
}

export interface UnavailableSecret {
  status: "unavailable";
  blocker: string;
  code: string;
}

export type SecretResolutionResult = ResolvedSecret | UnavailableSecret;

/**
 * Resolve a SecretRef to its actual secret value.
 *
 * - InlineEnvRef reads from `process.env` (test-only fallback).
 * - PaperclipSecretRef is fail-closed: always returns unavailable.
 *
 * Callers must check `status` before accessing `value`.
 */
export function resolveSecretRef(ref: SecretRef): SecretResolutionResult {
  switch (ref.type) {
    case "inline_env": {
      const value = process.env[ref.env_key];
      if (value === undefined || value === "") {
        return {
          status: "unavailable",
          blocker: `Environment variable ${ref.env_key} is not set`,
          code: "missing_secret_env",
        };
      }
      return { status: "resolved", value };
    }
    case "secret_ref": {
      return {
        status: "unavailable",
        blocker: `Paperclip secret ${ref.secret_id} is not resolvable in this environment`,
        code: "secret_unavailable",
      };
    }
    default: {
      // Exhaustiveness guard
      const _exhaustive: never = ref;
      return {
        status: "unavailable",
        blocker: "Unknown secret ref type",
        code: "secret_unavailable",
      };
    }
  }
}

/**
 * Return a safe, redacted string representation of a SecretRef.
 * Never includes the actual secret value.
 */
export function redactSecretRef(ref: SecretRef): string {
  switch (ref.type) {
    case "inline_env":
      return `InlineEnvRef(env_key=${ref.env_key}, value=<redacted>)`;
    case "secret_ref":
      return `PaperclipSecretRef(secret_id=${ref.secret_id}, version=${ref.version}, value=<redacted>)`;
    default: {
      const _exhaustive: never = ref;
      return `UnknownSecretRef(value=<redacted>)`;
    }
  }
}
