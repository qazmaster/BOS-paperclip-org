import type {
  BPIScore,
  BosStatusOverlay,
  BosStatus,
  BettingTableItem,
  EvalGateResult,
  CircuitBreakerRecord,
  DecisionMetadata,
  CynefinDomain,
  DecisionRiskTier,
  DecisionRecordDetailLevel,
  DecisionType,
} from "./contracts";
import type { PaperclipAdapter } from "./paperclipAdapter";

export interface ReadablePaperclipAdapter extends PaperclipAdapter {
  getIssueDocuments(issueId: string): Promise<Array<{ title: string; markdown: string }>>;
  getIssueComments(issueId: string): Promise<Array<{ markdown: string }>>;
}

export interface ReconstructionEnvelope {
  schema_version: "1.0";
  issue_id: string;
  reconstructed_at: string;
  found: {
    bpi?: BPIScore;
    status?: BosStatusOverlay;
    betting_table?: BettingTableItem[];
    gate_result?: EvalGateResult;
    circuit_breaker?: CircuitBreakerRecord;
    decision?: DecisionMetadata;
  };
  missing: string[];
  fallback_used: boolean;
  diagnostics: {
    documents_scraped: number;
    comments_scraped: number;
    parse_errors: string[];
  };
}

function now(): string {
  return new Date().toISOString();
}

function safeParseBool(value: string | undefined): boolean | undefined {
  if (value === undefined) return undefined;
  const lower = value.toLowerCase().trim();
  if (lower === "true") return true;
  if (lower === "false") return false;
  return undefined;
}

function safeParseNumber(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const n = Number(value.trim());
  return Number.isNaN(n) ? undefined : n;
}

function extractListItem(markdown: string, key: string): string | undefined {
  const match = markdown.match(new RegExp(`^-\\s*${key}:\\s*(.+)$`, "m"));
  return match?.[1].trim();
}

function extractBoldItem(markdown: string, key: string): string | undefined {
  const match = markdown.match(new RegExp(`^-\\s*${key}:\\s*\\*\\*(.+?)\\*\\*$`, "m"));
  return match?.[1].trim();
}

function parseBPI(issueId: string, markdown: string): BPIScore | null {
  try {
    const score = safeParseNumber(extractListItem(markdown, "Score"));
    const formula = extractListItem(markdown, "Formula");
    const scoredBy = extractListItem(markdown, "Scored by");
    const scoredAt = extractListItem(markdown, "Scored at");

    if (score === undefined || !formula || !scoredBy || !scoredAt) return null;

    const components: BPIScore["components"] = {
      expected_value: safeParseNumber(extractListItem(markdown, "expected_value")) ?? 0,
      urgency: safeParseNumber(extractListItem(markdown, "urgency")) ?? 0,
      estimated_token_cost: safeParseNumber(extractListItem(markdown, "estimated_token_cost")) ?? 0,
      risk_factor: safeParseNumber(extractListItem(markdown, "risk_factor")) ?? 0,
      company_token_budget_ref: safeParseNumber(extractListItem(markdown, "company_token_budget_ref")) ?? 0,
    };

    const hardGates: BPIScore["hard_gates"] = {
      strategic_weight_passed: safeParseBool(extractListItem(markdown, "strategic_weight_passed")) ?? false,
      budget_snapshot_available: safeParseBool(extractListItem(markdown, "budget_snapshot_available")) ?? false,
      acceptance_inputs_present: safeParseBool(extractListItem(markdown, "acceptance_inputs_present")) ?? false,
      policy_precheck_passed: safeParseBool(extractListItem(markdown, "policy_precheck_passed")) ?? false,
      security_precheck_passed: safeParseBool(extractListItem(markdown, "security_precheck_passed")) ?? false,
    };

    return {
      schema_version: "1.0",
      score,
      formula: formula as BPIScore["formula"],
      components,
      hard_gates: hardGates,
      scored_by: scoredBy as BPIScore["scored_by"],
      scored_at: scoredAt,
      source_issue_id: issueId,
    };
  } catch {
    return null;
  }
}

function parseStatus(issueId: string, markdown: string): BosStatusOverlay | null {
  try {
    const status = extractListItem(markdown, "Status");
    const producer = extractListItem(markdown, "Producer");
    const blueprint = extractListItem(markdown, "Blueprint");
    const bpi = extractListItem(markdown, "BPI");
    const updated = extractListItem(markdown, "Updated");

    if (!status || !producer) return null;

    return {
      schema_version: "1.0",
      issue_id: issueId,
      bos_status: status as BosStatus,
      producer_division: producer as BosStatusOverlay["producer_division"],
      blueprint_id: blueprint === "none" || blueprint === "null" ? null : (blueprint ?? null),
      bpi_score: bpi === "unscored" || bpi === undefined ? null : safeParseNumber(bpi) ?? null,
      updated_at: updated ?? now(),
    };
  } catch {
    return null;
  }
}

