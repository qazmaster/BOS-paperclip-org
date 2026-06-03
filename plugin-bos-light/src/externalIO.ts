import { spawn } from "child_process";
import * as https from "https";
import { resolveSecretRef, redactSecretRef } from "./secretResolver";
import type { SecretRef } from "./contracts";

export interface PRCreateResult {
  number: number;
  url: string;
  title: string;
  head_ref: string;
  base_ref: string;
}

export interface PRMergeResult {
  merged: boolean;
  message: string;
  sha: string;
}

export interface WorkflowRunResult {
  run_id: number;
  status: string;
  conclusion: string | null;
}

export interface ExternalIOEvidence {
  adapter: "gh_cli" | "github_http";
  action: string;
  success: boolean;
  error_category: "none" | "missing_binary" | "auth_failure" | "network_error" | "not_found" | "generic";
  redacted_diagnostics: string;
  response_summary: Record<string, unknown> | null;
  duration_ms: number;
}

export interface GitHubAdapter {
  createPR(params: {
    title: string;
    body: string;
    head: string;
    base: string;
    repo: string;
  }): Promise<ExternalIOEvidence>;
  mergePR(params: { number: number; repo: string; method?: "squash" | "merge" | "rebase" }): Promise<ExternalIOEvidence>;
  approvePR(params: { number: number; repo: string }): Promise<ExternalIOEvidence>;
  triggerWorkflow(params: { workflow: string; repo: string; ref: string }): Promise<ExternalIOEvidence>;
  watchWorkflowRun(params: { run_id: number; repo: string }): Promise<ExternalIOEvidence>;
}

const SECRET_PATTERNS = [
  /ghp_[a-zA-Z0-9]{36}/g,
  /glpat-[a-zA-Z0-9\-]{20}/g,
  /-----BEGIN OPENSSH PRIVATE KEY-----[\s\S]*?-----END OPENSSH PRIVATE KEY-----/g,
  /-----BEGIN RSA PRIVATE KEY-----[\s\S]*?-----END RSA PRIVATE KEY-----/g,
  /-----BEGIN EC PRIVATE KEY-----[\s\S]*?-----END EC PRIVATE KEY-----/g,
];

export function redactSecrets(input: string): string {
  let result = input;
  for (const pattern of SECRET_PATTERNS) {
    result = result.replace(pattern, "[REDACTED]");
  }
  return result;
}

function classifyGhError(exitCode: number | null, stderr: string): ExternalIOEvidence["error_category"] {
  if (exitCode === null) return "missing_binary";
  const lower = stderr.toLowerCase();
  if (lower.includes("authentication failed") || lower.includes("401") || lower.includes("403")) {
    return "auth_failure";
  }
  if (lower.includes("not found") || lower.includes("404")) {
    return "not_found";
  }
  if (lower.includes("could not resolve host") || lower.includes("network") || lower.includes("timeout")) {
    return "network_error";
  }
  if (exitCode !== 0) return "generic";
  return "none";
}

/**
 * Check if GITHUB_TOKEN is available.
 *
 * Environment Variables:
 *   GITHUB_TOKEN (str): GitHub personal access token for PR/issue operations.
 */
export function hasGitHubToken(): boolean {
  return Boolean(process.env.GITHUB_TOKEN);
}

export function discoverGhBinary(): Promise<boolean> {
  return new Promise((resolve) => {
    const child = spawn("gh", ["--version"], { env: process.env });
    child.on("error", () => resolve(false));
    child.on("close", (code) => resolve(code === 0));
  });
}

function runGh(args: string[], token?: string): Promise<{ exitCode: number | null; stdout: string; stderr: string; duration: number }> {
  return new Promise((resolve) => {
    const start = Date.now();
    const env: NodeJS.ProcessEnv = { ...process.env };
    if (token) {
      env.GITHUB_TOKEN = token;
    }
    const child = spawn("gh", args, { env });
    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (data) => { stdout += String(data); });
    child.stderr.on("data", (data) => { stderr += String(data); });

    child.on("error", () => {
      resolve({ exitCode: null, stdout, stderr, duration: Date.now() - start });
    });

    child.on("close", (exitCode) => {
      resolve({ exitCode, stdout, stderr, duration: Date.now() - start });
    });
  });
}

export class GhCliAdapter implements GitHubAdapter {
  private repo: string;
  private token?: string;

