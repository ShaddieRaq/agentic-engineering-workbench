import { describe, expect, it } from "vitest";
import { getScenarioDefinition } from "../src/scenarios/scenarioRegistry.js";

describe("getScenarioDefinition", () => {
  it("returns a registered scenario", () => {
    const definition = getScenarioDefinition("explain-agentic-harness");

    expect(definition.id).toBe("explain-agentic-harness");
    expect(definition.evaluators).toHaveLength(1);
  });

  it("rejects an unknown scenario", () => {
    expect(() => getScenarioDefinition("unknown")).toThrow(
      "Unknown scenario: unknown",
    );
  });
});