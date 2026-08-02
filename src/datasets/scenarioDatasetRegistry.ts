import { agenticHarnessAudienceDataset } from "./agenticHarnessAudienceDataset.js";
import { adversarialInstructionDataset } from "./adversarialInstructionDataset.js";
import type { ScenarioDatasetDefinition } from "./scenarioDatasetDefinition.js";

const scenarioDatasets: Record<
  string,
  ScenarioDatasetDefinition
> = {
  [agenticHarnessAudienceDataset.id]:
    agenticHarnessAudienceDataset,
  [adversarialInstructionDataset.id]: adversarialInstructionDataset,
};

export function getScenarioDatasetDefinition(
  id: string,
): ScenarioDatasetDefinition {
  const dataset = scenarioDatasets[id];

  if (!dataset) {
    throw new Error(`Unknown scenario dataset: ${id}`);
  }

  return dataset;
}

export function listScenarioDatasetDefinitions(): ScenarioDatasetDefinition[] {
  return Object.values(scenarioDatasets).sort((left, right) =>
    left.id.localeCompare(right.id),
  );
}
