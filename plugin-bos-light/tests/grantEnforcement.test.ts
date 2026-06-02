import { describe, it, expect, beforeEach } from "vitest";
import { AgentActionValidator, createValidatedToolWrapper } from "../src/agentActionValidator";
import type { AgentActionRequest } from "../src/agentActionValidator";
import { validateGrantRequest } from "../src/grantPolicy";
import { InMemoryGrantLedger, createBudgetGrant, createAccessGrant } from "../src/grantLedger";
import { BosTaskMetadataStore } from "../src/bosTaskMetadata";
import type { BosTaskGrantRef, BosTaskMetadata } from "../src/bosTaskMetadata";
import { mirrorMetadataToComment, mirrorGrantDecisionToComment, serializeMetadataToMarkdown, serializeGrantDecisionToMarkdown } from "../src/metadataMirror";
import { InMemoryPaperclipAdapter } from "../src/paperclipAdapter";
import type { GrantRequest, Division } from "../src/contracts";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const BOS_T2_ISSUE = "BOS-T2";
const BOS_T2_MISSION = "mission_bos_t2";
const BOS_T2_TITLE = "Test grant enforcement with live BOS task";

function makeGrantRequest(overrides: Partial<GrantRequest> = {}): GrantRequest {
  return {
    schema_version: "1.0",
    requested_by: "Div1.HCO",
    target_division: "Div7.MissionControl",
    mission_id: BOS_T2_MISSION,
    paperclip_task_id: BOS_T2_ISSUE,
    purpose: "Execute BOS-T2 decision dispatch",
    requested_tools: ["decision", "packet_emission"],
    requested_secrets: [],
    estimated_cost: 25_000,
    risk_level: "LOW",
    ttl_minutes: 120,
    requested_at: new Date().toISOString(),
    ...overrides,
  };
}

// ─── BOS-T2 Grant Enforcement Integration ─────────────────────────────────────

