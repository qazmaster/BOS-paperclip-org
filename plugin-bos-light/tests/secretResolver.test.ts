import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  resolveSecretRef,
  redactSecretRef,
  type SecretResolutionResult,
} from "../src/secretResolver";
import type { PaperclipSecretRef, InlineEnvRef } from "../src/contracts";

describe("secretResolver", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe("resolveSecretRef", () => {
    it("resolves InlineEnvRef when the env var is present", () => {
      process.env.TEST_SECRET_KEY = "shh";
      const ref: InlineEnvRef = { type: "inline_env", env_key: "TEST_SECRET_KEY" };
      const result: SecretResolutionResult = resolveSecretRef(ref);
      expect(result.status).toBe("resolved");
      if (result.status === "resolved") {
        expect(result.value).toBe("shh");
      }
    });

    it("returns unavailable for InlineEnvRef when the env var is missing", () => {
      delete process.env.MISSING_SECRET_KEY;
      const ref: InlineEnvRef = { type: "inline_env", env_key: "MISSING_SECRET_KEY" };
      const result = resolveSecretRef(ref);
      expect(result.status).toBe("unavailable");
      if (result.status === "unavailable") {
        expect(result.code).toBe("missing_secret_env");
        expect(result.blocker).toContain("MISSING_SECRET_KEY");
      }
    });

    it("returns unavailable for InlineEnvRef when the env var is empty", () => {
      process.env.EMPTY_SECRET_KEY = "";
      const ref: InlineEnvRef = { type: "inline_env", env_key: "EMPTY_SECRET_KEY" };
      const result = resolveSecretRef(ref);
      expect(result.status).toBe("unavailable");
      if (result.status === "unavailable") {
        expect(result.code).toBe("missing_secret_env");
      }
    });

    it("returns fail-closed unavailable for PaperclipSecretRef", () => {
      const ref: PaperclipSecretRef = { type: "secret_ref", secret_id: "git-token-1", version: "latest" };
      const result = resolveSecretRef(ref);
      expect(result.status).toBe("unavailable");
      if (result.status === "unavailable") {
        expect(result.code).toBe("secret_unavailable");
        expect(result.blocker).toContain("git-token-1");
      }
    });
  });

  describe("redactSecretRef", () => {
    it("redacts InlineEnvRef without exposing value", () => {
      process.env.REDACT_TEST = "hidden";
      const ref: InlineEnvRef = { type: "inline_env", env_key: "REDACT_TEST" };
      const redacted = redactSecretRef(ref);
      expect(redacted).toContain("REDACT_TEST");
      expect(redacted).toContain("<redacted>");
      expect(redacted).not.toContain("hidden");
    });

    it("redacts PaperclipSecretRef without exposing value", () => {
      const ref: PaperclipSecretRef = { type: "secret_ref", secret_id: "tok-1", version: "latest" };
      const redacted = redactSecretRef(ref);
      expect(redacted).toContain("tok-1");
      expect(redacted).toContain("latest");
      expect(redacted).toContain("<redacted>");
    });
  });
});
