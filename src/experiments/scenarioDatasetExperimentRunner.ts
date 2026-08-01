import type { ScenarioDatasetDefinition } from "../datasets/scenarioDatasetDefinition.js";
import {
  runScenarioDataset,
  type ScenarioDatasetExecutor,
  type ScenarioDatasetRunResult,
} from "../datasets/scenarioDatasetRunner.js";
import {
  compareReliabilitySummaries,
  type ReliabilityComparison,
} from "../orchestration/reliabilityComparison.js";
import type { ScenarioDatasetExperimentDefinition } from "./scenarioDatasetExperimentDefinition.js";

export interface ScenarioDatasetCaseComparison
  extends ReliabilityComparison {
  datasetCaseId: string;
}

export interface ScenarioDatasetExperimentResult {
  definition: ScenarioDatasetExperimentDefinition;
  baseline: ScenarioDatasetRunResult;
  candidate: ScenarioDatasetRunResult;
  comparisons: ScenarioDatasetCaseComparison[];
  completedAt: string;
}

export async function runScenarioDatasetExperiment(
  definition: ScenarioDatasetExperimentDefinition,
  dataset: ScenarioDatasetDefinition,
  baselineExecutor: ScenarioDatasetExecutor,
  candidateExecutor: ScenarioDatasetExecutor,
): Promise<ScenarioDatasetExperimentResult> {
  if (definition.datasetId !== dataset.id) {
    throw new Error(
      `Experiment dataset ${definition.datasetId} does not match ${dataset.id}.`,
    );
  }

  const baseline = await runScenarioDataset(
    dataset,
    baselineExecutor,
    definition.execution,
  );
  const candidate = await runScenarioDataset(
    dataset,
    candidateExecutor,
    definition.execution,
  );
  const candidateSummaries = new Map(
    candidate.caseSummaries.map((summary) => [
      summary.datasetCaseId,
      summary,
    ]),
  );
  const comparisons = baseline.caseSummaries.map(
    (baselineSummary): ScenarioDatasetCaseComparison => {
      const candidateSummary = candidateSummaries.get(
        baselineSummary.datasetCaseId,
      );

      if (!candidateSummary) {
        throw new Error(
          `Candidate evidence is missing case: ${baselineSummary.datasetCaseId}`,
        );
      }

      return {
        datasetCaseId: baselineSummary.datasetCaseId,
        ...compareReliabilitySummaries(
          baselineSummary,
          candidateSummary,
        ),
      };
    },
  );

  return {
    definition,
    baseline,
    candidate,
    comparisons,
    completedAt: new Date().toISOString(),
  };
}
