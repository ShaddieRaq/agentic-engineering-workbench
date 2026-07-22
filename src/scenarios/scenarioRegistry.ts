import type { ScenarioDefinition } from "./scenarioDefinition.js";
import { explainAgenticHarnessScenario } from "./explainAgenticHarnessScenario.js";

const scenarios: Record<string, ScenarioDefinition> = {
  [explainAgenticHarnessScenario.id]: explainAgenticHarnessScenario,
};

export function getScenarioDefinition(id: string): ScenarioDefinition {
  const definition = scenarios[id];

  if (!definition) {
    throw new Error(`Unknown scenario: ${id}`);
  }

  return definition;
}