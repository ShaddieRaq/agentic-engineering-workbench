import type { HarnessResult } from "../harness/harnessResult.js";
import type { ScenarioDatasetDefinition } from "./scenarioDatasetDefinition.js";
import {
  resolveScenarioDataset,
  type ResolvedScenarioDatasetCase,
} from "./scenarioDatasetResolver.js";

export type ScenarioDatasetExecutor = (
  resolvedCase: ResolvedScenarioDatasetCase,
) => Promise<HarnessResult>;

export interface ScenarioDatasetRunEvidence {
  datasetCaseId: string;
  harnessResult: HarnessResult;
}

export interface ScenarioDatasetRunResult {
  datasetId: string;
  runs: ScenarioDatasetRunEvidence[];
}

export async function runScenarioDataset(
  dataset: ScenarioDatasetDefinition,
  executeDatasetCase: ScenarioDatasetExecutor,
): Promise<ScenarioDatasetRunResult> {
  const resolvedCases = resolveScenarioDataset(dataset);
  const runs: ScenarioDatasetRunEvidence[] = [];

  for (const resolvedCase of resolvedCases) {
    const harnessResult = await executeDatasetCase(resolvedCase);

    runs.push({
      datasetCaseId: resolvedCase.datasetCase.id,
      harnessResult,
    });
  }

  return {
    datasetId: dataset.id,
    runs,
  };
}