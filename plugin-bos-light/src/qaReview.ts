import { createHash } from "crypto";
import type { PaperclipAdapter } from "./paperclipAdapter";
import type { EvalGateResult } from "./contracts";

export interface SecurityFlag {
  severity: "critical" | "warning" | "info";
  category: "secret_leak" | "injection" | "authorization" | "dependency" | "configuration";
  file?: string;
  line?: number;
  message: string;
}

export interface ReviewEnvelope {
  schema_version: "1.0";
  diff_hash: string;
  files_changed: string[];
  lines_added: number;
  lines_removed: number;
  security_flags: SecurityFlag[];
  reviewed_at: string;
  reviewed_by: "Div5.QualificationsLibraryLearning";
}

export interface ReviewResult {
  schema_version: "1.0";
  envelope: ReviewEnvelope;
  eval_gate: EvalGateResult;
  approved_for_merge: boolean;
}

export interface ReviewCriteria {
  gate_id: string;
  description: string;
  is_blocking: boolean;
  check: (envelope: ReviewEnvelope) => boolean;
}

const SECURITY_PATTERNS: Array<{
  severity: SecurityFlag["severity"];
  category: SecurityFlag["category"];
  pattern: RegExp;
  message: string;
}> = [
  {
    severity: "critical",
    category: "secret_leak",
    pattern: /(password|secret|token|key|api_key)\s*[:=]\s*["'][^"']{8,}["']/i,
    message: "Potential hardcoded secret detected",
  },
  {
    severity: "critical",
    category: "injection",
    pattern: /eval\s*\(|new\s+Function\s*\(|exec\s*\(/i,
    message: "Potential code injection vector",
  },
  {
    severity: "warning",
    category: "authorization",
    pattern: /skipAuth|disableAuth|auth\s*=\s*false|noauth/i,
    message: "Authentication bypass detected",
  },
  {
    severity: "warning",
    category: "dependency",
    pattern: /http:\/\/(?!localhost|127\.0\.0\.1)/i,
    message: "Insecure HTTP dependency",
  },
  {
    severity: "info",
    category: "configuration",
    pattern: /TODO|FIXME|HACK|XXX/i,
    message: "Code comment indicates unfinished work",
  },
];

export function hashDiff(diffText: string): string {
  return createHash("sha256").update(diffText).digest("hex");
}

export function parseDiff(diffText: string): Pick<ReviewEnvelope, "files_changed" | "lines_added" | "lines_removed"> {
  const lines = diffText.split("\n");
  const filesChanged = new Set<string>();
  let linesAdded = 0;
  let linesRemoved = 0;

  for (const line of lines) {
    if (line.startsWith("diff --git ")) {
      const match = line.match(/diff --git a\/(.+?) b\/(.+?)$/);
      if (match) {
        filesChanged.add(match[2]);
      }
    } else if (line.startsWith("--- ") && !line.startsWith("--- /dev/null")) {
      const file = line.slice(6).trim();
      if (file) filesChanged.add(file);
    } else if (line.startsWith("+++ ") && !line.startsWith("+++ /dev/null")) {
      const file = line.slice(6).trim();
      if (file) filesChanged.add(file);
    } else if (line.startsWith("+")) {
      linesAdded++;
    } else if (line.startsWith("-")) {
      linesRemoved++;
    }
  }

  return {
    files_changed: Array.from(filesChanged),
    lines_added: linesAdded,
    lines_removed: linesRemoved,
  };
}

export function scanSecurity(diffText: string, files: string[]): SecurityFlag[] {
  const flags: SecurityFlag[] = [];
  const lines = diffText.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.startsWith("+")) continue;
    const content = line.slice(1);

    for (const sp of SECURITY_PATTERNS) {
      if (sp.pattern.test(content)) {
        // Try to find which file this line belongs to
        let file: string | undefined;
        for (let j = i; j >= 0; j--) {
          const prev = lines[j];
          if (prev.startsWith("+++ ")) {
            const f = prev.slice(6).trim();
            if (f && f !== "/dev/null") {
              file = f;
              break;
            }
          }
          if (prev.startsWith("diff --git ")) {
            const match = prev.match(/diff --git a\/(.+?) b\/(.+?)$/);
            if (match) {
              file = match[2];
              break;
            }
          }
        }

        flags.push({
          severity: sp.severity,
          category: sp.category,
          file,
          line: i + 1,
          message: sp.message,
        });
      }
    }
  }

  return flags;
}

export function reviewDiff(diffText: string): ReviewEnvelope {
  const parsed = parseDiff(diffText);
  const flags = scanSecurity(diffText, parsed.files_changed);

  return {
    schema_version: "1.0",
    diff_hash: hashDiff(diffText),
    files_changed: parsed.files_changed,
    lines_added: parsed.lines_added,
    lines_removed: parsed.lines_removed,
    security_flags: flags,
    reviewed_at: new Date().toISOString(),
    reviewed_by: "Div5.QualificationsLibraryLearning",
  };
}

export function runEvalGate(
  envelope: ReviewEnvelope,
  criteria: ReviewCriteria[]
): EvalGateResult {
  const gates: EvalGateResult["gates"] = criteria.map((c) => ({
    gate_id: c.gate_id as "LARS.Deterministic" | "LARS.SecurityPolicy" | "LARS.ArtifactIntegrity" | "LARS.Budget",
    status: c.check(envelope) ? "PASSED" : "FAILED",
    evidence: c.description,
    is_blocking: c.is_blocking,
  }));

  const blockingFailureCount = gates.filter((g) => g.is_blocking && g.status === "FAILED").length;
  const warningCount = gates.filter((g) => !g.is_blocking && g.status === "FAILED").length;
  const notRunCount = gates.filter((g) => g.status === "NOT_RUN").length;

  const overall: EvalGateResult["overall"] =
    notRunCount > 0
      ? "INCOMPLETE"
      : blockingFailureCount > 0
        ? "FAILED_BLOCKING"
        : warningCount > 0
          ? "PASSED_WITH_WARNINGS"
          : "PASSED";

  return {
    schema_version: "1.0",
    issue_id: "qa-review",
    run_id: null,
    gates,
    overall,
    blocking_failure_count: blockingFailureCount,
    warning_count: warningCount,
    not_run_count: notRunCount,
    evaluated_at: new Date().toISOString(),
    evaluated_by: "Div5.QualificationsLibraryLearning",
  };
}

export function isApprovedForMerge(reviewResult: ReviewResult): boolean {
  if (reviewResult.eval_gate.overall === "FAILED_BLOCKING" || reviewResult.eval_gate.overall === "INCOMPLETE") {
    return false;
  }
  const hasCritical = reviewResult.envelope.security_flags.some((f) => f.severity === "critical");
  return !hasCritical;
}

export async function produceReviewArtifact(
  reviewResult: ReviewResult,
  issueId: string,
  adapter: PaperclipAdapter
): Promise<{ artifact_id: string; artifact_type: "document" | "comment" }> {
  const markdown = buildReviewMarkdown(reviewResult);

  try {
    const doc = await adapter.createIssueDocument(issueId, `QA Review: ${issueId}`, markdown);
    return { artifact_id: doc.document_id, artifact_type: "document" };
  } catch (err) {
    const comment = await adapter.addIssueComment(issueId, markdown);
    return { artifact_id: comment.comment_id, artifact_type: "comment" };
  }
}

function buildReviewMarkdown(reviewResult: ReviewResult): string {
  const e = reviewResult.envelope;
  const g = reviewResult.eval_gate;

  const flagLines = e.security_flags.length
    ? e.security_flags
        .map(
          (f) =>
            `- **${f.severity.toUpperCase()}** [${f.category}] ${f.message}${f.file ? ` (${f.file}${f.line ? `:${f.line}` : ""})` : ""}`
        )
        .join("\n")
    : "No security flags detected.";

  const gateLines = g.gates
    .map((gate) => `- **${gate.gate_id}**: ${gate.status}${gate.is_blocking ? " (blocking)" : ""}`)
    .join("\n");

  return `# QA Review Result

- Diff hash: \`${e.diff_hash.slice(0, 16)}...\`
- Files changed: ${e.files_changed.length}
- Lines added: ${e.lines_added}
- Lines removed: ${e.lines_removed}
- Approved for merge: ${reviewResult.approved_for_merge ? "YES" : "NO"}

## Security Flags
${flagLines}

## Eval Gate
${gateLines}

- Overall: **${g.overall}**
- Blocking failures: ${g.blocking_failure_count}

*Reviewed at: ${e.reviewed_at} by ${e.reviewed_by}*`;
}

export class QAReview {
  private adapter: PaperclipAdapter;

  constructor(adapter: PaperclipAdapter) {
    this.adapter = adapter;
  }

  reviewDiff(diffText: string): ReviewEnvelope {
    return reviewDiff(diffText);
  }

  runEvalGate(envelope: ReviewEnvelope, criteria: ReviewCriteria[]): EvalGateResult {
    return runEvalGate(envelope, criteria);
  }

  isApprovedForMerge(reviewResult: ReviewResult): boolean {
    return isApprovedForMerge(reviewResult);
  }

  async produceReviewArtifact(reviewResult: ReviewResult, issueId: string): Promise<{ artifact_id: string; artifact_type: "document" | "comment" }> {
    return produceReviewArtifact(reviewResult, issueId, this.adapter);
  }

  fullReview(diffText: string, criteria: ReviewCriteria[]): ReviewResult {
    const envelope = this.reviewDiff(diffText);
    const evalGate = this.runEvalGate(envelope, criteria);
    const result: ReviewResult = {
      schema_version: "1.0",
      envelope,
      eval_gate: evalGate,
      approved_for_merge: false,
    };
    return { ...result, approved_for_merge: this.isApprovedForMerge(result) };
  }
}
