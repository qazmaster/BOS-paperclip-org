import type {
  DecisionArtifactEnvelope,
  DecisionArtifactReadbackDiagnostic,
  DecisionArtifactReadbackResult,
  DecisionArtifactSurface
} from "./contracts";
import type { LivePaperclipFetch, LivePaperclipFetchResponse } from "./livePaperclipAdapter";

export type LiveDecisionArtifactReadbackPathBuilder = (context: {
  baseUrl: string;
  companyId: string;
  issueId: string;
  artifactId: string;
}) => string;

export interface LiveDecisionArtifactReadbackPathConfig {
  readIssueDocument?: string | LiveDecisionArtifactReadbackPathBuilder;
  readIssueComment?: string | LiveDecisionArtifactReadbackPathBuilder;
}

export interface ReadbackDecisionArtifactEnvelopeOptions {
  fetch: LivePaperclipFetch;
  baseUrl: string;
  companyId: string;
  issueId?: string;
  headers?: Record<string, string>;
  timeoutMs?: number;
  paths?: LiveDecisionArtifactReadbackPathConfig;
}

interface ParsedArtifactRef {
  surface: DecisionArtifactSurface;
  issueId: string | null;
  artifactId: string;
}

const SCHEMA_VERSION: DecisionArtifactReadbackResult["schema_version"] = "live-decision-artifact-readback/v1";
const DEFAULT_TIMEOUT_MS = 5_000;
const MAX_DIAGNOSTIC_TEXT = 500;
const MAX_SNIPPET_TEXT = 500;
const SAFE_REF_PART = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const SECRET_VALUE_PATTERNS = [
  /\bBearer\s+[A-Za-z0-9._~+\/-]+=*/gi,
  /\b(access[_-]?token|refresh[_-]?token|session[_-]?token|api[_\s-]?key|token|secret|authorization|cookie|password)\s*[:=]\s*("[^"]+"|'[^']+'|[^\s,;]+)/gi,
  /\b(access[_-]?token|refresh[_-]?token|session[_-]?token|token|secret|password|authorization|cookie)\s+(?:is\s+)?[A-Za-z0-9._~+\/-]{8,}\b/gi,
  /\b(sk|pk)_(live|test)_[A-Za-z0-9]{12,}\b/g,
  /\b[A-Za-z0-9_-]{24,}\.[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{20,}\b/g
];

function redactSensitiveText(value: unknown): string {
  const raw = value instanceof Error && value.message ? value.message : String(value ?? "");
  let redacted = raw.replace(/[\r\n\t]+/g, " ").replace(/\s{2,}/g, " ").trim();
  for (const pattern of SECRET_VALUE_PATTERNS) {
    redacted = redacted.replace(pattern, (match, key) => {
      if (typeof key === "string" && key.length > 0 && !/^sk|pk$/i.test(key)) return `${key}=[REDACTED]`;
      return "[REDACTED]";
    });
  }
  return redacted.slice(0, MAX_DIAGNOSTIC_TEXT);
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

function encodePathPart(value: string): string {
  return encodeURIComponent(value);
}

function joinUrl(baseUrl: string, path: string): string {
  if (/^https?:\/\//i.test(path)) return path;
  return `${trimTrailingSlash(baseUrl)}/${path.replace(/^\/+/, "")}`;
}

function resolvePath(input: {
  configured?: string | LiveDecisionArtifactReadbackPathBuilder;
  baseUrl: string;
  companyId: string;
  issueId: string;
  artifactId: string;
  surface: "documents.native" | "comments.native";
}): string {
  const context = {
    baseUrl: trimTrailingSlash(input.baseUrl),
    companyId: input.companyId,
    issueId: input.issueId,
    artifactId: input.artifactId
  };
  const defaultPath = input.surface === "documents.native"
    ? `/api/companies/${encodePathPart(input.companyId)}/issues/${encodePathPart(input.issueId)}/documents/${encodePathPart(input.artifactId)}`
    : `/api/companies/${encodePathPart(input.companyId)}/issues/${encodePathPart(input.issueId)}/comments/${encodePathPart(input.artifactId)}`;
  const path = typeof input.configured === "function" ? input.configured(context) : input.configured ?? defaultPath;
  return joinUrl(input.baseUrl, path);
}

function parseArtifactRef(envelope: DecisionArtifactEnvelope): ParsedArtifactRef | null {
  const ref = envelope.artifact_ref;
  if (ref.startsWith("markdown-only://")) {
    const match = /^markdown-only:\/\/issues\/([^/]+)\/decisions\/([^/?#]+)$/.exec(ref);
    if (!match) return null;
    return { surface: "markdown-only", issueId: match[1], artifactId: match[2] };
  }

  const match = /^paperclip:\/\/issues\/([^/]+)\/(documents|comments)\/([^/?#]+)$/.exec(ref);
  if (!match) return null;
  const [, issueId, collection, artifactId] = match;
  const surface: DecisionArtifactSurface = collection === "documents" ? "documents.native" : "comments.native";
  return { surface, issueId, artifactId };
}

function isSafeRefPart(value: string | null): value is string {
  if (!value) return false;
  return SAFE_REF_PART.test(value) && !value.includes("..") && !value.includes("/") && !value.includes("\\");
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => reject(new Error(`timeout after ${timeoutMs}ms`)), timeoutMs);
      })
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

async function sha256Hex(text: string): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function readStringAtPath(value: unknown, path: string[]): string | null {
  let cursor = value;
  for (const segment of path) {
    if (!cursor || typeof cursor !== "object" || !(segment in cursor)) return null;
    cursor = (cursor as Record<string, unknown>)[segment];
  }
  return typeof cursor === "string" && cursor.trim().length > 0 ? cursor : null;
}

function firstStringAtPath(value: unknown, paths: string[][]): string | null {
  for (const path of paths) {
    const found = readStringAtPath(value, path);
    if (found) return found;
  }
  return null;
}

function extractContent(payload: unknown, rawText: string | null): string | null {
  const fromPayload = firstStringAtPath(payload, [
    ["markdown"],
    ["body"],
    ["content"],
    ["text"],
    ["document", "markdown"],
    ["document", "body"],
    ["document", "content"],
    ["comment", "body"],
    ["comment", "content"],
    ["data", "markdown"],
    ["data", "body"],
    ["data", "content"],
    ["result", "markdown"],
    ["result", "body"],
    ["result", "content"]
  ]);
  if (fromPayload) return fromPayload;
  if (rawText && rawText.trim().length > 0 && !/^\s*[\[{]/.test(rawText)) return rawText;
  return null;
}

async function readResponseBody(response: LivePaperclipFetchResponse, timeoutMs: number): Promise<{ rawText: string | null; json: unknown; malformed: string | null }> {
  let rawText: string | null = null;
  if (typeof response.text === "function") rawText = await withTimeout(response.text(), timeoutMs);
  if (rawText !== null && rawText.trim().length > 0) {
    try {
      return { rawText, json: JSON.parse(rawText), malformed: null };
    } catch (error) {
      return { rawText, json: null, malformed: redactSensitiveText(error) };
    }
  }
  if (typeof response.json === "function") {
    try {
      return { rawText, json: await withTimeout(response.json(), timeoutMs), malformed: null };
    } catch (error) {
      return { rawText, json: null, malformed: redactSensitiveText(error) };
    }
  }
  return { rawText, json: null, malformed: null };
}

function diagnostic(input: Partial<Omit<DecisionArtifactReadbackDiagnostic, "message">> & { phase: DecisionArtifactReadbackDiagnostic["phase"]; message: unknown }): DecisionArtifactReadbackDiagnostic {
  return {
    phase: input.phase,
    status_code: input.status_code ?? null,
    bounded_response_text: input.bounded_response_text ? redactSensitiveText(input.bounded_response_text) : null,
    malformed_json_reason: input.malformed_json_reason ? redactSensitiveText(input.malformed_json_reason) : null,
    timeout_ms: input.timeout_ms ?? null,
    fallback_used: input.fallback_used ?? false,
    message: redactSensitiveText(input.message)
  };
}

function baseResult(
  envelope: DecisionArtifactEnvelope,
  status: DecisionArtifactReadbackResult["status"],
  diagnostics: DecisionArtifactReadbackDiagnostic[],
  overrides: Partial<DecisionArtifactReadbackResult> = {}
): DecisionArtifactReadbackResult {
  return {
    schema_version: SCHEMA_VERSION,
    selected_surface: envelope.selected_surface,
    artifact_ref: envelope.artifact_ref,
    artifact_id: envelope.artifact_id,
    issue_id: envelope.issue_id,
    status,
    live_proof: false,
    sha256: null,
    expected_sha256: null,
    snippet: null,
    diagnostics,
    invariants: {
      decided_by: "Div7.MissionControl",
      diagnostics_sanitized: true,
      native_approval_mutated: false
    },
    ...overrides
  };
}

export async function readbackDecisionArtifactEnvelope(
  envelope: DecisionArtifactEnvelope,
  options: ReadbackDecisionArtifactEnvelopeOptions
): Promise<DecisionArtifactReadbackResult> {
  const parsed = parseArtifactRef(envelope);
  if (!parsed) {
    return baseResult(envelope, "unsupported-ref", [
      diagnostic({ phase: "artifact-ref.parse", fallback_used: true, message: "artifact_ref shape is unsupported for live readback" })
    ]);
  }

  if (parsed.surface === "markdown-only") {
    return baseResult(envelope, "fail-closed", [
      diagnostic({ phase: "artifact-ref.parse", fallback_used: true, message: "markdown-only artifact ref is handoff evidence, not live proof" })
    ]);
  }

  const issueId = options.issueId ?? parsed.issueId ?? envelope.issue_id;
  if (!isSafeRefPart(issueId) || !isSafeRefPart(parsed.artifactId)) {
    return baseResult(envelope, "unsafe-ref", [
      diagnostic({ phase: "artifact-ref.parse", fallback_used: true, message: "artifact_ref contained an unsafe issue or artifact identifier" })
    ]);
  }

  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const phase = parsed.surface === "documents.native" ? "documents.read" : "comments.read";
  const configured = parsed.surface === "documents.native" ? options.paths?.readIssueDocument : options.paths?.readIssueComment;
  const url = resolvePath({
    configured,
    baseUrl: options.baseUrl,
    companyId: options.companyId,
    issueId,
    artifactId: parsed.artifactId,
    surface: parsed.surface
  });

  let response: LivePaperclipFetchResponse;
  try {
    response = await withTimeout(
      options.fetch(url, {
        method: "GET",
        headers: { accept: "application/json", ...(options.headers ?? {}) }
      }),
      timeoutMs
    );
  } catch (error) {
    const timeout = error instanceof Error && error.message.includes("timeout after") ? timeoutMs : null;
    return baseResult(envelope, timeout ? "timeout" : "denied", [
      diagnostic({ phase, timeout_ms: timeout, fallback_used: true, message: error })
    ]);
  }

  let body: Awaited<ReturnType<typeof readResponseBody>>;
  try {
    body = await readResponseBody(response, timeoutMs);
  } catch (error) {
    const timeout = error instanceof Error && error.message.includes("timeout after") ? timeoutMs : null;
    return baseResult(envelope, timeout ? "timeout" : "malformed", [
      diagnostic({ phase, status_code: response.status, timeout_ms: timeout, fallback_used: true, message: error })
    ]);
  }

  const responseText = body.rawText ?? (body.json === null || body.json === undefined ? null : JSON.stringify(body.json));
  if (!response.ok) {
    return baseResult(envelope, response.status === 401 || response.status === 403 || response.status === 404 ? "denied" : "malformed", [
      diagnostic({
        phase,
        status_code: response.status,
        bounded_response_text: responseText,
        malformed_json_reason: body.malformed,
        fallback_used: true,
        message: `Paperclip ${phase} failed with status ${response.status}`
      })
    ]);
  }

  if (body.malformed) {
    return baseResult(envelope, "malformed", [
      diagnostic({
        phase,
        status_code: response.status,
        bounded_response_text: body.rawText,
        malformed_json_reason: body.malformed,
        fallback_used: true,
        message: "Paperclip readback returned malformed JSON"
      })
    ]);
  }

  const content = extractContent(body.json, body.rawText);
  if (!content) {
    return baseResult(envelope, "missing-content", [
      diagnostic({
        phase,
        status_code: response.status,
        bounded_response_text: responseText,
        fallback_used: true,
        message: "Paperclip readback returned no markdown/body/content text"
      })
    ]);
  }

  const sha256 = await sha256Hex(content);
  const expectedSha256 = await sha256Hex(envelope.markdown);
  const matched = sha256 === expectedSha256;
  return baseResult(envelope, matched ? "matched" : "mismatch", [
    diagnostic({
      phase,
      status_code: response.status,
      bounded_response_text: responseText,
      fallback_used: !matched,
      message: matched ? "decision artifact readback matched envelope markdown" : "decision artifact readback hash mismatch"
    })
  ], {
    selected_surface: parsed.surface,
    artifact_id: parsed.artifactId,
    issue_id: issueId,
    live_proof: matched,
    sha256,
    expected_sha256: expectedSha256,
    snippet: redactSensitiveText(content).slice(0, MAX_SNIPPET_TEXT)
  });
}
