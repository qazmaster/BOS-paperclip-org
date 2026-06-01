import { spawn } from "child_process";
import { createHash } from "crypto";
import { resolveSecretRef, redactSecretRef } from "./secretResolver";
import type { SecretRef } from "./contracts";

export interface GitCommandEvidence {
  command: string;
  args: string[];
  cwd: string;
  env_keys: string[];
  exit_code: number | null;
  stdout_hash: string;
  stderr_hash: string;
  duration_ms: number;
  success: boolean;
  error_category: "none" | "missing_binary" | "non_fast_forward" | "auth_failure" | "generic";
  redacted_diagnostics: string;
}

export interface GitOperations {
  clone(repoUrl: string, localPath: string, branch?: string): Promise<GitCommandEvidence>;
  checkoutBranch(localPath: string, branch: string, create?: boolean): Promise<GitCommandEvidence>;
  add(localPath: string, paths: string[]): Promise<GitCommandEvidence>;
  commit(localPath: string, message: string): Promise<GitCommandEvidence>;
  push(localPath: string, remote?: string, branch?: string, force?: boolean): Promise<GitCommandEvidence>;
  lsRemote(repoUrl: string, refs?: string[]): Promise<GitCommandEvidence>;
  fetch(localPath: string, remote?: string, refs?: string[]): Promise<GitCommandEvidence>;
}

const SECRET_PATTERNS = [
  /ghp_[a-zA-Z0-9]{36}/g,
  /glpat-[a-zA-Z0-9\-]{20}/g,
  /-----BEGIN OPENSSH PRIVATE KEY-----[\s\S]*?-----END OPENSSH PRIVATE KEY-----/g,
  /-----BEGIN RSA PRIVATE KEY-----[\s\S]*?-----END RSA PRIVATE KEY-----/g,
  /-----BEGIN EC PRIVATE KEY-----[\s\S]*?-----END EC PRIVATE KEY-----/g,
  /[a-f0-9]{40}/g,
];

export function redactSecrets(input: string): string {
  let result = input;
  for (const pattern of SECRET_PATTERNS) {
    result = result.replace(pattern, "[REDACTED]");
  }
  return result;
}

function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

function classifyGitError(exitCode: number | null, stderr: string): GitCommandEvidence["error_category"] {
  if (exitCode === null) return "missing_binary";
  const lower = stderr.toLowerCase();
  if (lower.includes("non-fast-forward") || lower.includes("rejected") && lower.includes("non-fast-forward")) {
    return "non_fast_forward";
  }
  if (lower.includes("authentication failed") || lower.includes("permission denied") || lower.includes("403")) {
    return "auth_failure";
  }
  if (exitCode !== 0) return "generic";
  return "none";
}

function buildAuthEnv(resolvedToken?: string): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env };
  if (process.env.GIT_SSH_KEY) {
    env.GIT_SSH_COMMAND = `ssh -i ${process.env.GIT_SSH_KEY} -o IdentitiesOnly=yes -o StrictHostKeyChecking=no`;
  } else if (resolvedToken) {
    env.GIT_ASKPASS = "echo";
    env.GIT_USERNAME = resolvedToken;
    env.GIT_PASSWORD = "x-oauth-basic";
  } else if (process.env.GITHUB_TOKEN) {
    env.GIT_ASKPASS = "echo";
    env.GIT_USERNAME = process.env.GITHUB_TOKEN;
    env.GIT_PASSWORD = "x-oauth-basic";
  } else if (process.env.GITLAB_TOKEN) {
    env.GIT_ASKPASS = "echo";
    env.GIT_USERNAME = "oauth2";
    env.GIT_PASSWORD = process.env.GITLAB_TOKEN;
  }
  return env;
}

