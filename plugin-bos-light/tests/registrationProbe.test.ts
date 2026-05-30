import { describe, expect, it } from "vitest";
import { BOS_LIGHT_REGISTRATION_INTENT, probeBosLightRegistration } from "../src/registrationProbe";

const expectedPikoTools = [
  "piko:bpi-score",
  "piko:blueprint-gen",
  "piko:bpi-blueprint-artifact",
  "piko:eval-gate",
  "piko:eval-gate-evidence",
  "piko:circuit-breaker-observe",
  "piko:decide"
];

describe("BOS Light registration probe", () => {
  it("records worker registration intent without claiming live Paperclip support", async () => {
    const result = await probeBosLightRegistration();

    expect(result.schema_version).toBe("1.0");
    expect(result.runtime_support_claimed).toBe(false);
    expect(result.intent.tools).toEqual(expectedPikoTools);
    expect(result.intent.dataProviders).toEqual(["betting-table"]);
    expect(result.intent.actions).toEqual(["approve-batch"]);
    expect(result.attempted).toEqual({
      tools: expectedPikoTools,
      dataProviders: ["betting-table"],
      actions: ["approve-batch"]
    });
    expect(result.succeeded).toEqual(result.attempted);
    expect(result.failed).toEqual({ tools: [], dataProviders: [], actions: [] });
    expect(result.skipped).toEqual({ tools: [], dataProviders: [], actions: [] });
    expect(result.warnings).toEqual([]);
    expect(result.validation_errors).toEqual([]);
  });

  it("exposes absent ctx.tools as skipped piko tools instead of host support", async () => {
    const result = await probeBosLightRegistration({ unavailableSurfaces: ["tools"] });

    expect(result.attempted.tools).toEqual([]);
    expect(result.succeeded.tools).toEqual([]);
    expect(result.skipped.tools).toEqual(expectedPikoTools);
    expect(result.failed.tools).toEqual([]);
    expect(result.runtime_support_claimed).toBe(false);
    expect(result.validation_errors).toEqual([]);

    expect(result.attempted.dataProviders).toEqual(["betting-table"]);
    expect(result.attempted.actions).toEqual(["approve-batch"]);
  });

  it("keeps thrown tool, data provider, and action registration failures diagnostic-only", async () => {
    const result = await probeBosLightRegistration({
      failRegistrations: {
        tools: ["piko:eval-gate"],
        dataProviders: ["betting-table"],
        actions: ["approve-batch"]
      }
    });

    expect(result.failed.tools).toEqual([
      {
        key: "piko:eval-gate",
        error: "registration rejected by local probe for tools:piko:eval-gate"
      }
    ]);
    expect(result.failed.dataProviders).toEqual([
      {
        key: "betting-table",
        error: "registration rejected by local probe for dataProviders:betting-table"
      }
    ]);
    expect(result.failed.actions).toEqual([
      {
        key: "approve-batch",
        error: "registration rejected by local probe for actions:approve-batch"
      }
    ]);
    expect(result.succeeded.tools).toEqual(expectedPikoTools.filter((key) => key !== "piko:eval-gate"));
    expect(result.succeeded.dataProviders).toEqual([]);
    expect(result.succeeded.actions).toEqual([]);
    expect(result.attempted.tools).toEqual(expectedPikoTools);
    expect(result.attempted.dataProviders).toEqual(["betting-table"]);
    expect(result.attempted.actions).toEqual(["approve-batch"]);
    expect(result.runtime_support_claimed).toBe(false);
    expect(result.validation_errors).toEqual([]);
    expect(result.logs.filter((entry) => entry.level === "error")).toEqual([]);
    expect(result.warnings.map((entry) => entry.message)).toEqual([
      "Skipped optional BOS Light tool registration",
      "Skipped optional BOS Light data provider registration",
      "Skipped optional BOS Light action registration"
    ]);
  });

  it("keeps the seven piko tool keys canonical", () => {
    expect(BOS_LIGHT_REGISTRATION_INTENT.tools).toEqual(expectedPikoTools);
    expect(BOS_LIGHT_REGISTRATION_INTENT.tools).toHaveLength(7);
    expect(BOS_LIGHT_REGISTRATION_INTENT.tools.every((key) => key.startsWith("piko:"))).toBe(true);
  });

  it("keeps betting-table as the only local data-provider registration key", () => {
    expect(BOS_LIGHT_REGISTRATION_INTENT.dataProviders).toEqual(["betting-table"]);
  });

  it("keeps approve-batch as the only local action registration key", () => {
    expect(BOS_LIGHT_REGISTRATION_INTENT.actions).toEqual(["approve-batch"]);
  });
});
