import { RequiredPhraseEvaluator } from "../evaluations/requiredPhraseEvaluator.js";
import { StructuredOutputEvaluator } from "../evaluations/structuredOutputEvaluator.js";
import type { ScenarioDefinition } from "./scenarioDefinition.js";
import { explainAgenticHarnessOutputSchema } from "./explainAgenticHarnessOutput.js";

export const explainAgenticHarnessScenario: ScenarioDefinition = {
    id: "explain-agentic-harness",
    description: "Explains what an agentic harness is and how it works.",
    outputSchema: explainAgenticHarnessOutputSchema,
    evaluators: [
        new RequiredPhraseEvaluator("agentic harness"),
        new StructuredOutputEvaluator(
            explainAgenticHarnessOutputSchema,
        ),
    ],
};