describe("BOS-T2 grant enforcement - full lifecycle", () => {
  let validator: AgentActionValidator;
  let ledger: InMemoryGrantLedger;
  let metadataStore: BosTaskMetadataStore;
  let adapter: InMemoryPaperclipAdapter;

  beforeEach(() => {
    ledger = new InMemoryGrantLedger();
    validator = new AgentActionValidator(ledger);
    metadataStore = new BosTaskMetadataStore();
    adapter = new InMemoryPaperclipAdapter();
  });

  it("Div7 agent can request and receive BudgetGrant for BOS-T2", () => {
    // Step 1: Create metadata for BOS-T2 task
    const metadata = metadataStore.create({
      issue_id: BOS_T2_ISSUE,
      mission_id: BOS_T2_MISSION,
      title: BOS_T2_TITLE,
      assigned_division: "Div7.MissionControl",
      risk_level: "LOW",
      phase: "intake",
    });

    expect(metadata.issue_id).toBe(BOS_T2_ISSUE);
    expect(metadata.phase).toBe("intake");
    expect(metadata.assigned_division).toBe("Div7.MissionControl");

    // Step 2: Validate grant request for Div7
    const request = makeGrantRequest();
    const decision = validateGrantRequest(request);

    expect(decision.status).toBe("approved");
    if (decision.status !== "approved") throw new Error("Expected approved");

    // Step 3: Create BudgetGrant and track in ledger
    const budgetGrant = createBudgetGrant(request, decision);
    ledger.add({
      grantId: budgetGrant.grant_id,
      missionId: budgetGrant.mission_id,
      targetDivision: budgetGrant.target_division,
      grantType: "BUDGET_GRANT",
      tokenCap: budgetGrant.token_cap,
      ttlMinutes: budgetGrant.ttl_minutes,
      issuedAt: budgetGrant.granted_at,
      expiresAt: budgetGrant.expires_at,
      revoked: false,
    });

    // Step 4: Attach grant to metadata
    const grantRef: BosTaskGrantRef = {
      grant_id: budgetGrant.grant_id,
      grant_type: "BUDGET_GRANT",
      status: "active",
      issued_at: budgetGrant.granted_at,
      expires_at: budgetGrant.expires_at,
      token_cap: budgetGrant.token_cap,
      allowed_tools: budgetGrant.allowed_tools,
    };

    metadataStore.attachGrant(BOS_T2_ISSUE, grantRef, "Div3.Treasury");
    const granted = metadataStore.get(BOS_T2_ISSUE)!;

    expect(granted.phase).toBe("granted");
    expect(granted.grant_ref).toBeDefined();
    expect(granted.grant_ref!.grant_id).toBe(budgetGrant.grant_id);
    expect(granted.grant_ref!.status).toBe("active");
    expect(granted.grant_ref!.token_cap).toBe(25_000);
  });

  it("Div4 is blocked from external tool access (web_search, external_api, external_api_call, fetch)", () => {
    const externalTools = ["web_search", "external_api", "external_api_call", "fetch"];

    for (const tool of externalTools) {
      const result = validator.validate({
        division: "Div4.Production",
        missionId: BOS_T2_MISSION,
        toolName: tool,
        estimatedCost: 5_000,
        paperclipTaskId: BOS_T2_ISSUE,
      });

      expect(result.allowed, `Div4 should be denied ${tool}`).toBe(false);
      expect(result.decision?.status, `Decision for ${tool} should be denied`).toBe("denied");
      expect(result.reason, `Reason for ${tool} should reference Div6.External`).toContain("Div6.External");
      expect(result.denialId, `Denial ID for ${tool} should exist`).toBeDefined();
    }

    // All 4 denials should be logged
    const denials = validator.getDenialsForDivision("Div4.Production");
    expect(denials).toHaveLength(4);

    for (const denial of denials) {
      expect(denial.missionId).toBe(BOS_T2_MISSION);
      expect(denial.reason).toContain("Div6.External");
    }
  });

  it("Div4 is blocked from production tool (denied tool for division)", () => {
    const result = validator.validate({
      division: "Div4.Production",
      missionId: BOS_T2_MISSION,
      toolName: "production",
      estimatedCost: 5_000,
      paperclipTaskId: BOS_T2_ISSUE,
    });

    expect(result.allowed).toBe(false);
    expect(result.decision?.status).toBe("denied");
    expect(result.reason).toContain("denied tools");
  });

  it("Div7 agent action validator approves allowed tools (decision, packet_emission)", () => {
    const allowedTools = ["decision", "packet_emission"];

    for (const tool of allowedTools) {
      const result = validator.validate({
        division: "Div7.MissionControl",
        missionId: BOS_T2_MISSION,
        toolName: tool,
        estimatedCost: 10_000,
        paperclipTaskId: BOS_T2_ISSUE,
      });

      expect(result.allowed, `Div7 should be allowed ${tool}`).toBe(true);
      expect(result.decision?.status, `Decision for ${tool} should be approved`).toBe("approved");
    }
  });

  it("Div7 agent is blocked from external tools and repo_write", () => {
    const deniedTools = ["external_api", "repo_write", "production"];

    for (const tool of deniedTools) {
      const result = validator.validate({
        division: "Div7.MissionControl",
        missionId: BOS_T2_MISSION,
        toolName: tool,
        estimatedCost: 5_000,
      });

      expect(result.allowed, `Div7 should be denied ${tool}`).toBe(false);
    }
  });

  it("BOS-T2 grant decision is mirrored to Paperclip comments", async () => {
    // Step 1: Approve grant for Div7
    const request = makeGrantRequest();
    const decision = validateGrantRequest(request);
    expect(decision.status).toBe("approved");
    if (decision.status !== "approved") throw new Error("Expected approved");

    // Step 2: Mirror grant decision to comments
    const mirrorResult = await mirrorGrantDecisionToComment(adapter, BOS_T2_ISSUE, {
      status: decision.status,
      decision_id: decision.decision_id,
      rationale: decision.rationale,
      allowed_tools: decision.allowed_tools,
      denied_tools: decision.denied_tools,
      token_cap: decision.token_cap,
      ttl_minutes: decision.ttl_minutes,
    });

    expect(mirrorResult.success).toBe(true);
    expect(mirrorResult.comment_id).toBeDefined();
    expect(mirrorResult.issue_id).toBe(BOS_T2_ISSUE);

    // Step 3: Verify comment was posted
    const comments = await adapter.getIssueComments(BOS_T2_ISSUE);
    expect(comments).toHaveLength(1);
    expect(comments[0].markdown).toContain("BOS Grant Decision");
    expect(comments[0].markdown).toContain("APPROVED");
    expect(comments[0].markdown).toContain(BOS_T2_ISSUE);
    expect(comments[0].markdown).toContain("decision");
  });

  it("BOS-T2 metadata is mirrored to Paperclip comments after grant attach", async () => {
    // Step 1: Create metadata
    metadataStore.create({
      issue_id: BOS_T2_ISSUE,
      mission_id: BOS_T2_MISSION,
      title: BOS_T2_TITLE,
      assigned_division: "Div7.MissionControl",
      risk_level: "LOW",
    });

    // Step 2: Approve and create grant
    const request = makeGrantRequest();
    const decision = validateGrantRequest(request);
    if (decision.status !== "approved") throw new Error("Expected approved");
    const budgetGrant = createBudgetGrant(request, decision);

    // Step 3: Attach grant to metadata
    const grantRef: BosTaskGrantRef = {
      grant_id: budgetGrant.grant_id,
      grant_type: "BUDGET_GRANT",
      status: "active",
      issued_at: budgetGrant.granted_at,
      expires_at: budgetGrant.expires_at,
      token_cap: budgetGrant.token_cap,
      allowed_tools: budgetGrant.allowed_tools,
    };
    metadataStore.attachGrant(BOS_T2_ISSUE, grantRef, "Div3.Treasury");
    metadataStore.updatePhase(BOS_T2_ISSUE, "in_progress", "Div7.MissionControl", "Dispatching BOS-T2");

    // Step 4: Mirror metadata to comments
    const metadata = metadataStore.get(BOS_T2_ISSUE)!;
    const mirrorResult = await mirrorMetadataToComment(adapter, metadata);

    expect(mirrorResult.success).toBe(true);
    expect(mirrorResult.comment_id).toBeDefined();

    // Step 5: Verify comment content includes full metadata
    const comments = await adapter.getIssueComments(BOS_T2_ISSUE);
    expect(comments).toHaveLength(1);
    const md = comments[0].markdown;
    expect(md).toContain("BOS Task Metadata");
    expect(md).toContain(BOS_T2_ISSUE);
    expect(md).toContain("in_progress");
    expect(md).toContain("Div7.MissionControl");
    expect(md).toContain(budgetGrant.grant_id);
    expect(md).toContain("BUDGET_GRANT");
    expect(md).toContain("Audit Trail");
  });

  it("grant denial for Div4 external access is mirrored to comments", async () => {
    // Step 1: Request external access for Div4 - should be denied
    const request = makeGrantRequest({
      target_division: "Div4.Production",
      requested_tools: ["repo_read", "web_search"],
    });

    const decision = validateGrantRequest(request);
    expect(decision.status).toBe("denied");
    if (decision.status !== "denied") throw new Error("Expected denied");

    // Step 2: Mirror denial decision
    const mirrorResult = await mirrorGrantDecisionToComment(adapter, BOS_T2_ISSUE, {
      status: decision.status,
      decision_id: decision.decision_id,
      rationale: decision.rationale,
      reason: decision.reason,
    });

    expect(mirrorResult.success).toBe(true);

    // Step 3: Verify denial comment
    const comments = await adapter.getIssueComments(BOS_T2_ISSUE);
    expect(comments).toHaveLength(1);
    expect(comments[0].markdown).toContain("BOS Grant Decision");
    expect(comments[0].markdown).toContain("DENIED");
    expect(comments[0].markdown).toContain("Div6.External");
  });

  it("complete BOS-T2 flow: create metadata -> validate grant -> issue grant -> mirror -> verify", async () => {
    // Phase 1: Task intake
    metadataStore.create({
      issue_id: BOS_T2_ISSUE,
      mission_id: BOS_T2_MISSION,
      title: BOS_T2_TITLE,
      description: "End-to-end grant enforcement test",
      assigned_division: "Div7.MissionControl",
      risk_level: "LOW",
      phase: "intake",
    });

    // Phase 2: Grant request and validation
    const request = makeGrantRequest();
    const decision = validateGrantRequest(request);
    expect(decision.status).toBe("approved");
    if (decision.status !== "approved") throw new Error("Expected approved");

    // Phase 3: Issue BudgetGrant
    const budgetGrant = createBudgetGrant(request, decision);
    const accessGrant = createAccessGrant(request, decision);

    // Track in ledger
    ledger.add({
      grantId: budgetGrant.grant_id,
      missionId: budgetGrant.mission_id,
      targetDivision: budgetGrant.target_division,
      grantType: "BUDGET_GRANT",
      tokenCap: budgetGrant.token_cap,
      ttlMinutes: budgetGrant.ttl_minutes,
      issuedAt: budgetGrant.granted_at,
      expiresAt: budgetGrant.expires_at,
      revoked: false,
    });

    // Phase 4: Attach grant to metadata and advance phase
    const grantRef: BosTaskGrantRef = {
      grant_id: budgetGrant.grant_id,
      grant_type: "BUDGET_GRANT",
      status: "active",
      issued_at: budgetGrant.granted_at,
      expires_at: budgetGrant.expires_at,
      token_cap: budgetGrant.token_cap,
      allowed_tools: budgetGrant.allowed_tools,
    };
    metadataStore.attachGrant(BOS_T2_ISSUE, grantRef, "Div3.Treasury");

    // Phase 5: Validate Div7 actions through AgentActionValidator
    const div7DecisionResult = validator.validate({
      division: "Div7.MissionControl",
      missionId: BOS_T2_MISSION,
      toolName: "decision",
      estimatedCost: 10_000,
      paperclipTaskId: BOS_T2_ISSUE,
    });
    expect(div7DecisionResult.allowed).toBe(true);

    const div7PacketResult = validator.validate({
      division: "Div7.MissionControl",
      missionId: BOS_T2_MISSION,
      toolName: "packet_emission",
      estimatedCost: 10_000,
      paperclipTaskId: BOS_T2_ISSUE,
    });
    expect(div7PacketResult.allowed).toBe(true);

    // Phase 6: Verify Div4 is blocked from external tools
    const div4ExternalResult = validator.validate({
      division: "Div4.Production",
      missionId: BOS_T2_MISSION,
      toolName: "web_search",
      estimatedCost: 5_000,
      paperclipTaskId: BOS_T2_ISSUE,
    });
    expect(div4ExternalResult.allowed).toBe(false);
    expect(div4ExternalResult.decision?.status).toBe("denied");

    // Phase 7: Mirror metadata and grant decision to comments
    const metadata = metadataStore.get(BOS_T2_ISSUE)!;
    const metadataMirror = await mirrorMetadataToComment(adapter, metadata);
    expect(metadataMirror.success).toBe(true);

    const grantDecisionMirror = await mirrorGrantDecisionToComment(adapter, BOS_T2_ISSUE, {
      status: decision.status,
      decision_id: decision.decision_id,
      rationale: decision.rationale,
      allowed_tools: decision.allowed_tools,
      denied_tools: decision.denied_tools,
      token_cap: decision.token_cap,
      ttl_minutes: decision.ttl_minutes,
    });
    expect(grantDecisionMirror.success).toBe(true);

    // Phase 8: Verify final state
    const comments = await adapter.getIssueComments(BOS_T2_ISSUE);
    expect(comments).toHaveLength(2);

    // First comment: metadata mirror
    expect(comments[0].markdown).toContain("BOS Task Metadata");
    expect(comments[0].markdown).toContain("granted");
    expect(comments[0].markdown).toContain(budgetGrant.grant_id);

    // Second comment: grant decision
    expect(comments[1].markdown).toContain("BOS Grant Decision");
    expect(comments[1].markdown).toContain("APPROVED");

    // Verify metadata store state
    const finalMetadata = metadataStore.get(BOS_T2_ISSUE)!;
    expect(finalMetadata.phase).toBe("granted");
    expect(finalMetadata.grant_ref).toBeDefined();
    expect(finalMetadata.grant_ref!.status).toBe("active");
    expect(finalMetadata.assigned_division).toBe("Div7.MissionControl");
    expect(finalMetadata.audit_trail.length).toBeGreaterThanOrEqual(2);

    // Verify denial log: only Div4 external denials
    const allDenials = validator.getDenialLog();
    expect(allDenials).toHaveLength(1);
    expect(allDenials[0].division).toBe("Div4.Production");
    expect(allDenials[0].toolName).toBe("web_search");

    // Verify ledger
    const ledgerEntries = ledger.getByMission(BOS_T2_MISSION);
    expect(ledgerEntries).toHaveLength(1);
    expect(ledgerEntries[0].grantId).toBe(budgetGrant.grant_id);
    expect(ledgerEntries[0].revoked).toBe(false);
  });

  it("createValidatedToolWrapper denies Div4 external access at handler level", () => {
    const wrapTool = createValidatedToolWrapper(validator, "Div4.Production", BOS_T2_MISSION, {
      paperclipTaskId: BOS_T2_ISSUE,
    });

    // Div4 web_search should be denied
    const webSearchHandler = (params: any) => ({ results: ["should not execute"] });
    const wrappedWebSearch = wrapTool("web_search", webSearchHandler);
    const deniedResult = wrappedWebSearch({ query: "test" }) as any;

    expect(deniedResult.error).toBe("grant_denied");
    expect(deniedResult.division).toBe("Div4.Production");
    expect(deniedResult.reason).toContain("Div6.External");

    // Div4 repo_read should be approved
    const repoHandler = (params: any) => ({ content: "file content" });
    const wrappedRepo = wrapTool("repo_read", repoHandler);
    const approvedResult = wrappedRepo({ path: "src/index.ts" });

    expect(approvedResult.content).toBe("file content");
  });

  it("grant lifecycle: ledger tracks revoked and expired grants for BOS-T2", () => {
    // This test verifies that the ledger correctly tracks grant lifecycle
    // that feeds into the AgentActionValidator's approval checks.

    // Step 1: Create and track a grant for BOS-T2
    const request = makeGrantRequest();
    const decision = validateGrantRequest(request);
    expect(decision.status).toBe("approved");
    if (decision.status !== "approved") throw new Error("Expected approved");

    const budgetGrant = createBudgetGrant(request, decision);
    ledger.add({
      grantId: budgetGrant.grant_id,
      missionId: budgetGrant.mission_id,
      targetDivision: budgetGrant.target_division,
      grantType: "BUDGET_GRANT",
      tokenCap: budgetGrant.token_cap,
      ttlMinutes: budgetGrant.ttl_minutes,
      issuedAt: budgetGrant.granted_at,
      expiresAt: budgetGrant.expires_at,
      revoked: false,
    });

    // Step 2: Verify grant is active and not expired
    const entry = ledger.get(budgetGrant.grant_id);
    expect(entry).toBeDefined();
    expect(entry!.revoked).toBe(false);
    expect(ledger.isExpired(budgetGrant.grant_id)).toBe(false);

    // Step 3: Revoke the grant and verify
    ledger.revoke(budgetGrant.grant_id, "Policy violation during BOS-T2");
    const revokedEntry = ledger.get(budgetGrant.grant_id);
    expect(revokedEntry!.revoked).toBe(true);
    expect(revokedEntry!.revokedReason).toBe("Policy violation during BOS-T2");

    // Step 4: Verify expired grant detection
    const expiredGrantId = "grant_expired_test";
    ledger.add({
      grantId: expiredGrantId,
      missionId: BOS_T2_MISSION,
      targetDivision: "Div7.MissionControl",
      grantType: "BUDGET_GRANT",
      tokenCap: 100_000,
      ttlMinutes: 120,
      issuedAt: new Date(Date.now() - 200 * 60_000).toISOString(),
      expiresAt: new Date(Date.now() - 60 * 60_000).toISOString(),
      revoked: false,
    });
    expect(ledger.isExpired(expiredGrantId)).toBe(true);

    // Step 5: Verify cost overrun detection
    const overrunGrantId = "grant_overrun_test";
    ledger.add({
      grantId: overrunGrantId,
      missionId: BOS_T2_MISSION,
      targetDivision: "Div7.MissionControl",
      grantType: "BUDGET_GRANT",
      tokenCap: 5_000,
      ttlMinutes: 120,
      issuedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 120 * 60_000).toISOString(),
      revoked: false,
    });
    expect(ledger.checkOverrun(overrunGrantId, 10_000)).toBe(true);
    expect(ledger.checkOverrun(overrunGrantId, 3_000)).toBe(false);

    // Step 6: Verify mission-level grant tracking
    const missionGrants = ledger.getByMission(BOS_T2_MISSION);
    expect(missionGrants.length).toBeGreaterThanOrEqual(2);
  });
});

