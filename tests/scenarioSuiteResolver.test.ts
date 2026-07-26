import { describe, expect, it } from "vitest";
import { getScenarioSuiteDefinition } from "../src/suites/scenarioSuiteRegistry.js";
import { resolveScenarioSuite } from "../src/suites/scenarioSuiteResolver.js";

describe("resolveScenarioSuite", () => {
  it("resolves every scenario in a registered suite", () => {
    const suite = getScenarioSuiteDefinition(
      "core-reliability",
    );

    const scenarios = resolveScenarioSuite(suite);

    expect(
      scenarios.map((scenario) => scenario.id),
    ).toEqual([
      "explain-agentic-harness",
    ]);
  });

  it("rejects a suite referencing an unknown scenario", () => {
    expect(() =>
      resolveScenarioSuite({
        id: "invalid-suite",
        description: "Contains an unknown scenario.",
        scenarioIds: ["unknown-scenario"],
      }),
    ).toThrow("Unknown scenario: unknown-scenario");
  });
});