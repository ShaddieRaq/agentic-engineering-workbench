import type { EvaluationResult } from "./evaluationResult.js";
import type { Evaluator } from "./evaluator.js";

export class NonEmptyOutputEvaluator implements Evaluator {
  readonly id = "non-empty-output";

  evaluate(output: string): EvaluationResult {
    const passed = output.trim().length > 0;

    return {
      evaluatorId: this.id,
      passed,
      message: passed
        ? "The agent produced output."
        : "The agent produced no output.",
    };
  }
}