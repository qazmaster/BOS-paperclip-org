import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { DefaultGitOperations, redactSecrets, type GitCommandEvidence } from "../src/gitOperations";
import type { SecretRef } from "../src/contracts";
import { spawn, type ChildProcess } from "child_process";
import { EventEmitter } from "events";

vi.mock("child_process", () => ({
  spawn: vi.fn(),
}));

describe("redactSecrets", () => {
  it("redacts GitHub personal access tokens", () => {
    const input = "token=ghp_abcdefghijklmnopqrstuvwxyz0123456789";
    expect(redactSecrets(input)).toBe("token=[REDACTED]");
  });

  it("redacts GitLab tokens", () => {
    const input = "token=glpat-xxxxxxxxxxxxxxxxxxxx";
    expect(redactSecrets(input)).toBe("token=[REDACTED]");
  });

  it("redacts SSH private keys", () => {
    const input = "-----BEGIN OPENSSH PRIVATE KEY-----\nabc\n-----END OPENSSH PRIVATE KEY-----";
    expect(redactSecrets(input)).toBe("[REDACTED]");
  });

  it("redacts 40-char hex strings (potential SHA/commit tokens)", () => {
    const input = "deadbeefdeadbeefdeadbeefdeadbeefdeadbeef";
    expect(redactSecrets(input)).toBe("[REDACTED]");
  });

  it("presents benign text unchanged", () => {
    expect(redactSecrets("hello world")).toBe("hello world");
  });
});