  constructor(repo: string, token?: string) {
    this.repo = repo;
    this.token = token;
  }

  private buildEvidence(
    action: string,
    exitCode: number | null,
    stderr: string,
    stdout: string,
    duration: number,
    responseSummary: Record<string, unknown> | null
  ): ExternalIOEvidence {
    const category = classifyGhError(exitCode, stderr);
    return {
      adapter: "gh_cli",
      action,
      success: exitCode === 0,
      error_category: category,
      redacted_diagnostics: redactSecrets(category === "none" ? "OK" : `${category}: ${stderr.slice(0, 500)}`),
      response_summary: responseSummary,
      duration_ms: duration,
    };
  }

  async createPR(params: { title: string; body: string; head: string; base: string }): Promise<ExternalIOEvidence> {
    const args = [
      "pr", "create",
      "--title", params.title,
      "--body", params.body,
      "--base", params.base,
      "--head", params.head,
      "--json", "number,url,title,headRefName,baseRefName",
      "--repo", this.repo,
    ];
    const { exitCode, stdout, stderr, duration } = await runGh(args, this.token);
    let summary: Record<string, unknown> | null = null;
    if (exitCode === 0) {
      try {
        summary = JSON.parse(stdout.trim());
      } catch {
        summary = { raw: stdout.slice(0, 200) };
      }
    }
    return this.buildEvidence("pr_create", exitCode, stderr, stdout, duration, summary);
  }

  async mergePR(params: { number: number; method?: "squash" | "merge" | "rebase" }): Promise<ExternalIOEvidence> {
    const args = ["pr", "merge", String(params.number), "--repo", this.repo];
    if (params.method) args.push(`--${params.method}`);
    args.push("--auto");
    const { exitCode, stdout, stderr, duration } = await runGh(args, this.token);
    return this.buildEvidence("pr_merge", exitCode, stderr, stdout, duration, {
      pr_number: params.number,
      method: params.method ?? "merge",
    });
  }

  async approvePR(params: { number: number }): Promise<ExternalIOEvidence> {
    const args = ["pr", "review", String(params.number), "--approve", "--repo", this.repo];
    const { exitCode, stdout, stderr, duration } = await runGh(args, this.token);
    return this.buildEvidence("pr_approve", exitCode, stderr, stdout, duration, {
      pr_number: params.number,
    });
  }

  async triggerWorkflow(params: { workflow: string; ref: string }): Promise<ExternalIOEvidence> {
    const args = ["workflow", "run", params.workflow, "--ref", params.ref, "--repo", this.repo];
    const { exitCode, stdout, stderr, duration } = await runGh(args, this.token);
    return this.buildEvidence("workflow_trigger", exitCode, stderr, stdout, duration, {
      workflow: params.workflow,
      ref: params.ref,
    });
  }

  async watchWorkflowRun(params: { run_id: number }): Promise<ExternalIOEvidence> {
    const args = ["run", "watch", String(params.run_id), "--json", "status,conclusion", "--repo", this.repo];
    const { exitCode, stdout, stderr, duration } = await runGh(args, this.token);
    let summary: Record<string, unknown> | null = null;
    if (exitCode === 0) {
      try {
        summary = JSON.parse(stdout.trim());
      } catch {
        summary = { raw: stdout.slice(0, 200) };
      }
    }
    return this.buildEvidence("workflow_watch", exitCode, stderr, stdout, duration, summary);
  }
}

export class GitHubHttpAdapter implements GitHubAdapter {
  private repo: string;
  private token: string;
  private secretUnavailable?: { blocker: string; code: string };

  constructor(repo: string, secretRef?: SecretRef) {
    this.repo = repo;
    if (secretRef) {
      const result = resolveSecretRef(secretRef);
      if (result.status === "resolved") {
        this.token = result.value;
      } else {
        this.token = "";
        this.secretUnavailable = { blocker: result.blocker, code: result.code };
      }
    } else {
      this.token = process.env.GITHUB_TOKEN ?? "";
    }
  }

  private unavailableEvidence(action: string): ExternalIOEvidence {
    return {
      adapter: "github_http",
      action,
      success: false,
      error_category: "auth_failure",
      redacted_diagnostics: `secret_unavailable: ${this.secretUnavailable!.code}`,
      response_summary: null,
      duration_ms: 0,
    };
  }

