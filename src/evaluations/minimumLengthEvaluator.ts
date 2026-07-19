import type { EvaluationResult } from "./evaluationResult.js";
import type { EvaluationInput, Evaluator } from "./evaluator.js";

export class MinimumLengthEvaluator implements Evaluator {
  readonly id = "minimum-length";

  constructor(private readonly minimumCharacters: number) {}

  evaluate(input: EvaluationInput): EvaluationResult {
    const characterCount = input.output.trim().length;
    const passed = characterCount >= this.minimumCharacters;

    return {
      evaluatorId: this.id,
      passed,
      message: passed
        ? `The output met the minimum length of ${this.minimumCharacters} characters.`
        : `The output had ${characterCount} characters but required at least ${this.minimumCharacters}.`,
    };
  }
}