function runGit(cwd: string, args: string[], secretRef?: SecretRef): Promise<GitCommandEvidence> {
  return new Promise((resolve) => {
    const start = Date.now();

    let resolvedToken: string | undefined;
    if (secretRef) {
      const resolution = resolveSecretRef(secretRef);
      if (resolution.status === "unavailable") {
        const duration = Date.now() - start;
        resolve({
          command: "git",
          args,
          cwd,
          env_keys: [],
          exit_code: null,
          stdout_hash: sha256(""),
          stderr_hash: sha256(""),
          duration_ms: duration,
          success: false,
          error_category: "auth_failure",
          redacted_diagnostics: `secret_unavailable: ${resolution.code} — ${redactSecretRef(secretRef)}`,
        });
        return;
      }
      resolvedToken = resolution.value;
    }

    const env = buildAuthEnv(resolvedToken);
    const envKeys = Object.keys(env).filter(
      (k) => k.startsWith("GIT_") || k === "GITHUB_TOKEN" || k === "GITLAB_TOKEN"
    );

    const child = spawn("git", args, { cwd, env });
    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (data) => { stdout += String(data); });
    child.stderr.on("data", (data) => { stderr += String(data); });

    child.on("error", (err) => {
      const duration = Date.now() - start;
      const isMissingBinary = (err as NodeJS.ErrnoException).code === "ENOENT";
      const diagnostics = redactSecrets(isMissingBinary ? "git binary not found in PATH" : err.message);
      resolve({
        command: "git",
        args,
        cwd,
        env_keys: envKeys,
        exit_code: null,
        stdout_hash: sha256(stdout),
        stderr_hash: sha256(stderr),
        duration_ms: duration,
        success: false,
        error_category: "missing_binary",
        redacted_diagnostics: diagnostics,
      });
    });

    child.on("close", (exitCode) => {
      const duration = Date.now() - start;
      const category = classifyGitError(exitCode, stderr);
      const redactedStderr = redactSecrets(stderr);
      const redactedStdout = redactSecrets(stdout);
      resolve({
        command: "git",
        args,
        cwd,
        env_keys: envKeys,
        exit_code: exitCode,
        stdout_hash: sha256(redactedStdout),
        stderr_hash: sha256(redactedStderr),
        duration_ms: duration,
        success: exitCode === 0,
        error_category: category,
        redacted_diagnostics: category === "none" ? "OK" : `${category}: ${redactedStderr.slice(0, 500)}`,
      });
    });
  });
}

export class DefaultGitOperations implements GitOperations {
  private secretRef?: SecretRef;

  constructor(secretRef?: SecretRef) {
    this.secretRef = secretRef;
  }

  async clone(repoUrl: string, localPath: string, branch?: string): Promise<GitCommandEvidence> {
    const args = ["clone", repoUrl, localPath];
    if (branch) {
      args.push("--branch", branch, "--single-branch");
    }
    return runGit(process.cwd(), args, this.secretRef);
  }

  async checkoutBranch(localPath: string, branch: string, create = false): Promise<GitCommandEvidence> {
    const args = create ? ["checkout", "-b", branch] : ["checkout", branch];
    return runGit(localPath, args, this.secretRef);
  }

  async add(localPath: string, paths: string[]): Promise<GitCommandEvidence> {
    return runGit(localPath, ["add", ...paths], this.secretRef);
  }

  async commit(localPath: string, message: string): Promise<GitCommandEvidence> {
    return runGit(localPath, ["commit", "-m", message], this.secretRef);
  }

  async push(localPath: string, remote = "origin", branch?: string, force = false): Promise<GitCommandEvidence> {
    const args = ["push", remote];
    if (branch) args.push(branch);
    if (force) args.push("--force");
    return runGit(localPath, args, this.secretRef);
  }

  async lsRemote(repoUrl: string, refs?: string[]): Promise<GitCommandEvidence> {
    const args = ["ls-remote", repoUrl, ...(refs || [])];
    return runGit(process.cwd(), args, this.secretRef);
  }

  async fetch(localPath: string, remote = "origin", refs?: string[]): Promise<GitCommandEvidence> {
    const args = ["fetch", remote, ...(refs || [])];
    return runGit(localPath, args, this.secretRef);
  }
}
