import { describe, expect, it } from "vitest";
import { scenarioDatasetDefinitionSchema } from "../src/datasets/scenarioDatasetDefinition.js";
import { resolveScenarioDataset } from "../src/datasets/scenarioDatasetResolver.js";

describe("resolveScenarioDataset", () => {
  it("resolves each case to its scenario policy", () => {
    const dataset = scenarioDatasetDefinitionSchema.parse({
      id: "agentic-harness-audiences",
      description: "Exercises one policy with audience-specific inputs.",
      cases: [
        {
          id: "beginner",
          scenarioId: "explain-agentic-harness",
          task: {
            id: "beginner-explanation",
            instruction: "Explain an agentic harness to a beginner.",
          },
          context: [],
        },
      ],
    });

    const resolvedCases = resolveScenarioDataset(dataset);

    expect(resolvedCases).toHaveLength(1);
    expect(resolvedCases[0]?.datasetCase.id).toBe("beginner");
    expect(resolvedCases[0]?.scenario.id).toBe(
      "explain-agentic-harness",
    );
  });
  it("rejects a case referencing an unknown scenario", () => {
    const dataset = scenarioDatasetDefinitionSchema.parse({
      id: "invalid-dataset",
      description: "Contains an invalid scenario reference.",
      cases: [
        {
          id: "invalid-case",
          scenarioId: "unknown-scenario",
          task: {
            id: "invalid-task",
            instruction: "This case must not execute.",
          },
          context: [],
        },
      ],
    });

    expect(() => resolveScenarioDataset(dataset)).toThrow(
      "Unknown scenario: unknown-scenario",
    );
  });
});