import { describe, expect, it } from "vitest";
import { platformAgentRegistry } from "../src/agents/platformAgentRegistry.js";
import {
  assertModelMeetsFloor,
  isFloorApprovedModel,
  requiresStrongModel,
} from "../src/agents/modelTierPolicy.js";

const analyst = platformAgentRegistry.get("agent-improvement-analyst").manifest;
const intake = platformAgentRegistry.get("project-intake").manifest;

describe("isFloorApprovedModel", () => {
  it("accepts gpt-5.4 and dated snapshots, rejects mini and others", () => {
    expect(isFloorApprovedModel("gpt-5.4")).toBe(true);
    expect(isFloorApprovedModel("gpt-5.4-2026-08-01")).toBe(true);
    expect(isFloorApprovedModel("gpt-5.4-mini")).toBe(false);
    expect(isFloorApprovedModel("gpt-5.4-mini-2026-08-01")).toBe(false);
    expect(isFloorApprovedModel("some-other-model")).toBe(false);
  });
});

describe("reasoning tier wiring", () => {
  it("marks the improvement analyst as an advanced judgment seat", () => {
    expect(analyst.reasoningTier).toBe("advanced");
    expect(requiresStrongModel(analyst)).toBe(true);
  });

  it("leaves a doer (project-intake) as standard", () => {
    expect(intake.reasoningTier).toBeUndefined();
    expect(requiresStrongModel(intake)).toBe(false);
  });
});

describe("assertModelMeetsFloor", () => {
  it("blocks an advanced agent on a below-floor model", () => {
    expect(() => assertModelMeetsFloor(analyst, "gpt-5.4-mini")).toThrow(
      /floor-approved strong model/,
    );
  });

  it("allows an advanced agent on a floor-approved model", () => {
    expect(() => assertModelMeetsFloor(analyst, "gpt-5.4")).not.toThrow();
  });

  it("allows a below-floor model when measurement opts out", () => {
    expect(() =>
      assertModelMeetsFloor(analyst, "gpt-5.4-mini", { allowBelowFloor: true }),
    ).not.toThrow();
  });

  it("never restricts a standard-tier doer", () => {
    expect(() => assertModelMeetsFloor(intake, "gpt-5.4-mini")).not.toThrow();
  });
});
