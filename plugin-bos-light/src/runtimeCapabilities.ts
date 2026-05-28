// Source-level capability boundary for BOS Light's draft Paperclip adapter.
//
// The JSON matrix remains the evidence source of truth. This file intentionally
// mirrors only stable capability keys/status vocabulary so TypeScript adapter
// seams can reference runtime surfaces without implying they are proven.

export const PAPERCLIP_RUNTIME_CAPABILITY_MATRIX_PATH = "plugin-bos-light/capabilities.paperclip-runtime.json" as const;

export const PAPERCLIP_RUNTIME_CAPABILITY_STATUSES = [
  "confirmed",
  "unsupported",
  "fallback-only",
  "unvalidated"
] as const;

export type PaperclipRuntimeCapabilityStatus = typeof PAPERCLIP_RUNTIME_CAPABILITY_STATUSES[number];

export const PAPERCLIP_RUNTIME_CAPABILITY_KEYS = [
  "company_template.import_export",
  "agents.syntax",
  "plugin.runtime.version_build",
  "plugin.runtime.registration",
  "registration.tools",
  "registration.data",
  "registration.actions",
  "config.api",
  "state.issue_scoped",
  "state.company_scoped",
  "entities.api",
  "activity.logging",
  "events.issue_lifecycle",
  "events.terminal_runs",
  "issues.native",
  "documents.native",
  "comments.native",
  "approvals.native",
  "ui.dashboard_widgets",
  "ui.issue_detail_tabs"
] as const;

export type PaperclipRuntimeCapabilityKey = typeof PAPERCLIP_RUNTIME_CAPABILITY_KEYS[number];

export const PAPERCLIP_RUNTIME_BOUNDARY_RULES = {
  adapter: "In-memory adapter and persistence are test/draft-only and never prove Paperclip host support.",
  artifacts: "Issue documents and comments are the preferred durable artifact path when native APIs are proven; until then they are adapter assumptions with markdown fallback.",
  state: "Plugin state is cache/overlay only unless a runtime round-trip and restart/readback proof exists.",
  events: "Event handling is optional behind explicit tool/action invocation, bounded polling, and activity fallback.",
  approvals: "Approval/request ownership stays with Paperclip-native approvals; plugin fallbacks may ask for review but must not simulate native approval objects."
} as const;
