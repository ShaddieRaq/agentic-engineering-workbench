import { describe, expect, it } from "vitest";
import { RequiredPhraseEvaluator } from "../src/evaluations/requiredPhraseEvaluator.js";
import type { EvaluationInput } from "../src/evaluations/evaluator.js";

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

describe("RequiredPhraseEvaluator", () => {
  it("passes when the output includes the required phrase", () => {
    const evaluator = new RequiredPhraseEvaluator("agentic harness");

    const result = evaluator.evaluate(
      createEvaluationInput("An agentic harness controls the model workflow."),
    );

    expect(result).toEqual({
      evaluatorId: "required-phrase",
      passed: true,
      message:
        'The output included the required phrase: "agentic harness".',
    });
  });

  it("fails when the output does not include the required phrase", () => {
    const evaluator = new RequiredPhraseEvaluator("agentic harness");

    const result = evaluator.evaluate(
      createEvaluationInput("The model produced a response."),
    );

    expect(result).toEqual({
      evaluatorId: "required-phrase",
      passed: false,
      message:
        'The output did not include the required phrase: "agentic harness".',
    });
  });
});