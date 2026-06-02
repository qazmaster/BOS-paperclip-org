import { describe, it, expect } from "vitest";
import {
  BOS_LIGHT_MANIFEST,
  BOS_LIGHT_REQUIRED_CAPABILITIES,
  ISSUE_LIFECYCLE_EVENTS,
  ORCHESTRATION_EVENTS,
  PLUGIN_REGISTRATION_PROBE_ROUTES,
  buildRegistrationStatus,
} from "../src/pluginRegistration";

describe("Plugin Registration API", () => {
  describe("BOS_LIGHT_MANIFEST", () => {
    it("has valid plugin id", () => {
      expect(BOS_LIGHT_MANIFEST.id).toBe("bos-light");
    });

    it("has apiVersion 1", () => {
      expect(BOS_LIGHT_MANIFEST.apiVersion).toBe(1);
    });

    it("declares automation category", () => {
      expect(BOS_LIGHT_MANIFEST.categories).toContain("automation");
    });

    it("declares worker entrypoint", () => {
      expect(BOS_LIGHT_MANIFEST.entrypoints.worker).toBe("./dist/worker.js");
    });

    it("declares tools matching worker registrations", () => {
      const toolNames = BOS_LIGHT_MANIFEST.tools?.map((t) => t.name) ?? [];
      expect(toolNames).toContain("bpi-score");
      expect(toolNames).toContain("blueprint-gen");
      expect(toolNames).toContain("eval-gate");
      expect(toolNames).toContain("decide");
      expect(toolNames).toContain("circuit-breaker-observe");
    });

    it("declares UI slots for BOS overlays", () => {
      const slots = BOS_LIGHT_MANIFEST.ui?.slots ?? [];
      const slotIds = slots.map((s) => s.id);
      expect(slotIds).toContain("betting-table");
      expect(slotIds).toContain("bos-status");
      expect(slotIds).toContain("circuit-state");
      expect(slotIds).toContain("gate-results");
    });

    it("declares detail tabs scoped to issue entity", () => {
      const detailTabs =
        BOS_LIGHT_MANIFEST.ui?.slots.filter((s) => s.type === "detailTab") ??
        [];
      for (const tab of detailTabs) {
        expect(tab.entityTypes).toContain("issue");
      }
    });

    it("declares dashboard widget", () => {
      const widgets =
        BOS_LIGHT_MANIFEST.ui?.slots.filter(
          (s) => s.type === "dashboardWidget"
        ) ?? [];
      expect(widgets.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe("Required Capabilities", () => {
    it("includes issue read capabilities", () => {
      expect(BOS_LIGHT_REQUIRED_CAPABILITIES).toContain("issues.read");
      expect(BOS_LIGHT_REQUIRED_CAPABILITIES).toContain(
        "issue.comments.read"
      );
      expect(BOS_LIGHT_REQUIRED_CAPABILITIES).toContain(
        "issue.documents.read"
      );
    });

    it("includes issue write capabilities", () => {
      expect(BOS_LIGHT_REQUIRED_CAPABILITIES).toContain("issues.create");
      expect(BOS_LIGHT_REQUIRED_CAPABILITIES).toContain("issues.update");
      expect(BOS_LIGHT_REQUIRED_CAPABILITIES).toContain("issues.checkout");
    });

    it("includes event subscription capability", () => {
      expect(BOS_LIGHT_REQUIRED_CAPABILITIES).toContain("events.subscribe");
      expect(BOS_LIGHT_REQUIRED_CAPABILITIES).toContain("events.emit");
    });

    it("includes plugin state capabilities", () => {
      expect(BOS_LIGHT_REQUIRED_CAPABILITIES).toContain(
        "plugin.state.read"
      );
      expect(BOS_LIGHT_REQUIRED_CAPABILITIES).toContain(
        "plugin.state.write"
      );
    });

    it("includes agent tools registration capability", () => {
      expect(BOS_LIGHT_REQUIRED_CAPABILITIES).toContain(
        "agent.tools.register"
      );
    });
  });

  describe("Issue Lifecycle Events", () => {
    it("includes issue.created", () => {
      expect(ISSUE_LIFECYCLE_EVENTS).toContain("issue.created");
    });

    it("includes issue.updated", () => {
      expect(ISSUE_LIFECYCLE_EVENTS).toContain("issue.updated");
    });

    it("includes issue.checked_out", () => {
      expect(ISSUE_LIFECYCLE_EVENTS).toContain("issue.checked_out");
    });

    it("includes issue.released", () => {
      expect(ISSUE_LIFECYCLE_EVENTS).toContain("issue.released");
    });

    it("includes issue.comment.created", () => {
      expect(ISSUE_LIFECYCLE_EVENTS).toContain("issue.comment.created");
    });

    it("includes issue.document lifecycle events", () => {
      expect(ISSUE_LIFECYCLE_EVENTS).toContain("issue.document.created");
      expect(ISSUE_LIFECYCLE_EVENTS).toContain("issue.document.updated");
      expect(ISSUE_LIFECYCLE_EVENTS).toContain("issue.document.deleted");
    });

    it("includes issue.relations.updated", () => {
      expect(ISSUE_LIFECYCLE_EVENTS).toContain("issue.relations.updated");
    });
  });

  describe("Orchestration Events", () => {
    it("includes agent run lifecycle events", () => {
      expect(ORCHESTRATION_EVENTS).toContain("agent.run.started");
      expect(ORCHESTRATION_EVENTS).toContain("agent.run.finished");
      expect(ORCHESTRATION_EVENTS).toContain("agent.run.failed");
      expect(ORCHESTRATION_EVENTS).toContain("agent.run.cancelled");
    });

    it("includes approval events", () => {
      expect(ORCHESTRATION_EVENTS).toContain("approval.created");
      expect(ORCHESTRATION_EVENTS).toContain("approval.decided");
    });

    it("includes budget incident events", () => {
      expect(ORCHESTRATION_EVENTS).toContain("budget.incident.opened");
      expect(ORCHESTRATION_EVENTS).toContain("budget.incident.resolved");
    });
  });

  describe("Registration Probe Routes", () => {
    it("covers plugin management routes", () => {
      const routes = [...PLUGIN_REGISTRATION_PROBE_ROUTES];
      expect(routes).toContain("/api/plugins");
      expect(routes).toContain("/api/plugins/bos-light");
      expect(routes).toContain("/api/plugins/bos-light/status");
      expect(routes).toContain("/api/plugins/bos-light/health");
    });

    it("covers plugin admin routes", () => {
      const routes = [...PLUGIN_REGISTRATION_PROBE_ROUTES];
      expect(routes).toContain("/settings/plugins");
      expect(routes).toContain("/settings/plugins/bos-light");
    });

    it("covers plugin data/actions bridge routes", () => {
      const routes = [...PLUGIN_REGISTRATION_PROBE_ROUTES];
      expect(routes).toContain("/api/plugins/bos-light/data");
      expect(routes).toContain("/api/plugins/bos-light/actions");
    });

    it("covers plugin tools route", () => {
      const routes = [...PLUGIN_REGISTRATION_PROBE_ROUTES];
      expect(routes).toContain("/api/plugins/bos-light/tools");
    });

    it("has comprehensive route coverage", () => {
      expect(PLUGIN_REGISTRATION_PROBE_ROUTES.length).toBeGreaterThanOrEqual(
        19
      );
    });
  });

  describe("buildRegistrationStatus", () => {
    it("returns runtimeAvailable=false when no routes discovered", () => {
      const status = buildRegistrationStatus({
        observedVersion: "0.3.1",
        probedRoutes: ["/api/plugins", "/api/plugins/bos-light"],
        discoveredRoutes: [],
      });
      expect(status.runtimeAvailable).toBe(false);
      expect(status.pluginRoutesFound).toBe(false);
      expect(status.workerStarted).toBe(false);
      expect(status.error).toContain("not available");
    });

    it("returns runtimeAvailable=true when routes are discovered", () => {
      const status = buildRegistrationStatus({
        observedVersion: "1.0.0",
        probedRoutes: ["/api/plugins"],
        discoveredRoutes: ["/api/plugins"],
      });
      expect(status.runtimeAvailable).toBe(true);
      expect(status.pluginRoutesFound).toBe(true);
    });

    it("includes observed version", () => {
      const status = buildRegistrationStatus({
        observedVersion: "0.3.1",
        probedRoutes: [],
        discoveredRoutes: [],
      });
      expect(status.observedVersion).toBe("0.3.1");
    });

    it("sets lastProbedAt to ISO timestamp", () => {
      const status = buildRegistrationStatus({
        observedVersion: null,
        probedRoutes: [],
        discoveredRoutes: [],
      });
      expect(status.lastProbedAt).toBeTruthy();
      expect(() => new Date(status.lastProbedAt!)).not.toThrow();
    });

    it("preserves custom error message", () => {
      const status = buildRegistrationStatus({
        observedVersion: null,
        probedRoutes: [],
        discoveredRoutes: [],
        error: "Custom error",
      });
      expect(status.error).toBe("Custom error");
    });
  });
});
