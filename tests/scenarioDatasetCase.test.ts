import { describe, expect, it } from "vitest";
import { scenarioDatasetCaseSchema } from "../src/datasets/scenarioDatasetCase.js";

describe("scenarioDatasetCaseSchema", () => {
  it("accepts an explicit scenario input case", () => {
    const result = scenarioDatasetCaseSchema.safeParse({
      id: "beginner-explanation",
      scenarioId: "explain-agentic-harness",
      task: {
        id: "explain-agentic-harness-for-beginners",
        instruction: "Explain an agentic harness to a beginner.",
      },
      context: [
        {
          id: "target-audience",
          source: "dataset",
          content: "The reader is new to AI engineering.",
        },
      ],
    });

    expect(result.success).toBe(true);
  });
});