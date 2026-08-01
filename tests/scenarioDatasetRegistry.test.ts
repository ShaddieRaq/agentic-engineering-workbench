import { describe, expect, it } from "vitest";
import { getScenarioDatasetDefinition } from "../src/datasets/scenarioDatasetRegistry.js";

describe("getScenarioDatasetDefinition", () => {
  it("returns a registered scenario dataset", () => {
    const dataset = getScenarioDatasetDefinition(
      "agentic-harness-audiences",
    );

    expect(dataset.id).toBe("agentic-harness-audiences");
    expect(dataset.cases.map((datasetCase) => datasetCase.id)).toEqual([
      "beginner",
      "staff-engineer",
    ]);
  });
  it("rejects an unknown scenario dataset", () => {
    expect(() =>
      getScenarioDatasetDefinition("unknown-dataset"),
    ).toThrow("Unknown scenario dataset: unknown-dataset");
  });
});