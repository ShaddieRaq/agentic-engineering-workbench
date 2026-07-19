import type { EvaluationResult } from "./evaluationResult.js";

export function evaluateNonEmptyOutput(
  output: string,
): EvaluationResult {
  const passed = output.trim().length > 0;

  return {
    evaluatorId: "non-empty-output",
    passed,
    message: passed
      ? "The agent produced output."
      : "The agent produced no output.",
  };
}