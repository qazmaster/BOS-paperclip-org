import { describe, expect, it } from "vitest";
import {
  serializeMetadataToMarkdown,
  serializeGrantDecisionToMarkdown,
  formatBosMetadataComment,
  parseBosMetadataComment,
  hasBosMetadata
} from "../src/metadataMirror";
import type { BosTaskMetadata, BosRoutingMetadata } from "../src/bosTaskMetadata";

const now = "2026-06-03T00:00:00.000Z";

describe("serializeMetadataToMarkdown", () => {
  const baseMetadata: BosTaskMetadata = {
    schema_version: "1.0",
    issue_id: "BOS-100",
    mission_id: "mission_1",
    phase: "production",
    risk_level: "MEDIUM",
    assigned_division: "Div4.Production",
    grant_ref: {
      grant_id: "grant_1",
      grant_type: "BUDGET_GRANT",
      status: "active",
      token_cap: 100000,
      allowed_tools: ["repo_read", "repo_write"],
      issued_at: now,
      expires_at: now
    },
    audit_trail: [
      {
        timestamp: now,
        event: "created",
        actor: "Div1.HCO",
        detail: "Task assigned"
      }
    ],
    updated_at: now
  };

  it("includes header and identity fields", () => {
    const md = serializeMetadataToMarkdown(baseMetadata);

    expect(md).toContain("# BOS Task Metadata");
    expect(md).toContain("**Issue:** BOS-100");
    expect(md).toContain("**Mission:** mission_1");
    expect(md).toContain("**Phase:** production");
    expect(md).toContain("**Risk:** MEDIUM");
    expect(md).toContain("**Division:** Div4.Production");
  });

  it("includes grant section when present", () => {
    const md = serializeMetadataToMarkdown(baseMetadata);

    expect(md).toContain("## Grant");
    expect(md).toContain("**ID:** grant_1");
    expect(md).toContain("**Type:** BUDGET_GRANT");
    expect(md).toContain("**Token Cap:** 100,000");
    expect(md).toContain("**Tools:** repo_read, repo_write");
  });

  it("includes audit trail", () => {
    const md = serializeMetadataToMarkdown(baseMetadata);

    expect(md).toContain("## Audit Trail");
    expect(md).toContain("**created** by Div1.HCO: Task assigned");
  });

  it("shows unassigned when no division", () => {
    const md = serializeMetadataToMarkdown({
      ...baseMetadata,
      assigned_division: undefined
    });

    expect(md).toContain("**Division:** (unassigned)");
  });

  it("truncates audit trail to last 10 entries", () => {
    const entries = Array.from({ length: 15 }, (_, i) => ({
      timestamp: now,
      event: `event_${i}`,
      actor: "Div1.HCO",
      detail: `Detail ${i}`
    }));

    const md = serializeMetadataToMarkdown({
      ...baseMetadata,
      audit_trail: entries
    });

    expect(md).toContain("showing last 10 of 15 entries");
    expect(md).toContain("event_14");
    expect(md).not.toContain("event_0");
  });
});

describe("serializeGrantDecisionToMarkdown", () => {
  it("formats approved decision", () => {
    const md = serializeGrantDecisionToMarkdown("BOS-100", {
      status: "approved",
      decision_id: "gdec_1",
      rationale: "Within budget",
      allowed_tools: ["repo_read"],
      denied_tools: ["external_api"],
      token_cap: 50000,
      ttl_minutes: 120
    });

    expect(md).toContain("# BOS Grant Decision — APPROVED");
    expect(md).toContain("**Issue:** BOS-100");
    expect(md).toContain("**Decision ID:** gdec_1");
    expect(md).toContain("**Rationale:** Within budget");
    expect(md).toContain("**Allowed Tools:** repo_read");
    expect(md).toContain("**Denied Tools:** external_api");
    expect(md).toContain("**Token Cap:** 50,000");
    expect(md).toContain("**TTL:** 120m");
  });

  it("formats denied decision", () => {
    const md = serializeGrantDecisionToMarkdown("BOS-100", {
      status: "denied",
      decision_id: "gdec_2",
      rationale: "Exceeds limits",
      reason: "Cost too high"
    });

    expect(md).toContain("# BOS Grant Decision — DENIED");
    expect(md).toContain("**Reason:** Cost too high");
  });

  it("formats escalated decision", () => {
    const md = serializeGrantDecisionToMarkdown("BOS-100", {
      status: "escalate",
      decision_id: "gdec_3",
      rationale: "Needs review",
      escalation_target: "Div7.MissionControl",
      reason: "Critical risk"
    });

    expect(md).toContain("# BOS Grant Decision — ESCALATE");
    expect(md).toContain("**Escalation Target:** Div7.MissionControl");
    expect(md).toContain("**Reason:** Critical risk");
  });
});

describe("formatBosMetadataComment and parseBosMetadataComment", () => {
  const metadata: BosRoutingMetadata = {
    schemaVersion: "bos-light.metadata.v1",
    bosMissionId: "mission_1",
    currentDivision: "Div4.Production",
    routingPhase: "operational",
    qaRequired: true,
    cynefinDomain: "COMPLICATED",
    decisionId: "dec_1"
  };

  it("round-trips through format and parse", () => {
    const comment = formatBosMetadataComment(metadata);
    const parsed = parseBosMetadataComment(comment);

    expect(parsed).toEqual(metadata);
  });

  it("includes delimited markers", () => {
    const comment = formatBosMetadataComment(metadata);

    expect(comment).toContain("<!-- BOS_LIGHT_METADATA_START -->");
    expect(comment).toContain("<!-- BOS_LIGHT_METADATA_END -->");
  });

  it("parses null for missing markers", () => {
    expect(parseBosMetadataComment("no metadata here")).toBeNull();
  });

  it("parses null for missing mission_id", () => {
    const comment = "<!-- BOS_LIGHT_METADATA_START -->\ndivision: Div4.Production\n<!-- BOS_LIGHT_METADATA_END -->";
    expect(parseBosMetadataComment(comment)).toBeNull();
  });

  it("handles optional fields", () => {
    const minimal: BosRoutingMetadata = {
      schemaVersion: "bos-light.metadata.v1",
      bosMissionId: "mission_1",
      currentDivision: "Div1.HCO",
      routingPhase: "pre_decision",
      qaRequired: false
    };

    const comment = formatBosMetadataComment(minimal);
    const parsed = parseBosMetadataComment(comment);

    expect(parsed?.cynefinDomain).toBeUndefined();
    expect(parsed?.decisionId).toBeUndefined();
  });
});

describe("hasBosMetadata", () => {
  it("returns true when both markers present", () => {
    expect(hasBosMetadata("<!-- BOS_LIGHT_METADATA_START -->data<!-- BOS_LIGHT_METADATA_END -->")).toBe(true);
  });

  it("returns false when markers missing", () => {
    expect(hasBosMetadata("no metadata")).toBe(false);
  });

  it("returns false when only start marker present", () => {
    expect(hasBosMetadata("<!-- BOS_LIGHT_METADATA_START -->data")).toBe(false);
  });
});
