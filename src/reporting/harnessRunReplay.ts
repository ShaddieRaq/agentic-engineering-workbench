import { randomUUID } from "node:crypto";
import { composeEvaluators } from "../evaluations/composeEvaluators.js";
import type { HarnessResult } from "../harness/harnessResult.js";
import { SimpleHarness } from "../harness/simpleHarness.js";
import { getHarnessDefinition } from "../harnesses/harnessRegistry.js";
import type { AIProvider } from "../providers/aiProvider.js";
import { getScenarioDefinition } from "../scenarios/scenarioRegistry.js";

export interface ReplayEvaluationComparison {
  index: number;
  evaluatorId: string;
  sourcePassed: boolean | null;
  replayPassed: boolean | null;
  changed: boolean;
}

export interface HarnessRunReplayResult {
  replayId: string;
  sourceRun: HarnessResult;
  replayRun: HarnessResult;
  comparison: {
    outcome: "improved" | "regressed" | "unchanged";
    policyChanged: boolean;
    evaluations: ReplayEvaluationComparison[];
  };
  completedAt: string;
}

export async function replayHarnessRun(
  sourceRun: HarnessResult,
  provider: AIProvider,
): Promise<HarnessRunReplayResult> {
  const harnessDefinition = getHarnessDefinition(sourceRun.harnessId);
  const scenario = sourceRun.scenarioId === null
    ? undefined
    : getScenarioDefinition(sourceRun.scenarioId);
  const evaluators = composeEvaluators(harnessDefinition, scenario);
  const harness = new SimpleHarness(
    provider,
    evaluators,
    harnessDefinition.id,
    scenario?.id ?? null,
    scenario?.outputSchema,
  );
  const replayRun = await harness.run(
    sourceRun.role,
    sourceRun.task,
    sourceRun.context,
  );
  const evaluationCount = Math.max(
    sourceRun.evaluations.length,
    replayRun.evaluations.length,
  );
  const evaluations = Array.from({ length: evaluationCount }, (_, index) => {
    const source = sourceRun.evaluations[index];
    const replay = replayRun.evaluations[index];

    return {
      index,
      evaluatorId:
        replay?.evaluatorId ?? source?.evaluatorId ?? `missing-${index}`,
      sourcePassed: source?.passed ?? null,
      replayPassed: replay?.passed ?? null,
      changed:
        source?.evaluatorId !== replay?.evaluatorId ||
        source?.passed !== replay?.passed,
    };
  });

  return {
    replayId: randomUUID(),
    sourceRun,
    replayRun,
    comparison: {
      outcome:
        sourceRun.passed === replayRun.passed
          ? "unchanged"
          : replayRun.passed
            ? "improved"
            : "regressed",
      policyChanged: evaluations.some(
        ({ index }) =>
          sourceRun.evaluations[index]?.evaluatorId !==
          replayRun.evaluations[index]?.evaluatorId,
      ),
      evaluations,
    },
    completedAt: new Date().toISOString(),
  };
}
