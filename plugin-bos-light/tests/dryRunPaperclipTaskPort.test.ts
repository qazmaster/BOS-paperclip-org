import { describe, expect, it } from "vitest";
import { DryRunPaperclipTaskPort } from "../src/dryRunPaperclipTaskPort";
import type { CreateIssueInput, UpdateIssueInput, AddCommentInput, CreateChildIssueInput } from "../src/paperclipTaskPort";

describe("DryRunPaperclipTaskPort", () => {
  it("creates issues with deterministic IDs", async () => {
    const port = new DryRunPaperclipTaskPort();
    const input: CreateIssueInput = {
      idempotencyKey: "key_1",
      title: "Test Issue",
      description: "Test description",
      assigneeDivision: "Div4.Production",
      labels: ["feature"],
      metadata: { priority: "high" }
    };

    const ref = await port.createIssue(input);

    expect(ref.issueId).toBe("dry_run_issue_1");
    expect(ref.issueNumber).toBe(1);
    expect(ref.url).toContain("issues/1");
  });

  it("increments issue counter", async () => {
    const port = new DryRunPaperclipTaskPort();

    const ref1 = await port.createIssue({
      idempotencyKey: "key_1",
      title: "Issue 1",
      description: "Desc 1",
      assigneeDivision: "Div4.Production",
      labels: [],
      metadata: {}
    });

    const ref2 = await port.createIssue({
      idempotencyKey: "key_2",
      title: "Issue 2",
      description: "Desc 2",
      assigneeDivision: "Div1.HCO",
      labels: [],
      metadata: {}
    });

    expect(ref1.issueNumber).toBe(1);
    expect(ref2.issueNumber).toBe(2);
  });

  it("records create_issue actions", async () => {
    const port = new DryRunPaperclipTaskPort();
    await port.createIssue({
      idempotencyKey: "key_1",
      title: "Test Issue",
      description: "Test description",
      assigneeDivision: "Div4.Production",
      labels: ["feature"],
      metadata: { priority: "high" }
    });

    const actions = port.getEmittedActions();
    expect(actions).toHaveLength(1);
    expect(actions[0].actionType).toBe("create_issue");
    expect(actions[0].title).toBe("Test Issue");
    expect(actions[0].targetDivision).toBe("Div4.Production");
  });

  it("records update_issue actions", async () => {
    const port = new DryRunPaperclipTaskPort();
    const input: UpdateIssueInput = {
      idempotencyKey: "key_1",
      issueId: "issue_1",
      title: "Updated Title",
      labels: ["bug"]
    };

    await port.updateIssue(input);

    const actions = port.getActionsByType("update_issue");
    expect(actions).toHaveLength(1);
    expect(actions[0].issueId).toBe("issue_1");
    expect(actions[0].title).toBe("Updated Title");
  });

  it("records add_comment actions", async () => {
    const port = new DryRunPaperclipTaskPort();
    const input: AddCommentInput = {
      idempotencyKey: "key_1",
      issueId: "issue_1",
      body: "This is a comment"
    };

    await port.addComment(input);

    const actions = port.getActionsByType("add_comment");
    expect(actions).toHaveLength(1);
    expect(actions[0].issueId).toBe("issue_1");
    expect(actions[0].body).toBe("This is a comment");
  });

  it("creates child issues", async () => {
    const port = new DryRunPaperclipTaskPort();
    const input: CreateChildIssueInput = {
      idempotencyKey: "key_1",
      parentIssueId: "parent_1",
      title: "Child Issue",
      description: "Child description",
      assigneeDivision: "Div5.QualificationsLibraryLearning",
      labels: ["subtask"],
      metadata: {}
    };

    const ref = await port.createChildIssue(input);

    expect(ref.issueId).toBe("dry_run_child_1");
    expect(ref.issueNumber).toBe(1);

    const actions = port.getActionsByType("create_child_issue");
    expect(actions).toHaveLength(1);
    expect(actions[0].parentIssueId).toBe("parent_1");
  });

  it("filters actions by division", async () => {
    const port = new DryRunPaperclipTaskPort();

    await port.createIssue({
      idempotencyKey: "key_1",
      title: "Issue 1",
      description: "Desc 1",
      assigneeDivision: "Div4.Production",
      labels: [],
      metadata: {}
    });

    await port.createIssue({
      idempotencyKey: "key_2",
      title: "Issue 2",
      description: "Desc 2",
      assigneeDivision: "Div1.HCO",
      labels: [],
      metadata: {}
    });

    const div4Actions = port.getActionsByDivision("Div4.Production");
    expect(div4Actions).toHaveLength(1);
    expect(div4Actions[0].title).toBe("Issue 1");
  });

  it("clears actions and resets counter", async () => {
    const port = new DryRunPaperclipTaskPort();

    await port.createIssue({
      idempotencyKey: "key_1",
      title: "Issue 1",
      description: "Desc 1",
      assigneeDivision: "Div4.Production",
      labels: [],
      metadata: {}
    });

    port.clearActions();

    expect(port.getEmittedActions()).toHaveLength(0);

    const ref = await port.createIssue({
      idempotencyKey: "key_2",
      title: "Issue 2",
      description: "Desc 2",
      assigneeDivision: "Div1.HCO",
      labels: [],
      metadata: {}
    });

    expect(ref.issueNumber).toBe(1); // counter reset
  });
});
