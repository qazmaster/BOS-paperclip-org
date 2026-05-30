import { spawn } from "node:child_process";

const ADAPTER_TYPE = "gsdpi_local";
const DEFAULT_COMMAND = "gsd";
const DEFAULT_TIMEOUT_MS = 60_000;
const SECRET_KEY_RE = /(?:secret|token|password|passwd|api[_-]?key|credential|private[_-]?key|authorization|bearer)/i;

export interface GsdPiAdapterConfig {
  command?: string;
  args?: string[];
  cwd?: string;
  env?: Record<string, string>;
  timeoutMs?: number;
}

export interface GsdPiExecuteInput {
  runId?: string;
  prompt?: string;
  task?: string;
  cwd?: string;
  env?: Record<string, string>;
  args?: string[];
  timeoutMs?: number;
}

export interface CommandResult {
  exitCode: number | null;
  signal: string | null;
  timedOut: boolean;
  stdout: string;
  stderr: string;
}

export type CommandRunner = (
  command: string,
  args: string[],
  options: { cwd: string; env: Record<string, string>; timeoutMs: number },
) => Promise<CommandResult>;

export interface BosAdapterResult {
  schemaVersion: string;
  runId: string;
  adapterType: typeof ADAPTER_TYPE;
  status: "succeeded" | "failed" | "blocked" | "needs_input";
  gateResults?: unknown[];
  summary?: string;
  error?: string;
}

export interface TestEnvironmentResult {
  adapterType: typeof ADAPTER_TYPE;
  status: "pass" | "fail";
  command: string;
  version?: string;
  checks: Array<{ code: string; level: "info" | "warning" | "error"; message: string }>;
  diagnostics: {
    cwd: string;
    timeoutMs: number;
    envKeys: string[];
    secretEnvKeys: string[];
    exitCode: number | null;
    timedOut: boolean;
  };
}

export interface GsdPiServerAdapter {
  type: typeof ADAPTER_TYPE;
  adapterType: typeof ADAPTER_TYPE;
  testEnvironment(): Promise<TestEnvironmentResult>;
  execute(input?: GsdPiExecuteInput): Promise<{
    exitCode: number | null;
    signal: string | null;
    timedOut: boolean;
    summary: string;
    resultJson: { bosAdapterResult: BosAdapterResult };
    diagnostics: {
      command: string;
      args: string[];
      cwd: string;
      timeoutMs: number;
      envKeys: string[];
      secretEnvKeys: string[];
      stdoutExcerpt: string;
      stderrExcerpt: string;
    };
  }>;
}

export interface AdapterDeps {
  runner?: CommandRunner;
}

function normalizeConfig(config: GsdPiAdapterConfig = {}): Required<Omit<GsdPiAdapterConfig, "env">> & { env: Record<string, string> } {
  return {
    command: config.command?.trim() || DEFAULT_COMMAND,
    args: Array.isArray(config.args) ? config.args : [],
    cwd: config.cwd?.trim() || process.cwd(),
    env: config.env ?? {},
    timeoutMs: Number.isFinite(config.timeoutMs) && Number(config.timeoutMs) > 0 ? Number(config.timeoutMs) : DEFAULT_TIMEOUT_MS,
  };
}

function mergeEnv(...envs: Array<Record<string, string | undefined> | undefined>): Record<string, string> {
  const merged: Record<string, string> = {};
  for (const env of envs) {
    if (!env) continue;
    for (const [key, value] of Object.entries(env)) {
      if (typeof value === "string") merged[key] = value;
    }
  }
  return merged;
}

function envDiagnostics(env: Record<string, string>) {
  const envKeys = Object.keys(env).sort();
  return {
    envKeys,
    secretEnvKeys: envKeys.filter((key) => SECRET_KEY_RE.test(key)),
  };
}

function excerpt(value: string, max = 2_000): string {
  if (value.length <= max) return value;
  return value.slice(value.length - max);
}

function chunkToString(chunk: unknown): string {
  if (typeof chunk === "string") return chunk;
  if (Buffer.isBuffer(chunk)) return String(chunk);
  return String(chunk ?? "");
}

export function runCommand(
  command: string,
  args: string[],
  options: { cwd: string; env: Record<string, string>; timeoutMs: number },
): Promise<CommandResult> {
  return new Promise((resolve) => {
    let stdout = "";
    let stderr = "";
    let settled = false;
    let timedOut = false;
    let child: any;

    const finish = (result: CommandResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(result);
    };

    const timer = setTimeout(() => {
      timedOut = true;
      try {
        child?.kill?.("SIGTERM");
      } catch {
        // Child may already be gone. The close/error handler will finish.
      }
      finish({ exitCode: null, signal: "SIGTERM", timedOut, stdout, stderr });
    }, options.timeoutMs);

    try {
      child = spawn(command, args, {
        cwd: options.cwd,
        env: { ...process.env, ...options.env },
        shell: false,
      });
    } catch (error) {
      finish({
        exitCode: 127,
        signal: null,
        timedOut: false,
        stdout,
        stderr: error instanceof Error ? error.message : String(error),
      });
      return;
    }

    child.stdout?.on?.("data", (chunk: unknown) => {
      stdout += chunkToString(chunk);
    });
    child.stderr?.on?.("data", (chunk: unknown) => {
      stderr += chunkToString(chunk);
    });
    child.on?.("error", (error: unknown) => {
      finish({
        exitCode: 127,
        signal: null,
        timedOut,
        stdout,
        stderr: stderr || (error instanceof Error ? error.message : String(error)),
      });
    });
    child.on?.("close", (code: number | null, signal: string | null) => {
      finish({ exitCode: code, signal, timedOut, stdout, stderr });
    });
  });
}

