/**
 * Plugin Registration API Surface for BOS Light
 *
 * Documents how BOS Light registers as a Paperclip plugin and hooks into
 * the issue lifecycle, based on the Paperclip PLUGIN_SPEC.md (proposed
 * post-V1 plugin system).
 *
 * Source: https://github.com/paperclipai/paperclip/blob/master/doc/plugins/PLUGIN_SPEC.md
 *
 * IMPORTANT CAVEATS (from MEM176/MEM200/MEM201):
 *   - Paperclip 0.3.1 (sandbox) returns 404 on all plugin-specific routes.
 *   - Plugin registration, tool visibility, and agent-to-tool invocation
 *     cannot be achieved through the supported HTTP API surface.
 *   - This module documents the TARGET API surface; runtime registration
 *     is blocked until a Paperclip build with plugin support is deployed.
 */

// ─── Plugin Manifest Contract ────────────────────────────────────────────────

/**
 * Paperclip plugin manifest shape as defined in PLUGIN_SPEC.md section 10.1.
 * This is what BOS Light must export in its manifest.
 */
export interface PaperclipPluginManifestV1 {
  id: string;
  apiVersion: 1;
  version: string;
  displayName: string;
  description: string;
  author: string;
  categories: Array<"connector" | "workspace" | "automation" | "ui">;
  minimumHostVersion?: string;
  capabilities: string[];
  entrypoints: {
    worker: string;
    ui?: string;
  };
  instanceConfigSchema?: Record<string, unknown>;
  tools?: Array<{
    name: string;
    displayName: string;
    description: string;
    parametersSchema: Record<string, unknown>;
  }>;
  jobs?: Array<{
    job_key: string;
    schedule?: string;
  }>;
  webhooks?: Array<{
    endpointKey: string;
  }>;
  apiRoutes?: Array<{
    routeKey: string;
    method: string;
    path: string;
    auth?: string;
    capability?: string;
  }>;
  ui?: {
    slots: Array<{
      type:
        | "page"
        | "detailTab"
        | "taskDetailView"
        | "dashboardWidget"
        | "sidebar"
        | "routeSidebar"
        | "sidebarPanel"
        | "projectSidebarItem"
        | "globalToolbarButton"
        | "toolbarButton"
        | "contextMenuItem"
        | "commentAnnotation"
        | "commentContextMenuItem"
        | "settingsPage"
        | "companySettingsPage";
      id: string;
      displayName: string;
      exportName: string;
      entityTypes?: Array<"project" | "issue" | "agent" | "goal" | "run">;
      routePath?: string;
    }>;
  };
}

// ─── Plugin SDK Context ──────────────────────────────────────────────────────

/**
 * Plugin context provided by the host to the worker.
 * Based on PLUGIN_SPEC.md section 14.2.
 */
export interface PluginContext {
  manifest: PaperclipPluginManifestV1;
  config: {
    get(): Promise<Record<string, unknown>>;
  };
  events: {
    on(name: string, fn: (event: unknown) => Promise<void>): void;
    on(
      name: string,
      filter: EventFilter,
      fn: (event: unknown) => Promise<void>
    ): void;
    emit(name: string, payload: unknown): Promise<void>;
  };
  jobs: {
    register(
      key: string,
      input: { cron: string },
      fn: (job: unknown) => Promise<void>
    ): void;
  };
  state: {
    get(input: ScopeKey): Promise<unknown | null>;
    set(input: ScopeKey, value: unknown): Promise<void>;
    delete(input: ScopeKey): Promise<void>;
  };
  entities: {
    upsert(input: unknown): Promise<void>;
    list(input: unknown): Promise<unknown[]>;
  };
  data: {
    register(
      key: string,
      handler: (params: Record<string, unknown>) => Promise<unknown>
    ): void;
  };
  actions: {
    register(
      key: string,
      handler: (params: Record<string, unknown>) => Promise<unknown>
    ): void;
  };
  tools: {
    register(
      name: string,
      input: { displayName: string; description: string; parametersSchema: Record<string, unknown> },
      fn: (params: unknown, runCtx: ToolRunContext) => Promise<ToolResult>
    ): void;
  };
  issues: {
    create(input: IssueCreateInput): Promise<IssueRecord>;
    update(input: IssueUpdateInput): Promise<IssueRecord>;
    checkout(input: IssueCheckoutInput): Promise<IssueRecord>;
    relations: {
      get(issueId: string, companyId: string): Promise<unknown>;
      setBlockedBy(issueId: string, blockerIds: string[], companyId: string): Promise<void>;
    };
  };
  logger: {
    info(message: string, meta?: Record<string, unknown>): void;
    warn(message: string, meta?: Record<string, unknown>): void;
    error(message: string, meta?: Record<string, unknown>): void;
    debug(message: string, meta?: Record<string, unknown>): void;
  };
}

