import { calculateBPIScore } from "./bpi";
import { generateBlueprintMarkdown } from "./blueprint";
import {
  buildAndSaveBettingCycle,
  buildBettingTable,
  loadBettingCycle,
  markApprovalRequested,
  requestBettingCycleApproval,
  saveBettingCycle
} from "./bettingTable";
import { runEvalGates } from "./evalGates";
import { evalGateEvidence } from "./evalGateEvidence";
import { createCircuitBreakerRecord, recordFailure, attachEscalationIssue } from "./circuitBreaker";
import { circuitBreakerFlow } from "./circuitBreakerFlow";
import { decide } from "./decision";
import type { DecisionResult } from "./contracts";
import { runSeededIssueBlueprintFlow } from "./issueBlueprintFlow";
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
  buildAndSaveBettingCycle,
  saveBettingCycle,
  loadBettingCycle,
  requestBettingCycleApproval,
  markApprovalRequested,
  runEvalGates,
  evalGateEvidence,
  createCircuitBreakerRecord,
  recordFailure,
  attachEscalationIssue,
  circuitBreakerFlow,
  decide,
  runSeededIssueBlueprintFlow
};

function firstNonEmptyString(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === "string" && value.trim().length > 0) return value.trim();
  }
  return null;
}

function bettingCycleIdFrom(input: any, ctx: any): string | null {
  return firstNonEmptyString(
    input?.cycle_id,
    input?.cycleId,
    input?.betting_cycle_id,
    input?.input?.cycle_id,
    input?.input?.cycleId,
    input?.params?.cycle_id,
    input?.params?.cycleId,
    input?.context?.cycle_id,
    input?.context?.cycleId,
    ctx?.config?.current_betting_cycle_id,
    ctx?.config?.currentBettingCycleId
  );
}

function issueIdsFrom(input: any): string[] {
  const raw = input?.issue_ids ?? input?.issueIds ?? input?.selected_issue_ids ?? input?.selectedIssueIds ?? [];
  return Array.isArray(raw) ? raw.filter((issueId): issueId is string => typeof issueId === "string") : [];
}

function toolParamsFrom(params: any): Record<string, any> {
  return params && typeof params === "object" && !Array.isArray(params) ? params : {};
}

async function registerOptionalTool(ctx: any, name: string, handler: (params?: any) => Promise<any> | any): Promise<void> {
  if (typeof ctx.tools?.register !== "function") return;

  try {
    await ctx.tools.register(name, handler);
  } catch (error) {
    ctx.logger?.warn?.("Skipped optional BOS Light tool registration", {
      tool: name,
      error: error instanceof Error ? error.message : String(error)
    });
  }
}

async function registerOptionalDataProvider(ctx: any, name: string, handler: (context?: any) => Promise<any> | any): Promise<void> {
  if (typeof ctx.data?.register !== "function") return;

  try {
    await ctx.data.register(name, handler);
  } catch (error) {
    ctx.logger?.warn?.("Skipped optional BOS Light data provider registration", {
      dataProvider: name,
      error: error instanceof Error ? error.message : String(error)
    });
  }
}

async function registerOptionalAction(ctx: any, name: string, handler: (input?: any) => Promise<any> | any): Promise<void> {
  if (typeof ctx.actions?.register !== "function") return;

  try {
    await ctx.actions.register(name, handler);
  } catch (error) {
    ctx.logger?.warn?.("Skipped optional BOS Light action registration", {
      action: name,
      error: error instanceof Error ? error.message : String(error)
    });
  }
}

function adapterFrom(params: Record<string, any>, ctx: any): any {
  return params.adapter ?? ctx.paperclipAdapter ?? ctx.paperclip ?? null;
}

function persistenceFrom(params: Record<string, any>, ctx: any): any {
  return params.persistence ?? ctx.persistence ?? null;
}

export function runPikoDecide(params?: unknown): DecisionResult {
  return decide(params);
}

