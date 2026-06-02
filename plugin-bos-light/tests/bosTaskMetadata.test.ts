import { describe, it, expect, beforeEach } from "vitest";
import { BosTaskMetadataStore } from "../src/bosTaskMetadata";
import type { BosTaskMetadata, BosTaskGrantRef } from "../src/bosTaskMetadata";
import { serializeMetadataToMarkdown, serializeGrantDecisionToMarkdown, mirrorMetadataToComment, mirrorGrantDecisionToComment, mirrorAllMetadata } from "../src/metadataMirror";
import { InMemoryPaperclipAdapter } from "../src/paperclipAdapter";

describe("BosTaskMetadataStore", () => {
  let store: BosTaskMetadataStore;

  beforeEach(() => {
    store = new BosTaskMetadataStore();
  });

  it("creates metadata with defaults", () => {
    const metadata = store.create({
      issue_id: "BOS-T1",
      mission_id: "mission_001",
      title: "Test task",
    });

    expect(metadata.schema_version).toBe("1.0");
    expect(metadata.issue_id).toBe("BOS-T1");
    expect(metadata.mission_id).toBe("mission_001");
    expect(metadata.phase).toBe("intake");
    expect(metadata.risk_level).toBe("LOW");
    expect(metadata.assigned_division).toBeNull();
    expect(metadata.grant_ref).toBeNull();
    expect(metadata.audit_trail).toHaveLength(1);
    expect(metadata.audit_trail[0].event).toBe("metadata.created");
  });

  it("creates metadata with explicit overrides", () => {
    const metadata = store.create({
      issue_id: "BOS-T2",
      mission_id: "mission_002",
      title: "Build feature",
      description: "Implement the feature",
      assigned_division: "Div4.Production",
      risk_level: "HIGH",
      phase: "grant_pending",
    });

    expect(metadata.assigned_division).toBe("Div4.Production");
    expect(metadata.risk_level).toBe("HIGH");
    expect(metadata.phase).toBe("grant_pending");
    expect(metadata.description).toBe("Implement the feature");
  });

  it("rejects duplicate issue_id", () => {
    store.create({ issue_id: "BOS-T1", mission_id: "m1", title: "A" });
    expect(() => store.create({ issue_id: "BOS-T1", mission_id: "m2", title: "B" }))
      .toThrow("Metadata already exists for issue BOS-T1");
  });

  it("retrieves metadata by issue_id", () => {
    store.create({ issue_id: "BOS-T1", mission_id: "m1", title: "A" });
    const found = store.get("BOS-T1");
    expect(found).not.toBeNull();
    expect(found!.issue_id).toBe("BOS-T1");
  });

  it("returns null for unknown issue_id", () => {
    expect(store.get("UNKNOWN")).toBeNull();
  });

  it("has() checks existence", () => {
    store.create({ issue_id: "BOS-T1", mission_id: "m1", title: "A" });
    expect(store.has("BOS-T1")).toBe(true);
    expect(store.has("BOS-T99")).toBe(false);
  });

  it("updates phase and records audit entry", () => {
    store.create({ issue_id: "BOS-T1", mission_id: "m1", title: "A" });
    const updated = store.updatePhase("BOS-T1", "in_progress", "Div4.Production", "Work started");

    expect(updated.phase).toBe("in_progress");
    expect(updated.audit_trail).toHaveLength(2);
    expect(updated.audit_trail[1].event).toBe("phase.in_progress");
    expect(updated.audit_trail[1].actor).toBe("Div4.Production");
    expect(updated.audit_trail[1].detail).toBe("Work started");
  });

  it("throws when updating phase for unknown issue", () => {
    expect(() => store.updatePhase("UNKNOWN", "in_progress", "system"))
      .toThrow("No metadata found for issue UNKNOWN");
  });

  it("attaches grant reference and transitions to granted", () => {
    store.create({ issue_id: "BOS-T1", mission_id: "m1", title: "A" });

    const grant: BosTaskGrantRef = {
      grant_id: "grant_123",
      grant_type: "BUDGET_GRANT",
      status: "active",
      issued_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 3600_000).toISOString(),
      token_cap: 100_000,
      allowed_tools: ["repo_read", "test_runner"],
    };

    const updated = store.attachGrant("BOS-T1", grant, "Div3.Treasury");

    expect(updated.grant_ref).not.toBeNull();
    expect(updated.grant_ref!.grant_id).toBe("grant_123");
    expect(updated.grant_ref!.grant_type).toBe("BUDGET_GRANT");
    expect(updated.phase).toBe("granted");
    expect(updated.audit_trail).toHaveLength(2);
    expect(updated.audit_trail[1].event).toBe("grant.attached");
  });

  it("revokes grant and transitions to blocked", () => {
    store.create({ issue_id: "BOS-T1", mission_id: "m1", title: "A" });

    const grant: BosTaskGrantRef = {
      grant_id: "grant_123",
      grant_type: "BUDGET_GRANT",
      status: "active",
      issued_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 3600_000).toISOString(),
      token_cap: 100_000,
      allowed_tools: ["repo_read"],
    };

    store.attachGrant("BOS-T1", grant, "Div3.Treasury");
    const revoked = store.revokeGrant("BOS-T1", "Budget exceeded", "Div3.Treasury");

    expect(revoked.grant_ref!.status).toBe("revoked");
    expect(revoked.phase).toBe("blocked");
    expect(revoked.audit_trail).toHaveLength(3);
    expect(revoked.audit_trail[2].event).toBe("grant.revoked");
  });

  it("assigns division", () => {
    store.create({ issue_id: "BOS-T1", mission_id: "m1", title: "A" });
    const updated = store.assignDivision("BOS-T1", "Div4.Production", "Div1.HCO");

    expect(updated.assigned_division).toBe("Div4.Production");
    expect(updated.audit_trail[1].event).toBe("division.assigned");
  });

  it("lists all metadata", () => {
    store.create({ issue_id: "BOS-T1", mission_id: "m1", title: "A" });
    store.create({ issue_id: "BOS-T2", mission_id: "m2", title: "B" });
    expect(store.listAll()).toHaveLength(2);
  });

  it("clears all metadata", () => {
    store.create({ issue_id: "BOS-T1", mission_id: "m1", title: "A" });
    store.clear();
    expect(store.size()).toBe(0);
    expect(store.get("BOS-T1")).toBeNull();
  });

  it("tracks grant lifecycle end-to-end", () => {
    // Create
    store.create({
      issue_id: "BOS-T2",
      mission_id: "mission_bos_t2",
      title: "Build integration test suite",
      description: "Implement end-to-end test suite for BOS Light",
      assigned_division: "Div4.Production",
      risk_level: "MEDIUM",
    });

    // Assign
    store.assignDivision("BOS-T2", "Div7.MissionControl", "Div1.HCO");

    // Phase: grant pending
    store.updatePhase("BOS-T2", "grant_pending", "Div1.HCO", "Grant request submitted");

    // Attach grant
    store.attachGrant("BOS-T2", {
      grant_id: "grant_bos_t2",
      grant_type: "BUDGET_GRANT",
      status: "active",
      issued_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 480 * 60_000).toISOString(),
      token_cap: 250_000,
      allowed_tools: ["repo_read", "repo_write", "test_runner"],
    }, "Div3.Treasury");

    // In progress
    store.updatePhase("BOS-T2", "in_progress", "Div4.Production", "Work started");

    const metadata = store.get("BOS-T2")!;
    expect(metadata.phase).toBe("in_progress");
    expect(metadata.grant_ref!.grant_id).toBe("grant_bos_t2");
    expect(metadata.audit_trail.length).toBeGreaterThanOrEqual(5);
  });
});

