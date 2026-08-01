import { randomUUID } from "node:crypto";
import type { ModelBasedEvaluationResult } from "../evaluations/modelBasedEvaluatorRunner.js";
import type { HarnessResult } from "../harness/harnessResult.js";
import { summarizeTokenCosts, type TokenCostSummary } from "../orchestration/tokenCostComparison.js";
import type { RejectedHarnessRunArtifact } from "./harnessRunLoader.js";

export interface HarnessRunReport {
  reportId: string;
  sources: {
    acceptedPaths: string[];
    rejectedArtifacts: RejectedHarnessRunArtifact[];
  };
  runIds: string[];
  totalRuns: number;
  passedRuns: number;
  failedRuns: number;
  passRate: number | null;
  latencyMs: {
    average: number | null;
    minimum: number | null;
    maximum: number | null;
  };
  executionFailures: Record<"transport" | "parsing" | "unknown", number>;
  evaluatorFailures: Record<string, number>;
  models: Record<string, number>;
  usage: TokenCostSummary;
  modelJudgments: {
    samples: number;
    passed: number;
    failed: number;
    uncertain: number;
    disagreements: number;
  };
  generatedAt: string;
}

export function summarizeHarnessRuns(
  runs: readonly HarnessResult[],
  modelJudgments: readonly ModelBasedEvaluationResult[] = [],
  sources: HarnessRunReport["sources"] = {
    acceptedPaths: [],
    rejectedArtifacts: [],
  },
): HarnessRunReport {
  const durations = runs.map(({ durationMs }) => durationMs);
  const executionFailures = { transport: 0, parsing: 0, unknown: 0 };
  const evaluatorFailures: Record<string, number> = {};
  const models: Record<string, number> = {};

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

    if (run.provider) {
      models[run.provider.model] = (models[run.provider.model] ?? 0) + 1;
    }
  }

  const passedRuns = runs.filter(({ passed }) => passed).length;

  return {
    reportId: randomUUID(),
    sources,
    runIds: runs.map(({ runId }) => runId),
    totalRuns: runs.length,
    passedRuns,
    failedRuns: runs.length - passedRuns,
    passRate: runs.length === 0 ? null : passedRuns / runs.length,
    latencyMs: {
      average:
        durations.length === 0
          ? null
          : durations.reduce((total, value) => total + value, 0) /
            durations.length,
      minimum: durations.length === 0 ? null : Math.min(...durations),
      maximum: durations.length === 0 ? null : Math.max(...durations),
    },
    executionFailures,
    evaluatorFailures,
    models,
    usage: summarizeTokenCosts(runs.map(({ provider }) => provider)),
    modelJudgments: {
      samples: modelJudgments.length,
      passed: modelJudgments.filter(
        ({ parsedOutput }) => parsedOutput?.verdict === "pass",
      ).length,
      failed: modelJudgments.filter(
        ({ parsedOutput }) => parsedOutput?.verdict === "fail",
      ).length,
      uncertain: modelJudgments.filter(
        ({ parsedOutput }) => parsedOutput?.verdict === "uncertain",
      ).length,
      disagreements: modelJudgments.filter(
        ({ disagreement }) => disagreement.disagreed === true,
      ).length,
    },
    generatedAt: new Date().toISOString(),
  };
}