export interface EventFilter {
  projectId?: string;
  companyId?: string;
  agentId?: string;
  [key: string]: unknown;
}

export interface ScopeKey {
  scopeKind:
    | "instance"
    | "company"
    | "project"
    | "project_workspace"
    | "agent"
    | "issue"
    | "goal"
    | "run";
  scopeId?: string;
  namespace: string;
  key: string;
}

export interface ToolRunContext {
  agentId: string;
  runId: string;
  companyId: string;
  projectId?: string;
}

export type ToolResult =
  | { type: "text"; text: string }
  | { type: "json"; data: unknown }
  | { type: "error"; error: string };

export interface IssueCreateInput {
  companyId: string;
  title: string;
  description?: string;
  status?: string;
  priority?: string;
  assigneeAgentId?: string;
  assigneeUserId?: string;
  projectId?: string;
  goalId?: string;
  parentId?: string;
}

export interface IssueUpdateInput {
  issueId: string;
  companyId: string;
  title?: string;
  description?: string;
  status?: string;
  priority?: string;
  assigneeAgentId?: string | null;
  assigneeUserId?: string | null;
  comment?: string;
}

export interface IssueCheckoutInput {
  issueId: string;
  companyId: string;
  agentId: string;
  expectedStatuses?: string[];
}

export interface IssueRecord {
  id: string;
  companyId: string;
  identifier: string;
  title: string;
  description?: string;
  status: string;
  priority: string;
  assigneeAgentId?: string;
  assigneeUserId?: string;
  projectId?: string;
  goalId?: string;
  parentId?: string;
  requestDepth: number;
  startedAt?: string;
  completedAt?: string;
  createdAt: string;
  updatedAt: string;
}

// ─── Issue Lifecycle Events ──────────────────────────────────────────────────

/**
 * Issue lifecycle events that BOS Light can subscribe to.
 * Source: PLUGIN_SPEC.md section 16.
 *
 * These are delivered via `ctx.events.on(eventName, handler)` in the worker.
 * Delivery is at-least-once; handlers must be idempotent.
 */
export const ISSUE_LIFECYCLE_EVENTS = [
  "issue.created",
  "issue.updated",
  "issue.checked_out",
  "issue.released",
  "issue.comment.created",
  "issue.document.created",
  "issue.document.updated",
  "issue.document.deleted",
  "issue.relations.updated",
  "issue.assignment_wakeup_requested",
] as const;

export type IssueLifecycleEvent = (typeof ISSUE_LIFECYCLE_EVENTS)[number];

/**
 * Additional domain events relevant to BOS Light orchestration.
 */
export const ORCHESTRATION_EVENTS = [
  "agent.run.started",
  "agent.run.finished",
  "agent.run.failed",
  "agent.run.cancelled",
  "approval.created",
  "approval.decided",
  "budget.incident.opened",
  "budget.incident.resolved",
  "activity.logged",
] as const;

export type OrchestrationEvent = (typeof ORCHESTRATION_EVENTS)[number];

/**
 * Shape of a domain event received by the worker.
 */
export interface PaperclipDomainEvent {
  eventId: string;
  eventType: string;
  occurredAt: string;
  actor?: {
    type: "agent" | "user" | "system" | "plugin";
    id: string;
  };
  entity?: {
    type: string;
    id: string;
  };
  payload: Record<string, unknown>;
}

// ─── Required Capabilities ───────────────────────────────────────────────────

/**
 * Capabilities BOS Light needs for full issue lifecycle hook support.
 * Source: PLUGIN_SPEC.md section 15.1.
 */
