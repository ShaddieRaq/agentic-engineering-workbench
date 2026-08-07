import { describe, expect, it } from "vitest";
import { agentDatasetDefinitionSchema } from "../src/agents/datasets/agentDatasetDefinition.js";
import { testDesignerDataset } from "../src/agents/datasets/testDesignerDataset.js";
import { testDesignerInputSchema } from "../src/agents/testDesigner/testDesignerAgent.js";
import { testDesignerExpectationSchema } from "../src/agents/testDesigner/testDesignerExpectation.js";

describe("testDesignerDataset", () => {
  it("is a valid regression dataset with stable case ids", () => {
    const parsed = agentDatasetDefinitionSchema.parse(testDesignerDataset);
    expect(parsed.agentId).toBe("test-designer");
    expect(parsed.purpose).toBe("regression");
    expect(parsed.cases.map(({ id }) => id)).toEqual([
      "suite-exercises-the-product-with-a-holdout",
    ]);
  });

  it("has runnable inputs and parsable hidden expectations on every case", () => {
    for (const datasetCase of testDesignerDataset.cases) {
      expect(() =>
        testDesignerInputSchema.parse(datasetCase.input),
      ).not.toThrow();
      expect(datasetCase.expected).toBeDefined();
      expect(() =>
        testDesignerExpectationSchema.parse(datasetCase.expected),
      ).not.toThrow();
    }
  });
});
