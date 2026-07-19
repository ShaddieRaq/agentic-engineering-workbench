import type { EvaluationResult } from "./evaluationResult.js";
import type { EvaluationInput, Evaluator } from "./evaluator.js";

export class NonEmptyOutputEvaluator implements Evaluator {
  readonly id = "non-empty-output";

  evaluate(input: EvaluationInput): EvaluationResult {
    const passed = input.output.trim().length > 0;

    return {
      evaluatorId: this.id,
      passed,
      message: passed
        ? "The agent produced output."
        : "The agent produced no output.",
    };
  }
}