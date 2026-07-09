import { describe, expect, it } from "vitest";
import { redactSensitiveText } from "../src/livePaperclipAdapter";

describe("redactSensitiveText", () => {
  it("redacts Bearer tokens", () => {
    const input = "Authorization: Bearer sk-abc123def456";
    const result = redactSensitiveText(input);

    expect(result).toContain("[REDACTED]");
    expect(result).not.toContain("sk-abc123def456");
  });

  it("redacts api_key values", () => {
    const input = "api_key=secret_value_12345";
    const result = redactSensitiveText(input);

    expect(result).toContain("[REDACTED]");
    expect(result).not.toContain("secret_value_12345");
  });

  it("redacts token values", () => {
    const input = "token=my_secret_token_value";
    const result = redactSensitiveText(input);

    expect(result).toContain("[REDACTED]");
    expect(result).not.toContain("my_secret_token_value");
  });

  it("redacts secret ref patterns", () => {
    const input = "secret=my_credential_value_with_24chars_here";
    const result = redactSensitiveText(input);

    expect(result).toContain("[REDACTED]");
    expect(result).not.toContain("my_credential_value_with_24chars_here");
  });

  it("redacts JWT tokens", () => {
    const jwt = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c";
    const input = `Token: ${jwt}`;
    const result = redactSensitiveText(input);

    expect(result).toContain("[REDACTED]");
    expect(result).not.toContain(jwt);
  });

  it("handles Error objects", () => {
    const error = new Error("Failed with api_key=secret123");
    const result = redactSensitiveText(error);

    expect(result).toContain("[REDACTED]");
    expect(result).not.toContain("secret123");
  });

  it("handles non-string values", () => {
    expect(redactSensitiveText(null)).toBe("");
    expect(redactSensitiveText(undefined)).toBe("");
    expect(redactSensitiveText(42)).toBe("42");
  });

  it("normalizes whitespace", () => {
    const input = "line1\n\nline2\t\tline3   line4";
    const result = redactSensitiveText(input);

    expect(result).not.toContain("\n");
    expect(result).not.toContain("\t");
    expect(result).not.toContain("   ");
  });

  it("truncates to 500 characters", () => {
    const input = "a".repeat(1000);
    const result = redactSensitiveText(input);

    expect(result.length).toBeLessThanOrEqual(500);
  });

  it("preserves normal text", () => {
    const input = "This is a normal message without secrets";
    const result = redactSensitiveText(input);

    expect(result).toBe(input);
  });
});
