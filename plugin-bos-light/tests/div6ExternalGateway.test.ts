import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  executeExternalGitOperation,
  type ExternalGitEvidence,
  type ExternalGitOperation,
} from "../src/div6ExternalGateway";
import { issueScopedAccessGrant } from "../src/treasury";
import {
  getDivisionInbox,
  clearPacketRouter,
} from "../src/divisionPacketRouter";
import type {
  Division,
  ExternalGitGatewayUnauthorized,
  ScopedAccessGrant,
} from "../src/contracts";
import { spawn, type ChildProcess } from "child_process";
import { EventEmitter } from "events";

vi.mock("child_process", () => ({
  spawn: vi.fn(),
}));

const ORIGINAL_ENV = process.env;

const ALL_DIVISIONS: Division[] = [
  "Div7.MissionControl",
  "Div1.HCO",
  "Div2.MasterPlanner",
  "Div3.Treasury",
  "Div4.Production",
  "Div5.QualificationsLibraryLearning",
  "Div6.External",
];

function makeGrant(
  allowedOps: string[] = ["clone", "fetch", "read"],
  secretType: "paperclip" | "inline" = "inline"
): ScopedAccessGrant {
  const secretRef =
    secretType === "paperclip"
      ? { type: "secret_ref" as const, secret_id: "git-token-1", version: "latest" as const }
      : { type: "inline_env" as const, env_key: "TEST_GIT_TOKEN" };

  // Issue the grant via treasury to populate Div6 inbox
  const result = issueScopedAccessGrant(
    "Div3.Treasury",
    "mission_001",
    "https://github.com/example/repo.git",
    allowedOps,
    secretRef
  );

  if ("authorized" in result) {
    throw new Error("Unexpected TreasuryUnauthorized from test helper");
  }
  return result;
}

function makeExpiredGrant(): ScopedAccessGrant {
  const grant = makeGrant(["clone"], "inline");
  // Mutate to expired
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  (grant as { expires_at: string }).expires_at = yesterday;
  return grant;
}

function makeNonTreasuryGrant(): ScopedAccessGrant {
  const grant = makeGrant(["clone"], "inline");
  (grant as { granted_by: Division }).granted_by = "Div1.HCO";
  return grant;
}

