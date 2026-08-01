import type { HarnessResult } from "../harness/harnessResult.js";
import {
  summarizeScenarioSuiteRuns,
  type ScenarioSuiteSummary,
} from "../suites/scenarioSuiteSummary.js";

export interface ScenarioDatasetRunOutcome {
  datasetCaseId: string;
  harnessResult: Pick<HarnessResult, "passed">;
}

export interface ScenarioDatasetCaseSummary
  extends ScenarioSuiteSummary {
  datasetCaseId: string;
}

export function summarizeScenarioDatasetCases(
  runs: ReadonlyArray<ScenarioDatasetRunOutcome>,
): ScenarioDatasetCaseSummary[] {
  const runsByCase = new Map<
    string,
    Array<Pick<HarnessResult, "passed">>
  >();

  for (const run of runs) {
    const caseRuns = runsByCase.get(run.datasetCaseId) ?? [];
    caseRuns.push(run.harnessResult);
    runsByCase.set(run.datasetCaseId, caseRuns);
  }

  return Array.from(
    runsByCase,
    ([datasetCaseId, caseRuns]) => ({
      datasetCaseId,
      ...summarizeScenarioSuiteRuns(caseRuns),
    }),
  );
}