import { describe, expect, it } from "vitest";
import { MinimumLengthEvaluator } from "../src/evaluations/minimumLengthEvaluator.js";
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

describe("MinimumLengthEvaluator", () => {
  it("passes when output meets the minimum length", () => {
    const evaluator = new MinimumLengthEvaluator(5);

    const result = evaluator.evaluate(createEvaluationInput("Hello"));

    expect(result).toEqual({
      evaluatorId: "minimum-length",
      passed: true,
      message: "The output met the minimum length of 5 characters.",
    });
  });

  it("fails when output is too short", () => {
    const evaluator = new MinimumLengthEvaluator(5);

    const result = evaluator.evaluate(createEvaluationInput("Hi"));

    expect(result).toEqual({
      evaluatorId: "minimum-length",
      passed: false,
      message: "The output had 2 characters but required at least 5.",
    });
  });
});
