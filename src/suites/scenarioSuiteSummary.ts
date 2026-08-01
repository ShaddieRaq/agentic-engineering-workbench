import type {
    ExecutionFailureCategory,
    HarnessResult,
  } from "../harness/harnessResult.js";

export interface ScenarioSuiteSummary {
  totalRuns: number;
  passedRuns: number;
  failedRuns: number;
  passRate: number | null;
}

export interface ScenarioSuiteFailureSummary {
    executionFailures: Record<ExecutionFailureCategory, number>;
    evaluatorFailures: Record<string, number>;
  }

  export function summarizeScenarioSuiteFailures(
    runs: ReadonlyArray<
      Pick<HarnessResult, "executionFailure" | "evaluations">
    >,
  ): ScenarioSuiteFailureSummary {
    const executionFailures: Record<ExecutionFailureCategory, number> = {
      transport: 0,
      parsing: 0,
      unknown: 0,
    };
    const evaluatorFailures: Record<string, number> = {};

    for (const run of runs) {
      if (run.executionFailure) {
        executionFailures[run.executionFailure.category] += 1;
      }

      for (const evaluation of run.evaluations) {
        if (!evaluation.passed) {
          evaluatorFailures[evaluation.evaluatorId] =
            (evaluatorFailures[evaluation.evaluatorId] ?? 0) + 1;
        }
      }
    }

    return {
      executionFailures,
      evaluatorFailures,
    };
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