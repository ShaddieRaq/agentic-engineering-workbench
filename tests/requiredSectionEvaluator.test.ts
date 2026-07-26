import { describe, expect, it } from "vitest";
import type { EvaluationInput } from "../src/evaluations/evaluator.js";
import { RequiredSectionEvaluator } from "../src/evaluations/requiredSectionEvaluator.js";

function createEvaluationInput(output: string): EvaluationInput {
  return {
    role: {
      id: "coach",
      instructions: "Explain clearly.",
    },
    task: {
      id: "example",
      instruction: "Explain the example.",
    },
    context: [],
    prompt: "Explain the example.",
    output,
  };
}

describe("RequiredSectionEvaluator", () => {
  it("passes when the output contains the required Markdown section", () => {
    const evaluator = new RequiredSectionEvaluator("Risks");

    const result = evaluator.evaluate(
      createEvaluationInput("## Risks\n\nThe workflow may fail."),
    );

    expect(result).toEqual({
      evaluatorId: "required-section",
      passed: true,
      message: 'The output included the required section: "Risks".',
    });
  });

  it("ignores heading level and title case", () => {
    const evaluator = new RequiredSectionEvaluator("Risks");

    const result = evaluator.evaluate(
      createEvaluationInput("##### rIsKs\n\nThe workflow may fail."),
    );

    expect(result.passed).toBe(true);
  });

  it("does not treat an ordinary text mention as a section", () => {
    const evaluator = new RequiredSectionEvaluator("Risks");

    const result = evaluator.evaluate(
      createEvaluationInput("This explanation discusses risks."),
    );

    expect(result).toEqual({
      evaluatorId: "required-section",
      passed: false,
      message: 'The output did not include the required section: "Risks".',
    });
  });

  it("requires an exact heading title", () => {
    const evaluator = new RequiredSectionEvaluator("Risks");

    const result = evaluator.evaluate(
      createEvaluationInput("## Risk analysis\n\nThe workflow may fail."),
    );

    expect(result.passed).toBe(false);
  });
});