export const BOS_LIGHT_REQUIRED_CAPABILITIES = [
  // Read
  "issues.read",
  "issue.comments.read",
  "issue.documents.read",
  "issue.relations.read",
  "issue.subtree.read",
  "agents.read",
  "companies.read",
  "projects.read",
  "activity.read",
  // Write
  "issues.create",
  "issues.update",
  "issue.comments.create",
  "issue.documents.write",
  "issue.relations.write",
  "issues.checkout",
  "issues.wakeup",
  "activity.log.write",
  // Events
  "events.subscribe",
  "events.emit",
  // Plugin state
  "plugin.state.read",
  "plugin.state.write",
  // Agent tools
  "agent.tools.register",
  // UI
  "ui.detailTab.register",
  "ui.dashboardWidget.register",
] as const;

// ─── Host-Worker RPC Protocol ────────────────────────────────────────────────

/**
 * RPC methods the host calls on the plugin worker.
 * Source: PLUGIN_SPEC.md section 13.
 */
export interface PluginWorkerRPC {
  /** Called once on worker startup. */
  initialize(input: {
    manifest: PaperclipPluginManifestV1;
    config: Record<string, unknown>;
    instanceInfo: Record<string, unknown>;
    hostApiVersion: number;
  }): Promise<void>;

  /** Returns plugin health status. */
  health(): Promise<{
    status: "ready" | "error" | "starting";
    error?: string;
    diagnostics?: Record<string, unknown>;
  }>;

  /** Called when the host needs to stop the worker. */
  shutdown(): Promise<void>;

  /** Validates plugin config after changes or startup. */
  validateConfig?(input: {
    config: Record<string, unknown>;
  }): Promise<{
    ok: boolean;
    warnings?: string[];
    errors?: string[];
  }>;

  /** Called when operator updates plugin config at runtime. */
  configChanged?(input: { config: Record<string, unknown> }): Promise<void>;

  /** Receives domain events from the host. */
  onEvent(input: { event: PaperclipDomainEvent }): Promise<void>;

  /** Runs a declared scheduled job. */
  runJob?(input: {
    jobKey: string;
    trigger: "schedule" | "manual" | "retry";
    runId: string;
  }): Promise<void>;

  /** Receives inbound webhook payload. */
  handleWebhook?(input: {
    endpointKey: string;
    headers: Record<string, string>;
    body: unknown;
    requestId: string;
  }): Promise<void>;

  /** Returns plugin data for UI components. */
  getData?(input: {
    dataKey: string;
    context: Record<string, unknown>;
    params?: Record<string, unknown>;
  }): Promise<unknown>;

  /** Runs a plugin action from the board UI. */
  performAction?(input: {
    actionKey: string;
    params: Record<string, unknown>;
  }): Promise<unknown>;

  /** Runs a plugin-contributed agent tool during a run. */
  executeTool?(input: {
    toolName: string;
    params: unknown;
    runContext: ToolRunContext;
  }): Promise<ToolResult>;
}

// ─── Plugin Registration Helper ──────────────────────────────────────────────

/**
 * Define a BOS Light plugin with typed lifecycle hooks.
 *
 * This mirrors `definePlugin()` from `@paperclipai/plugin-sdk` (PLUGIN_SPEC.md 14.2).
 * The actual import path is `@paperclipai/plugin-sdk` — this local definition
 * exists because the SDK is not yet available as a published package in our
 * build environment.
 */
export interface PluginDefinition {
  /** Worker initialization — receives PluginContext, registers event handlers. */
  initialize(ctx: PluginContext): Promise<void>;

  /** Health check — called by the host periodically. */
  health?(): Promise<{ status: "ready" | "error"; error?: string }>;

  /** Graceful shutdown — drain in-flight work within 10s deadline. */
  shutdown?(): Promise<void>;

  /** Validate plugin config. */
  validateConfig?(config: Record<string, unknown>): Promise<{
    ok: boolean;
    warnings?: string[];
    errors?: string[];
  }>;

  /** Handle runtime config changes without restart. */
  configChanged?(config: Record<string, unknown>): Promise<void>;

  /** Handle inbound domain events (issue lifecycle, agent runs, etc.). */
  onEvent?(event: PaperclipDomainEvent): Promise<void>;

  /** Run a scheduled job. */
  runJob?(input: { jobKey: string; trigger: string }): Promise<void>;

