import { describe, expect, it } from "vitest";
import { evaluateNonEmptyOutput } from "../src/evaluations/evaluateNonEmptyOutput.js";

describe("evaluateNonEmptyOutput", () => {
  it("passes when the agent produces output", () => {
    const result = evaluateNonEmptyOutput("Agent response");

    expect(result).toEqual({
      evaluatorId: "non-empty-output",
      passed: true,
      message: "The agent produced output.",
    });
  });

  it("fails when the output is empty", () => {
    const result = evaluateNonEmptyOutput("   ");

    expect(result).toEqual({
      evaluatorId: "non-empty-output",
      passed: false,
      message: "The agent produced no output.",
    });
  });
});