function parseJsonCandidate(stdout: string): unknown | null {
  const trimmed = stdout.trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    // Continue with line-based parse.
  }
  const lines = trimmed.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index];
    if (!line.startsWith("{") || !line.endsWith("}")) continue;
    try {
      return JSON.parse(line);
    } catch {
      // Keep searching earlier lines.
    }
  }
  return null;
}

function normalizeBosAdapterResult(parsed: unknown, runId: string): BosAdapterResult | null {
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
  const record = parsed as Record<string, unknown>;
  const resultJson = record.resultJson && typeof record.resultJson === "object" ? (record.resultJson as Record<string, unknown>) : record;
  const candidate = resultJson.bosAdapterResult && typeof resultJson.bosAdapterResult === "object"
    ? (resultJson.bosAdapterResult as Record<string, unknown>)
    : resultJson;
  if (candidate.adapterType !== ADAPTER_TYPE && !("gateResults" in candidate) && candidate.status !== "succeeded") return null;
  const status = typeof candidate.status === "string" ? candidate.status : "succeeded";
  if (!(["succeeded", "failed", "blocked", "needs_input"] as string[]).includes(status)) return null;
  return {
    schemaVersion: typeof candidate.schemaVersion === "string" ? candidate.schemaVersion : "1.0",
    runId: typeof candidate.runId === "string" && candidate.runId ? candidate.runId : runId,
    adapterType: ADAPTER_TYPE,
    status: status as BosAdapterResult["status"],
    gateResults: Array.isArray(candidate.gateResults) ? candidate.gateResults : undefined,
    summary: typeof candidate.summary === "string" ? candidate.summary : undefined,
    error: typeof candidate.error === "string" ? candidate.error : undefined,
  };
}

export function createBlockedResult(runId: string, message: string): BosAdapterResult {
  return {
    schemaVersion: "1.0",
    runId,
    adapterType: ADAPTER_TYPE,
    status: "blocked",
    error: message,
    summary: message,
  };
}

export function createServerAdapter(config: GsdPiAdapterConfig = {}, deps: AdapterDeps = {}): GsdPiServerAdapter {
  const baseConfig = normalizeConfig(config);
  const runner = deps.runner ?? runCommand;

  return {
    type: ADAPTER_TYPE,
    adapterType: ADAPTER_TYPE,

    async testEnvironment(): Promise<TestEnvironmentResult> {
      const env = mergeEnv(baseConfig.env);
      const diagnostics = envDiagnostics(env);
      const result = await runner(baseConfig.command, ["--version"], {
        cwd: baseConfig.cwd,
        env,
        timeoutMs: Math.min(baseConfig.timeoutMs, 15_000),
      });
      const version = excerpt(result.stdout || result.stderr, 500).trim();
      const pass = result.exitCode === 0 && !result.timedOut && version.length > 0;
      return {
        adapterType: ADAPTER_TYPE,
        status: pass ? "pass" : "fail",
        command: baseConfig.command,
        version: pass ? version : undefined,
        checks: [
          pass
            ? { code: "gsd_version", level: "info", message: version }
            : {
                code: result.timedOut ? "gsd_version_timeout" : "gsd_command_unavailable",
                level: "error",
                message: result.timedOut ? "GSD-Pi command timed out during version probe." : "GSD-Pi command did not return a version.",
              },
        ],
        diagnostics: {
          cwd: baseConfig.cwd,
          timeoutMs: Math.min(baseConfig.timeoutMs, 15_000),
          envKeys: diagnostics.envKeys,
          secretEnvKeys: diagnostics.secretEnvKeys,
          exitCode: result.exitCode,
          timedOut: result.timedOut,
        },
      };
    },

    async execute(input: GsdPiExecuteInput = {}) {
      const runId = input.runId || `gsdpi-${Date.now()}`;
      const env = mergeEnv(baseConfig.env, input.env);
      const diagnostics = envDiagnostics(env);
      const args = [
        ...baseConfig.args,
        ...(Array.isArray(input.args) ? input.args : []),
      ];
      if (input.prompt) args.push(input.prompt);
      if (input.task) args.push(input.task);
      const cwd = input.cwd || baseConfig.cwd;
      const timeoutMs = Number.isFinite(input.timeoutMs) && Number(input.timeoutMs) > 0 ? Number(input.timeoutMs) : baseConfig.timeoutMs;
      const result = await runner(baseConfig.command, args, { cwd, env, timeoutMs });
      const parsed = normalizeBosAdapterResult(parseJsonCandidate(result.stdout), runId);
      const bosAdapterResult = parsed ?? createBlockedResult(
        runId,
        result.timedOut
          ? "GSD-Pi command timed out before emitting BosAdapterResult."
          : "GSD-Pi command did not emit parseable BosAdapterResult JSON.",
      );
      const summary = bosAdapterResult.summary || bosAdapterResult.error || excerpt(result.stdout || result.stderr, 500);
      return {
        exitCode: result.exitCode,
        signal: result.signal,
        timedOut: result.timedOut,
        summary,
        resultJson: { bosAdapterResult },
        diagnostics: {
          command: baseConfig.command,
          args,
          cwd,
          timeoutMs,
          envKeys: diagnostics.envKeys,
          secretEnvKeys: diagnostics.secretEnvKeys,
          stdoutExcerpt: excerpt(result.stdout),
          stderrExcerpt: excerpt(result.stderr),
        },
      };
    },
  };
}
