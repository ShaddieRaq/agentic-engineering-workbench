import { describe, expect, it } from "vitest";
import { scenarioDatasetDefinitionSchema } from "../src/datasets/scenarioDatasetDefinition.js";

describe("scenarioDatasetDefinitionSchema", () => {
  it("accepts multiple cases for one scenario policy", () => {
    const result = scenarioDatasetDefinitionSchema.safeParse({
      id: "agentic-harness-audiences",
      description: "Explains agentic harnesses to different audiences.",
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
        {
          id: "staff-engineer",
          scenarioId: "explain-agentic-harness",
          task: {
            id: "staff-engineer-explanation",
            instruction: "Explain an agentic harness to a staff engineer.",
          },
          context: [],
        },
      ],
    });

    expect(result.success).toBe(true);
  });
  it("rejects duplicate case IDs", () => {
    const duplicateCase = {
      id: "duplicate-case",
      scenarioId: "explain-agentic-harness",
      task: {
        id: "explanation",
        instruction: "Explain an agentic harness.",
      },
      context: [],
    };

    const result = scenarioDatasetDefinitionSchema.safeParse({
      id: "invalid-dataset",
      description: "Contains ambiguous case IDs.",
      cases: [duplicateCase, duplicateCase],
    });

    expect(result.success).toBe(false);
  });
});