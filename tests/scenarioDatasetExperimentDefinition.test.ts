import { describe, expect, it } from "vitest";
import { scenarioDatasetExperimentDefinitionSchema } from "../src/experiments/scenarioDatasetExperimentDefinition.js";

const definition = {
  id: "role-comparison",
  datasetId: "agentic-harness-audiences",
  harnessId: "technical-coach",
  baseline: {
    id: "baseline",
    rolePath: "roles/technical-coach.md",
  },
  candidate: {
    id: "candidate",
    rolePath: "roles/audience-aware-coach.md",
  },
  execution: {
    repetitions: 1,
    concurrency: 1,
  },
};

describe("scenarioDatasetExperimentDefinitionSchema", () => {
  it("accepts distinct baseline and candidate variants", () => {
    expect(
      scenarioDatasetExperimentDefinitionSchema.parse(definition),
    ).toEqual(definition);
  });

  it("rejects duplicate variant IDs", () => {
    expect(() =>
      scenarioDatasetExperimentDefinitionSchema.parse({
        ...definition,
        candidate: {
          ...definition.candidate,
          id: "baseline",
        },
      }),
    ).toThrow("Baseline and candidate IDs must be different");
  });
});
