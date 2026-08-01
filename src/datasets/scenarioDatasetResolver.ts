import type { ScenarioDefinition } from "../scenarios/scenarioDefinition.js";
import { getScenarioDefinition } from "../scenarios/scenarioRegistry.js";
import type { ScenarioDatasetCase } from "./scenarioDatasetCase.js";
import type { ScenarioDatasetDefinition } from "./scenarioDatasetDefinition.js";

export interface ResolvedScenarioDatasetCase {
  datasetCase: ScenarioDatasetCase;
  scenario: ScenarioDefinition;
}

export function resolveScenarioDataset(
  dataset: ScenarioDatasetDefinition,
): ResolvedScenarioDatasetCase[] {
  return dataset.cases.map((datasetCase) => ({
    datasetCase,
    scenario: getScenarioDefinition(datasetCase.scenarioId),
  }));
}