// ─── Serialization round-trip ─────────────────────────────────────────────────

describe("BOS-T2 metadata serialization and mirroring", () => {
  let metadataStore: BosTaskMetadataStore;
  let adapter: InMemoryPaperclipAdapter;

  beforeEach(() => {
    metadataStore = new BosTaskMetadataStore();
    adapter = new InMemoryPaperclipAdapter();
  });

  it("serializeMetadataToMarkdown produces expected BOS-T2 metadata fields", () => {
    metadataStore.create({
      issue_id: BOS_T2_ISSUE,
      mission_id: BOS_T2_MISSION,
      title: BOS_T2_TITLE,
      assigned_division: "Div7.MissionControl",
      risk_level: "LOW",
    });

    const grantRef: BosTaskGrantRef = {
      grant_id: "grant_bos_t2_001",
      grant_type: "BUDGET_GRANT",
      status: "active",
      issued_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 120 * 60_000).toISOString(),
      token_cap: 25_000,
      allowed_tools: ["decision", "packet_emission"],
    };
    metadataStore.attachGrant(BOS_T2_ISSUE, grantRef, "Div3.Treasury");

    const metadata = metadataStore.get(BOS_T2_ISSUE)!;
    const md = serializeMetadataToMarkdown(metadata);

    expect(md).toContain("# BOS Task Metadata");
    expect(md).toContain(`**Issue:** ${BOS_T2_ISSUE}`);
    expect(md).toContain(`**Mission:** ${BOS_T2_MISSION}`);
    expect(md).toContain("granted");
    expect(md).toContain("Div7.MissionControl");
    expect(md).toContain("grant_bos_t2_001");
    expect(md).toContain("BUDGET_GRANT");
    expect(md).toContain("active");
    expect(md).toContain("25,000");
    expect(md).toContain("decision, packet_emission");
    expect(md).toContain("bos-task-metadata/v1.0");
  });

  it("serializeGrantDecisionToMarkdown covers approved, denied, and escalated decisions", () => {
    // Approved
    const approvedMd = serializeGrantDecisionToMarkdown(BOS_T2_ISSUE, {
      status: "approved",
      decision_id: "gdec_approved_001",
      rationale: "Routine low-risk request",
      allowed_tools: ["decision", "packet_emission"],
      denied_tools: [],
      token_cap: 25_000,
      ttl_minutes: 120,
    });
    expect(approvedMd).toContain("APPROVED");
    expect(approvedMd).toContain(BOS_T2_ISSUE);
    expect(approvedMd).toContain("decision, packet_emission");
    expect(approvedMd).toContain("25,000");

    // Denied
    const deniedMd = serializeGrantDecisionToMarkdown(BOS_T2_ISSUE, {
      status: "denied",
      decision_id: "gdec_denied_001",
      rationale: "External access blocked",
      reason: "Division Div4.Production cannot receive external-world access.",
    });
    expect(deniedMd).toContain("DENIED");
    expect(deniedMd).toContain("Div4.Production");

    // Escalated
    const escalatedMd = serializeGrantDecisionToMarkdown(BOS_T2_ISSUE, {
      status: "escalate",
      decision_id: "gdec_escalated_001",
      rationale: "Cost exceeds limit",
      escalation_target: "Div1.HCO",
      reason: "Exceeds auto-approve limit",
    });
    expect(escalatedMd).toContain("ESCALATE");
    expect(escalatedMd).toContain("Div1.HCO");
  });

  it("mirrorGrantDecisionToComment handles adapter failure gracefully", async () => {
    const failingAdapter: InMemoryPaperclipAdapter = {
      ...adapter,
      addIssueComment: async () => { throw new Error("Paperclip API unavailable"); },
    } as any;

    const result = await mirrorGrantDecisionToComment(failingAdapter, BOS_T2_ISSUE, {
      status: "approved",
      decision_id: "gdec_001",
      rationale: "test",
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("Paperclip API unavailable");
    expect(result.comment_id).toBeNull();
  });

  it("mirrorMetadataToComment handles adapter failure gracefully", async () => {
    metadataStore.create({
      issue_id: BOS_T2_ISSUE,
      mission_id: BOS_T2_MISSION,
      title: BOS_T2_TITLE,
    });

    const failingAdapter: InMemoryPaperclipAdapter = {
      ...adapter,
      addIssueComment: async () => { throw new Error("Network timeout"); },
    } as any;

    const metadata = metadataStore.get(BOS_T2_ISSUE)!;
    const result = await mirrorMetadataToComment(failingAdapter, metadata);

    expect(result.success).toBe(false);
    expect(result.error).toContain("Network timeout");
    expect(result.comment_id).toBeNull();
  });
});