  /** Handle inbound webhooks. */
  handleWebhook?(input: {
    endpointKey: string;
    body: unknown;
  }): Promise<unknown>;

  /** Return data for plugin UI components. */
  getData?(input: {
    dataKey: string;
    context: Record<string, unknown>;
  }): Promise<unknown>;

  /** Run an action from the board UI. */
  performAction?(input: {
    actionKey: string;
    params: Record<string, unknown>;
  }): Promise<unknown>;

  /** Run a plugin-contributed agent tool. */
  executeTool?(input: {
    toolName: string;
    params: unknown;
    runContext: ToolRunContext;
  }): Promise<ToolResult>;
}

/**
 * BOS Light plugin manifest.
 *
 * This is the actual manifest that will be exported from dist/manifest.js
 * when the plugin is packaged for Paperclip installation.
 */
export const BOS_LIGHT_MANIFEST: PaperclipPluginManifestV1 = {
  id: "bos-light",
  apiVersion: 1,
  version: "0.1.0",
  displayName: "BOS Light",
  description:
    "Organizational intelligence overlay: BPI, Betting Table, Blueprints, Gates, Circuit Breaker.",
  author: "BOS/Chimera",
  categories: ["automation"],
  capabilities: [...BOS_LIGHT_REQUIRED_CAPABILITIES],
  entrypoints: {
    worker: "./dist/worker.js",
  },
  tools: [
    {
      name: "bpi-score",
      displayName: "BPI Score",
      description: "Calculate BPI score for an issue or set of issues",
      parametersSchema: {
        type: "object",
        properties: {
          issue_ids: {
            type: "array",
            items: { type: "string" },
            description: "Issue IDs to score",
          },
        },
      },
    },
    {
      name: "blueprint-gen",
      displayName: "Blueprint Generator",
      description: "Generate a BOS blueprint markdown for an issue",
      parametersSchema: {
        type: "object",
        properties: {
          issue_id: { type: "string" },
          title: { type: "string" },
        },
      },
    },
    {
      name: "eval-gate",
      displayName: "Eval Gate",
      description: "Run evaluation gates on an issue or artifact",
      parametersSchema: {
        type: "object",
        properties: {
          gate_type: { type: "string" },
          target_id: { type: "string" },
        },
      },
    },
    {
      name: "decide",
      displayName: "Decide",
      description: "Run BOS Light decision logic",
      parametersSchema: {
        type: "object",
        properties: {
          context: { type: "object" },
        },
      },
    },
    {
      name: "circuit-breaker-observe",
      displayName: "Circuit Breaker Observe",
      description: "Record a circuit breaker observation",
      parametersSchema: {
        type: "object",
        properties: {
          issue_id: { type: "string" },
          observation: { type: "string" },
        },
      },
    },
  ],
  ui: {
    slots: [
      {
        type: "dashboardWidget",
        id: "betting-table",
        displayName: "Betting Table",
        exportName: "BettingTableWidget",
      },
      {
        type: "detailTab",
        id: "bos-status",
        displayName: "BOS Status",
        exportName: "BosStatusTab",
        entityTypes: ["issue"],
      },
      {
        type: "detailTab",
        id: "circuit-state",
        displayName: "Circuit State",
        exportName: "CircuitStateTab",
        entityTypes: ["issue"],
      },
      {
        type: "detailTab",
        id: "gate-results",
        displayName: "Gate Results",
        exportName: "GateResultsTab",
        entityTypes: ["issue"],
      },
    ],
  },
};

// ─── Registration Status ─────────────────────────────────────────────────────

/**
 * Current registration status for BOS Light against the live Paperclip instance.
 *
 * As of M009 S01 T01, the live Paperclip sandbox (0.3.1) does NOT expose
 * plugin registration routes. All 21+ probed routes return HTTP 404.
 *
 * Registration is BLOCKED until a Paperclip build with the plugin runtime
 * is deployed. The plugin system is a post-V1 feature per PLUGIN_SPEC.md.
 */
export interface PluginRegistrationStatus {
  /** Whether the plugin runtime is available on the host. */
  runtimeAvailable: boolean;

  /** Paperclip version observed from /api/health. */
  observedVersion: string | null;

  /** Whether plugin routes were discovered. */
  pluginRoutesFound: boolean;

  /** Routes that returned non-404. */
  discoveredRoutes: string[];

