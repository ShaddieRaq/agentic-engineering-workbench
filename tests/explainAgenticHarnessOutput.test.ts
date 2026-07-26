import { describe, expect, it } from "vitest";
import { explainAgenticHarnessOutputSchema } from "../src/scenarios/explainAgenticHarnessOutput.js";

describe("explainAgenticHarnessOutputSchema", () => {
  it("accepts a complete structured explanation", () => {
    const result = explainAgenticHarnessOutputSchema.safeParse({
      definition: "An agentic harness surrounds a model with explicit controls.",
      responsibilities: ["Build prompts", "Evaluate responses"],
      modelBoundary: "The model generates output but does not control the workflow.",
      practicalExample: "A coaching harness evaluates a generated explanation.",
    });

    expect(result.success).toBe(true);
  });
  it("rejects an explanation missing a required field", () => {
    const result = explainAgenticHarnessOutputSchema.safeParse({
      definition: "An agentic harness surrounds a model with explicit controls.",
      responsibilities: ["Build prompts"],
      modelBoundary: "The model does not control the workflow.",
    });

    expect(result.success).toBe(false);
  });
});