describe("MetadataMirror - serialization", () => {
  it("serializes full metadata to markdown", () => {
    const metadata: BosTaskMetadata = {
      schema_version: "1.0",
      issue_id: "BOS-T2",
      mission_id: "mission_002",
      phase: "granted",
      assigned_division: "Div4.Production",
      risk_level: "MEDIUM",
      grant_ref: {
        grant_id: "grant_abc",
        grant_type: "BUDGET_GRANT",
        status: "active",
        issued_at: "2026-06-02T10:00:00Z",
        expires_at: "2026-06-02T18:00:00Z",
        token_cap: 250_000,
        allowed_tools: ["repo_read", "repo_write", "test_runner"],
      },
      title: "Build test suite",
      description: "Implement e2e tests",
      created_at: "2026-06-02T09:00:00Z",
      updated_at: "2026-06-02T10:30:00Z",
      audit_trail: [
        { timestamp: "2026-06-02T09:00:00Z", event: "metadata.created", actor: "Div3.Treasury", detail: "Initialized" },
        { timestamp: "2026-06-02T10:00:00Z", event: "grant.attached", actor: "Div3.Treasury", detail: "Grant attached" },
      ],
    };

    const md = serializeMetadataToMarkdown(metadata);

    expect(md).toContain("# BOS Task Metadata");
    expect(md).toContain("**Issue:** BOS-T2");
    expect(md).toContain("**Mission:** mission_002");
    expect(md).toContain("**Phase:** granted");
    expect(md).toContain("**Risk:** MEDIUM");
    expect(md).toContain("**Division:** Div4.Production");
    expect(md).toContain("## Grant");
    expect(md).toContain("**ID:** grant_abc");
    expect(md).toContain("**Type:** BUDGET_GRANT");
    expect(md).toContain("**Token Cap:** 250,000");
    expect(md).toContain("**Tools:** repo_read, repo_write, test_runner");
    expect(md).toContain("## Audit Trail");
    expect(md).toContain("metadata.created");
    expect(md).toContain("grant.attached");
    expect(md).toContain("bos-task-metadata/v1.0");
  });

  it("serializes metadata without grant", () => {
    const metadata: BosTaskMetadata = {
      schema_version: "1.0",
      issue_id: "BOS-T1",
      mission_id: "mission_001",
      phase: "intake",
      assigned_division: null,
      risk_level: "LOW",
      grant_ref: null,
      title: "Simple task",
      description: "",
      created_at: "2026-06-02T09:00:00Z",
      updated_at: "2026-06-02T09:00:00Z",
      audit_trail: [],
    };

    const md = serializeMetadataToMarkdown(metadata);

    expect(md).toContain("# BOS Task Metadata");
    expect(md).toContain("**Division:** (unassigned)");
    expect(md).not.toContain("## Grant");
    expect(md).not.toContain("## Audit Trail");
  });

  it("serializes approved grant decision", () => {
    const md = serializeGrantDecisionToMarkdown("BOS-T2", {
      status: "approved",
      decision_id: "gdec_123",
      rationale: "Approved: Build test suite",
      allowed_tools: ["repo_read", "test_runner"],
      denied_tools: ["external_api"],
      token_cap: 100_000,
      ttl_minutes: 480,
    });

    expect(md).toContain("# BOS Grant Decision — APPROVED");
    expect(md).toContain("**Issue:** BOS-T2");
    expect(md).toContain("**Decision ID:** gdec_123");
    expect(md).toContain("**Status:** approved");
    expect(md).toContain("**Allowed Tools:** repo_read, test_runner");
    expect(md).toContain("**Denied Tools:** external_api");
    expect(md).toContain("**Token Cap:** 100,000");
    expect(md).toContain("**TTL:** 480m");
    expect(md).toContain("bos-grant-decision/v1.0");
  });

  it("serializes denied grant decision", () => {
    const md = serializeGrantDecisionToMarkdown("BOS-T4", {
      status: "denied",
      decision_id: "gdec_456",
      rationale: "Denied: External access not allowed",
      reason: "Division Div4.Production cannot receive external-world access.",
    });

    expect(md).toContain("# BOS Grant Decision — DENIED");
    expect(md).toContain("**Reason:** Division Div4.Production cannot receive external-world access.");
  });

  it("serializes escalated grant decision", () => {
    const md = serializeGrantDecisionToMarkdown("BOS-T5", {
      status: "escalate",
      decision_id: "gdec_789",
      rationale: "Escalated: High risk",
      reason: "Critical risk level requires Div7 review.",
      escalation_target: "Div7.MissionControl",
    });

    expect(md).toContain("# BOS Grant Decision — ESCALATE");
    expect(md).toContain("**Escalation Target:** Div7.MissionControl");
  });
});

