import { describe, expect, it } from "vitest";
import { NonEmptyOutputEvaluator } from "../src/evaluations/evaluateNonEmptyOutput.js";
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

describe("NonEmptyOutputEvaluator", () => {
  it("passes when the agent produces output", () => {
    const evaluator = new NonEmptyOutputEvaluator();

    const result = evaluator.evaluate(createEvaluationInput("Agent response"));

    expect(result).toEqual({
      evaluatorId: "non-empty-output",
      passed: true,
      message: "The agent produced output.",
    });
  });

  it("fails when the output is empty", () => {
    const evaluator = new NonEmptyOutputEvaluator();

    const result = evaluator.evaluate(createEvaluationInput("   "));

    expect(result).toEqual({
      evaluatorId: "non-empty-output",
      passed: false,
      message: "The agent produced no output.",
    });
  });
});