import { describe, it, expect, beforeEach } from "vitest";
import { DryRunPaperclipTaskPort } from "../src/dryRunPaperclipTaskPort";
import { InMemoryBosTaskMetadataStorage, createBosTaskMetadata } from "../src/bosTaskMetadata";
import { formatBosMetadataComment, parseBosMetadataComment, hasBosMetadata } from "../src/metadataMirror";
import { decide, delegateDecisionToDiv1, createDecisionDelegated } from "../src/decision";
import { routeAfterDecision } from "../src/missionRouter";
import { clearPacketRouter } from "../src/divisionPacketRouter";
import type { Division } from "../src/contracts";

describe("PaperclipAction Mapper", () => {
  let port: DryRunPaperclipTaskPort;

  beforeEach(() => {
    port = new DryRunPaperclipTaskPort();
  });

  it("createIssue returns deterministic issue ref", async () => {
    const ref = await port.createIssue({
      idempotencyKey: "key_1",
      title: "Test issue",
      description: "Test description",
      assigneeDivision: "Div4.Production",
      labels: ["bos-light", "division:Div4.Production"],
      metadata: { routingRule: "implementation" },
    });

    expect(ref.issueId).toMatch(/^dry_run_issue_\d+$/);
    expect(ref.issueNumber).toBeGreaterThan(0);
    expect(ref.url).toContain("paperclip.example");
  });

  it("getEmittedActions returns all actions", async () => {
    await port.createIssue({
      idempotencyKey: "key_1",
      title: "Issue 1",
      description: "Desc 1",
      assigneeDivision: "Div2.MasterPlanner",
      labels: [],
      metadata: {},
    });

    await port.addComment({
      idempotencyKey: "key_2",
      issueId: "dry_run_issue_1",
      body: "Comment body",
    });

    const actions = port.getEmittedActions();
    expect(actions).toHaveLength(2);
    expect(actions[0].actionType).toBe("create_issue");
    expect(actions[1].actionType).toBe("add_comment");
  });

  it("getActionsByType filters correctly", async () => {
    await port.createIssue({
      idempotencyKey: "key_1",
      title: "Issue 1",
      description: "Desc 1",
      assigneeDivision: "Div4.Production",
      labels: [],
      metadata: {},
    });

    await port.addComment({
      idempotencyKey: "key_2",
      issueId: "dry_run_issue_1",
      body: "Comment",
    });

    expect(port.getActionsByType("create_issue")).toHaveLength(1);
    expect(port.getActionsByType("add_comment")).toHaveLength(1);
    expect(port.getActionsByType("update_issue")).toHaveLength(0);
  });

  it("getActionsByDivision filters correctly", async () => {
    await port.createIssue({
      idempotencyKey: "key_1",
      title: "Div4 issue",
      description: "Desc",
      assigneeDivision: "Div4.Production",
      labels: [],
      metadata: {},
    });

    await port.createIssue({
      idempotencyKey: "key_2",
      title: "Div5 issue",
      description: "Desc",
      assigneeDivision: "Div5.QualificationsLibraryLearning",
      labels: [],
      metadata: {},
    });

    expect(port.getActionsByDivision("Div4.Production")).toHaveLength(1);
    expect(port.getActionsByDivision("Div5.QualificationsLibraryLearning")).toHaveLength(1);
    expect(port.getActionsByDivision("Div2.MasterPlanner")).toHaveLength(0);
  });
});

describe("BosTaskMetadata", () => {
  let storage: InMemoryBosTaskMetadataStorage;

  beforeEach(() => {
    storage = new InMemoryBosTaskMetadataStorage();
  });

  it("createBosTaskMetadata creates metadata with defaults", () => {
    const metadata = createBosTaskMetadata(
      "mission_001",
      "Div4.Production",
      ["Div2.MasterPlanner", "Div4.Production", "Div5.QualificationsLibraryLearning"]
    );

    expect(metadata.schemaVersion).toBe("bos-light.metadata.v1");
    expect(metadata.bosMissionId).toBe("mission_001");
    expect(metadata.currentDivision).toBe("Div4.Production");
    expect(metadata.routingPhase).toBe("operational");
    expect(metadata.qaRequired).toBe(false);
  });

  it("storage get/set/delete works", () => {
    const metadata = createBosTaskMetadata("mission_001", "Div4.Production", []);

    storage.set("issue_1", metadata);
    expect(storage.get("issue_1")).toEqual(metadata);

    storage.delete("issue_1");
    expect(storage.get("issue_1")).toBeUndefined();
  });

  it("storage getByMission returns matching entries", () => {
    const metadata1 = createBosTaskMetadata("mission_001", "Div2.MasterPlanner", []);
    const metadata2 = createBosTaskMetadata("mission_001", "Div4.Production", []);
    const metadata3 = createBosTaskMetadata("mission_002", "Div5.QualificationsLibraryLearning", []);

    storage.set("issue_1", metadata1);
    storage.set("issue_2", metadata2);
    storage.set("issue_3", metadata3);

    const results = storage.getByMission("mission_001");
    expect(results).toHaveLength(2);
    expect(results.map(r => r.issueId)).toContain("issue_1");
    expect(results.map(r => r.issueId)).toContain("issue_2");
  });
});

