import { ForbiddenPhraseEvaluator } from "../evaluations/forbiddenPhraseEvaluator.js";
import { MinimumLengthEvaluator } from "../evaluations/minimumLengthEvaluator.js";
import { NonEmptyOutputEvaluator } from "../evaluations/evaluateNonEmptyOutput.js";
import type { HarnessDefinition } from "../harness/harnessDefinition.js";

export const technicalCoachHarness: HarnessDefinition = {
  id: "technical-coach",
  description: "Explains technical concepts clearly and practically.",
  evaluators: [
    new NonEmptyOutputEvaluator(),
    new MinimumLengthEvaluator(100),
    new ForbiddenPhraseEvaluator("I cannot help"),
  ],
};