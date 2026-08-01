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
import {
  compareLatencySummaries,
  summarizeLatencies,
  type LatencyComparison,
} from "../orchestration/latencyComparison.js";
import type { ScenarioDatasetExperimentDefinition } from "./scenarioDatasetExperimentDefinition.js";
import {
  compareTokenCostSummaries,
  summarizeTokenCosts,
  type TokenCostComparison,
} from "../orchestration/tokenCostComparison.js";

export interface ScenarioDatasetCaseComparison
  extends ReliabilityComparison {
  datasetCaseId: string;
}

export interface ScenarioDatasetCaseLatencyComparison
  extends LatencyComparison {
  datasetCaseId: string;
}

export interface ScenarioDatasetCaseTokenCostComparison
  extends TokenCostComparison {
  datasetCaseId: string;
}

export interface ScenarioDatasetExperimentResult {
  definition: ScenarioDatasetExperimentDefinition;
  baseline: ScenarioDatasetRunResult;
  candidate: ScenarioDatasetRunResult;
  reliabilityComparisons: ScenarioDatasetCaseComparison[];
  latencyComparisons: ScenarioDatasetCaseLatencyComparison[];
  tokenCostComparisons: ScenarioDatasetCaseTokenCostComparison[];
  completedAt: string;
}

function durationsForCase(
  result: ScenarioDatasetRunResult,
  datasetCaseId: string,
): number[] {
  return result.runs
    .filter((run) => run.datasetCaseId === datasetCaseId)
    .map((run) => run.harnessResult.durationMs);
}

function providerEvidenceForCase(
  result: ScenarioDatasetRunResult,
  datasetCaseId: string,
) {
  return result.runs
    .filter((run) => run.datasetCaseId === datasetCaseId)
    .map((run) => run.harnessResult.provider);
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
  const reliabilityComparisons = baseline.caseSummaries.map(
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
  const latencyComparisons = baseline.caseSummaries.map(
    ({ datasetCaseId }): ScenarioDatasetCaseLatencyComparison => ({
      datasetCaseId,
      ...compareLatencySummaries(
        summarizeLatencies(
          durationsForCase(baseline, datasetCaseId),
        ),
        summarizeLatencies(
          durationsForCase(candidate, datasetCaseId),
        ),
      ),
    }),
  );
  const tokenCostComparisons = baseline.caseSummaries.map(
    ({ datasetCaseId }): ScenarioDatasetCaseTokenCostComparison => ({
      datasetCaseId,
      ...compareTokenCostSummaries(
        summarizeTokenCosts(
          providerEvidenceForCase(baseline, datasetCaseId),
        ),
        summarizeTokenCosts(
          providerEvidenceForCase(candidate, datasetCaseId),
        ),
      ),
    }),
  );

  return {
    definition,
    baseline,
    candidate,
    reliabilityComparisons,
    latencyComparisons,
    tokenCostComparisons,
    completedAt: new Date().toISOString(),
  };
}
