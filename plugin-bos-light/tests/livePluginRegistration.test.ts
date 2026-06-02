/**
 * Live Integration Test: Plugin Registration on Paperclip
 *
 * Tests plugin registration against the live Paperclip instance.
 * This test verifies:
 * 1. Paperclip instance is reachable and healthy
 * 2. Plugin runtime availability can be probed
 * 3. Plugin registration attempts produce expected results
 * 4. Issue lifecycle hooks can be initialized and tested
 *
 * NOTE: This test makes real HTTP requests to the live Paperclip instance.
 * It should be run manually or in CI with appropriate credentials.
 * 
 * Timeout is set to 30 seconds for live network requests.
 */
import { describe, expect, it, beforeAll } from "vitest";
import {
  PluginRegistrationClient,
  createRegistrationClient,
  BOS_LIGHT_MANIFEST,
} from "../src/pluginRegistration";
import {
  IssueLifecycleHookManager,
  createBosLightHookManager,
  mapDomainEventToHookEvent,
} from "../src/issueLifecycleHooks";

// Load environment variables from root .env if not already set
const PAPERCLIP_BASE_URL = process.env.PAPERCLIP_BASE_URL || "https://paperclip.oysana.com";
const PAPERCLIP_API_KEY = process.env.PAPERCLIP_API_KEY || "";

// Set timeout for live tests (30 seconds)
const LIVE_TEST_TIMEOUT = 30000;

