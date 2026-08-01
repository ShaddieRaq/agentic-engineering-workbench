import type { HarnessResult } from "../harness/harnessResult.js";

export interface ScenarioSuiteSummary {
  totalRuns: number;
  passedRuns: number;
  failedRuns: number;
  passRate: number | null;
}

export function summarizeScenarioSuiteRuns(
  runs: ReadonlyArray<Pick<HarnessResult, "passed">>,
): ScenarioSuiteSummary {
  const totalRuns = runs.length;
  const passedRuns = runs.filter((run) => run.passed).length;

  return {
    totalRuns,
    passedRuns,
    failedRuns: totalRuns - passedRuns,
    passRate: totalRuns === 0 ? null : passedRuns / totalRuns,
  };
}