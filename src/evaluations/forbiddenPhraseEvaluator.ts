import type { EvaluationResult } from "./evaluationResult.js";
import type { EvaluationInput, Evaluator } from "./evaluator.js";

export class ForbiddenPhraseEvaluator implements Evaluator {
  readonly id = "forbidden-phrase";

  constructor(private readonly forbiddenPhrase: string) {}

  evaluate(input: EvaluationInput): EvaluationResult {
    const found = input.output
      .toLowerCase()
      .includes(this.forbiddenPhrase.toLowerCase());

    return {
      evaluatorId: this.id,
      passed: !found,
      message: found
        ? `The output included the forbidden phrase: "${this.forbiddenPhrase}".`
        : `The output did not include the forbidden phrase: "${this.forbiddenPhrase}".`,
    };
  }
}