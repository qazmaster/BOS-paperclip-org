import { describe, it, expect } from "vitest";
import { enforceOwnerBoundary, isDiv7MissionControl } from "../src/ownerBoundary";
import type { Division } from "../src/contracts";

const ALL_DIVISIONS: Division[] = [
  "Div7.MissionControl",
  "Div1.HCO",
  "Div2.MasterPlanner",
  "Div3.Treasury",
  "Div4.Production",
  "Div5.QualificationsLibraryLearning",
  "Div6.External",
];

describe("isDiv7MissionControl", () => {
  it("returns true for Div7.MissionControl", () => {
    expect(isDiv7MissionControl("Div7.MissionControl")).toBe(true);
  });

  it("returns false for all other divisions", () => {
    for (const div of ALL_DIVISIONS.filter((d) => d !== "Div7.MissionControl")) {
      expect(isDiv7MissionControl(div)).toBe(false);
    }
  });
});

describe("enforceOwnerBoundary", () => {
  it("allows a division to act as itself", () => {
    for (const div of ALL_DIVISIONS) {
      const result = enforceOwnerBoundary(div, div);
      expect(result.authorized).toBe(true);
      if (result.authorized) {
        expect(result.caller).toBe(div);
        expect(result.allowed).toBe(div);
      }
    }
  });

  it("allows Div7.MissionControl to act on behalf of any division", () => {
    for (const div of ALL_DIVISIONS) {
      const result = enforceOwnerBoundary("Div7.MissionControl", div);
      expect(result.authorized).toBe(true);
      if (result.authorized) {
        expect(result.caller).toBe("Div7.MissionControl");
        expect(result.allowed).toBe(div);
      }
    }
  });

  it("blocks non-Div7 callers from acting on behalf of another division", () => {
    const nonDiv7 = ALL_DIVISIONS.filter((d) => d !== "Div7.MissionControl");
    for (const caller of nonDiv7) {
      for (const allowed of ALL_DIVISIONS) {
        if (caller === allowed) continue;
        const result = enforceOwnerBoundary(caller, allowed);
        expect(result.authorized).toBe(false);
        if (!result.authorized) {
          expect(result.caller).toBe(caller);
          expect(result.allowed).toBe(allowed);
          expect(result.reason).toContain("not authorized");
          expect(result.reason).toContain("Div7.MissionControl");
        }
      }
    }
  });

  it("includes the division names in the rejection reason", () => {
    const result = enforceOwnerBoundary("Div3.Treasury", "Div4.Production");
    expect(result.authorized).toBe(false);
    if (!result.authorized) {
      expect(result.reason).toContain("Div3.Treasury");
      expect(result.reason).toContain("Div4.Production");
    }
  });
});
