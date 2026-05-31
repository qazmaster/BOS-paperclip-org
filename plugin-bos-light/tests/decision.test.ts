import { describe, expect, it } from "vitest";
import { decide } from "../src/decision";
import { registerBosLightPlugin, runPikoDecide } from "../src/worker";

const now = "2026-03-01T00:00:00.000Z";

describe("piko:decide classifier contract", () => {
  it("keeps CLEAR batch approvals compact with low risk diagnostics", () => {
    const decision = decide({
      issue_id: "issue_clear_batch",
      signals: ["Routine batch approve request follows the known approval playbook"],
      confidence: 0.92,
      now
    });

    expect(decision).toMatchObject({
      schema_version: "1.0",
      accepted: true,
      issue_id: "issue_clear_batch",
      cynefin_domain: "CLEAR",
      confidence: 0.92,
      risk_tier: "LOW",
      record_detail: "compact",
      decision_type: "BATCH_APPROVAL",
      decided_by: "Div7.MissionControl",
      decided_at: now,
      diagnostics: {
        validation_errors: [],
        sanitized: true
      }
    });
    if (!decision.accepted) throw new Error("expected accepted decision");
    expect(decision.ooda).toBeUndefined();
    expect(decision.recommended_action).toContain("Betting Table");
    expect(decision.record_markdown).toContain("Risk tier: LOW");
    expect(decision.record_markdown).toContain("## Fallback-Ready Fields");
    expect(decision.record_markdown).toContain("## Validation Diagnostics");
    expect(decision.record_markdown).toContain("## Compact Rationale");
    expect(decision.record_markdown).not.toContain("## Domain Evidence");
    expect(decision.record_markdown).not.toContain("## High-Risk Safeguards");
    expect(decision.diagnostics.domain_evidence).toEqual(expect.arrayContaining([
      expect.objectContaining({ domain: "CLEAR", matched_signals: expect.arrayContaining(["batch", "approve", "approval", "known", "playbook"]) })
    ]));
  });

  it("classifies COMPLICATED policy and budget exceptions with expanded evidence", () => {
    const decision = decide({
      issue_id: "issue_policy_budget",
      signals: ["Policy rule review for a budget exception requires expert constraints"],
      confidence: 0.7,
      now
    });

    expect(decision).toMatchObject({
      accepted: true,
      cynefin_domain: "COMPLICATED",
      risk_tier: "MEDIUM",
      record_detail: "expanded",
      decision_type: "POLICY_UPDATE",
      decided_by: "Div7.MissionControl"
    });
    if (!decision.accepted) throw new Error("expected accepted decision");
    expect(decision.diagnostics.risk_reasons.join(" ")).toMatch(/expert|policy/i);
    expect(decision.diagnostics.domain_evidence).toEqual(expect.arrayContaining([
      expect.objectContaining({ domain: "COMPLICATED", matched_signals: expect.arrayContaining(["policy", "rule", "budget", "expert", "exception", "constraint"]) })
    ]));
    expect(decision.record_markdown).toContain("## Diagnostics");
    expect(decision.record_markdown).toContain("## Domain Evidence");
    expect(decision.record_markdown).toContain("## Policy / Expert Review");
    expect(decision.record_markdown).toContain("## Budget Review");
  });

  it("adds OODA sections for COMPLEX ambiguous strategy decisions", () => {
    const decision = decide({
      issue_id: "issue_complex_strategy",
      signals: ["Unknown emerging strategy needs an ambiguous hypothesis experiment probe"],
      confidence: 0.66,
      now
    });

    expect(decision).toMatchObject({
      accepted: true,
      cynefin_domain: "COMPLEX",
      risk_tier: "HIGH",
      record_detail: "expanded",
      decision_type: "EXPERIMENT"
    });
    if (!decision.accepted) throw new Error("expected accepted decision");
    expect(decision.ooda).toMatchObject({
      observe: expect.any(Array),
      orient: expect.any(Array),
      decide: expect.any(Array),
      act: expect.any(Array)
    });
    expect(decision.record_markdown).toContain("## OODA");
    expect(decision.record_markdown).toContain("## Strategic Probe");
    expect(decision.record_markdown).toContain("## Ambiguity / Disorder Handling");
    expect(decision.record_markdown).toContain("## Complex Decision Control");
    expect(decision.record_markdown).toContain("## High-Risk Safeguards");
  });

  it("classifies CHAOTIC outage and circuit-breaker signals as critical self-healing work", () => {
    const decision = decide({
      issue_id: "issue_chaotic_outage",
      signals: ["Critical outage: runaway circuit breaker incident is down and must stop"],
      confidence: 0.82,
      now
    });

    expect(decision).toMatchObject({
      accepted: true,
      cynefin_domain: "CHAOTIC",
      risk_tier: "CRITICAL",
      record_detail: "expanded",
      decision_type: "SELF_HEALING"
    });
    if (!decision.accepted) throw new Error("expected accepted decision");
    expect(decision.recommended_action).toContain("Stabilize first");
    expect(decision.record_markdown).toContain("## Incident / Containment");
    expect(decision.record_markdown).toContain("## Chaotic Decision Control");
    expect(decision.record_markdown).toContain("## High-Risk Safeguards");
    expect(decision.ooda?.act.join(" ")).toMatch(/Contain/i);
  });

  it("routes mixed low-confidence evidence to DISORDER with uncertainty diagnostics", () => {
    const decision = decide({
      issue_id: "issue_disorder_mixed",
      signals: ["Batch approve request but unknown ambiguous emergency policy exception"],
      confidence: 0.3,
      now
    });

    expect(decision).toMatchObject({
      accepted: true,
      cynefin_domain: "DISORDER",
      confidence: 0.3,
      risk_tier: "HIGH",
      record_detail: "expanded",
      decision_type: "EXPERIMENT"
    });
    if (!decision.accepted) throw new Error("expected accepted decision");
    expect(decision.diagnostics.uncertainty_reasons).toContain("low confidence with mixed domain evidence");
    expect(decision.recommended_action).toMatch(/reclassify/i);
    expect(decision.record_markdown).toContain("## Ambiguity / Disorder Handling");
    expect(decision.record_markdown).toContain("## High-Risk Safeguards");
    expect(decision.ooda).toBeDefined();
  });

  it("clamps confidence and returns deterministic timestamps and decision ids when now is provided", () => {
    const high = decide({ issue_id: "issue_clamp_high", signals: ["batch approve"], confidence: 2, now });
    const low = decide({ issue_id: "issue_clamp_low", signals: ["policy rule"], confidence: -1, now });

    expect(high).toMatchObject({ accepted: true, confidence: 1, decided_at: now, decision_id: "decision_issue_clamp_high_20260301T000000000Z" });
    expect(low).toMatchObject({ accepted: true, confidence: 0, decided_at: now, decision_id: "decision_issue_clamp_low_20260301T000000000Z" });
  });

  it("rejects unsafe issue identifiers before they can enter artifact refs", () => {
    const decision = decide({
      issue_id: "ISS/../../secret-token-1234567890",
      signals: ["Routine batch approve request"],
      confidence: 0.9,
      now
    });

    expect(decision).toMatchObject({
      accepted: false,
      error: "invalid_decision_input",
      issue_id: null,
      diagnostics: {
        validation_errors: expect.arrayContaining(["issue_id must use only safe artifact identifier characters"]),
        sanitized: true
      }
    });
    expect(JSON.stringify(decision)).not.toMatch(/secret-token|\.\.|\//);
  });

  it("returns bounded structured validation errors without stack traces or raw secret values", () => {
    const decision = decide({
      issue_id: "",
      signals: [""],
      confidence: Number.NaN,
      now,
      secret: "api-token-should-not-leak"
    });

    expect(decision).toMatchObject({
      schema_version: "1.0",
      accepted: false,
      error: "invalid_decision_input",
      issue_id: null,
      decided_by: "Div7.MissionControl",
      decided_at: now,
      diagnostics: {
        validation_errors: expect.arrayContaining([
          "issue_id is required",
          "signals must contain only non-empty strings",
          "confidence must be a finite number when provided"
        ]),
        sanitized: true
      }
    });
    expect(JSON.stringify(decision)).not.toMatch(/api-token|stack|\n|\t/);
  });
});

describe("piko:decide worker seam", () => {
  it("returns the same typed result shape through the optional worker tool registration", async () => {
    const tools = new Map<string, (input?: unknown) => Promise<unknown> | unknown>();
    await registerBosLightPlugin({
      logger: { info: () => undefined },
      tools: { register: async (name: string, handler: (input?: unknown) => Promise<unknown> | unknown) => { tools.set(name, handler); } }
    });

    const params = {
      issue_id: "issue_worker_decide",
      signals: ["Policy budget review needs expert constraint"],
      confidence: 0.74,
      now
    };
    const direct = decide(params);
    const seam = runPikoDecide(params);
    const worker = await tools.get("piko:decide")?.(params);

    expect(tools.has("piko:decide")).toBe(true);
    expect(seam).toEqual(direct);
    expect(worker).toEqual(direct);
    expect(worker).toMatchObject({
      accepted: true,
      cynefin_domain: "COMPLICATED",
      record_detail: "expanded",
      diagnostics: { sanitized: true }
    });
    const workerDecision = worker as ReturnType<typeof decide>;
    if (!workerDecision.accepted) {
      throw new Error("expected accepted worker decision");
    }
    expect(workerDecision.record_markdown).toContain("## Policy / Expert Review");
    expect(workerDecision.record_markdown).toContain("## Budget Review");
  });

  it("keeps worker piko:decide malformed input failures structured and bounded", async () => {
    const tools = new Map<string, (input?: unknown) => Promise<unknown> | unknown>();
    await registerBosLightPlugin({
      logger: { info: () => undefined },
      tools: { register: async (name: string, handler: (input?: unknown) => Promise<unknown> | unknown) => { tools.set(name, handler); } }
    });

    const worker = await tools.get("piko:decide")?.({
      issue_id: "",
      signals: [""],
      now,
      secret: "worker-token-should-not-leak"
    });

    expect(worker).toMatchObject({
      accepted: false,
      error: "invalid_decision_input",
      issue_id: null,
      diagnostics: { sanitized: true }
    });
    expect(JSON.stringify(worker)).not.toMatch(/worker-token|stack|\n|\t/);
  });
});
