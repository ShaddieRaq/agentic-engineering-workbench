import { MinimumLengthEvaluator } from "../evaluations/minimumLengthEvaluator.js";
import { NonEmptyOutputEvaluator } from "../evaluations/evaluateNonEmptyOutput.js";
import type { HarnessDefinition } from "../harness/harnessDefinition.js";

export const basicReliabilityHarness: HarnessDefinition = {
  id: "basic-reliability",
  description: "Applies general output reliability checks to any task.",
  evaluators: [
    new NonEmptyOutputEvaluator(),
    new MinimumLengthEvaluator(20),
  ],
};