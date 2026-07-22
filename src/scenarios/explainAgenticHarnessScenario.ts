import { RequiredPhraseEvaluator } from "../evaluations/requiredPhraseEvaluator.js";
import type { ScenarioDefinition } from "./scenarioDefinition.js";

export const explainAgenticHarnessScenario: ScenarioDefinition = {
  id: "explain-agentic-harness",
  description: "Explains what an agentic harness is and how it works.",
  evaluators: [
    new RequiredPhraseEvaluator("agentic harness"),
  ],
};