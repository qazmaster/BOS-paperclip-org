/**
 * E2E Live Test: BOS-T1 CLEAR Routing
 *
 * Processes BOS-T1 through the full live plugin routing pipeline:
 * Issue intake → MissionEnvelope → MissionSignals → MissionRouter →
 * DivisionPacketRouter → Grant Policy → Metadata Mirror
 *
 * Verifies:
 * 1. BOS-T1 routes deterministically to Div4.Production (CLEAR path)
 * 2. Grant auto-approved for routine implementation
 * 3. Routing decision log contains complete audit trail
 * 4. Metadata mirror reflects correct assignment and grant lifecycle
 *
 * "Live" = exercises the full routing pipeline without mocking
 *          (uses in-memory adapters to avoid Paperclip network calls).
 */
import { describe, it, expect, beforeEach } from "vitest";
import {
  missionRouterIssueCreatedHandler,
  issueCreatedToMissionEnvelope,
  getRoutingDecisionLog,
  clearRoutingDecisionLog,
  getPacketsForIssue,
  getRoutingPacketSummary,
  createBosLightHookManager,
  type IssueCreatedPayload,
  type IssueLifecycleHookEvent,
} from "../src/issueLifecycleHooks";
import { clearPacketRouter, getDivisionInbox } from "../src/divisionPacketRouter";
import { validateGrantRequest } from "../src/grantPolicy";
import { InMemoryGrantLedger, createBudgetGrant, createAccessGrant } from "../src/grantLedger";
import { BosTaskMetadataStore, type BosTaskGrantRef } from "../src/bosTaskMetadata";
import { serializeMetadataToMarkdown, mirrorMetadataToComment } from "../src/metadataMirror";
import { InMemoryPaperclipAdapter } from "../src/paperclipAdapter";
import type { MissionRoutingState, MissionRouterUnauthorized, GrantRequest } from "../src/contracts";

// ─── Constants ────────────────────────────────────────────────────────────────

const BOS_T1_ISSUE = "issue-bos-t1-e2e";
const BOS_T1_IDENTIFIER = "BOS-T1";
const BOS_T1_COMPANY = "company-bos";
const BOS_T1_PROJECT = "proj-bos";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeBosT1Payload(overrides: Partial<IssueCreatedPayload> = {}): IssueCreatedPayload {
  return {
    issueId: BOS_T1_ISSUE,
    companyId: BOS_T1_COMPANY,
    identifier: BOS_T1_IDENTIFIER,
    title: "Implement authentication flow",
    description: "Build the login and registration code for the application",
    status: "open",
    priority: "high",
    projectId: BOS_T1_PROJECT,
    createdAt: "2026-06-02T12:00:00.000Z",
    ...overrides,
  };
}

function makeBosT1Event(overrides: Partial<IssueCreatedPayload> = {}): IssueLifecycleHookEvent {
  return {
    eventType: "issue.created",
    eventId: "evt-bos-t1-e2e",
    occurredAt: "2026-06-02T12:00:00.000Z",
    payload: makeBosT1Payload(overrides),
    actor: { type: "user", id: "user-bos" },
  };
}

function isRoutingState(r: MissionRoutingState | MissionRouterUnauthorized): r is MissionRoutingState {
  return "status" in r && r.status === "ROUTED";
}

// ─── BOS-T1 E2E Live Routing ─────────────────────────────────────────────────

