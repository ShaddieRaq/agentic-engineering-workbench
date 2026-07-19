import { describe, expect, it } from "vitest";
import { ForbiddenPhraseEvaluator } from "../src/evaluations/forbiddenPhraseEvaluator.js";
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

describe("ForbiddenPhraseEvaluator", () => {
  it("passes when the output does not include the forbidden phrase", () => {
    const evaluator = new ForbiddenPhraseEvaluator("I cannot help");

    const result = evaluator.evaluate(
      createEvaluationInput("Here is the requested explanation."),
    );

    expect(result).toEqual({
      evaluatorId: "forbidden-phrase",
      passed: true,
      message:
        'The output did not include the forbidden phrase: "I cannot help".',
    });
  });

  it("fails when the output includes the forbidden phrase", () => {
    const evaluator = new ForbiddenPhraseEvaluator("I cannot help");

    const result = evaluator.evaluate(
      createEvaluationInput("I cannot help with that request."),
    );

    expect(result).toEqual({
      evaluatorId: "forbidden-phrase",
      passed: false,
      message:
        'The output included the forbidden phrase: "I cannot help".',
    });
  });
});