describe("Metadata Mirror", () => {
  it("format then parse round-trips correctly", () => {
    const metadata = createBosTaskMetadata(
      "mission_001",
      "Div4.Production",
      ["Div2.MasterPlanner", "Div4.Production"],
      {
        cynefinDomain: "COMPLEX",
        decisionId: "decision_001",
        qaRequired: true,
      }
    );

    const comment = formatBosMetadataComment(metadata);
    expect(hasBosMetadata(comment)).toBe(true);

    const parsed = parseBosMetadataComment(comment);
    expect(parsed).not.toBeNull();
    expect(parsed!.bosMissionId).toBe("mission_001");
    expect(parsed!.cynefinDomain).toBe("COMPLEX");
    expect(parsed!.qaRequired).toBe(true);
  });

  it("parseBosMetadataComment returns null for invalid comment", () => {
    expect(parseBosMetadataComment("no metadata here")).toBeNull();
    expect(parseBosMetadataComment("<!-- BOS_LIGHT_METADATA_START --> broken")).toBeNull();
  });

  it("hasBosMetadata detects metadata blocks", () => {
    const metadata = createBosTaskMetadata("m1", "Div4.Production", []);
    const comment = formatBosMetadataComment(metadata);

    expect(hasBosMetadata(comment)).toBe(true);
    expect(hasBosMetadata("regular comment")).toBe(false);
  });
});

describe("Full routing to PaperclipAction to metadata flow", () => {
  beforeEach(() => {
    clearPacketRouter();
  });

  it("COMPLEX mission: Div7 -> DecisionDelegated -> Div1 -> operational actions", () => {
    // Step 1: Div7 makes COMPLEX decision
    const decision = decide({
      issue_id: "test_mission",
      signals: ["experiment strategy hypothesis ambiguous"],
      confidence: 0.7,
    });

    expect(decision.accepted).toBe(true);
    if (!decision.accepted) throw new Error("Expected accepted decision");

    // Step 2: Create DecisionDelegated
    const delegated = createDecisionDelegated(decision);
    expect(delegated.cynefin_domain).toBe("COMPLEX");
    expect(delegated.routing_directive.targetDivisions).toContain("Div2.MasterPlanner");
    expect(delegated.routing_directive.targetDivisions).toContain("Div4.Production");

    // Step 3: Div1 routes operationally
    const result = routeAfterDecision("Div1.HCO", "test_mission", delegated);
    expect("status" in result).toBe(true);

    // Step 4: Create BosTaskMetadata for each target division
    const storage = new InMemoryBosTaskMetadataStorage();
    const port = new DryRunPaperclipTaskPort();

    for (const division of delegated.routing_directive.targetDivisions) {
      const metadata = createBosTaskMetadata("test_mission", division, delegated.required_followup_divisions, {
        cynefinDomain: delegated.cynefin_domain,
        decisionId: delegated.decision_id,
        routingPhase: "post_div7_decision",
        qaRequired: delegated.routing_directive.requiresQA,
      });

      storage.set(`issue_${division}`, metadata);

      // Create dry-run action
      port.createIssue({
        idempotencyKey: `key_${division}`,
        title: `[${division}] Test mission task`,
        description: `Task for ${division}`,
        assigneeDivision: division,
        labels: ["bos-light", `division:${division}`, `route:${delegated.routing_directive.routingRule}`],
        metadata: { bosMetadata: metadata },
      });
    }

    // Verify actions
    const actions = port.getEmittedActions();
    expect(actions.length).toBeGreaterThanOrEqual(3); // Div2, Div4, Div5

    // Verify metadata
    const missionMetadata = storage.getByMission("test_mission");
    expect(missionMetadata.length).toBeGreaterThanOrEqual(3);

    // Verify mirror format
    const firstMetadata = missionMetadata[0].metadata;
    const comment = formatBosMetadataComment(firstMetadata);
    expect(hasBosMetadata(comment)).toBe(true);

    const parsed = parseBosMetadataComment(comment);
    expect(parsed!.bosMissionId).toBe("test_mission");
    expect(parsed!.cynefinDomain).toBe("COMPLEX");
  });
});