describe("E2E Live: BOS-T1 CLEAR Routing", () => {
  beforeEach(() => {
    clearPacketRouter();
    clearRoutingDecisionLog();
  });

  // ── 1. Deterministic Routing to Div4.Production ────────────────────────────

  describe("Deterministic routing to Div4.Production", () => {
    it("routes BOS-T1 to Div4.Production via MissionRouter", async () => {
      const event = makeBosT1Event();
      const result = await missionRouterIssueCreatedHandler(event);

      expect(result.handled).toBe(true);
      expect(result.message).toContain("Div4.Production");
      expect(result.message).toContain(BOS_T1_IDENTIFIER);

      const log = getRoutingDecisionLog();
      expect(log).toHaveLength(1);

      const routingResult = log[0].routingResult as MissionRoutingState;
      expect(routingResult.status).toBe("ROUTED");
      expect(routingResult.activated_divisions).toContain("Div4.Production");
      expect(routingResult.current_division).toBe("Div4.Production");
    });

    it("does NOT trigger two-pass (Div7 executive decision) for CLEAR task", async () => {
      const event = makeBosT1Event();
      await missionRouterIssueCreatedHandler(event);

      const log = getRoutingDecisionLog();
      expect(log[0].twoPassRouting).toBeUndefined();

      // Div7 should NOT be in activated divisions (only in status_update oversight)
      const routingResult = log[0].routingResult as MissionRoutingState;
      expect(routingResult.activated_divisions).not.toContain("Div7.MissionControl");
    });

    it("derives implementation routing rule for BOS-T1", async () => {
      const event = makeBosT1Event();
      await missionRouterIssueCreatedHandler(event);

      const log = getRoutingDecisionLog();
      const routingResult = log[0].routingResult as MissionRoutingState;

      // Single activated division (Div4) = "implementation" rule
      expect(routingResult.activated_divisions).toHaveLength(1);
      expect(routingResult.activated_divisions[0]).toBe("Div4.Production");
    });

    it("delivers work_assignment packet to Div4.Production inbox", async () => {
      const event = makeBosT1Event();
      await missionRouterIssueCreatedHandler(event);

      const div4Inbox = getDivisionInbox("Div4.Production");
      expect(div4Inbox.length).toBeGreaterThanOrEqual(1);

      const workPacket = div4Inbox.find(p => p.packet_type === "work_assignment");
      expect(workPacket).toBeDefined();
      expect(workPacket!.to_division).toBe("Div4.Production");
      expect(workPacket!.from_division).toBe("Div1.HCO");
    });

    it("delivers status_update to Div7.MissionControl for oversight", async () => {
      const event = makeBosT1Event();
      await missionRouterIssueCreatedHandler(event);

      const div7Inbox = getDivisionInbox("Div7.MissionControl");
      expect(div7Inbox.length).toBeGreaterThanOrEqual(1);

      const statusPacket = div7Inbox.find(p => p.packet_type === "status_update");
      expect(statusPacket).toBeDefined();
      expect(statusPacket!.to_division).toBe("Div7.MissionControl");
    });

    it("routes consistently across multiple invocations (determinism)", async () => {
      const manager = createBosLightHookManager();

      for (let i = 0; i < 5; i++) {
        clearPacketRouter();
        clearRoutingDecisionLog();

        const event = makeBosT1Event({
          issueId: `issue-bos-t1-det-${i}`,
          identifier: `BOS-T1-${i}`,
        });
        await missionRouterIssueCreatedHandler(event);

        const log = getRoutingDecisionLog();
        const result = log[0].routingResult as MissionRoutingState;
        expect(result.activated_divisions).toContain("Div4.Production");
        expect(result.current_division).toBe("Div4.Production");
      }
    });
  });

  // ── 2. Grant Auto-Approved ────────────────────────────────────────────────

  describe("Grant auto-approved for CLEAR task", () => {
    it("auto-approves grant request for Div4 routine implementation", () => {
      const request: GrantRequest = {
        schema_version: "1.0",
        requested_by: "Div1.HCO",
        target_division: "Div4.Production",
        mission_id: BOS_T1_ISSUE,
        paperclip_task_id: BOS_T1_ISSUE,
        purpose: "Execute BOS-T1 implementation",
        requested_tools: ["repo_read", "repo_write", "test_runner", "build"],
        requested_secrets: [],
        estimated_cost: 50_000,
        risk_level: "LOW",
        ttl_minutes: 120,
        requested_at: new Date().toISOString(),
      };

      const decision = validateGrantRequest(request);

      expect(decision.status).toBe("approved");
      if (decision.status !== "approved") throw new Error("Expected approved");
      expect(decision.allowed_tools).toContain("repo_read");
      expect(decision.allowed_tools).toContain("repo_write");
      expect(decision.allowed_tools).toContain("test_runner");
      expect(decision.allowed_tools).toContain("build");
      expect(decision.token_cap).toBe(50_000);
    });

    it("creates BudgetGrant from auto-approved decision", () => {
      const request: GrantRequest = {
        schema_version: "1.0",
        requested_by: "Div1.HCO",
        target_division: "Div4.Production",
        mission_id: BOS_T1_ISSUE,
        purpose: "Execute BOS-T1 implementation",
        requested_tools: ["repo_read", "repo_write", "test_runner"],
        requested_secrets: [],
        estimated_cost: 50_000,
        risk_level: "LOW",
        ttl_minutes: 120,
        requested_at: new Date().toISOString(),
      };

      const decision = validateGrantRequest(request);
      if (decision.status !== "approved") throw new Error("Expected approved");

      const budgetGrant = createBudgetGrant(request, decision);

      expect(budgetGrant.schema_version).toBe("1.0");
      expect(budgetGrant.grant_type).toBe("BUDGET_GRANT");
      expect(budgetGrant.mission_id).toBe(BOS_T1_ISSUE);
      expect(budgetGrant.target_division).toBe("Div4.Production");
      expect(budgetGrant.token_cap).toBe(50_000);
      expect(budgetGrant.granted_by).toBe("Div3.Treasury");
      expect(budgetGrant.requires_qa).toBe(true);
    });

    it("creates AccessGrant from auto-approved decision", () => {
      const request: GrantRequest = {
        schema_version: "1.0",
        requested_by: "Div1.HCO",
        target_division: "Div4.Production",
        mission_id: BOS_T1_ISSUE,
        purpose: "Execute BOS-T1 implementation",
        requested_tools: ["repo_read", "repo_write", "test_runner"],
        requested_secrets: [],
        estimated_cost: 50_000,
        risk_level: "LOW",
        ttl_minutes: 120,
        requested_at: new Date().toISOString(),
      };

      const decision = validateGrantRequest(request);
      if (decision.status !== "approved") throw new Error("Expected approved");

      const accessGrant = createAccessGrant(request, decision);

      expect(accessGrant.grant_type).toBe("ACCESS_GRANT");
      expect(accessGrant.target_division).toBe("Div4.Production");
      expect(accessGrant.adapter_scope).toBe("Div4.Production");
      expect(accessGrant.granted_by).toBe("Div3.Treasury");
    });

    it("tracks grant in ledger for BOS-T1 mission", () => {
      const ledger = new InMemoryGrantLedger();

      const request: GrantRequest = {
        schema_version: "1.0",
        requested_by: "Div1.HCO",
        target_division: "Div4.Production",
        mission_id: BOS_T1_ISSUE,
        purpose: "Execute BOS-T1 implementation",
        requested_tools: ["repo_read", "repo_write", "test_runner"],
        requested_secrets: [],
        estimated_cost: 50_000,
        risk_level: "LOW",
        ttl_minutes: 120,
        requested_at: new Date().toISOString(),
      };

      const decision = validateGrantRequest(request);
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

      const entries = ledger.getByMission(BOS_T1_ISSUE);
      expect(entries).toHaveLength(1);
      expect(entries[0].tokenCap).toBe(50_000);
      expect(entries[0].revoked).toBe(false);
      expect(entries[0].targetDivision).toBe("Div4.Production");
    });
  });

  // ── 3. Routing Decision Log Audit Trail ────────────────────────────────────

  describe("Routing decision log audit trail", () => {
    it("logs complete metadata for BOS-T1 routing", async () => {
      const event = makeBosT1Event();
      await missionRouterIssueCreatedHandler(event);

      const log = getRoutingDecisionLog();
      expect(log).toHaveLength(1);

      const entry = log[0];
      expect(entry.issueId).toBe(BOS_T1_ISSUE);
      expect(entry.identifier).toBe(BOS_T1_IDENTIFIER);
      expect(entry.missionId).toBe(BOS_T1_ISSUE);
      expect(entry.signals).toBeDefined();
      expect(entry.routingResult).toBeDefined();
      expect(entry.packetDeliveries).toBeDefined();
      expect(entry.routedAt).toBeDefined();
    });

    it("includes MissionSignals in audit trail", async () => {
      const event = makeBosT1Event();
      await missionRouterIssueCreatedHandler(event);

      const log = getRoutingDecisionLog();
      const { signals } = log[0];

      expect(signals.taskClass).toBe("technical");
      expect(signals.requiresImplementation).toBe(true);
      expect(signals.riskLevel).toBe("HIGH"); // high priority → HIGH risk
      expect(signals.requiresQA).toBe(false); // no QA keywords
      expect(typeof signals.ambiguityLevel).toBe("string");
    });

    it("includes packet delivery records with traceability", async () => {
      const event = makeBosT1Event();
      await missionRouterIssueCreatedHandler(event);

      const log = getRoutingDecisionLog();
      const { packetDeliveries } = log[0];

      expect(packetDeliveries.length).toBeGreaterThan(0);

      const div4Delivery = packetDeliveries.find(d => d.toDivision === "Div4.Production");
      expect(div4Delivery).toBeDefined();
      expect(div4Delivery!.packetType).toBe("work_assignment");
      expect(div4Delivery!.fromDivision).toBe("Div1.HCO");
      expect(div4Delivery!.packetId).toMatch(/^pkt_/);
      expect(div4Delivery!.deliveredAt).toBeDefined();
    });

    it("packets are traceable via getPacketsForIssue", async () => {
      const event = makeBosT1Event();
      await missionRouterIssueCreatedHandler(event);

      const packets = getPacketsForIssue(BOS_T1_ISSUE);
      expect(packets.length).toBeGreaterThanOrEqual(1);

      const div4Packet = packets.find(p => p.toDivision === "Div4.Production");
      expect(div4Packet).toBeDefined();
      expect(div4Packet!.packetType).toBe("work_assignment");
    });

    it("packet summary reflects BOS-T1 routing", async () => {
      await missionRouterIssueCreatedHandler(makeBosT1Event());

      const summary = getRoutingPacketSummary();
      expect(summary.has("Div4.Production")).toBe(true);

      const div4Info = summary.get("Div4.Production")!;
      expect(div4Info.count).toBeGreaterThanOrEqual(1);
      expect(div4Info.latestPacketId).toMatch(/^pkt_/);
    });

    it("timestamps are valid ISO format", async () => {
      await missionRouterIssueCreatedHandler(makeBosT1Event());

      const log = getRoutingDecisionLog();
      const { routedAt } = log[0];
      const parsed = new Date(routedAt);
      expect(parsed.getTime()).not.toBeNaN();
    });
  });

  // ── 4. Metadata Mirror ─────────────────────────────────────────────────────

  describe("Metadata mirror for BOS-T1", () => {
    it("creates BosTaskMetadata with correct assignment", () => {
      const store = new BosTaskMetadataStore();

      const metadata = store.create({
        issue_id: BOS_T1_ISSUE,
        mission_id: BOS_T1_ISSUE,
        title: "Implement authentication flow",
        assigned_division: "Div4.Production",
        risk_level: "HIGH",
        phase: "granted",
      });

      expect(metadata.issue_id).toBe(BOS_T1_ISSUE);
      expect(metadata.assigned_division).toBe("Div4.Production");
      expect(metadata.risk_level).toBe("HIGH");
      expect(metadata.phase).toBe("granted");
    });

    it("serializes metadata to markdown with grant info", () => {
      const store = new BosTaskMetadataStore();

      const metadata = store.create({
        issue_id: BOS_T1_ISSUE,
        mission_id: BOS_T1_ISSUE,
        title: "Implement authentication flow",
        assigned_division: "Div4.Production",
        risk_level: "HIGH",
        phase: "intake",
      });

      // Attach grant ref via the store's attachGrant method
      const grantRef: BosTaskGrantRef = {
        grant_id: "grant_bos_t1_001",
        grant_type: "BUDGET_GRANT",
        status: "active",
        issued_at: "2026-06-02T12:00:00.000Z",
        expires_at: "2026-06-02T14:00:00.000Z",
        token_cap: 50_000,
        allowed_tools: ["repo_read", "repo_write", "test_runner"],
      };
      store.attachGrant(BOS_T1_ISSUE, grantRef, "Div3.Treasury");

      const updated = store.get(BOS_T1_ISSUE)!;
      const markdown = serializeMetadataToMarkdown(updated);

      expect(markdown).toContain("# BOS Task Metadata");
      expect(markdown).toContain(BOS_T1_ISSUE);
      expect(markdown).toContain("Div4.Production");
      expect(markdown).toContain("granted");
      expect(markdown).toContain("BUDGET_GRANT");
      expect(markdown).toContain("50,000");
      expect(markdown).toContain("repo_read");
    });

    it("mirrors metadata to Paperclip comment via adapter", async () => {
      const adapter = new InMemoryPaperclipAdapter();
      const store = new BosTaskMetadataStore();

      const metadata = store.create({
        issue_id: BOS_T1_ISSUE,
        mission_id: BOS_T1_ISSUE,
        title: "Implement authentication flow",
        assigned_division: "Div4.Production",
        risk_level: "HIGH",
        phase: "intake",
      });

      const grantRef: BosTaskGrantRef = {
        grant_id: "grant_bos_t1_001",
        grant_type: "BUDGET_GRANT",
        status: "active",
        issued_at: "2026-06-02T12:00:00.000Z",
        expires_at: "2026-06-02T14:00:00.000Z",
        token_cap: 50_000,
        allowed_tools: ["repo_read", "repo_write", "test_runner"],
      };
      store.attachGrant(BOS_T1_ISSUE, grantRef, "Div3.Treasury");

      const updated = store.get(BOS_T1_ISSUE)!;
      const result = await mirrorMetadataToComment(adapter, updated);

      expect(result.success).toBe(true);
      expect(result.issue_id).toBe(BOS_T1_ISSUE);
      expect(result.comment_id).toBeDefined();
      expect(result.error).toBeUndefined();
    });

    it("audit trail records routing and grant events", () => {
      const store = new BosTaskMetadataStore();

      const metadata = store.create({
        issue_id: BOS_T1_ISSUE,
        mission_id: BOS_T1_ISSUE,
        title: "Implement authentication flow",
        assigned_division: "Div4.Production",
        risk_level: "HIGH",
        phase: "intake",
      });

      // Attach grant (which adds a grant.attached audit entry and sets phase to granted)
      const grantRef: BosTaskGrantRef = {
        grant_id: "grant_bos_t1_001",
        grant_type: "BUDGET_GRANT",
        status: "active",
        issued_at: "2026-06-02T12:00:00.000Z",
        expires_at: "2026-06-02T14:00:00.000Z",
        token_cap: 50_000,
        allowed_tools: ["repo_read", "repo_write", "test_runner"],
      };
      store.attachGrant(BOS_T1_ISSUE, grantRef, "Div3.Treasury");

      const updated = store.get(BOS_T1_ISSUE)!;
      expect(updated.phase).toBe("granted");

      // Verify audit trail contains created + grant.attached
      expect(updated.audit_trail.length).toBeGreaterThanOrEqual(2);

      const createdEntry = updated.audit_trail.find(e => e.event === "metadata.created");
      expect(createdEntry).toBeDefined();

      const grantEntry = updated.audit_trail.find(e => e.event === "grant.attached");
      expect(grantEntry).toBeDefined();
      expect(grantEntry!.detail).toContain("grant_bos_t1_001");
      expect(grantEntry!.detail).toContain("50000");
    });
  });

  // ── 5. Full E2E Integration ────────────────────────────────────────────────

  describe("Full E2E: BOS-T1 intake → route → grant → mirror", () => {
    it("complete flow: issue create → MissionRouter → Div4 packet → grant → metadata", async () => {
      const manager = createBosLightHookManager();
      const ledger = new InMemoryGrantLedger();
      const metadataStore = new BosTaskMetadataStore();
      const adapter = new InMemoryPaperclipAdapter();

      // Step 1: Dispatch BOS-T1 through hook manager
      const event = makeBosT1Event();
      const hookLogs = await manager.dispatchEvent(event);

      // Verify both hooks fired
      expect(hookLogs).toHaveLength(2);
      const routerLog = hookLogs.find(l => l.handlerName === "bos-light-mission-router");
      expect(routerLog).toBeDefined();
      expect(routerLog!.result.handled).toBe(true);

      // Step 2: Verify routing decision
      const decisionLog = getRoutingDecisionLog();
      expect(decisionLog).toHaveLength(1);

      const entry = decisionLog[0];
      expect(entry.issueId).toBe(BOS_T1_ISSUE);
      expect(entry.identifier).toBe(BOS_T1_IDENTIFIER);

      const routingResult = entry.routingResult as MissionRoutingState;
      expect(routingResult.status).toBe("ROUTED");
      expect(routingResult.activated_divisions).toContain("Div4.Production");
      expect(routingResult.current_division).toBe("Div4.Production");

      // Step 3: Verify packet delivery
      const div4Inbox = getDivisionInbox("Div4.Production");
      expect(div4Inbox.length).toBeGreaterThanOrEqual(1);

      const workPacket = div4Inbox.find(p => p.packet_type === "work_assignment");
      expect(workPacket).toBeDefined();
      expect(workPacket!.to_division).toBe("Div4.Production");
      expect(workPacket!.from_division).toBe("Div1.HCO");

      // Step 4: Request and receive auto-approved grant
      const grantRequest: GrantRequest = {
        schema_version: "1.0",
        requested_by: "Div1.HCO",
        target_division: "Div4.Production",
        mission_id: BOS_T1_ISSUE,
        paperclip_task_id: BOS_T1_ISSUE,
        purpose: "Execute BOS-T1 implementation",
        requested_tools: ["repo_read", "repo_write", "test_runner", "build"],
        requested_secrets: [],
        estimated_cost: 50_000,
        risk_level: "LOW",
        ttl_minutes: 120,
        requested_at: new Date().toISOString(),
      };

      const grantDecision = validateGrantRequest(grantRequest);
      expect(grantDecision.status).toBe("approved");
      if (grantDecision.status !== "approved") throw new Error("Expected approved");

      const budgetGrant = createBudgetGrant(grantRequest, grantDecision);

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

      // Step 5: Create and mirror metadata
      const metadata = metadataStore.create({
        issue_id: BOS_T1_ISSUE,
        mission_id: BOS_T1_ISSUE,
        title: "Implement authentication flow",
        assigned_division: "Div4.Production",
        risk_level: "HIGH",
        phase: "intake",
      });

      // Attach grant via store API (sets phase to granted, adds audit entry)
      const grantRef: BosTaskGrantRef = {
        grant_id: budgetGrant.grant_id,
        grant_type: "BUDGET_GRANT",
        status: "active",
        issued_at: budgetGrant.granted_at,
        expires_at: budgetGrant.expires_at,
        token_cap: budgetGrant.token_cap,
        allowed_tools: grantDecision.allowed_tools,
      };
      metadataStore.attachGrant(BOS_T1_ISSUE, grantRef, "Div3.Treasury");

      const updatedMetadata = metadataStore.get(BOS_T1_ISSUE)!;
      const mirrorResult = await mirrorMetadataToComment(adapter, updatedMetadata);

      expect(mirrorResult.success).toBe(true);
      expect(mirrorResult.issue_id).toBe(BOS_T1_ISSUE);

      // Step 6: Verify full state
      const ledgerEntries = ledger.getByMission(BOS_T1_ISSUE);
      expect(ledgerEntries).toHaveLength(1);
      expect(ledgerEntries[0].targetDivision).toBe("Div4.Production");
      expect(ledgerEntries[0].revoked).toBe(false);

      expect(updatedMetadata.phase).toBe("granted");
      expect(updatedMetadata.assigned_division).toBe("Div4.Production");
      expect(updatedMetadata.grant_ref).toBeDefined();
      expect(updatedMetadata.grant_ref!.status).toBe("active");
      expect(updatedMetadata.audit_trail.length).toBeGreaterThanOrEqual(2);

      // Verify packet traceability
      const tracedPackets = getPacketsForIssue(BOS_T1_ISSUE);
      expect(tracedPackets.length).toBe(entry.packetDeliveries.length);
    });
  });
});