  /** All routes that were probed. */
  probedRoutes: string[];

  /** Whether the plugin worker was started. */
  workerStarted: boolean;

  /** Error message if registration failed. */
  error: string | null;

  /** Timestamp of the last probe. */
  lastProbedAt: string | null;
}

/**
 * Routes to probe for plugin registration support.
 * Based on PLUGIN_SPEC.md sections 8-19.
 */
export const PLUGIN_REGISTRATION_PROBE_ROUTES = [
  // Plugin management (CLI/admin)
  "/api/plugins",
  "/api/plugins/bos-light",
  "/api/plugins/bos-light/status",
  "/api/plugins/bos-light/health",
  "/api/plugins/bos-light/install",
  "/api/plugins/bos-light/config",
  // Plugin-scoped API routes
  "/api/plugins/bos-light/api/*",
  // Plugin UI
  "/_plugins/bos-light/ui/",
  // Plugin webhooks
  "/api/plugins/bos-light/webhooks/*",
  // Plugin admin/settings
  "/settings/plugins",
  "/settings/plugins/bos-light",
  // Plugin state
  "/api/plugins/bos-light/state",
  // Plugin data/actions bridge
  "/api/plugins/bos-light/data",
  "/api/plugins/bos-light/actions",
  // Plugin tools
  "/api/plugins/bos-light/tools",
  // Plugin jobs
  "/api/plugins/bos-light/jobs",
  // Plugin entities
  "/api/plugins/bos-light/entities",
  // Plugin events
  "/api/plugins/bos-light/events",
  // npm-style install
  "/api/plugins/install",
] as const;

/**
 * Build a registration status from a live probe result.
 */
export function buildRegistrationStatus(input: {
  observedVersion: string | null;
  probedRoutes: string[];
  discoveredRoutes: string[];
  error?: string | null;
}): PluginRegistrationStatus {
  return {
    runtimeAvailable: input.discoveredRoutes.length > 0,
    observedVersion: input.observedVersion,
    pluginRoutesFound: input.discoveredRoutes.length > 0,
    discoveredRoutes: input.discoveredRoutes,
    probedRoutes: input.probedRoutes,
    workerStarted: false, // Cannot start worker without runtime
    error:
      input.error ??
      (input.discoveredRoutes.length === 0
        ? "No plugin routes found. Paperclip plugin runtime is not available (post-V1 feature)."
        : null),
    lastProbedAt: new Date().toISOString(),
  };
}

// ─── Plugin Registration Client ──────────────────────────────────────────────

/**
 * Configuration for connecting to a Paperclip instance.
 */
export interface PaperclipConnectionConfig {
  baseUrl: string;
  apiKey: string;
  companyId?: string;
  timeout?: number;
}

/**
 * Result of a plugin registration attempt.
 */
export interface RegistrationResult {
  success: boolean;
  status: PluginRegistrationStatus;
  error?: string;
  timestamp: string;
}

/**
 * Client for attempting plugin registration with Paperclip.
 * 
 * Since Paperclip 0.3.1 does not support plugin registration via API,
 * this client performs live probes and reports the status.
 */
export class PluginRegistrationClient {
  private config: PaperclipConnectionConfig;
  
  constructor(config: PaperclipConnectionConfig) {
    this.config = {
      timeout: 10000,
      ...config,
    };
  }
  
  /**
   * Probe the Paperclip instance to check plugin runtime availability.
   */
  async probePluginRuntime(): Promise<PluginRegistrationStatus> {
    const discoveredRoutes: string[] = [];
    const probedRoutes: string[] = [];
    let observedVersion: string | null = null;
    let error: string | null = null;
    
    try {
      // First, check the health endpoint to get the version
      const healthResponse = await this.fetchWithTimeout(
        `${this.config.baseUrl}/api/health`
      );
      
      if (healthResponse.ok) {
        const healthData = await healthResponse.json();
        observedVersion = healthData.version || null;
      }
      
      // Probe plugin-specific routes
      const pluginRoutes = [
        "/api/plugins",
        "/api/plugins/bos-light",
        "/api/plugins/bos-light/status",
        "/api/plugins/bos-light/health",
      ];
      
      for (const route of pluginRoutes) {
        probedRoutes.push(route);
        try {
          const response = await this.fetchWithTimeout(
            `${this.config.baseUrl}${route}`
          );
          if (response.ok) {
            discoveredRoutes.push(route);
          }
        } catch (e) {
          // Route not available
        }
      }
      
      // Check if we can list plugins
      if (discoveredRoutes.includes("/api/plugins")) {
        const pluginsResponse = await this.fetchWithTimeout(
          `${this.config.baseUrl}/api/plugins`
        );
        if (pluginsResponse.ok) {
          const plugins = await pluginsResponse.json();
          // If we get an empty array, plugins are supported but none installed
          if (Array.isArray(plugins)) {
            error = null;
          }
        }
      }
      
    } catch (e) {
      error = e instanceof Error ? e.message : "Unknown error during probe";
    }
    
    return buildRegistrationStatus({
      observedVersion,
      probedRoutes,
      discoveredRoutes,
      error,
    });
  }
  
