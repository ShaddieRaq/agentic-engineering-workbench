import { describe, expect, it } from "vitest";
import { agentDatasetDefinitionSchema } from "../src/agents/datasets/agentDatasetDefinition.js";
import { getAgentDatasetDefinition } from "../src/agents/datasets/agentDatasetRegistry.js";
import { projectArchitectDataset } from "../src/agents/datasets/projectArchitectDataset.js";
import { platformAgentRegistry } from "../src/agents/platformAgentRegistry.js";
import { projectArchitectInputSchema } from "../src/agents/projectArchitect/projectArchitectAgent.js";
import { projectArchitectExpectationSchema } from "../src/agents/projectArchitect/projectArchitectExpectation.js";

describe("projectArchitectDataset", () => {
  it("is a valid regression dataset with stable case ids", () => {
    const parsed = agentDatasetDefinitionSchema.parse(projectArchitectDataset);
    expect(parsed.agentId).toBe("project-architect");
    expect(parsed.purpose).toBe("regression");
    expect(parsed.cases.map(({ id }) => id)).toEqual([
      "clean-brief-plans-without-alarms",
      "behavioral-criteria-map-to-automated-tests",
      "constraint-traceability",
      "contradictory-brief-flags-blocking",
      "multi-feature-boundedness",
    ]);
  });

  it("has runnable inputs and parsable hidden expectations on every case", () => {
    for (const datasetCase of projectArchitectDataset.cases) {
      expect(() =>
        projectArchitectInputSchema.parse(datasetCase.input),
      ).not.toThrow();
      expect(datasetCase.expected).toBeDefined();
      expect(() =>
        projectArchitectExpectationSchema.parse(datasetCase.expected),
      ).not.toThrow();
    }
  });

  it("is registered and wired into the agent verification manifest", () => {
    expect(getAgentDatasetDefinition("project-architect-smoke").id).toBe(
      "project-architect-smoke",
    );
    expect(
      platformAgentRegistry.get("project-architect").manifest.verification,
    ).toEqual({
      datasetIds: ["project-architect-smoke"],
      minimumPassRate: 1,
    });
  });
});
