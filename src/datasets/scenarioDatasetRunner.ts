import type { HarnessResult } from "../harness/harnessResult.js";
import type { ScenarioDatasetDefinition } from "./scenarioDatasetDefinition.js";
import {
    resolveScenarioDataset,
    type ResolvedScenarioDatasetCase,
} from "./scenarioDatasetResolver.js";

import {
    parseRepetitionOptions,
    type RepetitionOptions,
} from "../orchestration/repetitionPolicy.js";

import {
    summarizeScenarioDatasetCases,
    type ScenarioDatasetCaseSummary,
  } from "./scenarioDatasetSummary.js";

export type ScenarioDatasetRunOptions = RepetitionOptions;

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
    caseSummaries: ScenarioDatasetCaseSummary[];
  }

export async function runScenarioDataset(
    dataset: ScenarioDatasetDefinition,
    executeDatasetCase: ScenarioDatasetExecutor,
    options: ScenarioDatasetRunOptions = {},
  ): Promise<ScenarioDatasetRunResult> {
    const { repetitions } = parseRepetitionOptions(options);
    const resolvedCases = resolveScenarioDataset(dataset);
    const runs: ScenarioDatasetRunEvidence[] = [];

    for (const resolvedCase of resolvedCases) {
        for (let repetition = 0; repetition < repetitions; repetition += 1) {
          const harnessResult = await executeDatasetCase(resolvedCase);
    
          runs.push({
            datasetCaseId: resolvedCase.datasetCase.id,
            harnessResult,
          });
        }
      }

      return {
        datasetId: dataset.id,
        runs,
        caseSummaries: summarizeScenarioDatasetCases(runs),
      };
}