describe("executeExternalGitOperation", () => {
  let mockChild: EventEmitter & { stdout: EventEmitter; stderr: EventEmitter };

  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV, TEST_GIT_TOKEN: "ghp_test_token_123", OTHER_TOKEN: "ghp_other_123" };
    clearPacketRouter();
    mockChild = Object.assign(new EventEmitter(), {
      stdout: new EventEmitter(),
      stderr: new EventEmitter(),
    });
    vi.mocked(spawn).mockReturnValue(mockChild as unknown as ChildProcess);
  });

  afterEach(() => {
    process.env = ORIGINAL_ENV;
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

  function emitError(err: Error) {
    process.nextTick(() => {
      mockChild.emit("error", err);
    });
  }

  it("rejects non-Div6.External callers with ExternalGitGatewayUnauthorized", async () => {
    const nonDiv6 = ALL_DIVISIONS.filter((d) => d !== "Div6.External");

    for (const caller of nonDiv6) {
      clearPacketRouter();
      const grant = makeGrant();
      const result = await executeExternalGitOperation(
        caller,
        grant.grant_id,
        "ls-remote"
      );

      expect("authorized" in result).toBe(true);
      const unauthorized = result as ExternalGitGatewayUnauthorized;
      expect(unauthorized.authorized).toBe(false);
      expect(unauthorized.caller).toBe(caller);
      expect(unauthorized.required_role).toBe("Div6.External");
      expect(unauthorized.reason).toContain("Div6.External");
      expect(unauthorized.rejected_at).toBeDefined();
    }
  });

  it("rejects empty grantId", async () => {
    const result = await executeExternalGitOperation(
      "Div6.External",
      "",
      "ls-remote"
    );
    expect("authorized" in result).toBe(true);
    const unauthorized = result as ExternalGitGatewayUnauthorized;
    expect(unauthorized.reason).toContain("grantId");
  });

  it("rejects missing access_grant packet in Div6 inbox", async () => {
    clearPacketRouter(); // ensure empty inbox
    const result = await executeExternalGitOperation(
      "Div6.External",
      "nonexistent_grant",
      "ls-remote"
    );
    expect("authorized" in result).toBe(true);
    const unauthorized = result as ExternalGitGatewayUnauthorized;
    expect(unauthorized.reason).toContain("No access_grant");
  });

  it("rejects grant with invalid origin", async () => {
    clearPacketRouter();
    const grant = makeNonTreasuryGrant();
    const result = await executeExternalGitOperation(
      "Div6.External",
      grant.grant_id,
      "ls-remote"
    );
    expect("authorized" in result).toBe(true);
    const unauthorized = result as ExternalGitGatewayUnauthorized;
    expect(unauthorized.reason).toContain("Grant origin invalid");
  });

  it("rejects expired grant", async () => {
    clearPacketRouter();
    const grant = makeExpiredGrant();
    const result = await executeExternalGitOperation(
      "Div6.External",
      grant.grant_id,
      "ls-remote"
    );
    expect("authorized" in result).toBe(true);
    const unauthorized = result as ExternalGitGatewayUnauthorized;
    expect(unauthorized.reason).toContain("expired");
  });

  it("rejects ls-remote when grant lacks read/clone/fetch ops", async () => {
    clearPacketRouter();
    const grant = makeGrant(["push"]);
    const result = await executeExternalGitOperation(
      "Div6.External",
      grant.grant_id,
      "ls-remote"
    );
    expect("authorized" in result).toBe(true);
    const unauthorized = result as ExternalGitGatewayUnauthorized;
    expect(unauthorized.reason).toContain("ls-remote");
  });

  it("rejects clone when grant lacks clone op", async () => {
    clearPacketRouter();
    const grant = makeGrant(["read", "fetch"]);
    const result = await executeExternalGitOperation(
      "Div6.External",
      grant.grant_id,
      "clone",
      "/tmp/repo"
    );
    expect("authorized" in result).toBe(true);
    const unauthorized = result as ExternalGitGatewayUnauthorized;
    expect(unauthorized.reason).toContain("clone");
  });

  it("rejects fetch when grant lacks fetch/pull op", async () => {
    clearPacketRouter();
    const grant = makeGrant(["read", "clone"]);
    const result = await executeExternalGitOperation(
      "Div6.External",
      grant.grant_id,
      "fetch",
      "/tmp/repo"
    );
    expect("authorized" in result).toBe(true);
    const unauthorized = result as ExternalGitGatewayUnauthorized;
    expect(unauthorized.reason).toContain("fetch");
  });

  it("allows ls-remote with 'read' permission", async () => {
    clearPacketRouter();
    const grant = makeGrant(["read"]);
    const promise = executeExternalGitOperation(
      "Div6.External",
      grant.grant_id,
      "ls-remote"
    );
    emitSuccess("abc123\tHEAD\n");
    const result = await promise;
    expect("authorized" in result).toBe(false);
    const evidence = result as ExternalGitEvidence;
    expect(evidence.operation).toBe("ls-remote");
    expect(evidence.git_evidence.success).toBe(true);
  });

  it("allows ls-remote with 'clone' permission", async () => {
    clearPacketRouter();
    const grant = makeGrant(["clone"]);
    const promise = executeExternalGitOperation(
      "Div6.External",
      grant.grant_id,
      "ls-remote"
    );
    emitSuccess();
    const result = await promise;
    expect("authorized" in result).toBe(false);
    const evidence = result as ExternalGitEvidence;
    expect(evidence.git_evidence.success).toBe(true);
  });

  it("allows clone with 'clone' permission", async () => {
    clearPacketRouter();
    const grant = makeGrant(["clone"]);
    const promise = executeExternalGitOperation(
      "Div6.External",
      grant.grant_id,
      "clone",
      "/tmp/repo"
    );
    emitSuccess();
    const result = await promise;
    expect("authorized" in result).toBe(false);
    const evidence = result as ExternalGitEvidence;
    expect(evidence.operation).toBe("clone");
    expect(evidence.git_evidence.success).toBe(true);
    expect(evidence.git_evidence.args).toEqual([
      "clone",
      "https://github.com/example/repo.git",
      "/tmp/repo",
    ]);
  });

  it("allows fetch with 'fetch' permission", async () => {
    clearPacketRouter();
    const grant = makeGrant(["fetch"]);
    const promise = executeExternalGitOperation(
      "Div6.External",
      grant.grant_id,
      "fetch",
      "/tmp/repo"
    );
    emitSuccess();
    const result = await promise;
    expect("authorized" in result).toBe(false);
    const evidence = result as ExternalGitEvidence;
    expect(evidence.operation).toBe("fetch");
    expect(evidence.git_evidence.success).toBe(true);
  });

  it("allows fetch with 'pull' permission", async () => {
    clearPacketRouter();
    const grant = makeGrant(["pull"]);
    const promise = executeExternalGitOperation(
      "Div6.External",
      grant.grant_id,
      "fetch",
      "/tmp/repo"
    );
    emitSuccess();
    const result = await promise;
    expect("authorized" in result).toBe(false);
    const evidence = result as ExternalGitEvidence;
    expect(evidence.git_evidence.success).toBe(true);
  });

  it("rejects clone without localPath", async () => {
    clearPacketRouter();
    const grant = makeGrant(["clone"]);
    const result = await executeExternalGitOperation(
      "Div6.External",
      grant.grant_id,
      "clone"
    );
    expect("authorized" in result).toBe(true);
    const unauthorized = result as ExternalGitGatewayUnauthorized;
    expect(unauthorized.reason).toContain("localPath");
  });

  it("rejects fetch without localPath", async () => {
    clearPacketRouter();
    const grant = makeGrant(["fetch"]);
    const result = await executeExternalGitOperation(
      "Div6.External",
      grant.grant_id,
      "fetch"
    );
    expect("authorized" in result).toBe(true);
    const unauthorized = result as ExternalGitGatewayUnauthorized;
    expect(unauthorized.reason).toContain("localPath");
  });

  it("ls-remote does not require localPath", async () => {
    clearPacketRouter();
    const grant = makeGrant(["read"]);
    const promise = executeExternalGitOperation(
      "Div6.External",
      grant.grant_id,
      "ls-remote"
    );
    emitSuccess();
    const result = await promise;
    expect("authorized" in result).toBe(false);
  });

  it("produces ExternalGitEvidence with trust_level 'untrusted' on success", async () => {
    clearPacketRouter();
    const grant = makeGrant();
    const promise = executeExternalGitOperation(
      "Div6.External",
      grant.grant_id,
      "ls-remote"
    );
    emitSuccess("ref output");
    const result = await promise;
    const evidence = result as ExternalGitEvidence;
    expect(evidence.schema_version).toBe("1.0");
    expect(evidence.trust_level).toBe("untrusted");
    expect(evidence.produced_by).toBe("Div6.External");
    expect(evidence.grant_id).toBe(grant.grant_id);
    expect(evidence.mission_id).toBe("mission_001");
    expect(evidence.quarantine_ref).toMatch(/^quarantine_\d+_[a-z0-9]+$/);
    expect(evidence.produced_at).toBeDefined();
    expect(evidence.git_evidence).toBeDefined();
    expect(evidence.git_evidence.success).toBe(true);
  });

  it("produces ExternalGitEvidence on git failure", async () => {
    clearPacketRouter();
    const grant = makeGrant();
    const promise = executeExternalGitOperation(
      "Div6.External",
      grant.grant_id,
      "ls-remote"
    );
    emitFailure(128, "fatal: Authentication failed");
    const result = await promise;
    expect("authorized" in result).toBe(false);
    const evidence = result as ExternalGitEvidence;
    expect(evidence.git_evidence.success).toBe(false);
    expect(evidence.git_evidence.error_category).toBe("auth_failure");
    expect(evidence.trust_level).toBe("untrusted");
  });

  it("git evidence contains only hashes, not raw stdout/stderr", async () => {
    clearPacketRouter();
    const grant = makeGrant();
    const promise = executeExternalGitOperation(
      "Div6.External",
      grant.grant_id,
      "ls-remote"
    );
    emitSuccess("sensitive token data here");
    const result = await promise;
    const evidence = result as ExternalGitEvidence;
    expect(evidence.git_evidence.stdout_hash).toBeDefined();
    expect(evidence.git_evidence.stdout_hash).not.toContain("sensitive");
    expect(evidence.git_evidence.stderr_hash).toBeDefined();
  });

  it("emits completion_report to Div5.QualificationsLibraryLearning", async () => {
    clearPacketRouter();
    const grant = makeGrant();
    const promise = executeExternalGitOperation(
      "Div6.External",
      grant.grant_id,
      "ls-remote"
    );
    emitSuccess();
    await promise;

    const div5Inbox = getDivisionInbox("Div5.QualificationsLibraryLearning");
    expect(div5Inbox).toHaveLength(1);
    expect(div5Inbox[0].packet_type).toBe("completion_report");
    expect(div5Inbox[0].from_division).toBe("Div6.External");
    expect(div5Inbox[0].to_division).toBe("Div5.QualificationsLibraryLearning");

    const payload = div5Inbox[0].payload as ExternalGitEvidence;
    expect(payload.trust_level).toBe("untrusted");
    expect(payload.grant_id).toBe(grant.grant_id);
    expect(payload.git_evidence).toBeDefined();
  });

  it("emits status_update to Div1.HCO with redacted summary", async () => {
    clearPacketRouter();
    const grant = makeGrant();
    const promise = executeExternalGitOperation(
      "Div6.External",
      grant.grant_id,
      "ls-remote"
    );
    emitSuccess();
    await promise;

    const div1Inbox = getDivisionInbox("Div1.HCO");
    // Div1.HCO gets status_update from treasury (grant creation) + div6 (execution)
    expect(div1Inbox).toHaveLength(2);
    const div6Status = div1Inbox.find((p) => p.from_division === "Div6.External");
    expect(div6Status).toBeDefined();
    expect(div6Status!.packet_type).toBe("status_update");
    expect(div6Status!.to_division).toBe("Div1.HCO");

    const payload = div6Status!.payload as Record<string, unknown>;
    expect(payload.grant_id).toBe(grant.grant_id);
    expect(payload.mission_id).toBe("mission_001");
    expect(payload.operation).toBe("ls-remote");
    expect(payload.repo_url).toBe("https://github.com/example/repo.git");
    expect(typeof payload.success).toBe("boolean");
    expect(payload.error_category).toBeDefined();
    expect(payload.trust_level).toBe("untrusted");
    expect(typeof payload.quarantine_ref).toBe("string");
    expect(payload.quarantine_ref).toMatch(/^quarantine_/);
  });

  it("does not emit packets on validation failure", async () => {
    clearPacketRouter();
    await executeExternalGitOperation(
      "Div1.HCO",
      "some_grant",
      "ls-remote"
    );

    expect(getDivisionInbox("Div5.QualificationsLibraryLearning")).toHaveLength(0);
    expect(getDivisionInbox("Div1.HCO")).toHaveLength(0);
  });

  it("does not emit packets on grant not found", async () => {
    clearPacketRouter();
    await executeExternalGitOperation(
      "Div6.External",
      "missing_grant",
      "ls-remote"
    );

    expect(getDivisionInbox("Div5.QualificationsLibraryLearning")).toHaveLength(0);
    expect(getDivisionInbox("Div1.HCO")).toHaveLength(0);
  });

  it("emits both packets on execution success", async () => {
    clearPacketRouter();
    const grant = makeGrant();
    const promise = executeExternalGitOperation(
      "Div6.External",
      grant.grant_id,
      "ls-remote"
    );
    emitSuccess();
    await promise;

    expect(getDivisionInbox("Div5.QualificationsLibraryLearning")).toHaveLength(1);
    // Div1.HCO: 1 from treasury grant creation + 1 from div6 execution
    expect(getDivisionInbox("Div1.HCO")).toHaveLength(2);
  });

  it("emits both packets on execution failure", async () => {
    clearPacketRouter();
    const grant = makeGrant();
    const promise = executeExternalGitOperation(
      "Div6.External",
      grant.grant_id,
      "ls-remote"
    );
    emitFailure(1, "generic error");
    await promise;

    expect(getDivisionInbox("Div5.QualificationsLibraryLearning")).toHaveLength(1);
    expect(getDivisionInbox("Div1.HCO")).toHaveLength(2);
  });

  it("status_update does not contain raw git output", async () => {
    clearPacketRouter();
    const grant = makeGrant();
    const promise = executeExternalGitOperation(
      "Div6.External",
      grant.grant_id,
      "ls-remote"
    );
    emitSuccess("raw output with ghp_abcdefghijklmnopqrstuvwxyz0123456789");
    await promise;

    const div1Inbox = getDivisionInbox("Div1.HCO");
    const payloadJson = JSON.stringify(div1Inbox[0].payload);
    expect(payloadJson).not.toContain("ghp_");
    expect(payloadJson).not.toContain("raw output");
  });

  it("completion_report contains full ExternalGitEvidence", async () => {
    clearPacketRouter();
    const grant = makeGrant();
    const promise = executeExternalGitOperation(
      "Div6.External",
      grant.grant_id,
      "clone",
      "/tmp/repo"
    );
    emitSuccess();
    const result = await promise;
    const evidence = result as ExternalGitEvidence;

    const div5Inbox = getDivisionInbox("Div5.QualificationsLibraryLearning");
    expect(div5Inbox[0].payload).toEqual(evidence);
  });

  it("isolates packet state between tests", async () => {
    clearPacketRouter();
    const grant = makeGrant();
    const promise = executeExternalGitOperation(
      "Div6.External",
      grant.grant_id,
      "ls-remote"
    );
    emitSuccess();
    await promise;

    expect(getDivisionInbox("Div5.QualificationsLibraryLearning")).toHaveLength(1);
    clearPacketRouter();
    expect(getDivisionInbox("Div5.QualificationsLibraryLearning")).toHaveLength(0);
    expect(getDivisionInbox("Div1.HCO")).toHaveLength(0);
  });

  it("validates multiple grants in inbox and selects correct one", async () => {
    clearPacketRouter();
    const grant1 = makeGrant(["read"], "inline");
    const grant2 = issueScopedAccessGrant(
      "Div3.Treasury",
      "mission_002",
      "https://github.com/other/repo.git",
      ["clone"],
      { type: "inline_env", env_key: "OTHER_TOKEN" }
    ) as ScopedAccessGrant;

    const promise = executeExternalGitOperation(
      "Div6.External",
      grant2.grant_id,
      "clone",
      "/tmp/repo"
    );
    emitSuccess();
    const result = await promise;
    const evidence = result as ExternalGitEvidence;
    expect(evidence.grant_id).toBe(grant2.grant_id);
    expect(evidence.mission_id).toBe("mission_002");
  });

  it("produces auth_failure evidence when secret resolution fails", async () => {
    clearPacketRouter();
    const grant = makeGrant(["read"], "paperclip");
    const promise = executeExternalGitOperation(
      "Div6.External",
      grant.grant_id,
      "ls-remote"
    );
    // No emit needed — DefaultGitOperations returns auth_failure immediately when secret unavailable
    const result = await promise;
    expect("authorized" in result).toBe(false);
    const evidence = result as ExternalGitEvidence;
    expect(evidence.git_evidence.success).toBe(false);
    expect(evidence.git_evidence.error_category).toBe("auth_failure");
    expect(evidence.git_evidence.redacted_diagnostics).toContain("secret_unavailable");
  });

  describe("git execution via gateway", () => {
    it("detects missing git binary (ENOENT) for ls-remote", async () => {
      clearPacketRouter();
      const grant = makeGrant(["read"]);
      const promise = executeExternalGitOperation(
        "Div6.External",
        grant.grant_id,
        "ls-remote"
      );
      const err = Object.assign(new Error("spawn git ENOENT"), { code: "ENOENT" });
      emitError(err);
      const result = await promise;
      expect("authorized" in result).toBe(false);
      const evidence = result as ExternalGitEvidence;
      expect(evidence.git_evidence.success).toBe(false);
      expect(evidence.git_evidence.error_category).toBe("missing_binary");
      expect(evidence.git_evidence.redacted_diagnostics).toContain("git binary not found");
      expect(evidence.trust_level).toBe("untrusted");
    });

    it("detects missing git binary (ENOENT) for clone", async () => {
      clearPacketRouter();
      const grant = makeGrant(["clone"]);
      const promise = executeExternalGitOperation(
        "Div6.External",
        grant.grant_id,
        "clone",
        "/tmp/repo"
      );
      const err = Object.assign(new Error("spawn git ENOENT"), { code: "ENOENT" });
      emitError(err);
      const result = await promise;
      expect("authorized" in result).toBe(false);
      const evidence = result as ExternalGitEvidence;
      expect(evidence.git_evidence.success).toBe(false);
      expect(evidence.git_evidence.error_category).toBe("missing_binary");
      expect(evidence.git_evidence.redacted_diagnostics).toContain("git binary not found");
      expect(evidence.trust_level).toBe("untrusted");
    });

    it("detects missing git binary (ENOENT) for fetch", async () => {
      clearPacketRouter();
      const grant = makeGrant(["fetch"]);
      const promise = executeExternalGitOperation(
        "Div6.External",
        grant.grant_id,
        "fetch",
        "/tmp/repo"
      );
      const err = Object.assign(new Error("spawn git ENOENT"), { code: "ENOENT" });
      emitError(err);
      const result = await promise;
      expect("authorized" in result).toBe(false);
      const evidence = result as ExternalGitEvidence;
      expect(evidence.git_evidence.success).toBe(false);
      expect(evidence.git_evidence.error_category).toBe("missing_binary");
      expect(evidence.git_evidence.redacted_diagnostics).toContain("git binary not found");
      expect(evidence.trust_level).toBe("untrusted");
    });

    it("detects auth failure for clone", async () => {
      clearPacketRouter();
      const grant = makeGrant(["clone"]);
      const promise = executeExternalGitOperation(
        "Div6.External",
        grant.grant_id,
        "clone",
        "/tmp/repo"
      );
      emitFailure(128, "fatal: Authentication failed for 'https://github.com/example/repo.git/'");
      const result = await promise;
      expect("authorized" in result).toBe(false);
      const evidence = result as ExternalGitEvidence;
      expect(evidence.git_evidence.success).toBe(false);
      expect(evidence.git_evidence.error_category).toBe("auth_failure");
      expect(evidence.trust_level).toBe("untrusted");
    });

    it("detects auth failure for fetch", async () => {
      clearPacketRouter();
      const grant = makeGrant(["fetch"]);
      const promise = executeExternalGitOperation(
        "Div6.External",
        grant.grant_id,
        "fetch",
        "/tmp/repo"
      );
      emitFailure(128, "fatal: Authentication failed for 'https://github.com/example/repo.git/'");
      const result = await promise;
      expect("authorized" in result).toBe(false);
      const evidence = result as ExternalGitEvidence;
      expect(evidence.git_evidence.success).toBe(false);
      expect(evidence.git_evidence.error_category).toBe("auth_failure");
      expect(evidence.trust_level).toBe("untrusted");
    });

    it("includes redacted_diagnostics in all evidence envelopes", async () => {
      clearPacketRouter();
      const grant = makeGrant(["read"]);
      const promise = executeExternalGitOperation(
        "Div6.External",
        grant.grant_id,
        "ls-remote"
      );
      emitSuccess("ok");
      const result = await promise;
      const evidence = result as ExternalGitEvidence;
      expect(typeof evidence.git_evidence.redacted_diagnostics).toBe("string");
      expect(evidence.git_evidence.redacted_diagnostics.length).toBeGreaterThan(0);
    });
  });
});
