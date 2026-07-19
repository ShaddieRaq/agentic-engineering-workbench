import { describe, expect, it } from "vitest";
import { MinimumLengthEvaluator } from "../src/evaluations/minimumLengthEvaluator.js";

describe("MinimumLengthEvaluator", () => {
  it("passes when output meets the minimum length", () => {
    const evaluator = new MinimumLengthEvaluator(5);

    const result = evaluator.evaluate("Hello");

    expect(result).toEqual({
      evaluatorId: "minimum-length",
      passed: true,
      message: "The output met the minimum length of 5 characters.",
    });
  });

  it("fails when output is too short", () => {
    const evaluator = new MinimumLengthEvaluator(5);

    const result = evaluator.evaluate("Hi");

    expect(result).toEqual({
      evaluatorId: "minimum-length",
      passed: false,
      message: "The output had 2 characters but required at least 5.",
    });
  });
});