function parseBettingTable(issueId: string, markdown: string): { cycleId: string; items: BettingTableItem[] } | null {
  try {
    const titleMatch = markdown.match(/^# Betting Table:\s*(.+)$/m);
    const cycleId = titleMatch?.[1].trim();
    if (!cycleId) return null;

    const tableRows: BettingTableItem[] = [];
    const lines = markdown.split("\n");
    for (const line of lines) {
      const rowMatch = line.match(/^\|\s*(.+?)\s*\|\s*(.+?)\s*\|\s*(.+?)\s*\|\s*(.+?)\s*\|$/);
      if (!rowMatch) continue;
      const [, issue_id_raw, bpi_raw, status_raw, approval_raw] = rowMatch;
      const issue_id = issue_id_raw.trim();
      if (issue_id === "Issue" || issue_id === "---" || issue_id === "-") continue;
      const bpi_score = safeParseNumber(bpi_raw);
      if (bpi_score === undefined) continue;

      const status = status_raw.trim() as BettingTableItem["status"];
      const approval = approval_raw.trim();

      tableRows.push({
        schema_version: "1.0",
        cycle_id: cycleId,
        issue_id,
        bpi_score,
        blueprint_id: null,
        status,
        native_approval_request_id: null,
        native_approval_status: approval === "none" || approval === "null" ? null : (approval as BettingTableItem["native_approval_status"]),
        approved_by: null,
        created_at: now(),
        updated_at: now(),
      });
    }

    return { cycleId, items: tableRows };
  } catch {
    return null;
  }
}

function parseGateResult(issueId: string, markdown: string): EvalGateResult | null {
  try {
    const runId = extractListItem(markdown, "Run");
    const overall = extractBoldItem(markdown, "Overall") ?? extractListItem(markdown, "Overall");
    const blockingFailures = safeParseNumber(extractListItem(markdown, "Blocking failures"));
    const warnings = safeParseNumber(extractListItem(markdown, "Warnings"));
    const notRun = safeParseNumber(extractListItem(markdown, "Not run"));
    const evaluatedAt = extractListItem(markdown, "Evaluated at");
    const evaluatedBy = extractListItem(markdown, "by");

    if (!overall) return null;

    const gates: EvalGateResult["gates"] = [];
    const gatePattern = /^- \*\*(LARS\.[\w.]+)\*\*:[^\S\r\n]*(PASSED|FAILED|NOT_RUN)(\s*\(blocking\))?[^\S\r\n]*(?:[—-][^\S\r\n]*(.+?))?$/gm;
    let m: RegExpExecArray | null;
    while ((m = gatePattern.exec(markdown)) !== null) {
      gates.push({
        gate_id: m[1] as EvalGateResult["gates"][number]["gate_id"],
        status: m[2] as EvalGateResult["gates"][number]["status"],
        is_blocking: !!m[3],
        evidence: m[4]?.trim() ?? null,
      });
    }

    return {
      schema_version: "1.0",
      issue_id: issueId,
      run_id: runId === "N/A" || runId === undefined ? null : runId,
      gates,
      overall: overall as EvalGateResult["overall"],
      blocking_failure_count: blockingFailures ?? 0,
      warning_count: warnings ?? 0,
      not_run_count: notRun ?? 0,
      evaluated_at: evaluatedAt ?? now(),
      evaluated_by: (evaluatedBy ?? "Div5.QualificationsLibraryLearning") as EvalGateResult["evaluated_by"],
    };
  } catch {
    return null;
  }
}

function parseCircuitBreaker(issueId: string, markdown: string): CircuitBreakerRecord | null {
  try {
    const state = extractBoldItem(markdown, "State") ?? extractListItem(markdown, "State");
    const attemptsLine = extractListItem(markdown, "Attempts");
    const attempts = attemptsLine?.includes("/")
      ? safeParseNumber(attemptsLine.split("/")[0].trim())
      : safeParseNumber(attemptsLine);
    const maxAttempts = attemptsLine?.includes("/")
      ? safeParseNumber(attemptsLine.split("/")[1].trim())
      : undefined;
    const halfOpenThreshold = safeParseNumber(extractListItem(markdown, "Half-open threshold"));
    const lastFailure = extractListItem(markdown, "Last failure");
    const lastFailureReason = extractListItem(markdown, "Last failure reason");
    const openedAt = extractListItem(markdown, "Opened at");
    const escalationIssue = extractListItem(markdown, "Escalation issue");

    if (!state) return null;

    return {
      schema_version: "1.0",
      issue_id: issueId,
      state: state as CircuitBreakerRecord["state"],
      attempt_count: attempts ?? 0,
      max_attempts: maxAttempts ?? 3,
      half_open_threshold: halfOpenThreshold ?? 1,
      last_failure_at: lastFailure === "never" || lastFailure === "null" || lastFailure === undefined ? null : lastFailure,
      last_failure_reason: lastFailureReason === "none" || lastFailureReason === "null" || lastFailureReason === undefined ? null : lastFailureReason,
      opened_at: openedAt === "not opened" || openedAt === "null" || openedAt === undefined ? null : openedAt,
      escalation_issue_id: escalationIssue === "none" || escalationIssue === "null" || escalationIssue === undefined ? null : escalationIssue,
      updated_at: now(),
    };
  } catch {
    return null;
  }
}

function parseDecision(issueId: string, markdown: string): DecisionMetadata | null {
  try {
    const decisionId = extractListItem(markdown, "Decision");
    const domain = extractListItem(markdown, "Domain");
    const confidence = safeParseNumber(extractListItem(markdown, "Confidence"));
    const riskTier = extractListItem(markdown, "Risk tier");
    const recordDetail = extractListItem(markdown, "Record detail");
    const decisionType = extractListItem(markdown, "Type");
    const recommendedAction = extractListItem(markdown, "Recommended action");
    const decidedBy = extractListItem(markdown, "Decided by");
    const decidedAt = extractListItem(markdown, "Decided at");

    if (!decisionId || !domain || confidence === undefined) return null;

    return {
      schema_version: "1.0",
      accepted: true,
      decision_id: decisionId,
      issue_id: issueId,
      cynefin_domain: domain as CynefinDomain,
      confidence,
      risk_tier: (riskTier ?? "MEDIUM") as DecisionRiskTier,
      record_detail: (recordDetail ?? "compact") as DecisionRecordDetailLevel,
      decision_type: (decisionType ?? "BATCH_APPROVAL") as DecisionType,
      emitted_events: [],
      recommended_action: recommendedAction ?? "",
      decided_by: (decidedBy ?? "Div7.MissionControl") as DecisionMetadata["decided_by"],
      decided_at: decidedAt ?? now(),
      diagnostics: {
        domain_evidence: [],
        selected_domain_reasons: [],
        risk_reasons: [],
        validation_errors: [],
        uncertainty_reasons: [],
        sanitized: true,
      },
      record_markdown: markdown,
    };
  } catch {
    return null;
  }
}

export async function reconstructStateFromArtifacts(
  adapter: ReadablePaperclipAdapter,
  issueId: string
): Promise<ReconstructionEnvelope> {
  const diagnostics: ReconstructionEnvelope["diagnostics"] = {
    documents_scraped: 0,
    comments_scraped: 0,
    parse_errors: [],
  };

  const found: ReconstructionEnvelope["found"] = {};
  const missing: string[] = [];
  let fallback_used = false;

  try {
    const documents = await adapter.getIssueDocuments(issueId);
    diagnostics.documents_scraped = documents.length;

    for (const doc of documents) {
      if (doc.title.includes("BPI Score")) {
        const bpi = parseBPI(issueId, doc.markdown);
        if (bpi) {
          found.bpi = bpi;
        } else {
          diagnostics.parse_errors.push(`Failed to parse BPI from document: ${doc.title}`);
          fallback_used = true;
        }
      } else if (doc.title.includes("Betting Table")) {
        const bt = parseBettingTable(issueId, doc.markdown);
        if (bt && bt.items.length > 0) {
          found.betting_table = bt.items;
        } else {
          diagnostics.parse_errors.push(`Failed to parse betting table from document: ${doc.title}`);
          fallback_used = true;
        }
      } else if (doc.title.includes("Circuit Breaker")) {
        const cb = parseCircuitBreaker(issueId, doc.markdown);
        if (cb) {
          found.circuit_breaker = cb;
        } else {
          diagnostics.parse_errors.push(`Failed to parse circuit breaker from document: ${doc.title}`);
          fallback_used = true;
        }
      }
    }
  } catch (err) {
    diagnostics.parse_errors.push(`Document read error: ${err instanceof Error ? err.message : String(err)}`);
    fallback_used = true;
  }

  try {
    const comments = await adapter.getIssueComments(issueId);
    diagnostics.comments_scraped = comments.length;

    for (const comment of comments) {
      if (comment.markdown.includes("BOS Status Update")) {
        const status = parseStatus(issueId, comment.markdown);
        if (status) {
          found.status = status;
        } else {
          diagnostics.parse_errors.push("Failed to parse status from comment");
          fallback_used = true;
        }
      } else if (comment.markdown.includes("Eval Gate Result")) {
        const gate = parseGateResult(issueId, comment.markdown);
        if (gate) {
          found.gate_result = gate;
        } else {
          diagnostics.parse_errors.push("Failed to parse gate result from comment");
          fallback_used = true;
        }
      } else if (comment.markdown.includes("Decision Record")) {
        const decision = parseDecision(issueId, comment.markdown);
        if (decision) {
          found.decision = decision;
        } else {
          diagnostics.parse_errors.push("Failed to parse decision from comment");
          fallback_used = true;
        }
      }
    }
  } catch (err) {
    diagnostics.parse_errors.push(`Comment read error: ${err instanceof Error ? err.message : String(err)}`);
    fallback_used = true;
  }

  if (!found.bpi) missing.push("bpi");
  if (!found.status) missing.push("status");
  if (!found.betting_table) missing.push("betting_table");
  if (!found.gate_result) missing.push("gate_result");
  if (!found.circuit_breaker) missing.push("circuit_breaker");
  if (!found.decision) missing.push("decision");

  return {
    schema_version: "1.0",
    issue_id: issueId,
    reconstructed_at: now(),
    found,
    missing,
    fallback_used,
    diagnostics,
  };
}
