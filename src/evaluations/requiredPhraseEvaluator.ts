import type { EvaluationResult } from "./evaluationResult.js";
import type { EvaluationInput, Evaluator } from "./evaluator.js";

export class RequiredPhraseEvaluator implements Evaluator {
  readonly id = "required-phrase";

  constructor(private readonly requiredPhrase: string) {}

  evaluate(input: EvaluationInput): EvaluationResult {
    const passed = input.output
      .toLowerCase()
      .includes(this.requiredPhrase.toLowerCase());

    return {
      evaluatorId: this.id,
      passed,
      message: passed
        ? `The output included the required phrase: "${this.requiredPhrase}".`
        : `The output did not include the required phrase: "${this.requiredPhrase}".`,
    };
  }
}