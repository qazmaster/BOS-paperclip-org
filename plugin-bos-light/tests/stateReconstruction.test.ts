import { describe, it, expect, beforeEach } from "vitest";
import { InMemoryPaperclipAdapter } from "../src/paperclipAdapter";
import { reconstructStateFromArtifacts, type ReconstructionEnvelope } from "../src/stateReconstruction";
import {
  DefaultHybridBOSPersistence,
} from "../src/hybridPersistence";
import type {
  BPIScore,
  BosStatusOverlay,
  BosStatus,
  BettingTableItem,
  EvalGateResult,
  CircuitBreakerRecord,
  DecisionMetadata,
} from "../src/contracts";

describe("reconstructStateFromArtifacts", () => {
  let adapter: InMemoryPaperclipAdapter;
  let hybrid: DefaultHybridBOSPersistence;

  beforeEach(() => {
    adapter = new InMemoryPaperclipAdapter();
    hybrid = new DefaultHybridBOSPersistence(adapter);
  });

  function makeBPI(issueId: string): BPIScore {
    return {
      schema_version: "1.0",
      score: 0.85,
      formula: "bpi_v1.0",
      components: {
        expected_value: 1000,
        urgency: 0.9,
        estimated_token_cost: 50000,
        risk_factor: 0.2,
        company_token_budget_ref: 100000,
      },
      hard_gates: {
        strategic_weight_passed: true,
        budget_snapshot_available: true,
        acceptance_inputs_present: true,
        policy_precheck_passed: true,
        security_precheck_passed: true,
      },
      scored_by: "Div2.MasterPlanner",
      scored_at: new Date().toISOString(),
      source_issue_id: issueId,
    };
  }

  function makeStatus(issueId: string): BosStatusOverlay {
    return {
      schema_version: "1.0",
      issue_id: issueId,
      bos_status: "TRIAGED" as BosStatus,
      producer_division: "Div4.Production",
      blueprint_id: null,
      bpi_score: 0.85,
      updated_at: new Date().toISOString(),
    };
  }

  function makeBettingItems(cycleId: string): BettingTableItem[] {
    return [
      {
        schema_version: "1.0",
        cycle_id: cycleId,
        issue_id: "issue-1",
        bpi_score: 0.9,
        blueprint_id: "bp-1",
        status: "CANDIDATE",
        native_approval_request_id: null,
        native_approval_status: null,
        approved_by: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      {
        schema_version: "1.0",
        cycle_id: cycleId,
        issue_id: "issue-2",
        bpi_score: 0.75,
        blueprint_id: null,
        status: "APPROVAL_REQUESTED",
        native_approval_request_id: "req-1",
        native_approval_status: "PENDING",
        approved_by: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ];
  }

  function makeGateResult(issueId: string): EvalGateResult {
    return {
      schema_version: "1.0",
      issue_id: issueId,
      run_id: "run-1",
      gates: [
        { gate_id: "LARS.Deterministic", status: "PASSED", evidence: "ok", is_blocking: true },
        { gate_id: "LARS.SecurityPolicy", status: "FAILED", evidence: null, is_blocking: true },
        { gate_id: "LARS.ArtifactIntegrity", status: "PASSED", evidence: "checksum ok", is_blocking: false },
        { gate_id: "LARS.Budget", status: "NOT_RUN", evidence: null, is_blocking: false },
      ],
      overall: "FAILED_BLOCKING",
      blocking_failure_count: 1,
      warning_count: 0,
      not_run_count: 1,
      evaluated_at: new Date().toISOString(),
      evaluated_by: "Div5.QualificationsLibraryLearning",
    };
  }

  function makeCircuitBreaker(issueId: string): CircuitBreakerRecord {
    return {
      schema_version: "1.0",
      issue_id: issueId,
      state: "CLOSED",
      attempt_count: 0,
      max_attempts: 3,
      half_open_threshold: 1,
      last_failure_at: null,
      last_failure_reason: null,
      opened_at: null,
      escalation_issue_id: null,
      updated_at: new Date().toISOString(),
    };
  }

  function makeDecision(issueId: string): DecisionMetadata {
    return {
      schema_version: "1.0",
      accepted: true,
      decision_id: "dec-1",
      issue_id: issueId,
      cynefin_domain: "COMPLICATED",
      confidence: 0.92,
      risk_tier: "MEDIUM",
      record_detail: "compact",
      decision_type: "BATCH_APPROVAL",
      emitted_events: [],
      recommended_action: "approve batch",
      decided_by: "Div7.MissionControl",
      decided_at: new Date().toISOString(),
      diagnostics: {
        domain_evidence: [],
        selected_domain_reasons: [],
        risk_reasons: [],
        validation_errors: [],
        uncertainty_reasons: [],
        sanitized: true,
      },
      record_markdown: "# Decision\napprove",
    };
  }

  describe("full round-trip via hybrid persistence", () => {
    it("reconstructs BPI from mirrored document artifact", async () => {
      const bpi = makeBPI("issue-1");
      await hybrid.saveBPI(bpi);
      await new Promise((r) => setTimeout(r, 50));

      const envelope = await reconstructStateFromArtifacts(adapter, "issue-1");
      expect(envelope.found.bpi).toBeDefined();
      expect(envelope.found.bpi?.source_issue_id).toBe("issue-1");
      expect(envelope.found.bpi?.score).toBe(0.85);
      expect(envelope.found.bpi?.formula).toBe("bpi_v1.0");
      expect(envelope.found.bpi?.components.expected_value).toBe(1000);
      expect(envelope.found.bpi?.hard_gates.strategic_weight_passed).toBe(true);
      expect(envelope.missing).not.toContain("bpi");
    });

    it("reconstructs status from mirrored comment artifact", async () => {
      const status = makeStatus("issue-2");
      await hybrid.saveStatus(status);
      await new Promise((r) => setTimeout(r, 50));

      const envelope = await reconstructStateFromArtifacts(adapter, "issue-2");
      expect(envelope.found.status).toBeDefined();
      expect(envelope.found.status?.issue_id).toBe("issue-2");
      expect(envelope.found.status?.bos_status).toBe("TRIAGED");
      expect(envelope.found.status?.producer_division).toBe("Div4.Production");
      expect(envelope.missing).not.toContain("status");
    });

    it("reconstructs betting table from mirrored document artifact", async () => {
      const items = makeBettingItems("cycle-1");
      await hybrid.saveBettingTable("cycle-1", items);
      await new Promise((r) => setTimeout(r, 50));

      const envelope = await reconstructStateFromArtifacts(adapter, "cycle-cycle-1");
      expect(envelope.found.betting_table).toBeDefined();
      expect(envelope.found.betting_table?.length).toBe(2);
      expect(envelope.found.betting_table?.[0].issue_id).toBe("issue-1");
      expect(envelope.found.betting_table?.[0].bpi_score).toBe(0.9);
      expect(envelope.found.betting_table?.[1].status).toBe("APPROVAL_REQUESTED");
      expect(envelope.missing).not.toContain("betting_table");
    });

    it("reconstructs gate result from mirrored comment artifact", async () => {
      const result = makeGateResult("issue-3");
      await hybrid.saveGateResult(result);
      await new Promise((r) => setTimeout(r, 50));

      const envelope = await reconstructStateFromArtifacts(adapter, "issue-3");
      expect(envelope.found.gate_result).toBeDefined();
      expect(envelope.found.gate_result?.issue_id).toBe("issue-3");
      expect(envelope.found.gate_result?.overall).toBe("FAILED_BLOCKING");
      expect(envelope.found.gate_result?.gates.length).toBe(4);
      expect(envelope.found.gate_result?.gates[0].gate_id).toBe("LARS.Deterministic");
      expect(envelope.found.gate_result?.gates[0].is_blocking).toBe(true);
      expect(envelope.found.gate_result?.gates[2].evidence).toBe("checksum ok");
      expect(envelope.missing).not.toContain("gate_result");
    });

    it("reconstructs circuit breaker from mirrored document artifact", async () => {
      const record = makeCircuitBreaker("issue-4");
      await hybrid.saveCircuitBreaker(record);
      await new Promise((r) => setTimeout(r, 50));

      const envelope = await reconstructStateFromArtifacts(adapter, "issue-4");
      expect(envelope.found.circuit_breaker).toBeDefined();
      expect(envelope.found.circuit_breaker?.issue_id).toBe("issue-4");
      expect(envelope.found.circuit_breaker?.state).toBe("CLOSED");
      expect(envelope.found.circuit_breaker?.max_attempts).toBe(3);
      expect(envelope.found.circuit_breaker?.last_failure_at).toBeNull();
      expect(envelope.missing).not.toContain("circuit_breaker");
    });

    it("reconstructs decision from mirrored comment artifact", async () => {
      const decision = makeDecision("issue-5");
      await hybrid.saveDecision(decision);
      await new Promise((r) => setTimeout(r, 50));

      const envelope = await reconstructStateFromArtifacts(adapter, "issue-5");
      expect(envelope.found.decision).toBeDefined();
      expect(envelope.found.decision?.decision_id).toBe("dec-1");
      expect(envelope.found.decision?.cynefin_domain).toBe("COMPLICATED");
      expect(envelope.found.decision?.confidence).toBe(0.92);
      expect(envelope.found.decision?.risk_tier).toBe("MEDIUM");
      expect(envelope.missing).not.toContain("decision");
    });

    it("reconstructs all artifacts for the same issue", async () => {
      const issueId = "issue-all";
      await hybrid.saveBPI(makeBPI(issueId));
      await hybrid.saveStatus(makeStatus(issueId));
      await hybrid.saveGateResult(makeGateResult(issueId));
      await hybrid.saveCircuitBreaker(makeCircuitBreaker(issueId));
      await hybrid.saveDecision(makeDecision(issueId));
      await new Promise((r) => setTimeout(r, 100));

      const envelope = await reconstructStateFromArtifacts(adapter, issueId);
      expect(envelope.found.bpi).toBeDefined();
      expect(envelope.found.status).toBeDefined();
      expect(envelope.found.gate_result).toBeDefined();
      expect(envelope.found.circuit_breaker).toBeDefined();
      expect(envelope.found.decision).toBeDefined();
      expect(envelope.missing).toEqual(["betting_table"]);
      expect(envelope.fallback_used).toBe(false);
    });
  });

  describe("missing artifacts", () => {
    it("reports all missing when adapter is empty", async () => {
      const envelope = await reconstructStateFromArtifacts(adapter, "issue-empty");
      expect(envelope.found.bpi).toBeUndefined();
      expect(envelope.found.status).toBeUndefined();
      expect(envelope.found.betting_table).toBeUndefined();
      expect(envelope.found.gate_result).toBeUndefined();
      expect(envelope.found.circuit_breaker).toBeUndefined();
      expect(envelope.found.decision).toBeUndefined();
      expect(envelope.missing).toEqual([
        "bpi",
        "status",
        "betting_table",
        "gate_result",
        "circuit_breaker",
        "decision",
      ]);
      expect(envelope.diagnostics.documents_scraped).toBe(0);
      expect(envelope.diagnostics.comments_scraped).toBe(0);
    });

    it("reports partial missing when only some artifacts exist", async () => {
      await hybrid.saveBPI(makeBPI("issue-partial"));
      await new Promise((r) => setTimeout(r, 50));

      const envelope = await reconstructStateFromArtifacts(adapter, "issue-partial");
      expect(envelope.found.bpi).toBeDefined();
      expect(envelope.missing).toEqual([
        "status",
        "betting_table",
        "gate_result",
        "circuit_breaker",
        "decision",
      ]);
    });
  });

  describe("markdown-only fallback parsing", () => {
    it("parses BPI from hand-written markdown", async () => {
      adapter.documents.push({
        issueId: "issue-md",
        title: "BPI Score: issue-md",
        markdown: `# BPI Score

- Issue: issue-md
- Score: 0.77
- Formula: bpi_v1.0
- Scored by: Div2.MasterPlanner
- Scored at: 2024-01-15T10:00:00.000Z

## Components
- expected_value: 500
- urgency: 0.8
- estimated_token_cost: 25000
- risk_factor: 0.1
- company_token_budget_ref: 50000

## Hard Gates
- strategic_weight_passed: true
- budget_snapshot_available: false
- acceptance_inputs_present: true
- policy_precheck_passed: true
- security_precheck_passed: true
`,
      });

      const envelope = await reconstructStateFromArtifacts(adapter, "issue-md");
      expect(envelope.found.bpi).toBeDefined();
      expect(envelope.found.bpi?.score).toBe(0.77);
      expect(envelope.found.bpi?.components.expected_value).toBe(500);
      expect(envelope.found.bpi?.hard_gates.budget_snapshot_available).toBe(false);
      expect(envelope.missing).not.toContain("bpi");
    });

    it("parses circuit breaker from minimal markdown", async () => {
      adapter.documents.push({
        issueId: "issue-cb",
        title: "Circuit Breaker: issue-cb",
        markdown: `# Circuit Breaker State

- Issue: issue-cb
- State: **OPEN**
- Attempts: 3
- max_attempts: 5
- Half-open threshold: 2
- Last failure: 2024-01-15T10:00:00.000Z
- Last failure reason: timeout
- Opened at: 2024-01-15T10:00:00.000Z
- Escalation issue: esc-1
`,
      });

      const envelope = await reconstructStateFromArtifacts(adapter, "issue-cb");
      expect(envelope.found.circuit_breaker).toBeDefined();
      expect(envelope.found.circuit_breaker?.state).toBe("OPEN");
      expect(envelope.found.circuit_breaker?.attempt_count).toBe(3);
      expect(envelope.found.circuit_breaker?.last_failure_reason).toBe("timeout");
      expect(envelope.found.circuit_breaker?.escalation_issue_id).toBe("esc-1");
    });

    it("falls back gracefully on malformed document markdown", async () => {
      adapter.documents.push({
        issueId: "issue-bad",
        title: "BPI Score: issue-bad",
        markdown: "This is not a valid BPI document. No score here.",
      });

      const envelope = await reconstructStateFromArtifacts(adapter, "issue-bad");
      expect(envelope.found.bpi).toBeUndefined();
      expect(envelope.missing).toContain("bpi");
      expect(envelope.fallback_used).toBe(true);
      expect(envelope.diagnostics.parse_errors.length).toBeGreaterThan(0);
    });

    it("falls back gracefully on malformed comment markdown", async () => {
      adapter.comments.push({
        issueId: "issue-bad-comment",
        markdown: "## BOS Status Update\n\nSome random text without structured data.",
      });

      const envelope = await reconstructStateFromArtifacts(adapter, "issue-bad-comment");
      expect(envelope.found.status).toBeUndefined();
      expect(envelope.missing).toContain("status");
      expect(envelope.fallback_used).toBe(true);
    });
  });

  describe("envelope structure", () => {
    it("includes schema version and reconstruction timestamp", async () => {
      const envelope = await reconstructStateFromArtifacts(adapter, "issue-1");
      expect(envelope.schema_version).toBe("1.0");
      expect(envelope.issue_id).toBe("issue-1");
      expect(envelope.reconstructed_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });

    it("counts scraped documents and comments", async () => {
      await hybrid.saveBPI(makeBPI("issue-count"));
      await hybrid.saveCircuitBreaker(makeCircuitBreaker("issue-count"));
      await hybrid.saveStatus(makeStatus("issue-count"));
      await new Promise((r) => setTimeout(r, 50));

      const envelope = await reconstructStateFromArtifacts(adapter, "issue-count");
      expect(envelope.diagnostics.documents_scraped).toBe(2);
      expect(envelope.diagnostics.comments_scraped).toBe(1);
    });

    it("does not mix artifacts from different issues", async () => {
      await hybrid.saveBPI(makeBPI("issue-a"));
      await hybrid.saveStatus(makeStatus("issue-b"));
      await new Promise((r) => setTimeout(r, 50));

      const envA = await reconstructStateFromArtifacts(adapter, "issue-a");
      expect(envA.found.bpi).toBeDefined();
      expect(envA.found.status).toBeUndefined();

      const envB = await reconstructStateFromArtifacts(adapter, "issue-b");
      expect(envB.found.bpi).toBeUndefined();
      expect(envB.found.status).toBeDefined();
    });
  });

  describe("best-effort gate parsing", () => {
    it("parses gate lines with varying evidence patterns", async () => {
      adapter.comments.push({
        issueId: "gate-1",
        markdown: `## Eval Gate Result

- Run: run-xyz
- Overall: **PASSED**
- Blocking failures: 0
- Warnings: 1
- Not run: 0

- **LARS.Deterministic**: PASSED (blocking) — deterministic check ok
- **LARS.SecurityPolicy**: PASSED (blocking)
- **LARS.ArtifactIntegrity**: FAILED — hash mismatch
- **LARS.Budget**: NOT_RUN

*Evaluated at: 2024-01-15T10:00:00.000Z by Div5.QualificationsLibraryLearning*
`,
      });

      const envelope = await reconstructStateFromArtifacts(adapter, "gate-1");
      expect(envelope.found.gate_result).toBeDefined();
      expect(envelope.found.gate_result?.gates.length).toBe(4);
      expect(envelope.found.gate_result?.gates[0].evidence).toBe("deterministic check ok");
      expect(envelope.found.gate_result?.gates[1].evidence).toBeNull();
      expect(envelope.found.gate_result?.gates[2].evidence).toBe("hash mismatch");
      expect(envelope.found.gate_result?.gates[3].status).toBe("NOT_RUN");
    });
  });
});