  private request(path: string, options: https.RequestOptions & { body?: string }): Promise<{ statusCode: number; body: string }> {
    return new Promise((resolve, reject) => {
      const [owner, repo] = this.repo.split("/");
      const req = https.request(
        {
          hostname: "api.github.com",
          port: 443,
          path: `/repos/${owner}/${repo}${path}`,
          method: options.method ?? "GET",
          headers: {
            "Authorization": `token ${this.token}`,
            "Accept": "application/vnd.github+json",
            "User-Agent": "bos-light-external-io",
            "X-GitHub-Api-Version": "2022-11-28",
            ...(options.body ? { "Content-Type": "application/json" } : {}),
            ...options.headers,
          },
          ...options,
        },
        (res) => {
          let data = "";
          res.on("data", (chunk) => { data += chunk; });
          res.on("end", () => {
            resolve({ statusCode: res.statusCode ?? 0, body: data });
          });
        }
      );
      req.on("error", (err) => reject(err));
      if (options.body) req.write(options.body);
      req.end();
    });
  }

  private buildEvidence(
    action: string,
    statusCode: number,
    body: string,
    duration: number,
    responseSummary: Record<string, unknown> | null
  ): ExternalIOEvidence {
    let category: ExternalIOEvidence["error_category"] = "none";
    if (statusCode === 401 || statusCode === 403) category = "auth_failure";
    else if (statusCode === 404) category = "not_found";
    else if (statusCode >= 500) category = "network_error";
    else if (statusCode !== 200 && statusCode !== 201 && statusCode !== 204) category = "generic";

    return {
      adapter: "github_http",
      action,
      success: statusCode >= 200 && statusCode < 300,
      error_category: category,
      redacted_diagnostics: redactSecrets(category === "none" ? "OK" : `${category}: HTTP ${statusCode} — ${body.slice(0, 500)}`),
      response_summary: responseSummary,
      duration_ms: duration,
    };
  }

  async createPR(params: { title: string; body: string; head: string; base: string }): Promise<ExternalIOEvidence> {
    if (this.secretUnavailable) return this.unavailableEvidence("pr_create");
    const start = Date.now();
    const body = JSON.stringify({ title: params.title, body: params.body, head: params.head, base: params.base });
    const { statusCode, body: responseBody } = await this.request("/pulls", { method: "POST", body });
    let summary: Record<string, unknown> | null = null;
    if (statusCode >= 200 && statusCode < 300) {
      try { summary = JSON.parse(responseBody); } catch { summary = { raw: responseBody.slice(0, 200) }; }
    }
    return this.buildEvidence("pr_create", statusCode, responseBody, Date.now() - start, summary);
  }

  async mergePR(params: { number: number; method?: "squash" | "merge" | "rebase" }): Promise<ExternalIOEvidence> {
    if (this.secretUnavailable) return this.unavailableEvidence("pr_merge");
    const start = Date.now();
    const body = JSON.stringify({ merge_method: params.method ?? "merge" });
    const { statusCode, body: responseBody } = await this.request(`/pulls/${params.number}/merge`, { method: "PUT", body });
    let summary: Record<string, unknown> | null = null;
    if (statusCode >= 200 && statusCode < 300) {
      try { summary = JSON.parse(responseBody); } catch { summary = { raw: responseBody.slice(0, 200) }; }
    }
    return this.buildEvidence("pr_merge", statusCode, responseBody, Date.now() - start, summary);
  }

  async approvePR(params: { number: number }): Promise<ExternalIOEvidence> {
    if (this.secretUnavailable) return this.unavailableEvidence("pr_approve");
    const start = Date.now();
    const body = JSON.stringify({ event: "APPROVE" });
    const { statusCode, body: responseBody } = await this.request(`/pulls/${params.number}/reviews`, { method: "POST", body });
    return this.buildEvidence("pr_approve", statusCode, responseBody, Date.now() - start, { pr_number: params.number });
  }

  async triggerWorkflow(params: { workflow: string; ref: string }): Promise<ExternalIOEvidence> {
    if (this.secretUnavailable) return this.unavailableEvidence("workflow_trigger");
    const start = Date.now();
    // GitHub Actions workflow dispatch requires workflow_id or workflow file name
    const body = JSON.stringify({ ref: params.ref });
    const { statusCode, body: responseBody } = await this.request(`/actions/workflows/${encodeURIComponent(params.workflow)}/dispatches`, { method: "POST", body });
    return this.buildEvidence("workflow_trigger", statusCode, responseBody, Date.now() - start, {
      workflow: params.workflow,
      ref: params.ref,
    });
  }