describe("MetadataMirror - mirror to comments", () => {
  let adapter: InMemoryPaperclipAdapter;
  let store: BosTaskMetadataStore;

  beforeEach(() => {
    adapter = new InMemoryPaperclipAdapter();
    store = new BosTaskMetadataStore();
  });

  it("mirrors metadata to comment via adapter", async () => {
    store.create({
      issue_id: "BOS-T2",
      mission_id: "mission_002",
      title: "Build test suite",
      assigned_division: "Div4.Production",
    });

    const metadata = store.get("BOS-T2")!;
    const result = await mirrorMetadataToComment(adapter, metadata);

    expect(result.success).toBe(true);
    expect(result.issue_id).toBe("BOS-T2");
    expect(result.comment_id).toBe("comment_1");
    expect(result.error).toBeUndefined();

    // Verify the comment was posted
    const comments = await adapter.getIssueComments("BOS-T2");
    expect(comments).toHaveLength(1);
    expect(comments[0].markdown).toContain("# BOS Task Metadata");
    expect(comments[0].markdown).toContain("**Issue:** BOS-T2");
    expect(comments[0].markdown).toContain("**Division:** Div4.Production");
  });

  it("mirrors grant decision to comment", async () => {
    const result = await mirrorGrantDecisionToComment(adapter, "BOS-T2", {
      status: "approved",
      decision_id: "gdec_test",
      rationale: "Approved for BOS-T2",
      allowed_tools: ["repo_read", "test_runner"],
      token_cap: 100_000,
      ttl_minutes: 480,
    });

    expect(result.success).toBe(true);
    expect(result.comment_id).toBe("comment_1");

    const comments = await adapter.getIssueComments("BOS-T2");
    expect(comments).toHaveLength(1);
    expect(comments[0].markdown).toContain("# BOS Grant Decision — APPROVED");
    expect(comments[0].markdown).toContain("**Allowed Tools:** repo_read, test_runner");
  });

  it("mirrors all metadata in store", async () => {
    store.create({ issue_id: "BOS-T1", mission_id: "m1", title: "Task A" });
    store.create({ issue_id: "BOS-T2", mission_id: "m2", title: "Task B" });

    const results = await mirrorAllMetadata(adapter, store);

    expect(results).toHaveLength(2);
    expect(results[0].success).toBe(true);
    expect(results[1].success).toBe(true);

    const t1Comments = await adapter.getIssueComments("BOS-T1");
    const t2Comments = await adapter.getIssueComments("BOS-T2");
    expect(t1Comments).toHaveLength(1);
    expect(t2Comments).toHaveLength(1);
  });

  it("returns failure when adapter throws", async () => {
    // Create a failing adapter
    const failingAdapter = {
      ...adapter,
      async addIssueComment(_issueId: string, _markdown: string): Promise<{ comment_id: string }> {
        throw new Error("API connection refused");
      },
    };

    store.create({ issue_id: "BOS-T1", mission_id: "m1", title: "A" });
    const metadata = store.get("BOS-T1")!;
    const result = await mirrorMetadataToComment(failingAdapter as any, metadata);

    expect(result.success).toBe(false);
    expect(result.comment_id).toBeNull();
    expect(result.error).toBe("API connection refused");
  });

  it("full lifecycle: create, grant, mirror, verify comment content", async () => {
    // Create metadata
    store.create({
      issue_id: "BOS-T2",
      mission_id: "mission_bos_t2",
      title: "Build integration test suite",
      description: "Implement end-to-end test suite for BOS Light",
      assigned_division: "Div4.Production",
      risk_level: "MEDIUM",
    });

    // Attach grant
    store.attachGrant("BOS-T2", {
      grant_id: "grant_bos_t2",
      grant_type: "BUDGET_GRANT",
      status: "active",
      issued_at: "2026-06-02T10:00:00Z",
      expires_at: "2026-06-02T18:00:00Z",
      token_cap: 250_000,
      allowed_tools: ["repo_read", "repo_write", "test_runner"],
    }, "Div3.Treasury");

    // Mirror to comment
    const metadata = store.get("BOS-T2")!;
    const result = await mirrorMetadataToComment(adapter, metadata);

    expect(result.success).toBe(true);

    // Read back the comment and verify content
    const comments = await adapter.getIssueComments("BOS-T2");
    expect(comments).toHaveLength(1);

    const md = comments[0].markdown;
    expect(md).toContain("**Issue:** BOS-T2");
    expect(md).toContain("**Mission:** mission_bos_t2");
    expect(md).toContain("**Phase:** granted");
    expect(md).toContain("**Risk:** MEDIUM");
    expect(md).toContain("**Division:** Div4.Production");
    expect(md).toContain("**ID:** grant_bos_t2");
    expect(md).toContain("**Type:** BUDGET_GRANT");
    expect(md).toContain("**Token Cap:** 250,000");
    expect(md).toContain("**Tools:** repo_read, repo_write, test_runner");
    expect(md).toContain("grant.attached");
    expect(md).toContain("bos-task-metadata/v1.0");
  });
});