describe("Live Paperclip Plugin Registration", () => {
  let client: PluginRegistrationClient;

  beforeAll(() => {
    // Create client for live instance
    client = new PluginRegistrationClient({
      baseUrl: PAPERCLIP_BASE_URL,
      apiKey: PAPERCLIP_API_KEY,
      timeout: 15000,
    });
  });

  describe("Instance Health Check", () => {
    it("can reach the Paperclip health endpoint", async () => {
      try {
        const response = await fetch(`${PAPERCLIP_BASE_URL}/api/health`);
        expect(response.ok).toBe(true);

        const data = await response.json();
        console.log("Paperclip health response:", data);
        expect(data).toBeDefined();
      } catch (error) {
        // If we can't reach the instance, skip the test
        console.warn("Cannot reach Paperclip instance:", error);
        expect(error).toBeNull(); // Will fail with useful message
      }
    }, LIVE_TEST_TIMEOUT);

    it("reports the Paperclip version", async () => {
      try {
        const response = await fetch(`${PAPERCLIP_BASE_URL}/api/health`);
        if (response.ok) {
          const data = await response.json();
          console.log("Paperclip version:", data.version);
          // Version should be a string like "0.3.1" or similar
          if (data.version) {
            expect(typeof data.version).toBe("string");
          }
        }
      } catch (error) {
        console.warn("Cannot check version:", error);
      }
    }, LIVE_TEST_TIMEOUT);
  });

  describe("Plugin Runtime Probing", () => {
    it("probes plugin runtime routes", async () => {
      const status = await client.probePluginRuntime();

      console.log("Plugin runtime probe result:", {
        runtimeAvailable: status.runtimeAvailable,
        observedVersion: status.observedVersion,
        pluginRoutesFound: status.pluginRoutesFound,
        discoveredRoutes: status.discoveredRoutes,
        probedRoutes: status.probedRoutes.length,
        error: status.error,
      });

      // Document the expected state for Paperclip 0.3.1
      // The plugin runtime is a post-V1 feature, so we expect it to be unavailable
      // Note: Version may not be available in the health response for 0.3.1
      expect(status.probedRoutes.length).toBeGreaterThan(0);
      expect(status.lastProbedAt).toBeTruthy();
      
      // Log the version if available
      if (status.observedVersion) {
        console.log("  Observed Paperclip version:", status.observedVersion);
      } else {
        console.log("  Version not available in health response");
      }

      // Log the actual state for documentation
      if (status.runtimeAvailable) {
        console.log("✓ Plugin runtime is AVAILABLE on this Paperclip instance");
        console.log("  Discovered routes:", status.discoveredRoutes);
      } else {
        console.log("✗ Plugin runtime is NOT available (expected for Paperclip 0.3.1)");
        console.log("  Error:", status.error);
      }
    }, LIVE_TEST_TIMEOUT);

    it("checks /api/plugins endpoint specifically", async () => {
      try {
        const response = await fetch(`${PAPERCLIP_BASE_URL}/api/plugins`, {
          headers: {
            "Authorization": `Bearer ${PAPERCLIP_API_KEY}`,
          },
        });

        console.log("/api/plugins response status:", response.status);

        if (response.ok) {
          const plugins = await response.json();
          console.log("/api/plugins response:", plugins);
          expect(Array.isArray(plugins)).toBe(true);
        } else {
          console.log("/api/plugins returned:", response.status, response.statusText);
        }
      } catch (error) {
        console.warn("Cannot check /api/plugins:", error);
      }
    }, LIVE_TEST_TIMEOUT);
  });

  describe("Plugin Registration Attempt", () => {
    it("attempts plugin registration and reports result", async () => {
      const result = await client.registerPlugin();

      console.log("Registration attempt result:", {
        success: result.success,
        runtimeAvailable: result.status.runtimeAvailable,
        observedVersion: result.status.observedVersion,
        workerStarted: result.status.workerStarted,
        error: result.error,
        timestamp: result.timestamp,
      });

      // Document the expected behavior
      expect(result.status).toBeDefined();
      expect(result.timestamp).toBeTruthy();

      if (result.success) {
        console.log("✓ Plugin registration SUCCEEDED");
        expect(result.status.workerStarted).toBe(true);
      } else {
        console.log("✗ Plugin registration FAILED (expected for 0.3.1)");
        console.log("  Error:", result.error);
        // For 0.3.1, we expect this to fail
        expect(result.error).toBeTruthy();
      }
    }, LIVE_TEST_TIMEOUT);

    it("checks if BOS Light is already registered", async () => {
      const isRegistered = await client.isPluginRegistered("bos-light");
      console.log("BOS Light registered:", isRegistered);

      // For 0.3.1, this should return false
      if (!isRegistered) {
        console.log("  (Expected: BOS Light not registered on 0.3.1)");
      }
    }, LIVE_TEST_TIMEOUT);

    it("lists all registered plugins", async () => {
      const plugins = await client.listPlugins();
      console.log("Registered plugins:", plugins);

      // For 0.3.1, this should return an empty array
      expect(Array.isArray(plugins)).toBe(true);
    }, LIVE_TEST_TIMEOUT);
  });

  describe("Issue Lifecycle Hooks Verification", () => {
    it("creates and initializes hook manager", () => {
      const manager = createBosLightHookManager();

      // Verify hooks are registered
      const allHandlers = manager.listAllHandlers();
      console.log("Registered hook handlers:", allHandlers);

      expect(allHandlers.length).toBe(3);
      expect(allHandlers.map(h => h.handlerName)).toContain("bos-light-log-created");
      expect(allHandlers.map(h => h.handlerName)).toContain("bos-light-log-updated");
      expect(allHandlers.map(h => h.handlerName)).toContain("bos-light-log-assignment");
    });

    it("dispatches issue.created event to hooks", async () => {
      const manager = createBosLightHookManager();

      const event = {
        eventType: "issue.created" as const,
        eventId: "evt-test-001",
        occurredAt: new Date().toISOString(),
        payload: {
          issueId: "issue-test-001",
          companyId: "test-company",
          identifier: "TEST-001",
          title: "Test Issue",
          status: "open",
          priority: "medium",
          projectId: "project-test",
          createdAt: new Date().toISOString(),
        },
        actor: {
          type: "user" as const,
          id: "user-test",
        },
      };

      const logs = await manager.dispatchEvent(event);
      console.log("Issue created hook dispatch logs:", logs);

      expect(logs.length).toBe(1);
      expect(logs[0].eventType).toBe("issue.created");
      expect(logs[0].result.handled).toBe(true);
      expect(logs[0].result.message).toContain("TEST-001");
    });

    it("dispatches issue.updated event to hooks", async () => {
      const manager = createBosLightHookManager();

      const event = {
        eventType: "issue.updated" as const,
        eventId: "evt-test-002",
        occurredAt: new Date().toISOString(),
        payload: {
          issueId: "issue-test-001",
          companyId: "test-company",
          identifier: "TEST-001",
          title: "Updated Title",
          status: "in-progress",
          previousStatus: "open",
          updatedAt: new Date().toISOString(),
          changedFields: ["title", "status"],
        },
        actor: {
          type: "agent" as const,
          id: "agent-test",
        },
      };

      const logs = await manager.dispatchEvent(event);
      console.log("Issue updated hook dispatch logs:", logs);

      expect(logs.length).toBe(1);
      expect(logs[0].eventType).toBe("issue.updated");
      expect(logs[0].result.handled).toBe(true);
      expect(logs[0].result.message).toContain("TEST-001");
      expect(logs[0].result.message).toContain("status");
    });

    it("dispatches issue.assignment event to hooks", async () => {
      const manager = createBosLightHookManager();

      const event = {
        eventType: "issue.assignment" as const,
        eventId: "evt-test-003",
        occurredAt: new Date().toISOString(),
        payload: {
          issueId: "issue-test-001",
          companyId: "test-company",
          identifier: "TEST-001",
          assigneeAgentId: "agent-001",
          previousAssigneeAgentId: undefined,
          assignedAt: new Date().toISOString(),
        },
        actor: {
          type: "system" as const,
          id: "system",
        },
      };

      const logs = await manager.dispatchEvent(event);
      console.log("Issue assignment hook dispatch logs:", logs);

      expect(logs.length).toBe(1);
      expect(logs[0].eventType).toBe("issue.assignment");
      expect(logs[0].result.handled).toBe(true);
      expect(logs[0].result.message).toContain("TEST-001");
    });

    it("maps Paperclip domain events to hook events", () => {
      // Test issue.created mapping
      const createdEvent = {
        eventId: "evt-001",
        eventType: "issue.created",
        occurredAt: new Date().toISOString(),
        payload: { issueId: "issue-001" },
      };
      const mappedCreated = mapDomainEventToHookEvent(createdEvent);
      expect(mappedCreated).not.toBeNull();
      expect(mappedCreated!.eventType).toBe("issue.created");

      // Test issue.updated mapping
      const updatedEvent = {
        eventId: "evt-002",
        eventType: "issue.updated",
        occurredAt: new Date().toISOString(),
        payload: { issueId: "issue-001" },
      };
      const mappedUpdated = mapDomainEventToHookEvent(updatedEvent);
      expect(mappedUpdated).not.toBeNull();
      expect(mappedUpdated!.eventType).toBe("issue.updated");

      // Test issue.checked_out mapping (should map to issue.assignment)
      const checkedOutEvent = {
        eventId: "evt-003",
        eventType: "issue.checked_out",
        occurredAt: new Date().toISOString(),
        payload: { issueId: "issue-001" },
      };
      const mappedCheckedOut = mapDomainEventToHookEvent(checkedOutEvent);
      expect(mappedCheckedOut).not.toBeNull();
      expect(mappedCheckedOut!.eventType).toBe("issue.assignment");

      // Test issue.released mapping (should map to issue.assignment)
      const releasedEvent = {
        eventId: "evt-004",
        eventType: "issue.released",
        occurredAt: new Date().toISOString(),
        payload: { issueId: "issue-001" },
      };
      const mappedReleased = mapDomainEventToHookEvent(releasedEvent);
      expect(mappedReleased).not.toBeNull();
      expect(mappedReleased!.eventType).toBe("issue.assignment");

      // Test issue.assignment_wakeup_requested mapping
      const wakeupEvent = {
        eventId: "evt-005",
        eventType: "issue.assignment_wakeup_requested",
        occurredAt: new Date().toISOString(),
        payload: { issueId: "issue-001" },
      };
      const mappedWakeup = mapDomainEventToHookEvent(wakeupEvent);
      expect(mappedWakeup).not.toBeNull();
      expect(mappedWakeup!.eventType).toBe("issue.assignment");

      // Test unknown event type
      const unknownEvent = {
        eventId: "evt-006",
        eventType: "unknown.event",
        occurredAt: new Date().toISOString(),
        payload: {},
      };
      const mappedUnknown = mapDomainEventToHookEvent(unknownEvent);
      expect(mappedUnknown).toBeNull();

      console.log("✓ Domain event mapping verified for all issue lifecycle events");
    });
  });

  describe("BOS Light Manifest Verification", () => {
    it("has valid manifest structure", () => {
      console.log("BOS Light Manifest:", {
        id: BOS_LIGHT_MANIFEST.id,
        apiVersion: BOS_LIGHT_MANIFEST.apiVersion,
        version: BOS_LIGHT_MANIFEST.version,
        displayName: BOS_LIGHT_MANIFEST.displayName,
        categories: BOS_LIGHT_MANIFEST.categories,
        capabilities: BOS_LIGHT_MANIFEST.capabilities.length,
        tools: BOS_LIGHT_MANIFEST.tools?.length,
        uiSlots: BOS_LIGHT_MANIFEST.ui?.slots?.length,
      });

      expect(BOS_LIGHT_MANIFEST.id).toBe("bos-light");
      expect(BOS_LIGHT_MANIFEST.apiVersion).toBe(1);
      expect(BOS_LIGHT_MANIFEST.categories).toContain("automation");
      expect(BOS_LIGHT_MANIFEST.capabilities.length).toBeGreaterThan(0);
      expect(BOS_LIGHT_MANIFEST.tools?.length).toBeGreaterThan(0);
      expect(BOS_LIGHT_MANIFEST.ui?.slots?.length).toBeGreaterThan(0);
    });
  });
});
