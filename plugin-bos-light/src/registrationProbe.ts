import { registerBosLightPlugin } from "./worker";

export const BOS_LIGHT_REGISTRATION_INTENT = {
  tools: [
    "piko:bpi-score",
    "piko:blueprint-gen",
    "piko:bpi-blueprint-artifact",
    "piko:eval-gate",
    "piko:eval-gate-evidence",
    "piko:circuit-breaker-observe",
    "piko:decide"
  ],
  dataProviders: ["betting-table"],
  actions: ["approve-batch"]
} as const;

export type RegistrationSurface = "tools" | "dataProviders" | "actions";
export type RegistrationLogLevel = "debug" | "info" | "warn" | "error";

export interface RegistrationFailure {
  key: string;
  error: string;
}

export interface RegistrationLogEntry {
  level: RegistrationLogLevel;
  message: string;
  details?: unknown;
}

export interface RegistrationSurfaceKeys<T = string[]> {
  tools: T;
  dataProviders: T;
  actions: T;
}

export interface ProbeBosLightRegistrationOptions {
  unavailableSurfaces?: RegistrationSurface[];
  failRegistrations?: Partial<RegistrationSurfaceKeys<string[]>>;
}

export interface BosLightRegistrationProbeResult {
  schema_version: "1.0";
  runtime_support_claimed: false;
  intent: RegistrationSurfaceKeys<readonly string[]>;
  attempted: RegistrationSurfaceKeys;
  succeeded: RegistrationSurfaceKeys;
  failed: RegistrationSurfaceKeys<RegistrationFailure[]>;
  skipped: RegistrationSurfaceKeys;
  warnings: RegistrationLogEntry[];
  logs: RegistrationLogEntry[];
  validation_errors: string[];
}

type RegistrationHandler = (...args: unknown[]) => unknown;
type MutableSurfaceKeys<T> = RegistrationSurfaceKeys<T>;

const SURFACES: RegistrationSurface[] = ["tools", "dataProviders", "actions"];

function emptyKeys(): RegistrationSurfaceKeys {
  return { tools: [], dataProviders: [], actions: [] };
}

function emptyFailures(): RegistrationSurfaceKeys<RegistrationFailure[]> {
  return { tools: [], dataProviders: [], actions: [] };
}

function sanitizeError(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  return raw.replace(/[\r\n\t]+/g, " ").replace(/\s{2,}/g, " ").trim().slice(0, 500) || "unknown error";
}

function makeRegisterRecorder(input: {
  surface: RegistrationSurface;
  attempted: MutableSurfaceKeys<string[]>;
  succeeded: MutableSurfaceKeys<string[]>;
  failed: MutableSurfaceKeys<RegistrationFailure[]>;
  failKeys: Set<string>;
}): (key: string, handler: RegistrationHandler) => Promise<void> {
  return async (key: string, _handler: RegistrationHandler): Promise<void> => {
    input.attempted[input.surface].push(key);
    if (input.failKeys.has(key)) {
      const error = `registration rejected by local probe for ${input.surface}:${key}`;
      input.failed[input.surface].push({ key, error });
      throw new Error(error);
    }
    input.succeeded[input.surface].push(key);
  };
}

function makeLogger(logs: RegistrationLogEntry[]): Record<RegistrationLogLevel, (message: string, details?: unknown) => void> {
  const record = (level: RegistrationLogLevel) => (message: string, details?: unknown): void => {
    logs.push(details === undefined ? { level, message } : { level, message, details });
  };

  return {
    debug: record("debug"),
    info: record("info"),
    warn: record("warn"),
    error: record("error")
  };
}

function missingKeys(expected: readonly string[], observed: string[]): string[] {
  const observedSet = new Set(observed);
  return expected.filter((key) => !observedSet.has(key));
}

function unexpectedKeys(expected: readonly string[], observed: string[]): string[] {
  const expectedSet = new Set(expected);
  return observed.filter((key) => !expectedSet.has(key));
}

export async function probeBosLightRegistration(options: ProbeBosLightRegistrationOptions = {}): Promise<BosLightRegistrationProbeResult> {
  const attempted = emptyKeys();
  const succeeded = emptyKeys();
  const failed = emptyFailures();
  const skipped = emptyKeys();
  const logs: RegistrationLogEntry[] = [];
  const unavailable = new Set(options.unavailableSurfaces ?? []);
  const failRegistrations = options.failRegistrations ?? {};

  const ctx: any = {
    logger: makeLogger(logs)
  };

  if (!unavailable.has("tools")) {
    ctx.tools = {
      register: makeRegisterRecorder({
        surface: "tools",
        attempted,
        succeeded,
        failed,
        failKeys: new Set(failRegistrations.tools ?? [])
      })
    };
  }

  if (!unavailable.has("dataProviders")) {
    ctx.data = {
      register: makeRegisterRecorder({
        surface: "dataProviders",
        attempted,
        succeeded,
        failed,
        failKeys: new Set(failRegistrations.dataProviders ?? [])
      })
    };
  }

  if (!unavailable.has("actions")) {
    ctx.actions = {
      register: makeRegisterRecorder({
        surface: "actions",
        attempted,
        succeeded,
        failed,
        failKeys: new Set(failRegistrations.actions ?? [])
      })
    };
  }

  try {
    await registerBosLightPlugin(ctx);
  } catch (error) {
    logs.push({
      level: "error",
      message: "BOS Light registration probe caught an unexpected worker registration error",
      details: { error: sanitizeError(error) }
    });
  }

  const validation_errors: string[] = [];

  for (const surface of SURFACES) {
    const expected = BOS_LIGHT_REGISTRATION_INTENT[surface];
    if (unavailable.has(surface)) {
      skipped[surface].push(...expected);
      continue;
    }

    for (const key of missingKeys(expected, attempted[surface])) {
      validation_errors.push(`missing_attempt:${surface}:${key}`);
    }
    for (const key of unexpectedKeys(expected, attempted[surface])) {
      validation_errors.push(`unexpected_attempt:${surface}:${key}`);
    }
  }

  return {
    schema_version: "1.0",
    runtime_support_claimed: false,
    intent: BOS_LIGHT_REGISTRATION_INTENT,
    attempted,
    succeeded,
    failed,
    skipped,
    warnings: logs.filter((entry) => entry.level === "warn"),
    logs,
    validation_errors
  };
}
