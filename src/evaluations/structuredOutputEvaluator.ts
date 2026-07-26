import type { ZodType } from "zod";
import type { EvaluationResult } from "./evaluationResult.js";
import type { EvaluationInput, Evaluator } from "./evaluator.js";

export class StructuredOutputEvaluator implements Evaluator {
  readonly id = "structured-output";

  constructor(private readonly outputSchema: ZodType) {}

  evaluate(input: EvaluationInput): EvaluationResult {
    let parsedOutput: unknown;

    try {
      parsedOutput = JSON.parse(input.output);
    } catch {
      return {
        evaluatorId: this.id,
        passed: false,
        message: "The output was not valid JSON.",
      };
    }

    const validationResult =
      this.outputSchema.safeParse(parsedOutput);

    return {
      evaluatorId: this.id,
      passed: validationResult.success,
      message: validationResult.success
        ? "The output matched the required structure."
        : "The output did not match the required structure.",
    };
  }
}