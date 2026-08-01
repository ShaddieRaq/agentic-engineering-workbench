import type { ScenarioDefinition } from "./scenarioDefinition.js";
import { explainAgenticHarnessScenario } from "./explainAgenticHarnessScenario.js";
import { adversarialInstructionDefenseScenario } from "./adversarialInstructionDefenseScenario.js";

const scenarios: Record<string, ScenarioDefinition> = {
    [explainAgenticHarnessScenario.id]: explainAgenticHarnessScenario,
    [adversarialInstructionDefenseScenario.id]:
        adversarialInstructionDefenseScenario,
};

export function getScenarioDefinition(id: string): ScenarioDefinition {
    const definition = scenarios[id];

    if (!definition) {
        throw new Error(`Unknown scenario: ${id}`);
    }

    return definition;
}

export function findScenarioDefinition(
    id: string,
): ScenarioDefinition | undefined {
    return scenarios[id];
}
