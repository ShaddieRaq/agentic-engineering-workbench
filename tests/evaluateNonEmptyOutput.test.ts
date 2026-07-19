import { describe, expect, it } from "vitest";
import { NonEmptyOutputEvaluator } from "../src/evaluations/evaluateNonEmptyOutput.js";

describe("NonEmptyOutputEvaluator", () => {
  it("passes when the agent produces output", () => {
    const evaluator = new NonEmptyOutputEvaluator();

    const result = evaluator.evaluate("Agent response");

    expect(result).toEqual({
      evaluatorId: "non-empty-output",
      passed: true,
      message: "The agent produced output.",
    });
  });

  it("fails when the output is empty", () => {
    const evaluator = new NonEmptyOutputEvaluator();

    const result = evaluator.evaluate("   ");

    expect(result).toEqual({
      evaluatorId: "non-empty-output",
      passed: false,
      message: "The agent produced no output.",
    });
  });
});