export async function registerBosLightPlugin(ctx: any): Promise<void> {
  ctx.logger?.info?.("Registering BOS Light plugin draft");

  // Tool: piko:bpi-score
  await registerOptionalTool(ctx, "piko:bpi-score", async (params: any) => calculateBPIScore(params));

  // Tool: piko:blueprint-gen
  await registerOptionalTool(ctx, "piko:blueprint-gen", async (params: any) => generateBlueprintMarkdown(params));

  // Tool: piko:bpi-blueprint-artifact. This is draft wiring only: the host must
  // provide an adapter seam before any document/comment support is implied.
  await registerOptionalTool(ctx, "piko:bpi-blueprint-artifact", async (params: any) => {
    const input = toolParamsFrom(params);
    const adapter = adapterFrom(input, ctx);
    if (!adapter?.createIssueDocument || !adapter?.addIssueComment) {
      return {
        error: "adapter_unavailable",
        message: "piko:bpi-blueprint-artifact requires a caller-provided adapter seam; Paperclip document/comment support remains unproven."
      };
    }

    return runSeededIssueBlueprintFlow({
      ...input,
      adapter,
      persistence: persistenceFrom(input, ctx),
      capabilities: input.capabilities ?? {
        documents_native: "unvalidated",
        comments_native: "unvalidated"
      }
    } as any);
  });

  // Tool: piko:eval-gate
  await registerOptionalTool(ctx, "piko:eval-gate", async (params: any) => runEvalGates(params));

  // Tool: piko:eval-gate-evidence. This composes the pure Eval Gate with
  // cache-overlay and Paperclip-visible evidence seams; absent adapter or
  // persistence support is reported in the returned envelope, not thrown.
  await registerOptionalTool(ctx, "piko:eval-gate-evidence", async (params: any) => {
    const input = toolParamsFrom(params);
    return evalGateEvidence({
      ...input,
      adapter: adapterFrom(input, ctx),
      persistence: persistenceFrom(input, ctx)
    } as any);
  });

  // Tool: piko:circuit-breaker-observe. Each invocation records one bounded
  // observation only; it does not start a background poller or claim live runtime
  // event support beyond the adapter/persistence diagnostics in the envelope.
  await registerOptionalTool(ctx, "piko:circuit-breaker-observe", async (params: any) => {
    const input = toolParamsFrom(params);
    return circuitBreakerFlow({
      ...input,
      adapter: adapterFrom(input, ctx),
      persistence: persistenceFrom(input, ctx)
    } as any);
  });

  // Tool: piko:decide
  await registerOptionalTool(ctx, "piko:decide", async (params: any) => runPikoDecide(params));

  // Data provider: Betting Table. Host data-provider hydration remains unvalidated;
  // this reads only the cache-overlay seam and returns diagnostics rather than
  // claiming durable Paperclip state support.
  await registerOptionalDataProvider(ctx, "betting-table", async (context: any = {}) => {
    const cycle_id = bettingCycleIdFrom(context, ctx);
    if (!cycle_id) {
      return {
        items: [],
        diagnostics: {
          cycle_id: null,
          error: "missing_cycle_id",
          persistence: ctx.persistence ? "provided" : "missing"
        }
      };
    }

    const cycle = await loadBettingCycle({
      cycle_id,
      persistence: context.persistence ?? ctx.persistence
    });

    return {
      items: cycle.items,
      diagnostics: {
        cycle_id: cycle.cycle_id,
        selected_issue_ids: cycle.selected_issue_ids,
        cache_overlay: cycle.cache_overlay
      }
    };
  });

  // Action: Approve Batch delegates to the adapter seam. It never creates a
  // plugin-side approval object and falls back through requestBettingCycleApproval
  // diagnostics when the native Paperclip adapter is unavailable.
  await registerOptionalAction(ctx, "approve-batch", async (input: any = {}) => {
    const cycle_id = bettingCycleIdFrom(input, ctx);
    if (!cycle_id) {
      return {
        error: "missing_cycle_id",
        selected_issue_ids: issueIdsFrom(input),
        selected_surface: "markdown-only",
        message: "approve-batch requires cycle_id or ctx.config.current_betting_cycle_id; no approval request was created."
      };
    }

    return requestBettingCycleApproval({
      cycle_id,
      issue_ids: issueIdsFrom(input),
      reason: firstNonEmptyString(input.reason, input.message) ?? "BOS Light Betting Table batch approval",
      requested_by: firstNonEmptyString(input.requested_by, input.requestedBy) ?? "BOS.Light.Worker",
      adapter: input.adapter ?? ctx.paperclipAdapter ?? ctx.paperclip,
      persistence: input.persistence ?? ctx.persistence,
      now: firstNonEmptyString(input.now) ?? undefined
    });
  });
}