  /**
   * Attempt to register the BOS Light plugin.
   * 
   * Since Paperclip 0.3.1 doesn't support plugin registration via API,
   * this method probes the runtime and returns the status.
   */
  async registerPlugin(): Promise<RegistrationResult> {
    const timestamp = new Date().toISOString();
    
    try {
      const status = await this.probePluginRuntime();
      
      if (!status.runtimeAvailable) {
        return {
          success: false,
          status,
          error: "Plugin registration not available: Paperclip plugin runtime is not deployed (post-V1 feature).",
          timestamp,
        };
      }
      
      // If runtime is available, try to register
      const registerResponse = await this.fetchWithTimeout(
        `${this.config.baseUrl}/api/plugins`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${this.config.apiKey}`,
          },
          body: JSON.stringify({
            manifest: BOS_LIGHT_MANIFEST,
            companyId: this.config.companyId,
          }),
        }
      );
      
      if (registerResponse.ok) {
        return {
          success: true,
          status: {
            ...status,
            workerStarted: true,
          },
          timestamp,
        };
      } else {
        const errorData = await registerResponse.json().catch(() => ({}));
        return {
          success: false,
          status,
          error: `Registration failed: ${registerResponse.status} ${registerResponse.statusText}. ${errorData.error || ""}`,
          timestamp,
        };
      }
      
    } catch (e) {
      return {
        success: false,
        status: buildRegistrationStatus({
          observedVersion: null,
          probedRoutes: [],
          discoveredRoutes: [],
          error: e instanceof Error ? e.message : "Unknown error",
        }),
        error: e instanceof Error ? e.message : "Unknown error during registration",
        timestamp,
      };
    }
  }
  
  /**
   * Check if a specific plugin is registered.
   */
  async isPluginRegistered(pluginId: string): Promise<boolean> {
    try {
      const response = await this.fetchWithTimeout(
        `${this.config.baseUrl}/api/plugins/${pluginId}`
      );
      return response.ok;
    } catch {
      return false;
    }
  }
  
  /**
   * List all registered plugins.
   */
  async listPlugins(): Promise<Array<{ id: string; status: string }>> {
    try {
      const response = await this.fetchWithTimeout(
        `${this.config.baseUrl}/api/plugins`
      );
      
      if (response.ok) {
        const plugins = await response.json();
        return Array.isArray(plugins) ? plugins : [];
      }
      return [];
    } catch {
      return [];
    }
  }
  
  /**
   * Helper to fetch with timeout.
   */
  private async fetchWithTimeout(
    url: string,
    options: RequestInit = {}
  ): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(
      () => controller.abort(),
      this.config.timeout
    );
    
    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
        headers: {
          "Authorization": `Bearer ${this.config.apiKey}`,
          ...options.headers,
        },
      });
      return response;
    } finally {
      clearTimeout(timeoutId);
    }
  }
}

/**
 * Create a plugin registration client for the live Paperclip instance.
 */
export function createRegistrationClient(
  baseUrl?: string,
  apiKey?: string,
  companyId?: string
): PluginRegistrationClient {
  return new PluginRegistrationClient({
    baseUrl: baseUrl || process.env.PAPERCLIP_BASE_URL || "https://paperclip.oysana.com",
    apiKey: apiKey || process.env.PAPERCLIP_API_KEY || "",
    companyId: companyId || process.env.PAPERCLIP_COMPANY_ID,
  });
}
