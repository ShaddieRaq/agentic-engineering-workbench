import type { EvaluationResult } from "./evaluationResult.js";
import type { EvaluationInput, Evaluator } from "./evaluator.js";

export class RequiredSectionEvaluator implements Evaluator {
  readonly id = "required-section";

  constructor(private readonly requiredSection: string) {}

  evaluate(input: EvaluationInput): EvaluationResult {
    const normalizedRequiredSection = this.requiredSection
      .trim()
      .toLowerCase();

    const headingPattern = /^#{1,6}\s+(.+?)\s*#*\s*$/gm;

    const passed = Array.from(input.output.matchAll(headingPattern)).some(
      (match) =>
        match[1]?.trim().toLowerCase() === normalizedRequiredSection,
    );

    return {
      evaluatorId: this.id,
      passed,
      message: passed
        ? `The output included the required section: "${this.requiredSection}".`
        : `The output did not include the required section: "${this.requiredSection}".`,
    };
  }
}