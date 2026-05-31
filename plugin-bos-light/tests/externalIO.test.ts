import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  ExternalIOGateway,
  GhCliAdapter,
  GitHubHttpAdapter,
  discoverGhBinary,
  hasGitHubToken,
  redactSecrets,
  type ExternalIOEvidence,
} from "../src/externalIO";
import { spawn, type ChildProcess } from "child_process";
import * as https from "https";
import { EventEmitter } from "events";

vi.mock("child_process", () => ({
  spawn: vi.fn(),
}));

vi.mock("https", () => ({
  request: vi.fn(),
}));

describe("redactSecrets", () => {
  it("redacts GitHub tokens", () => {
    const input = "token=ghp_abcdefghijklmnopqrstuvwxyz0123456789";
    expect(redactSecrets(input)).toBe("token=[REDACTED]");
  });

  it("redacts SSH keys", () => {
    const input = "-----BEGIN OPENSSH PRIVATE KEY-----\nabc\n-----END OPENSSH PRIVATE KEY-----";
    expect(redactSecrets(input)).toBe("[REDACTED]");
  });

  it("leaves benign text unchanged", () => {
    expect(redactSecrets("hello world")).toBe("hello world");
  });
});

describe("hasGitHubToken", () => {
  const origToken = process.env.GITHUB_TOKEN;

  beforeEach(() => {
    delete process.env.GITHUB_TOKEN;
  });

  afterEach(() => {
    if (origToken) process.env.GITHUB_TOKEN = origToken;
    else delete process.env.GITHUB_TOKEN;
  });

  it("returns false when GITHUB_TOKEN is missing", () => {
    expect(hasGitHubToken()).toBe(false);
  });

  it("returns true when GITHUB_TOKEN is present", () => {
    process.env.GITHUB_TOKEN = "ghp_testtoken123";
    expect(hasGitHubToken()).toBe(true);
  });
});

describe("discoverGhBinary", () => {
  let mockChild: EventEmitter & { stdout: EventEmitter; stderr: EventEmitter };

  beforeEach(() => {
    mockChild = Object.assign(new EventEmitter(), {
      stdout: new EventEmitter(),
      stderr: new EventEmitter(),
    });
    vi.mocked(spawn).mockReturnValue(mockChild as unknown as ChildProcess);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns true when gh --version succeeds", async () => {
    const promise = discoverGhBinary();
    process.nextTick(() => mockChild.emit("close", 0));
    expect(await promise).toBe(true);
  });

  it("returns false when gh --version fails", async () => {
    const promise = discoverGhBinary();
    process.nextTick(() => mockChild.emit("close", 1));
    expect(await promise).toBe(false);
  });

  it("returns false when gh binary is missing", async () => {
    const promise = discoverGhBinary();
    process.nextTick(() => mockChild.emit("error", new Error("ENOENT")));
    expect(await promise).toBe(false);
  });
});

