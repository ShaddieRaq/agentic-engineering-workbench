import { describe, expect, it } from "vitest";
import { getScenarioSuiteDefinition } from "../src/suites/scenarioSuiteRegistry.js";

describe("getScenarioSuiteDefinition", () => {
  it("returns a registered scenario suite", () => {
    const suite = getScenarioSuiteDefinition(
      "core-reliability",
    );

    expect(suite.id).toBe("core-reliability");
    expect(suite.scenarioIds).toEqual([
      "explain-agentic-harness",
    ]);
  });

  it("rejects an unknown scenario suite", () => {
    expect(() =>
      getScenarioSuiteDefinition("unknown"),
    ).toThrow("Unknown scenario suite: unknown");
  });
});
