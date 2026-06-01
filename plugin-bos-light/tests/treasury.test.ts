import { describe, it, expect, beforeEach } from "vitest";
import {
  issueScopedAccessGrant,
} from "../src/treasury";
import { getDivisionInbox, clearPacketRouter } from "../src/divisionPacketRouter";
import type { Division, ScopedAccessGrant, TreasuryUnauthorized, SecretRef } from "../src/contracts";

const ALL_DIVISIONS: Division[] = [
  "Div7.MissionControl",
  "Div1.HCO",
  "Div2.MasterPlanner",
  "Div3.Treasury",
  "Div4.Production",
  "Div5.QualificationsLibraryLearning",
  "Div6.External",
];

function makeSecretRef(type: "paperclip" | "inline"): SecretRef {
  if (type === "paperclip") {
    return { type: "secret_ref", secret_id: "git-token-1", version: "latest" };
  }
  return { type: "inline_env", env_key: "TEST_GIT_TOKEN" };
}

describe("issueScopedAccessGrant", () => {
  beforeEach(() => {
    clearPacketRouter();
  });

  it("allows Div3.Treasury to issue a scoped access grant", () => {
    const result = issueScopedAccessGrant(
      "Div3.Treasury",
      "mission_001",
      "https://github.com/example/repo.git",
      ["clone", "fetch"],
      makeSecretRef("paperclip")
    );

    expect("authorized" in result).toBe(false);
    const grant = result as ScopedAccessGrant;
    expect(grant.schema_version).toBe("1.0");
    expect(grant.mission_id).toBe("mission_001");
    expect(grant.repo_url).toBe("https://github.com/example/repo.git");
    expect(grant.allowed_ops).toEqual(["clone", "fetch"]);
    expect(grant.granted_by).toBe("Div3.Treasury");
    expect(grant.grant_id).toMatch(/^grant_\d+_[a-z0-9]+$/);
    expect(grant.secret_ref).toEqual(makeSecretRef("paperclip"));
  });

  it("rejects non-Div3 callers with TreasuryUnauthorized", () => {
    const nonDiv3 = ALL_DIVISIONS.filter((d) => d !== "Div3.Treasury");

    for (const caller of nonDiv3) {
      clearPacketRouter();
      const result = issueScopedAccessGrant(
        caller,
        "mission_001",
        "https://github.com/example/repo.git",
        ["clone"],
        makeSecretRef("paperclip")
      );

      expect("authorized" in result).toBe(true);
      const unauthorized = result as TreasuryUnauthorized;
      expect(unauthorized.authorized).toBe(false);
      expect(unauthorized.caller).toBe(caller);
      expect(unauthorized.required_role).toBe("Div3.Treasury");
      expect(unauthorized.reason).toContain("Div3.Treasury");
      expect(unauthorized.rejected_at).toBeDefined();
    }
  });

  it("rejects empty repoUrl", () => {
    const result = issueScopedAccessGrant(
      "Div3.Treasury",
      "mission_001",
      "",
      ["clone"],
      makeSecretRef("paperclip")
    );

    expect("authorized" in result).toBe(true);
    const unauthorized = result as TreasuryUnauthorized;
    expect(unauthorized.reason).toContain("repoUrl");
  });

  it("rejects whitespace-only repoUrl", () => {
    const result = issueScopedAccessGrant(
      "Div3.Treasury",
      "mission_001",
      "   ",
      ["clone"],
      makeSecretRef("paperclip")
    );

    expect("authorized" in result).toBe(true);
    const unauthorized = result as TreasuryUnauthorized;
    expect(unauthorized.reason).toContain("repoUrl");
  });

  it("rejects empty allowedOps array", () => {
    const result = issueScopedAccessGrant(
      "Div3.Treasury",
      "mission_001",
      "https://github.com/example/repo.git",
      [],
      makeSecretRef("paperclip")
    );

    expect("authorized" in result).toBe(true);
    const unauthorized = result as TreasuryUnauthorized;
    expect(unauthorized.reason).toContain("allowedOps");
  });

  it("rejects invalid allowedOps values", () => {
    const result = issueScopedAccessGrant(
      "Div3.Treasury",
      "mission_001",
      "https://github.com/example/repo.git",
      ["clone", "hack"],
      makeSecretRef("paperclip")
    );

    expect("authorized" in result).toBe(true);
    const unauthorized = result as TreasuryUnauthorized;
    expect(unauthorized.reason).toContain("allowedOps");
  });

  it("rejects non-array allowedOps", () => {
    const result = issueScopedAccessGrant(
      "Div3.Treasury",
      "mission_001",
      "https://github.com/example/repo.git",
      "clone" as unknown as string[],
      makeSecretRef("paperclip")
    );

    expect("authorized" in result).toBe(true);
    const unauthorized = result as TreasuryUnauthorized;
    expect(unauthorized.reason).toContain("allowedOps");
  });

  it("rejects invalid secretRef shape", () => {
    const result = issueScopedAccessGrant(
      "Div3.Treasury",
      "mission_001",
      "https://github.com/example/repo.git",
      ["clone"],
      { type: "unknown_ref", id: "x" } as unknown as SecretRef
    );

    expect("authorized" in result).toBe(true);
    const unauthorized = result as TreasuryUnauthorized;
    expect(unauthorized.reason).toContain("secretRef");
  });

  it("rejects PaperclipSecretRef with empty secret_id", () => {
    const result = issueScopedAccessGrant(
      "Div3.Treasury",
      "mission_001",
      "https://github.com/example/repo.git",
      ["clone"],
      { type: "secret_ref", secret_id: "", version: "latest" } as SecretRef
    );

    expect("authorized" in result).toBe(true);
    const unauthorized = result as TreasuryUnauthorized;
    expect(unauthorized.reason).toContain("secretRef");
  });

  it("rejects PaperclipSecretRef with wrong version", () => {
    const result = issueScopedAccessGrant(
      "Div3.Treasury",
      "mission_001",
      "https://github.com/example/repo.git",
      ["clone"],
      { type: "secret_ref", secret_id: "tok-1", version: "v1" } as unknown as SecretRef
    );

    expect("authorized" in result).toBe(true);
    const unauthorized = result as TreasuryUnauthorized;
    expect(unauthorized.reason).toContain("secretRef");
  });

  it("rejects InlineEnvRef with empty env_key", () => {
    const result = issueScopedAccessGrant(
      "Div3.Treasury",
      "mission_001",
      "https://github.com/example/repo.git",
      ["clone"],
      { type: "inline_env", env_key: "" } as SecretRef
    );

    expect("authorized" in result).toBe(true);
    const unauthorized = result as TreasuryUnauthorized;
    expect(unauthorized.reason).toContain("secretRef");
  });

  it("accepts all valid AllowedGitOperation values", () => {
    const allOps = ["clone", "fetch", "pull", "push", "read", "write"];
    const result = issueScopedAccessGrant(
      "Div3.Treasury",
      "mission_001",
      "https://github.com/example/repo.git",
      allOps,
      makeSecretRef("paperclip")
    );

    expect("authorized" in result).toBe(false);
    const grant = result as ScopedAccessGrant;
    expect(grant.allowed_ops).toEqual(allOps);
  });

  it("emits access_grant packet to Div6.External", () => {
    issueScopedAccessGrant(
      "Div3.Treasury",
      "mission_001",
      "https://github.com/example/repo.git",
      ["clone", "fetch"],
      makeSecretRef("paperclip")
    );

    const div6Inbox = getDivisionInbox("Div6.External");
    expect(div6Inbox).toHaveLength(1);
    expect(div6Inbox[0].packet_type).toBe("access_grant");
    expect(div6Inbox[0].from_division).toBe("Div3.Treasury");
    expect(div6Inbox[0].to_division).toBe("Div6.External");

    const payload = div6Inbox[0].payload as ScopedAccessGrant;
    expect(payload.mission_id).toBe("mission_001");
    expect(payload.repo_url).toBe("https://github.com/example/repo.git");
    expect(payload.allowed_ops).toEqual(["clone", "fetch"]);
    expect(payload.secret_ref).toEqual(makeSecretRef("paperclip"));
  });

  it("emits status_update packet to Div1.HCO with redacted secret_ref", () => {
    issueScopedAccessGrant(
      "Div3.Treasury",
      "mission_001",
      "https://github.com/example/repo.git",
      ["clone"],
      makeSecretRef("inline")
    );

    const div1Inbox = getDivisionInbox("Div1.HCO");
    expect(div1Inbox).toHaveLength(1);
    expect(div1Inbox[0].packet_type).toBe("status_update");
    expect(div1Inbox[0].from_division).toBe("Div3.Treasury");
    expect(div1Inbox[0].to_division).toBe("Div1.HCO");

    const payload = div1Inbox[0].payload as Record<string, unknown>;
    expect(payload.mission_id).toBe("mission_001");
    expect(payload.repo_url).toBe("https://github.com/example/repo.git");
    expect(payload.allowed_ops).toEqual(["clone"]);
    expect(typeof payload.secret_ref_redacted).toBe("string");
    expect(payload.secret_ref_redacted).toContain("<redacted>");
    expect(payload.secret_ref_redacted).toContain("TEST_GIT_TOKEN"); // env_key name is part of the ref shape
    expect(payload.granted_by).toBe("Div3.Treasury");
    expect(typeof payload.grant_id).toBe("string");
    expect(typeof payload.granted_at).toBe("string");
    expect(typeof payload.expires_at).toBe("string");
  });

  it("access_grant payload does not contain plaintext secret value", () => {
    process.env.PLAIN_TEST_TOKEN = "super-secret-value-123";
    issueScopedAccessGrant(
      "Div3.Treasury",
      "mission_001",
      "https://github.com/example/repo.git",
      ["clone"],
      { type: "inline_env", env_key: "PLAIN_TEST_TOKEN" }
    );

    const div6Inbox = getDivisionInbox("Div6.External");
    const payload = div6Inbox[0].payload as ScopedAccessGrant;
    // The secret_ref is a reference, not the value
    expect(payload.secret_ref).toEqual({ type: "inline_env", env_key: "PLAIN_TEST_TOKEN" });
    // Ensure the actual secret value is nowhere in the payload
    const payloadJson = JSON.stringify(payload);
    expect(payloadJson).not.toContain("super-secret-value-123");

    delete process.env.PLAIN_TEST_TOKEN;
  });

  it("sets expires_at approximately 24 hours after granted_at", () => {
    const before = Date.now();
    const result = issueScopedAccessGrant(
      "Div3.Treasury",
      "mission_001",
      "https://github.com/example/repo.git",
      ["clone"],
      makeSecretRef("paperclip")
    ) as ScopedAccessGrant;
    const after = Date.now();

    const grantedAt = new Date(result.granted_at).getTime();
    const expiresAt = new Date(result.expires_at).getTime();
    const diffMs = expiresAt - grantedAt;

    expect(diffMs).toBeGreaterThanOrEqual(23 * 60 * 60 * 1000);
    expect(diffMs).toBeLessThanOrEqual(25 * 60 * 60 * 1000);
  });

  it("trims repoUrl whitespace", () => {
    const result = issueScopedAccessGrant(
      "Div3.Treasury",
      "mission_001",
      "  https://github.com/example/repo.git  ",
      ["clone"],
      makeSecretRef("paperclip")
    ) as ScopedAccessGrant;

    expect(result.repo_url).toBe("https://github.com/example/repo.git");
  });

  it("does not emit packets on validation failure", () => {
    issueScopedAccessGrant(
      "Div3.Treasury",
      "mission_001",
      "",
      ["clone"],
      makeSecretRef("paperclip")
    );

    expect(getDivisionInbox("Div6.External")).toHaveLength(0);
    expect(getDivisionInbox("Div1.HCO")).toHaveLength(0);
  });

  it("does not emit packets on auth failure", () => {
    issueScopedAccessGrant(
      "Div1.HCO",
      "mission_001",
      "https://github.com/example/repo.git",
      ["clone"],
      makeSecretRef("paperclip")
    );

    expect(getDivisionInbox("Div6.External")).toHaveLength(0);
    expect(getDivisionInbox("Div1.HCO")).toHaveLength(0);
  });

  it("emits both packets on success", () => {
    issueScopedAccessGrant(
      "Div3.Treasury",
      "mission_001",
      "https://github.com/example/repo.git",
      ["clone"],
      makeSecretRef("paperclip")
    );

    expect(getDivisionInbox("Div6.External")).toHaveLength(1);
    expect(getDivisionInbox("Div1.HCO")).toHaveLength(1);
  });

  it("isolates packet state between tests", () => {
    issueScopedAccessGrant(
      "Div3.Treasury",
      "mission_001",
      "https://github.com/example/repo.git",
      ["clone"],
      makeSecretRef("paperclip")
    );

    expect(getDivisionInbox("Div6.External")).toHaveLength(1);
    clearPacketRouter();
    expect(getDivisionInbox("Div6.External")).toHaveLength(0);
    expect(getDivisionInbox("Div1.HCO")).toHaveLength(0);
  });

  it("accepts InlineEnvRef as valid secretRef", () => {
    const result = issueScopedAccessGrant(
      "Div3.Treasury",
      "mission_001",
      "https://github.com/example/repo.git",
      ["clone"],
      makeSecretRef("inline")
    );

    expect("authorized" in result).toBe(false);
    const grant = result as ScopedAccessGrant;
    expect(grant.secret_ref).toEqual(makeSecretRef("inline"));
  });

  it("returns unique grant_ids for successive calls", () => {
    const result1 = issueScopedAccessGrant(
      "Div3.Treasury",
      "mission_001",
      "https://github.com/example/repo.git",
      ["clone"],
      makeSecretRef("paperclip")
    ) as ScopedAccessGrant;

    const result2 = issueScopedAccessGrant(
      "Div3.Treasury",
      "mission_002",
      "https://github.com/example/repo2.git",
      ["fetch"],
      makeSecretRef("paperclip")
    ) as ScopedAccessGrant;

    expect(result1.grant_id).not.toBe(result2.grant_id);
  });
});