describe("DefaultGitOperations", () => {
  let ops: DefaultGitOperations;
  let mockChild: EventEmitter & { stdout: EventEmitter; stderr: EventEmitter };

  beforeEach(() => {
    ops = new DefaultGitOperations();
    mockChild = Object.assign(new EventEmitter(), {
      stdout: new EventEmitter(),
      stderr: new EventEmitter(),
    });
    vi.mocked(spawn).mockReturnValue(mockChild as unknown as ChildProcess);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function emitSuccess(stdoutText = "", stderrText = "") {
    process.nextTick(() => {
      if (stdoutText) mockChild.stdout.emit("data", stdoutText);
      if (stderrText) mockChild.stderr.emit("data", stderrText);
      mockChild.emit("close", 0);
    });
  }

  function emitError(err: Error) {
    process.nextTick(() => {
      mockChild.emit("error", err);
    });
  }

  function emitFailure(exitCode: number, stderrText: string) {
    process.nextTick(() => {
      if (stderrText) mockChild.stderr.emit("data", stderrText);
      mockChild.emit("close", exitCode);
    });
  }

  describe("clone", () => {
    it("shapes clone command correctly", async () => {
      const promise = ops.clone("git@github.com:org/repo.git", "/tmp/repo");
      emitSuccess();
      const evidence = await promise;
      expect(evidence.command).toBe("git");
      expect(evidence.args).toEqual(["clone", "git@github.com:org/repo.git", "/tmp/repo"]);
      expect(evidence.success).toBe(true);
      expect(evidence.error_category).toBe("none");
    });

    it("shapes clone with branch", async () => {
      const promise = ops.clone("https://github.com/org/repo.git", "/tmp/repo", "main");
      emitSuccess();
      const evidence = await promise;
      expect(evidence.args).toEqual([
        "clone",
        "https://github.com/org/repo.git",
        "/tmp/repo",
        "--branch",
        "main",
        "--single-branch",
      ]);
    });
  });

  describe("checkoutBranch", () => {
    it("shapes checkout command", async () => {
      const promise = ops.checkoutBranch("/tmp/repo", "feature-branch");
      emitSuccess();
      const evidence = await promise;
      expect(evidence.args).toEqual(["checkout", "feature-branch"]);
    });

    it("shapes checkout -b when create=true", async () => {
      const promise = ops.checkoutBranch("/tmp/repo", "feature-branch", true);
      emitSuccess();
      const evidence = await promise;
      expect(evidence.args).toEqual(["checkout", "-b", "feature-branch"]);
    });
  });

  describe("add", () => {
    it("shapes add with multiple paths", async () => {
      const promise = ops.add("/tmp/repo", ["file1.ts", "file2.ts"]);
      emitSuccess();
      const evidence = await promise;
      expect(evidence.args).toEqual(["add", "file1.ts", "file2.ts"]);
    });
  });

  describe("commit", () => {
    it("shapes commit with message", async () => {
      const promise = ops.commit("/tmp/repo", "feat: add tests");
      emitSuccess();
      const evidence = await promise;
      expect(evidence.args).toEqual(["commit", "-m", "feat: add tests"]);
    });
  });

  describe("push", () => {
    it("shapes push with defaults", async () => {
      const promise = ops.push("/tmp/repo");
      emitSuccess();
      const evidence = await promise;
      expect(evidence.args).toEqual(["push", "origin"]);
    });

    it("shapes push with branch and force", async () => {
      const promise = ops.push("/tmp/repo", "upstream", "main", true);
      emitSuccess();
      const evidence = await promise;
      expect(evidence.args).toEqual(["push", "upstream", "main", "--force"]);
    });
  });

  describe("lsRemote", () => {
    it("shapes ls-remote command correctly", async () => {
      const promise = ops.lsRemote("https://github.com/org/repo.git");
      emitSuccess();
      const evidence = await promise;
      expect(evidence.command).toBe("git");
      expect(evidence.args).toEqual(["ls-remote", "https://github.com/org/repo.git"]);
      expect(evidence.success).toBe(true);
      expect(evidence.error_category).toBe("none");
    });

    it("shapes ls-remote with optional refs", async () => {
      const promise = ops.lsRemote("https://github.com/org/repo.git", ["HEAD", "refs/tags/v1.0.0"]);
      emitSuccess();
      const evidence = await promise;
      expect(evidence.args).toEqual([
        "ls-remote",
        "https://github.com/org/repo.git",
        "HEAD",
        "refs/tags/v1.0.0",
      ]);
    });

    it("includes all required evidence envelope fields for ls-remote", async () => {
      const promise = ops.lsRemote("https://github.com/org/repo.git");
      emitSuccess("abc123\tHEAD\n");
      const evidence: GitCommandEvidence = await promise;
      expect(evidence.command).toBeDefined();
      expect(evidence.args).toBeInstanceOf(Array);
      expect(evidence.cwd).toBeDefined();
      expect(evidence.env_keys).toBeInstanceOf(Array);
      expect(typeof evidence.exit_code).toBe("number");
      expect(typeof evidence.stdout_hash).toBe("string");
      expect(typeof evidence.stderr_hash).toBe("string");
      expect(typeof evidence.duration_ms).toBe("number");
      expect(typeof evidence.success).toBe("boolean");
      expect(evidence.error_category).toBeDefined();
      expect(evidence.redacted_diagnostics).toBeDefined();
    });

    it("classifies missing binary for ls-remote", async () => {
      const promise = ops.lsRemote("https://github.com/org/repo.git");
      const err = Object.assign(new Error("spawn git ENOENT"), { code: "ENOENT" });
      emitError(err);
      const evidence = await promise;
      expect(evidence.success).toBe(false);
      expect(evidence.error_category).toBe("missing_binary");
      expect(evidence.redacted_diagnostics).toContain("git binary not found");
    });

    it("classifies auth failure for ls-remote", async () => {
      const promise = ops.lsRemote("https://github.com/org/repo.git");
      emitFailure(128, "fatal: Authentication failed for 'https://github.com/org/repo.git/'");
      const evidence = await promise;
      expect(evidence.success).toBe(false);
      expect(evidence.error_category).toBe("auth_failure");
    });
  });

  describe("missing git binary detection", () => {
    it("detects missing git binary (ENOENT)", async () => {
      const promise = ops.clone("https://github.com/org/repo.git", "/tmp/repo");
      const err = Object.assign(new Error("spawn git ENOENT"), { code: "ENOENT" });
      emitError(err);
      const evidence = await promise;
      expect(evidence.success).toBe(false);
      expect(evidence.error_category).toBe("missing_binary");
      expect(evidence.redacted_diagnostics).toContain("git binary not found");
    });
  });

  describe("non-fast-forward conflict detection", () => {
    it("detects non-fast-forward push rejection", async () => {
      const promise = ops.push("/tmp/repo", "origin", "main");
      emitFailure(1, "! [rejected]        main -> main (non-fast-forward)");
      const evidence = await promise;
      expect(evidence.success).toBe(false);
      expect(evidence.error_category).toBe("non_fast_forward");
    });
  });

  describe("auth failure detection", () => {
    it("detects authentication failure", async () => {
      const promise = ops.push("/tmp/repo");
      emitFailure(128, "remote: Invalid username or password.\nfatal: Authentication failed");
      const evidence = await promise;
      expect(evidence.success).toBe(false);
      expect(evidence.error_category).toBe("auth_failure");
    });
  });

  describe("secret redaction in evidence", () => {
    it("redacts tokens in stderr diagnostics", async () => {
      const promise = ops.push("/tmp/repo");
      emitFailure(128, "error: ghp_abcdefghijklmnopqrstuvwxyz0123456789 is invalid");
      const evidence = await promise;
      expect(evidence.redacted_diagnostics).not.toContain("ghp_");
      expect(evidence.redacted_diagnostics).toContain("[REDACTED]");
    });

    it("does not leak secrets in stdout_hash or stderr_hash", async () => {
      const promise = ops.clone("https://github.com/org/repo.git", "/tmp/repo");
      emitSuccess("ok", "token glpat-xxxxxxxxxxxxxxxxxxxx failed");
      const evidence = await promise;
      expect(evidence.stderr_hash).not.toContain("glpat");
    });
  });

  describe("structured evidence envelope", () => {
    it("includes all required fields", async () => {
      const promise = ops.commit("/tmp/repo", "test");
      emitSuccess("commit abc123");
      const evidence: GitCommandEvidence = await promise;
      expect(evidence.command).toBeDefined();
      expect(evidence.args).toBeInstanceOf(Array);
      expect(evidence.cwd).toBe("/tmp/repo");
      expect(evidence.env_keys).toBeInstanceOf(Array);
      expect(typeof evidence.exit_code).toBe("number");
      expect(typeof evidence.stdout_hash).toBe("string");
      expect(typeof evidence.stderr_hash).toBe("string");
      expect(typeof evidence.duration_ms).toBe("number");
      expect(typeof evidence.success).toBe("boolean");
      expect(evidence.error_category).toBeDefined();
      expect(evidence.redacted_diagnostics).toBeDefined();
    });
  });

  describe("environment auth discovery", () => {
    const originalEnv = process.env;

    beforeEach(() => {
      process.env = { ...originalEnv };
    });

    afterEach(() => {
      process.env = originalEnv;
    });

    it("passes GIT_SSH_KEY env through", async () => {
      process.env.GIT_SSH_KEY = "/home/user/.ssh/id_rsa";
      const promise = ops.clone("git@github.com:org/repo.git", "/tmp/repo");
      emitSuccess();
      await promise;
      const spawnCall = vi.mocked(spawn).mock.calls[0];
      const env = spawnCall[2]?.env as NodeJS.ProcessEnv;
      expect(env?.GIT_SSH_COMMAND).toContain("/home/user/.ssh/id_rsa");
      expect(env?.GIT_SSH_COMMAND).toContain("IdentitiesOnly=yes");
    });

    it("passes GITHUB_TOKEN env through", async () => {
      process.env.GITHUB_TOKEN = "ghp_testtoken123";
      const promise = ops.clone("https://github.com/org/repo.git", "/tmp/repo");
      emitSuccess();
      await promise;
      const spawnCall = vi.mocked(spawn).mock.calls[0];
      const env = spawnCall[2]?.env as NodeJS.ProcessEnv;
      expect(env?.GIT_USERNAME).toBe("ghp_testtoken123");
      expect(env?.GIT_PASSWORD).toBe("x-oauth-basic");
    });

    it("passes GITLAB_TOKEN env through", async () => {
      process.env.GITLAB_TOKEN = "glpat-testtoken123";
      const promise = ops.clone("https://gitlab.com/org/repo.git", "/tmp/repo");
      emitSuccess();
      await promise;
      const spawnCall = vi.mocked(spawn).mock.calls[0];
      const env = spawnCall[2]?.env as NodeJS.ProcessEnv;
      expect(env?.GIT_USERNAME).toBe("oauth2");
      expect(env?.GIT_PASSWORD).toBe("glpat-testtoken123");
    });
  });

  describe("with SecretRef", () => {
    const originalEnv = process.env;

    beforeEach(() => {
      process.env = { ...originalEnv };
    });

    afterEach(() => {
      process.env = originalEnv;
    });

    it("injects resolved token into git env when SecretRef resolves", async () => {
      process.env.MY_GIT_TOKEN = "ghp_injected_token_123";
      const secretRef: SecretRef = { type: "inline_env", env_key: "MY_GIT_TOKEN" };
      const opsWithSecret = new DefaultGitOperations(secretRef);
      const promise = opsWithSecret.clone("https://github.com/org/repo.git", "/tmp/repo");
      emitSuccess();
      await promise;
      const spawnCall = vi.mocked(spawn).mock.calls[0];
      const env = spawnCall[2]?.env as NodeJS.ProcessEnv;
      expect(env?.GIT_USERNAME).toBe("ghp_injected_token_123");
      expect(env?.GIT_PASSWORD).toBe("x-oauth-basic");
    });

    it("returns auth_failure when SecretRef resolution fails", async () => {
      const secretRef: SecretRef = { type: "secret_ref", secret_id: "unknown", version: "latest" };
      const opsWithSecret = new DefaultGitOperations(secretRef);
      const evidence = await opsWithSecret.clone("https://github.com/org/repo.git", "/tmp/repo");
      expect(evidence.success).toBe(false);
      expect(evidence.error_category).toBe("auth_failure");
      expect(evidence.redacted_diagnostics).toContain("secret_unavailable");
      expect(evidence.redacted_diagnostics).toContain("PaperclipSecretRef");
    });

    it("falls back to process.env when no SecretRef provided", async () => {
      process.env.GITHUB_TOKEN = "ghp_fallback_token";
      const opsNoSecret = new DefaultGitOperations();
      const promise = opsNoSecret.clone("https://github.com/org/repo.git", "/tmp/repo");
      emitSuccess();
      await promise;
      const spawnCall = vi.mocked(spawn).mock.calls[0];
      const env = spawnCall[2]?.env as NodeJS.ProcessEnv;
      expect(env?.GIT_USERNAME).toBe("ghp_fallback_token");
    });
  });
});
