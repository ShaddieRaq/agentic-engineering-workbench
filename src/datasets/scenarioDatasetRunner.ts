import type { HarnessResult } from "../harness/harnessResult.js";
import type { ScenarioDatasetDefinition } from "./scenarioDatasetDefinition.js";
import { mapWithConcurrency } from "../orchestration/mapWithConcurrency.js";
import {
    resolveScenarioDataset,
    type ResolvedScenarioDatasetCase,
} from "./scenarioDatasetResolver.js";

import {
    parseExecutionOptions,
    type ExecutionOptions,
} from "../orchestration/executionPolicy.js";

import {
    summarizeScenarioDatasetCases,
    type ScenarioDatasetCaseSummary,
} from "./scenarioDatasetSummary.js";

export type ScenarioDatasetRunOptions = ExecutionOptions;

export type ScenarioDatasetExecutor = (
    resolvedCase: ResolvedScenarioDatasetCase,
) => Promise<HarnessResult>;

export interface ScenarioDatasetRunEvidence {
    datasetCaseId: string;
    adversarial?: ResolvedScenarioDatasetCase["datasetCase"]["adversarial"];
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
    const { repetitions, concurrency } =
    parseExecutionOptions(options);
    const resolvedCases = resolveScenarioDataset(dataset);
    const executionPlan = resolvedCases.flatMap(
        (resolvedCase) =>
          Array.from(
            { length: repetitions },
            () => resolvedCase,
          ),
      );
    
      const runs = await mapWithConcurrency(
        executionPlan,
        concurrency,
        async (resolvedCase): Promise<ScenarioDatasetRunEvidence> => ({
          datasetCaseId: resolvedCase.datasetCase.id,
          ...(resolvedCase.datasetCase.adversarial
            ? { adversarial: resolvedCase.datasetCase.adversarial }
            : {}),
          harnessResult:
            await executeDatasetCase(resolvedCase),
        }),
      );

    return {
        datasetId: dataset.id,
        runs,
        caseSummaries: summarizeScenarioDatasetCases(runs),
    };
}
