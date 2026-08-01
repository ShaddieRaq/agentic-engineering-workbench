import { agenticHarnessAudienceDataset } from "./agenticHarnessAudienceDataset.js";
import type { ScenarioDatasetDefinition } from "./scenarioDatasetDefinition.js";

const scenarioDatasets: Record<
  string,
  ScenarioDatasetDefinition
> = {
  [agenticHarnessAudienceDataset.id]:
    agenticHarnessAudienceDataset,
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