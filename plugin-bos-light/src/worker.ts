import { calculateBPIScore } from "./bpi";
import { generateBlueprintMarkdown } from "./blueprint";
import { buildBettingTable, markApprovalRequested } from "./bettingTable";
import { runEvalGates } from "./evalGates";
import { createCircuitBreakerRecord, recordFailure, attachEscalationIssue } from "./circuitBreaker";
import { decide } from "./decision";
import { PAPERCLIP_RUNTIME_BOUNDARY_RULES } from "./runtimeCapabilities";

/*
  Draft worker skeleton.

  Source boundary: runtimeCapabilities.ts mirrors the matrix capability keys, and
  capabilities.paperclip-runtime.json remains the evidence source of truth. The
  optional ctx.tools/data/actions calls below are requested runtime surfaces only;
  optional chaining may skip them and must not be read as Paperclip support.

  Replace pseudo SDK wiring after C6/C7:
  - confirm definePlugin import path and plugin load smoke test;
  - confirm ctx.tools/data/actions registration API before exposing piko:* as host tools;
  - confirm issues/documents/comments APIs before treating native artifacts as durable;
  - keep approvals/request creation Paperclip-owned; fallback comments/issues may request review but do not create native approvals;
  - treat state/entity/config APIs as cache/overlay until read/write/restart proof exists;
  - keep issue lifecycle and run-event handling optional behind explicit invocation, bounded polling, and activity fallback.
*/

export const BOS_LIGHT_RUNTIME_BOUNDARY = PAPERCLIP_RUNTIME_BOUNDARY_RULES;

export const BOS_LIGHT_TOOLS = {
  calculateBPIScore,
  generateBlueprintMarkdown,
  buildBettingTable,
  markApprovalRequested,
  runEvalGates,
  createCircuitBreakerRecord,
  recordFailure,
  attachEscalationIssue,
  decide
};

export async function registerBosLightPlugin(ctx: any): Promise<void> {
  ctx.logger?.info?.("Registering BOS Light plugin draft");

  // Tool: piko:bpi-score
  await ctx.tools?.register?.("piko:bpi-score", async (params: any) => calculateBPIScore(params));

  // Tool: piko:blueprint-gen
  await ctx.tools?.register?.("piko:blueprint-gen", async (params: any) => generateBlueprintMarkdown(params));

  // Tool: piko:eval-gate
  await ctx.tools?.register?.("piko:eval-gate", async (params: any) => runEvalGates(params));

  // Tool: piko:decide
  await ctx.tools?.register?.("piko:decide", async (params: any) => decide(params));

  // Data provider: Betting Table. Host data-provider hydration remains unvalidated;
  // use native issues/projects or markdown artifacts until registration.data is proven.
  await ctx.data?.register?.("betting-table", async (_context: any) => {
    // TODO: load current cycle from persistence after state/entities have runtime proof.
    return { items: [] };
  });

  // Action: Approve Batch must create Paperclip-native approval/request, not a local/test-double approval.
  await ctx.actions?.register?.("approve-batch", async (input: any) => {
    const issueIds = input.issue_ids ?? [];
    const approval = await ctx.approvals?.create?.({ issueIds, reason: "BOS Light Betting Table batch approval" });
    return { approval };
  });
}
