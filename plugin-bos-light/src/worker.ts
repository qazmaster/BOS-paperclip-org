import { calculateBPIScore } from "./bpi";
import { generateBlueprintMarkdown } from "./blueprint";
import { buildBettingTable, markApprovalRequested } from "./bettingTable";
import { runEvalGates } from "./evalGates";
import { createCircuitBreakerRecord, recordFailure, attachEscalationIssue } from "./circuitBreaker";
import { decide } from "./decision";

/*
  Draft worker skeleton.

  Replace pseudo SDK wiring after C6/C7:
  - confirm definePlugin import path;
  - confirm ctx.tools/data/actions registration API;
  - confirm issues/documents/comments/approvals API;
  - confirm state/entity/config APIs.
*/

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

  // Data provider: Betting Table
  await ctx.data?.register?.("betting-table", async (_context: any) => {
    // TODO: load current cycle from persistence.
    return { items: [] };
  });

  // Action: Approve Batch must create Paperclip-native approval/request, not plugin-side approval.
  await ctx.actions?.register?.("approve-batch", async (input: any) => {
    const issueIds = input.issue_ids ?? [];
    const approval = await ctx.approvals?.create?.({ issueIds, reason: "BOS Light Betting Table batch approval" });
    return { approval };
  });
}
