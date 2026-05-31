import { describe, expect, it, vi } from "vitest";
import type { BettingTableItem, DecisionArtifactEnvelope, EvalGateResult } from "../src/contracts";
import { circuitBreakerFlow } from "../src/circuitBreakerFlow";
import { evalGateEvidence } from "../src/evalGateEvidence";
import { persistMajorFlowDecisionArtifact, type MajorFlowDecisionArtifactInput } from "../src";
import { InMemoryPaperclipAdapter } from "../src/paperclipAdapter";
import { InMemoryBOSPersistence } from "../src/persistence";

const NOW = "2026-05-30T00:00:00.000Z";
const T1 = "2026-05-30T00:01:00.000Z";
const T2 = "2026-05-30T00:02:00.000Z";
const T3 = "2026-05-30T00:03:00.000Z";
const RAW_SECRET = "raw-token-secret-1234567890";
const MARKDOWN_INJECTION = `**approve** <script>alert("x")</script> [steal](javascript:alert(1)) api_key=${RAW_SECRET}\n# injected heading`;
const TOKEN_LIKE_ISSUE_ID = "issue_token_secret_1234567890";
const SECRET_ERROR = new Error(
  `paperclip denied\nAuthorization: Bearer ${RAW_SECRET}\ntoken=${RAW_SECRET}\ncookie ${RAW_SECRET}\n    at PaperclipClient.request (client.ts:10:5)`
);

function bettingRows(): BettingTableItem[] {
  return [
    {
      schema_version: "1.0",
      cycle_id: "cycle_2026_05",
      issue_id: "issue_batch_1",
      bpi_score: 91,
      blueprint_id: "blueprint_1",
      status: "CANDIDATE",
      native_approval_request_id: null,
      native_approval_status: null,
      approved_by: null,
      created_at: NOW,
      updated_at: NOW
    },
    {
      schema_version: "1.0",
      cycle_id: "cycle_2026_05",
      issue_id: "issue_batch_2",
      bpi_score: 86,
      blueprint_id: "blueprint_2",
      status: "CANDIDATE",
      native_approval_request_id: null,
      native_approval_status: null,
      approved_by: null,
      created_at: NOW,
      updated_at: NOW
    }
  ];
}

function blockingEvalGateResult(): EvalGateResult {
  return {
    schema_version: "1.0",
    issue_id: "issue_eval_failure",
    run_id: "run_eval_1",
    gates: [
      {
        gate_id: "LARS.Deterministic",
        status: "PASSED",
        evidence: "deterministic replay matched",
        is_blocking: true
      },
      {
        gate_id: "LARS.SecurityPolicy",
        status: "FAILED",
        evidence: `Authorization: Bearer ${RAW_SECRET}\n    at gate.ts:10:5`,
        is_blocking: true
      },
      {
        gate_id: "LARS.ArtifactIntegrity",
        status: "FAILED",
        evidence: `artifact contained api_key=${RAW_SECRET}`,
        is_blocking: true
      },
      {
        gate_id: "LARS.Budget",
        status: "PASSED",
        evidence: "budget within limit",
        is_blocking: false
      }
    ],
    overall: "FAILED_BLOCKING",
    blocking_failure_count: 2,
    warning_count: 0,
    not_run_count: 0,
    evaluated_at: NOW,
    evaluated_by: "Div5.QualificationsLibraryLearning"
  };
}

function expectNoApprovalMutation(adapter: { approvals?: unknown[] }, approvalSpy: { mock: { calls: unknown[] } }) {
  expect(approvalSpy.mock.calls).toHaveLength(0);
  expect(adapter.approvals ?? []).toHaveLength(0);
}

function expectNoSensitiveLeak(value: unknown) {
  const serialized = JSON.stringify(value);
  expect(serialized).not.toContain(RAW_SECRET);
  expect(serialized).not.toMatch(/Authorization: Bearer|api_key=raw|token=raw|cookie raw-token|PaperclipClient\.request|\n\s+at\s/);
}

