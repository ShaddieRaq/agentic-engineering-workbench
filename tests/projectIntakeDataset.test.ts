import { describe, expect, it } from "vitest";
import { agentDatasetDefinitionSchema } from "../src/agents/datasets/agentDatasetDefinition.js";
import { getAgentDatasetDefinition } from "../src/agents/datasets/agentDatasetRegistry.js";
import { projectIntakeDataset } from "../src/agents/datasets/projectIntakeDataset.js";
import { platformAgentRegistry } from "../src/agents/platformAgentRegistry.js";
import { projectIntakeExpectationSchema } from "../src/agents/projectIntake/projectIntakeExpectation.js";
import { intakeTurnInputSchema } from "../src/foundry/intakeTurnInput.js";

describe("projectIntakeDataset", () => {
  it("is a valid regression dataset with stable case ids", () => {
    const parsed = agentDatasetDefinitionSchema.parse(projectIntakeDataset);
    expect(parsed.agentId).toBe("project-intake");
    expect(parsed.purpose).toBe("regression");
    expect(parsed.cases.map(({ id }) => id)).toEqual([
      "opening-turn-interrogates-the-idea",
      "confirmed-inference-becomes-user-stated",
      "vague-answer-is-challenged-not-accepted",
      "contradiction-is-surfaced-not-silently-resolved",
      "final-turn-reports-honestly",
    ]);
  });

  it("has runnable inputs and parsable hidden expectations on every case", () => {
    for (const datasetCase of projectIntakeDataset.cases) {
      expect(() => intakeTurnInputSchema.parse(datasetCase.input)).not.toThrow();
      expect(datasetCase.expected).toBeDefined();
      expect(() =>
        projectIntakeExpectationSchema.parse(datasetCase.expected),
      ).not.toThrow();
    }
  });

  it("is registered and wired into the agent verification manifest", () => {
    expect(getAgentDatasetDefinition("project-intake-smoke").id).toBe(
      "project-intake-smoke",
    );
    expect(
      platformAgentRegistry.get("project-intake").manifest.verification,
    ).toEqual({
      datasetIds: ["project-intake-smoke"],
      minimumPassRate: 1,
    });
  });
});