  async watchWorkflowRun(params: { run_id: number }): Promise<ExternalIOEvidence> {
    if (this.secretUnavailable) return this.unavailableEvidence("workflow_watch");
    const start = Date.now();
    const { statusCode, body: responseBody } = await this.request(`/actions/runs/${params.run_id}`, { method: "GET" });
    let summary: Record<string, unknown> | null = null;
    if (statusCode >= 200 && statusCode < 300) {
      try { summary = JSON.parse(responseBody); } catch { summary = { raw: responseBody.slice(0, 200) }; }
    }
    return this.buildEvidence("workflow_watch", statusCode, responseBody, Date.now() - start, summary);
  }
}

export class ExternalIOGateway {
  private repo: string;
  private secretRef?: SecretRef;
  private _adapter: GitHubAdapter | null = null;
  private _useGh: boolean | null = null;

  constructor(repo: string, secretRef?: SecretRef) {
    this.repo = repo;
    this.secretRef = secretRef;
  }

  async init(): Promise<void> {
    if (this.secretRef) {
      const result = resolveSecretRef(this.secretRef);
      if (result.status === "unavailable") {
        this._adapter = null;
        this._useGh = false;
        return;
      }
      const token = result.value;
      const ghAvailable = await discoverGhBinary();
      this._useGh = ghAvailable;
      this._adapter = ghAvailable
        ? new GhCliAdapter(this.repo, token)
        : new GitHubHttpAdapter(this.repo, this.secretRef);
      return;
    }

    if (!hasGitHubToken()) {
      this._adapter = null;
      this._useGh = false;
      return;
    }
    const ghAvailable = await discoverGhBinary();
    this._useGh = ghAvailable;
    this._adapter = ghAvailable ? new GhCliAdapter(this.repo) : new GitHubHttpAdapter(this.repo);
  }

  get adapter(): GitHubAdapter | null {
    return this._adapter;
  }

  get preferredAdapter(): "gh_cli" | "github_http" | "none" {
    if (this._useGh === null) return "none";
    if (!hasGitHubToken() && !this.secretRef) return "none";
    if (this.secretRef && this._adapter === null) return "none";
    return this._useGh ? "gh_cli" : "github_http";
  }

  async createPR(params: Omit<Parameters<GitHubAdapter["createPR"]>[0], "repo">): Promise<ExternalIOEvidence> {
    if (!this._adapter) return this.blockerEvidence("pr_create", "GITHUB_TOKEN missing");
    return this._adapter.createPR({ ...params, repo: this.repo });
  }

  async mergePR(params: Omit<Parameters<GitHubAdapter["mergePR"]>[0], "repo">): Promise<ExternalIOEvidence> {
    if (!this._adapter) return this.blockerEvidence("pr_merge", "GITHUB_TOKEN missing");
    return this._adapter.mergePR({ ...params, repo: this.repo });
  }

  async approvePR(params: Omit<Parameters<GitHubAdapter["approvePR"]>[0], "repo">): Promise<ExternalIOEvidence> {
    if (!this._adapter) return this.blockerEvidence("pr_approve", "GITHUB_TOKEN missing");
    return this._adapter.approvePR({ ...params, repo: this.repo });
  }

  async triggerWorkflow(params: Omit<Parameters<GitHubAdapter["triggerWorkflow"]>[0], "repo">): Promise<ExternalIOEvidence> {
    if (!this._adapter) return this.blockerEvidence("workflow_trigger", "GITHUB_TOKEN missing");
    return this._adapter.triggerWorkflow({ ...params, repo: this.repo });
  }

  async watchWorkflowRun(params: Omit<Parameters<GitHubAdapter["watchWorkflowRun"]>[0], "repo">): Promise<ExternalIOEvidence> {
    if (!this._adapter) return this.blockerEvidence("workflow_watch", "GITHUB_TOKEN missing");
    return this._adapter.watchWorkflowRun({ ...params, repo: this.repo });
  }

  private blockerEvidence(action: string, reason: string): ExternalIOEvidence {
    return {
      adapter: this.preferredAdapter === "none" ? "github_http" : this.preferredAdapter,
      action,
      success: false,
      error_category: "auth_failure",
      redacted_diagnostics: reason,
      response_summary: null,
      duration_ms: 0,
    };
  }
}