function expectS03Invariants(artifact: DecisionArtifactEnvelope) {
  expect(artifact.invariants).toMatchObject({
    decided_by: "Div7.MissionControl",
    diagnostics_sanitized: true,
    native_approval_mutated: false
  });
  expect(artifact.decision.decided_by).toBe("Div7.MissionControl");
  expect(artifact.decision.diagnostics.sanitized).toBe(true);
}

function expectNoMarkdownInjectionLeak(artifact: DecisionArtifactEnvelope) {
  const serialized = JSON.stringify(artifact);
  expect(serialized).not.toContain("<script>");
  expect(serialized).not.toContain("</script>");
  expect(serialized).not.toContain("**approve**");
  expect(serialized).not.toContain("[steal](javascript:alert(1))");
  expect(serialized).not.toContain("\n# injected heading");
  expectNoSensitiveLeak(artifact);
}

describe("major flow decision artifacts", () => {
  it("persists batch approval as a compact CLEAR decision without mutating native approval state", async () => {
    const persistence = new InMemoryBOSPersistence();
    const rows = bettingRows();
    await persistence.saveBettingTable("cycle_2026_05", rows);
    const beforeRows = await persistence.getBettingTable("cycle_2026_05");
    const adapter = new InMemoryPaperclipAdapter();
    const approvalSpy = vi.spyOn(adapter, "createApprovalRequest");

    const input: MajorFlowDecisionArtifactInput = {
      kind: "batch_approval",
      cycle_id: "cycle_2026_05",
      selected_issue_ids: ["issue_batch_1", "issue_batch_2"],
      bpi_ref: "bpi://cycle_2026_05/top-2",
      approval_request_ref: "markdown-only://betting-cycles/cycle_2026_05/approval-request",
      reason: "Routine batch approval for known playbook work"
    };

    const artifact = await persistMajorFlowDecisionArtifact(input, {
      adapter,
      persistence,
      capabilities: { documents_native: "confirmed", comments_native: "unvalidated" },
      now: NOW
    });

    const afterRows = await persistence.getBettingTable("cycle_2026_05");
    expect(afterRows).toEqual(beforeRows);
    expect(afterRows.every((row) => row.status === "CANDIDATE")).toBe(true);
    expect(afterRows.every((row) => row.native_approval_request_id === null)).toBe(true);
    expect(afterRows.every((row) => row.native_approval_status === null)).toBe(true);
    expectNoApprovalMutation(adapter, approvalSpy);

    expect(adapter.documents).toHaveLength(1);
    expect(adapter.comments).toHaveLength(0);
    expect(artifact.selected_surface).toBe("documents.native");
    expect(artifact.artifact_ref).toBe(`paperclip://issues/issue_batch_1/documents/doc_1`);
    expect(artifact.cache_overlay.save).toBe("saved");
    expect(artifact.invariants.native_approval_mutated).toBe(false);
    expect(artifact.decision).toMatchObject({
      accepted: true,
      issue_id: "issue_batch_1",
      cynefin_domain: "CLEAR",
      risk_tier: "LOW",
      record_detail: "compact",
      decision_type: "BATCH_APPROVAL",
      decided_by: "Div7.MissionControl",
      decided_at: NOW,
      diagnostics: { sanitized: true }
    });
    expect(artifact.markdown).toContain("Flow: BATCH_APPROVAL");
    expect(artifact.markdown).toContain("Cycle: cycle_2026_05");
    expect(artifact.markdown).toContain("Native approval mutated: false");
    expect(JSON.stringify(artifact)).not.toMatch(/APPROVAL_REQUESTED|APPROVED_FOR_CYCLE|native_approval_request_id/);
  });

  it("persists blocking Eval Gate failures as expanded non-LOW Div7 decisions with sanitized inspectable fallbacks", async () => {
    const persistence = new InMemoryBOSPersistence();
    const adapter = new InMemoryPaperclipAdapter();
    const approvalSpy = vi.spyOn(adapter, "createApprovalRequest");

    const artifact = await persistMajorFlowDecisionArtifact({
      kind: "eval_gate_failure",
      result: blockingEvalGateResult(),
      guidance: `Do not accept this run. token=${RAW_SECRET}`
    }, {
      adapter,
      persistence,
      capabilities: { documents_native: "unsupported", comments_native: "unvalidated" },
      now: NOW
    });

    expectNoApprovalMutation(adapter, approvalSpy);
    expect(adapter.documents).toHaveLength(0);
    expect(adapter.comments).toHaveLength(1);
    expect(artifact).toMatchObject({
      schema_version: "1.0",
      phase: "S02.decision_artifact",
      selected_surface: "comments.native",
      artifact_ref: "paperclip://issues/issue_eval_failure/comments/comment_1",
      fallback: { reason: "documents.native:unsupported" },
      cache_overlay: {
        durability: "cache-overlay-only",
        persistence: "provided",
        save: "saved",
        error: null,
        timestamp: NOW
      },
      invariants: {
        decided_by: "Div7.MissionControl",
        diagnostics_sanitized: true,
        native_approval_mutated: false
      }
    });
    expect(artifact.decision).toMatchObject({
      accepted: true,
      issue_id: "issue_eval_failure",
      cynefin_domain: "COMPLICATED",
      risk_tier: "MEDIUM",
      record_detail: "expanded",
      decided_by: "Div7.MissionControl",
      diagnostics: { sanitized: true }
    });
    if (!artifact.decision.accepted) throw new Error("expected accepted Eval Gate decision");
    expect(persistence.decisions.get(artifact.decision.decision_id)).toEqual(artifact.decision);
    expect(artifact.markdown).toContain("Flow: EVAL_GATE_FAILURE");
    expect(artifact.markdown).toContain("Overall: FAILED_BLOCKING");
    expect(artifact.markdown).toContain("Run: run_eval_1");
    expect(artifact.markdown).toContain("LARS.SecurityPolicy: FAILED (blocking)");
    expect(artifact.markdown).toContain("LARS.ArtifactIntegrity: FAILED (blocking)");
    expect(artifact.markdown).toContain("Blocking Eval Gate failure");
    expect(artifact.markdown).toContain("Raw gate evidence is intentionally omitted");
    expectNoSensitiveLeak(artifact);
  });

  it("accepts an existing EvalGateEvidenceEnvelope for incomplete gate runs", async () => {
    const persistence = new InMemoryBOSPersistence();
    const evidence = await evalGateEvidence({
      issue_id: "issue_eval_incomplete",
      run_id: "run_incomplete_1",
      blueprintMarkdown: "# Blueprint",
      outputMarkdown: "# Output",
      // Deliberately malformed: required booleans are absent, so the Eval Gate seam returns INCOMPLETE.
      now: NOW
    } as Parameters<typeof evalGateEvidence>[0]);

    const artifact = await persistMajorFlowDecisionArtifact({
      kind: "eval_gate_failure",
      evidence
    }, {
      persistence,
      capabilities: { documents_native: "unsupported", comments_native: "unsupported" },
      now: NOW
    });

    expect(evidence.result.overall).toBe("INCOMPLETE");
    expect(artifact.selected_surface).toBe("markdown-only");
    expect(artifact.fallback).toMatchObject({
      reason: "comments.native:unsupported",
      comment_error: "comments.native posture is unsupported"
    });
    expect(artifact.decision).toMatchObject({
      accepted: true,
      issue_id: "issue_eval_incomplete",
      cynefin_domain: "COMPLICATED",
      risk_tier: "MEDIUM",
      record_detail: "expanded",
      diagnostics: { sanitized: true }
    });
    expect(artifact.markdown).toContain("Overall: INCOMPLETE");
    expect(artifact.markdown).toContain("Run: run_incomplete_1");
    expect(artifact.markdown).toContain("LARS.Deterministic: NOT_RUN (blocking)");
    expect(artifact.markdown).toContain("Eval Gate incomplete");
  });

  it("maps an OPEN circuit breaker evidence envelope to a CHAOTIC CRITICAL SELF_HEALING decision without adding runtime support claims", async () => {
    const persistence = new InMemoryBOSPersistence();
    const circuitAdapter = new InMemoryPaperclipAdapter();
    await circuitBreakerFlow({ issue_id: "issue_circuit_open", run_id: "run_cb_1", observation: "failure", failure_reason: "first", persistence, adapter: circuitAdapter, now: T1 });
    await circuitBreakerFlow({ issue_id: "issue_circuit_open", run_id: "run_cb_2", observation: "failure", failure_reason: "second", persistence, adapter: circuitAdapter, now: T2 });
    const evidence = await circuitBreakerFlow({
      issue_id: "issue_circuit_open",
      run_id: "run_cb_3",
      observation: "failure",
      failure_reason: `critical outage stop worker Authorization: Bearer ${RAW_SECRET}`,
      persistence,
      adapter: circuitAdapter,
      now: T3
    });
    const artifactAdapter = new InMemoryPaperclipAdapter();
    const approvalSpy = vi.spyOn(artifactAdapter, "createApprovalRequest");

    const artifact = await persistMajorFlowDecisionArtifact({
      kind: "circuit_breaker_open",
      evidence
    }, {
      adapter: artifactAdapter,
      persistence,
      capabilities: { documents_native: "confirmed", comments_native: "unvalidated" },
      now: T3
    });

    expect(evidence.next_state).toBe("OPEN");
    expect(evidence.transition_reason).toBe("failure_threshold_reached");
    expect(evidence.selected_surface).toBe("issues.native");
    expectNoApprovalMutation(artifactAdapter, approvalSpy);
    expect(artifact.selected_surface).toBe("documents.native");
    expect(artifact.invariants.native_approval_mutated).toBe(false);
    expect(artifact.decision).toMatchObject({
      accepted: true,
      issue_id: "issue_circuit_open",
      cynefin_domain: "CHAOTIC",
      risk_tier: "CRITICAL",
      record_detail: "expanded",
      decision_type: "SELF_HEALING",
      decided_by: "Div7.MissionControl",
      diagnostics: { sanitized: true }
    });
    expect(artifact.markdown).toContain("Flow: CIRCUIT_BREAKER_OPEN");
    expect(artifact.markdown).toContain("Operational owner: Div1.HCO retains circuit-breaker containment");
    expect(artifact.markdown).toContain("Decision owner: Div7.MissionControl records this artifact-only decision");
    expect(artifact.markdown).toContain("no polling, subscriptions, activity-log dependence, or new escalation automation is added here");
    expect(artifact.markdown).toContain("Raw circuit evidence markdown is intentionally omitted");
    expect(artifact.markdown).toContain("Incident / Containment");
    expectNoSensitiveLeak(artifact);
  });

  it("persists policy exceptions as COMPLICATED expanded artifact-only decisions with reversible next steps", async () => {
    const persistence = new InMemoryBOSPersistence();
    const adapter = new InMemoryPaperclipAdapter();
    const approvalSpy = vi.spyOn(adapter, "createApprovalRequest");

    const artifact = await persistMajorFlowDecisionArtifact({
      kind: "policy_exception",
      issue_id: "issue_policy_exception",
      policy_owner: "Div5.QualificationsLibraryLearning",
      policy_ref: "policy://security/precheck",
      exception: "Allow a one-run policy exception for deterministic replay review",
      constraint_context: "security policy owner must review before acceptance",
      reversible_next_step: "Run the exception as markdown-only evidence and revert if owner rejects",
      diagnostics: `authorization token=${RAW_SECRET}`
    }, {
      adapter,
      persistence,
      capabilities: { documents_native: "unsupported", comments_native: "unvalidated" },
      now: NOW
    });

    expectNoApprovalMutation(adapter, approvalSpy);
    expect(artifact.selected_surface).toBe("comments.native");
    expect(artifact.fallback.reason).toBe("documents.native:unsupported");
    expect(artifact.invariants.native_approval_mutated).toBe(false);
    expect(artifact.decision).toMatchObject({
      accepted: true,
      issue_id: "issue_policy_exception",
      cynefin_domain: "COMPLICATED",
      risk_tier: "MEDIUM",
      record_detail: "expanded",
      decision_type: "POLICY_UPDATE",
      decided_by: "Div7.MissionControl",
      diagnostics: { sanitized: true }
    });
    expect(artifact.markdown).toContain("Flow: POLICY_EXCEPTION");
    expect(artifact.markdown).toContain("Policy owner: Div5.QualificationsLibraryLearning");
    expect(artifact.markdown).toContain("Reversible next step: Run the exception as markdown-only evidence and revert if owner rejects");
    expect(artifact.markdown).toContain("External mutation: none; artifact-only policy exception record");
    expectNoSensitiveLeak(artifact);
  });

  it("persists budget exceptions as COMPLICATED expanded artifact-only decisions with budget constraint context", async () => {
    const persistence = new InMemoryBOSPersistence();
    const adapter = new InMemoryPaperclipAdapter();
    const approvalSpy = vi.spyOn(adapter, "createApprovalRequest");

    const artifact = await persistMajorFlowDecisionArtifact({
      kind: "budget_exception",
      issue_id: "issue_budget_exception",
      budget_owner: "Div3.Treasury",
      budget_ref: "budget://company-token-budget/2026-05",
      budget_constraint: "Monthly company token budget has 8% remaining",
      requested_exception: "Spend an additional bounded 2% on correction evidence",
      reversible_next_step: "Approve only a capped probe and stop when the budget ref is exhausted",
      diagnostics: "budget API unavailable; using sanitized cache overlay summary"
    }, {
      adapter,
      persistence,
      capabilities: { documents_native: "unsupported", comments_native: "unvalidated" },
      now: NOW
    });

    expectNoApprovalMutation(adapter, approvalSpy);
    expect(artifact.selected_surface).toBe("comments.native");
    expect(artifact.decision).toMatchObject({
      accepted: true,
      issue_id: "issue_budget_exception",
      cynefin_domain: "COMPLICATED",
      risk_tier: "MEDIUM",
      record_detail: "expanded",
      decision_type: "POLICY_UPDATE",
      decided_by: "Div7.MissionControl",
      diagnostics: { sanitized: true }
    });
    expect(artifact.markdown).toContain("Flow: BUDGET_EXCEPTION");
    expect(artifact.markdown).toContain("Budget owner: Div3.Treasury");
    expect(artifact.markdown).toContain("Budget constraint: Monthly company token budget has 8% remaining");
    expect(artifact.markdown).toContain("External mutation: none; artifact-only budget exception record");
  });

  it("persists strategic choices as COMPLEX HIGH EXPERIMENT decisions with OODA and safe-to-fail rollback context", async () => {
    const persistence = new InMemoryBOSPersistence();
    const adapter = new InMemoryPaperclipAdapter();
    const approvalSpy = vi.spyOn(adapter, "createApprovalRequest");

    const artifact = await persistMajorFlowDecisionArtifact({
      kind: "strategic_choice",
      issue_id: "issue_strategy_choice",
      strategic_question: "Should BOS route uncertain customer evidence through a new synthesis lane?",
      choice: "Try the synthesis lane for one low-blast-radius issue",
      hypothesis: "A bounded experiment will reveal whether the lane improves acceptance evidence",
      safe_to_fail_probe: "Run one issue through the lane and compare acceptance trace quality",
      rollback: "Route the next issue back to the existing manual review path if traces are weaker",
      owner: "Div7.MissionControl",
      diagnostics: "strategy inputs are partial and uncertain"
    }, {
      adapter,
      persistence,
      capabilities: { documents_native: "unsupported", comments_native: "unvalidated" },
      now: NOW
    });

    expectNoApprovalMutation(adapter, approvalSpy);
    expect(artifact.selected_surface).toBe("comments.native");
    expect(artifact.decision).toMatchObject({
      accepted: true,
      issue_id: "issue_strategy_choice",
      cynefin_domain: "COMPLEX",
      risk_tier: "HIGH",
      record_detail: "expanded",
      decision_type: "EXPERIMENT",
      decided_by: "Div7.MissionControl",
      diagnostics: { sanitized: true }
    });
    if (!artifact.decision.accepted) throw new Error("expected accepted strategic decision");
    expect(artifact.decision.ooda).toBeDefined();
    expect(artifact.markdown).toContain("Flow: STRATEGIC_CHOICE");
    expect(artifact.markdown).toContain("Strategic Probe");
    expect(artifact.markdown).toContain("OODA observe");
    expect(artifact.markdown).toContain("Safe-to-fail probe: Run one issue through the lane and compare acceptance trace quality");
    expect(artifact.markdown).toContain("Rollback: Route the next issue back to the existing manual review path if traces are weaker");
  });

  it("returns markdown-only fallback artifacts for malformed document and comment adapter responses without approval mutation", async () => {
    const adapter = {
      approvals: [] as unknown[],
      createIssueDocument: vi.fn().mockResolvedValue({ document_id: "   " }),
      addIssueComment: vi.fn().mockResolvedValue({ comment_id: "" }),
      createApprovalRequest: vi.fn()
    };

    const artifact = await persistMajorFlowDecisionArtifact({
      kind: "policy_exception",
      issue_id: "issue_policy_malformed_fallback",
      policy_owner: "Div5.QualificationsLibraryLearning",
      exception: "Temporary policy exception while evidence is corrected",
      reversible_next_step: "Do nothing externally until a reviewer confirms the markdown artifact"
    }, {
      adapter,
      capabilities: { documents_native: "confirmed", comments_native: "unvalidated" },
      now: NOW
    });

    expect(adapter.createIssueDocument).toHaveBeenCalledOnce();
    expect(adapter.addIssueComment).toHaveBeenCalledOnce();
    expect(adapter.createApprovalRequest).not.toHaveBeenCalled();
    expect(adapter.approvals).toHaveLength(0);
    expect(artifact.selected_surface).toBe("markdown-only");
    expect(artifact.fallback).toMatchObject({
      reason: "comment_response_malformed",
      document_error: "createIssueDocument returned missing document_id",
      comment_error: "addIssueComment returned missing comment_id"
    });
    expect(artifact.invariants.native_approval_mutated).toBe(false);
    expect(artifact.markdown).toContain("Flow: POLICY_EXCEPTION");
  });

  it("returns sanitized markdown-only fallback artifacts when document writes fail and comments are unavailable", async () => {
    const adapter = {
      approvals: [] as unknown[],
      createIssueDocument: vi.fn().mockRejectedValue(SECRET_ERROR),
      createApprovalRequest: vi.fn()
    };

    const artifact = await persistMajorFlowDecisionArtifact({
      kind: "budget_exception",
      issue_id: "issue_budget_unavailable_fallback",
      budget_constraint: "budget service is unreachable",
      requested_exception: "temporarily spend from contingency cap",
      reversible_next_step: "stop the exception when the cache overlay cannot be saved"
    }, {
      adapter,
      capabilities: { documents_native: "confirmed", comments_native: "unvalidated" },
      now: NOW
    });

    expect(adapter.createIssueDocument).toHaveBeenCalledOnce();
    expect(adapter.createApprovalRequest).not.toHaveBeenCalled();
    expect(adapter.approvals).toHaveLength(0);
    expect(artifact.selected_surface).toBe("markdown-only");
    expect(artifact.fallback.reason).toBe("comments.native:unavailable");
    expect(artifact.fallback.document_error).toContain("[REDACTED]");
    expect(artifact.fallback.comment_error).toBe("addIssueComment is unavailable");
    expect(artifact.invariants.native_approval_mutated).toBe(false);
    expectNoSensitiveLeak(artifact);
  });

  it("neutralizes markdown and HTML injection strings before rendering major-flow artifacts", async () => {
    const persistence = new InMemoryBOSPersistence();
    const adapter = new InMemoryPaperclipAdapter();
    const approvalSpy = vi.spyOn(adapter, "createApprovalRequest");

    const artifact = await persistMajorFlowDecisionArtifact({
      kind: "strategic_choice",
      issue_id: "issue_strategy_injection",
      strategic_question: MARKDOWN_INJECTION,
      choice: `Try the bounded probe: ${MARKDOWN_INJECTION}`,
      hypothesis: `If rendered safely then ${MARKDOWN_INJECTION}`,
      safe_to_fail_probe: `Run one issue only. ${MARKDOWN_INJECTION}`,
      rollback: `Rollback on any unsafe render. ${MARKDOWN_INJECTION}`,
      owner: `Div7.MissionControl ${MARKDOWN_INJECTION}`,
      diagnostics: MARKDOWN_INJECTION
    }, {
      adapter,
      persistence,
      capabilities: { documents_native: "confirmed", comments_native: "unvalidated" },
      now: NOW
    });

    expectNoApprovalMutation(adapter, approvalSpy);
    expectS03Invariants(artifact);
    expect(artifact.selected_surface).toBe("documents.native");
    expect(artifact.artifact_ref).toBe("paperclip://issues/issue_strategy_injection/documents/doc_1");
    expect(artifact.decision).toMatchObject({
      accepted: true,
      issue_id: "issue_strategy_injection",
      cynefin_domain: "COMPLEX",
      risk_tier: "HIGH",
      decided_by: "Div7.MissionControl",
      diagnostics: { sanitized: true }
    });
    expect(artifact.markdown).toContain("&lt;script&gt;alert");
    expect(artifact.markdown).toContain("\\[steal\\]\\(javascript:alert");
    expectNoMarkdownInjectionLeak(artifact);
  });

  it("rejects token-like issue ids without persisting the raw id into markdown ids or refs", async () => {
    const adapter = new InMemoryPaperclipAdapter();
    const approvalSpy = vi.spyOn(adapter, "createApprovalRequest");

    const artifact = await persistMajorFlowDecisionArtifact({
      kind: "policy_exception",
      issue_id: TOKEN_LIKE_ISSUE_ID,
      policy_owner: "Div5.QualificationsLibraryLearning",
      exception: "Temporary policy exception while evidence is corrected",
      reversible_next_step: "Do nothing externally until a reviewer confirms the markdown artifact"
    } as MajorFlowDecisionArtifactInput, {
      adapter,
      capabilities: { documents_native: "confirmed", comments_native: "unvalidated" },
      now: NOW
    });

    expectNoApprovalMutation(adapter, approvalSpy);
    expectS03Invariants(artifact);
    expect(artifact.selected_surface).toBe("markdown-only");
    expect(artifact.fallback.reason).toBe("invalid_decision_input");
    expect(artifact.issue_id).toBeNull();
    expect(artifact.decision_id).toBeNull();
    expect(artifact.artifact_id).toBe("markdown-only:missing:decisions:invalid");
    expect(artifact.artifact_ref).toBe("markdown-only://issues/missing/decisions/invalid");
    expect(artifact.markdown).toContain("issue_id must not contain auth, token, cookie, api key, or secret");
    expect(JSON.stringify(artifact)).not.toContain(TOKEN_LIKE_ISSUE_ID);
  });

  it("fails closed with sanitized S02 artifacts for malformed direct inputs across all major-flow variants", async () => {
    const malformedInputs: Array<{ label: string; input: unknown; expectedIssueId: string | null }> = [
      {
        label: "batch_approval",
        input: { kind: "batch_approval", cycle_id: "cycle_bad", selected_issue_ids: "issue_bad", reason: "bad batch" },
        expectedIssueId: null
      },
      {
        label: "eval_gate_failure",
        input: { kind: "eval_gate_failure", result: { issue_id: "issue_eval_bad", overall: "FAILED_BLOCKING" } },
        expectedIssueId: "issue_eval_bad"
      },
      {
        label: "circuit_breaker_open",
        input: { kind: "circuit_breaker_open", issue_id: "issue_circuit_bad", record: { state: "OPEN" } },
        expectedIssueId: "issue_circuit_bad"
      },
      {
        label: "circuit_breaker_open_missing_record",
        input: { kind: "circuit_breaker_open", issue_id: "issue_circuit_missing_record", run_id: "run_missing_record" },
        expectedIssueId: "issue_circuit_missing_record"
      },
      {
        label: "circuit_breaker_open_non_open_state",
        input: {
          kind: "circuit_breaker_open",
          issue_id: "issue_circuit_closed",
          record: {
            schema_version: "1.0",
            issue_id: "issue_circuit_closed",
            state: "CLOSED",
            attempt_count: 0,
            max_attempts: 3,
            half_open_threshold: 1,
            last_failure_at: null,
            last_failure_reason: null,
            opened_at: null,
            escalation_issue_id: null,
            updated_at: NOW
          }
        },
        expectedIssueId: "issue_circuit_closed"
      },
      {
        label: "policy_exception",
        input: { kind: "policy_exception", issue_id: "issue_policy_bad", exception: "missing owner", reversible_next_step: "review manually" },
        expectedIssueId: "issue_policy_bad"
      },
      {
        label: "budget_exception",
        input: { kind: "budget_exception", issue_id: "issue_budget_bad", budget_constraint: "budget cap hit" },
        expectedIssueId: "issue_budget_bad"
      },
      {
        label: "strategic_choice",
        input: { kind: "strategic_choice", issue_id: "issue_strategy_bad", strategic_question: "which path?", choice: "probe" },
        expectedIssueId: "issue_strategy_bad"
      }
    ];

    for (const { label, input, expectedIssueId } of malformedInputs) {
      const adapter = new InMemoryPaperclipAdapter();
      const approvalSpy = vi.spyOn(adapter, "createApprovalRequest");
      const artifact = await persistMajorFlowDecisionArtifact(input as MajorFlowDecisionArtifactInput, {
        adapter,
        capabilities: { documents_native: "confirmed", comments_native: "unvalidated" },
        now: NOW
      });

      expectNoApprovalMutation(adapter, approvalSpy);
      expect(adapter.documents, label).toHaveLength(0);
      expect(adapter.comments, label).toHaveLength(0);
      expectS03Invariants(artifact);
      expect(artifact.selected_surface, label).toBe("markdown-only");
      expect(artifact.fallback.reason, label).toBe("invalid_decision_input");
      expect(artifact.issue_id, label).toBe(expectedIssueId);
      expect(artifact.decision_id, label).toBeNull();
      expect(artifact.decision, label).toMatchObject({
        accepted: false,
        error: "invalid_decision_input",
        issue_id: expectedIssueId,
        decided_by: "Div7.MissionControl",
        diagnostics: { sanitized: true }
      });
      expect(artifact.fallback.validation_error, label).not.toMatch(/Authorization: Bearer|api_key=raw|token=raw|cookie raw-token|\n\s+at\s/);
    }
  });
});