describe("GhCliAdapter", () => {
  let adapter: GhCliAdapter;
  let mockChild: EventEmitter & { stdout: EventEmitter; stderr: EventEmitter };

  beforeEach(() => {
    adapter = new GhCliAdapter("owner/repo");
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

  function emitFailure(exitCode: number, stderrText: string) {
    process.nextTick(() => {
      if (stderrText) mockChild.stderr.emit("data", stderrText);
      mockChild.emit("close", exitCode);
    });
  }

  it("createPR returns structured evidence on success", async () => {
    const stdout = JSON.stringify({ number: 42, url: "https://github.com/owner/repo/pull/42", title: "Test PR", headRefName: "feature", baseRefName: "main" });
    const promise = adapter.createPR({ title: "Test", body: "Body", head: "feature", base: "main" });
    emitSuccess(stdout);
    const evidence = await promise;
    expect(evidence.success).toBe(true);
    expect(evidence.error_category).toBe("none");
    expect(evidence.response_summary).toHaveProperty("number", 42);
  });

  it("createPR returns auth_failure on 401", async () => {
    const promise = adapter.createPR({ title: "Test", body: "Body", head: "feature", base: "main" });
    emitFailure(1, "HTTP 401: Bad credentials");
    const evidence = await promise;
    expect(evidence.success).toBe(false);
    expect(evidence.error_category).toBe("auth_failure");
  });

  it("mergePR returns evidence with pr number", async () => {
    const promise = adapter.mergePR({ number: 42, method: "squash" });
    emitSuccess("");
    const evidence = await promise;
    expect(evidence.action).toBe("pr_merge");
    expect(evidence.response_summary).toHaveProperty("pr_number", 42);
  });

  it("approvePR returns evidence", async () => {
    const promise = adapter.approvePR({ number: 42 });
    emitSuccess("");
    const evidence = await promise;
    expect(evidence.action).toBe("pr_approve");
    expect(evidence.success).toBe(true);
  });

  it("triggerWorkflow returns evidence", async () => {
    const promise = adapter.triggerWorkflow({ workflow: "ci.yml", ref: "main" });
    emitSuccess("");
    const evidence = await promise;
    expect(evidence.action).toBe("workflow_trigger");
    expect(evidence.response_summary).toHaveProperty("workflow", "ci.yml");
  });

  it("watchWorkflowRun returns structured evidence", async () => {
    const stdout = JSON.stringify({ status: "completed", conclusion: "success" });
    const promise = adapter.watchWorkflowRun({ run_id: 123 });
    emitSuccess(stdout);
    const evidence = await promise;
    expect(evidence.action).toBe("workflow_watch");
    expect(evidence.response_summary).toHaveProperty("conclusion", "success");
  });
});

describe("GitHubHttpAdapter", () => {
  let adapter: GitHubHttpAdapter;
  let mockReq: EventEmitter;
  let mockRes: EventEmitter & { statusCode?: number };

  beforeEach(() => {
    process.env.GITHUB_TOKEN = "ghp_testtoken123";
    adapter = new GitHubHttpAdapter("owner/repo");
    mockReq = Object.assign(new EventEmitter(), {
      write: vi.fn(),
      end: vi.fn(),
    });
    mockRes = Object.assign(new EventEmitter(), { statusCode: 200 });
    vi.mocked(https.request).mockImplementation((_options, callback) => {
      if (callback) process.nextTick(() => callback(mockRes as unknown as import("http").IncomingMessage));
      return mockReq as unknown as import("http").ClientRequest;
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.GITHUB_TOKEN;
  });

  function emitResponse(body: string, statusCode = 200) {
    mockRes.statusCode = statusCode;
    process.nextTick(() => {
      mockRes.emit("data", Buffer.from(body));
      mockRes.emit("end");
    });
  }

  it("createPR returns structured evidence on success", async () => {
    const body = JSON.stringify({ number: 42, html_url: "https://github.com/owner/repo/pull/42" });
    const promise = adapter.createPR({ title: "Test", body: "Body", head: "feature", base: "main" });
    emitResponse(body, 201);
    const evidence = await promise;
    expect(evidence.success).toBe(true);
    expect(evidence.error_category).toBe("none");
    expect(evidence.response_summary).toHaveProperty("number", 42);
  });

  it("createPR returns auth_failure on 401", async () => {
    const promise = adapter.createPR({ title: "Test", body: "Body", head: "feature", base: "main" });
    emitResponse(JSON.stringify({ message: "Bad credentials" }), 401);
    const evidence = await promise;
    expect(evidence.success).toBe(false);
    expect(evidence.error_category).toBe("auth_failure");
  });

  it("mergePR returns evidence on success", async () => {
    const promise = adapter.mergePR({ number: 42, method: "squash" });
    emitResponse(JSON.stringify({ sha: "abc123" }), 200);
    const evidence = await promise;
    expect(evidence.action).toBe("pr_merge");
    expect(evidence.success).toBe(true);
  });

  it("approvePR returns evidence", async () => {
    const promise = adapter.approvePR({ number: 42 });
    emitResponse(JSON.stringify({ id: 99 }), 200);
    const evidence = await promise;
    expect(evidence.action).toBe("pr_approve");
    expect(evidence.success).toBe(true);
  });

  it("triggerWorkflow returns evidence", async () => {
    const promise = adapter.triggerWorkflow({ workflow: "ci.yml", ref: "main" });
    emitResponse("", 204);
    const evidence = await promise;
    expect(evidence.action).toBe("workflow_trigger");
    expect(evidence.success).toBe(true);
  });

  it("watchWorkflowRun returns structured evidence", async () => {
    const body = JSON.stringify({ id: 123, status: "completed", conclusion: "success" });
    const promise = adapter.watchWorkflowRun({ run_id: 123 });
    emitResponse(body, 200);
    const evidence = await promise;
    expect(evidence.action).toBe("workflow_watch");
    expect(evidence.response_summary).toHaveProperty("conclusion", "success");
  });
});

describe("ExternalIOGateway", () => {
  const origToken = process.env.GITHUB_TOKEN;

  beforeEach(() => {
    delete process.env.GITHUB_TOKEN;
    vi.restoreAllMocks();
  });

  afterEach(() => {
    if (origToken) process.env.GITHUB_TOKEN = origToken;
    else delete process.env.GITHUB_TOKEN;
  });

  it("init with missing token produces null adapter and none preferred", async () => {
    delete process.env.GITHUB_TOKEN;
    const gateway = new ExternalIOGateway("owner/repo");
    await gateway.init();
    expect(gateway.adapter).toBeNull();
    expect(gateway.preferredAdapter).toBe("none");
  });

  it("init with token and gh available selects gh_cli", async () => {
    process.env.GITHUB_TOKEN = "ghp_testtoken123";
    const mockChild = Object.assign(new EventEmitter(), { stdout: new EventEmitter(), stderr: new EventEmitter() });
    vi.mocked(spawn).mockReturnValue(mockChild as unknown as ChildProcess);

    const gateway = new ExternalIOGateway("owner/repo");
    const promise = gateway.init();
    process.nextTick(() => mockChild.emit("close", 0));
    await promise;

    expect(gateway.preferredAdapter).toBe("gh_cli");
    expect(gateway.adapter).not.toBeNull();
  });

  it("init with token but no gh falls back to github_http", async () => {
    process.env.GITHUB_TOKEN = "ghp_testtoken123";
    const mockChild = Object.assign(new EventEmitter(), { stdout: new EventEmitter(), stderr: new EventEmitter() });
    vi.mocked(spawn).mockReturnValue(mockChild as unknown as ChildProcess);

    const gateway = new ExternalIOGateway("owner/repo");
    const promise = gateway.init();
    process.nextTick(() => mockChild.emit("error", new Error("ENOENT")));
    await promise;

    expect(gateway.preferredAdapter).toBe("github_http");
    expect(gateway.adapter).not.toBeNull();
  });

  it("createPR returns blocker when token is missing", async () => {
    delete process.env.GITHUB_TOKEN;
    const gateway = new ExternalIOGateway("owner/repo");
    await gateway.init();
    const evidence = await gateway.createPR({ title: "Test", body: "Body", head: "feature", base: "main" });
    expect(evidence.success).toBe(false);
    expect(evidence.error_category).toBe("auth_failure");
    expect(evidence.redacted_diagnostics).toContain("GITHUB_TOKEN missing");
  });

  it("mergePR returns blocker when token is missing", async () => {
    delete process.env.GITHUB_TOKEN;
    const gateway = new ExternalIOGateway("owner/repo");
    await gateway.init();
    const evidence = await gateway.mergePR({ number: 42 });
    expect(evidence.success).toBe(false);
    expect(evidence.error_category).toBe("auth_failure");
  });

  it("approvePR returns blocker when token is missing", async () => {
    delete process.env.GITHUB_TOKEN;
    const gateway = new ExternalIOGateway("owner/repo");
    await gateway.init();
    const evidence = await gateway.approvePR({ number: 42 });
    expect(evidence.success).toBe(false);
    expect(evidence.error_category).toBe("auth_failure");
  });

  it("triggerWorkflow returns blocker when token is missing", async () => {
    delete process.env.GITHUB_TOKEN;
    const gateway = new ExternalIOGateway("owner/repo");
    await gateway.init();
    const evidence = await gateway.triggerWorkflow({ workflow: "ci.yml", ref: "main" });
    expect(evidence.success).toBe(false);
    expect(evidence.error_category).toBe("auth_failure");
  });

  it("watchWorkflowRun returns blocker when token is missing", async () => {
    delete process.env.GITHUB_TOKEN;
    const gateway = new ExternalIOGateway("owner/repo");
    await gateway.init();
    const evidence = await gateway.watchWorkflowRun({ run_id: 123 });
    expect(evidence.success).toBe(false);
    expect(evidence.error_category).toBe("auth_failure");
  });
});
