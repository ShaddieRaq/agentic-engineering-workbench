import { describe, expect, it } from "vitest";
import { createAgentEvaluationExperiment } from "../src/agents/evaluations/agentEvaluationExperiment.js";
import {
  buildAgentEvaluationView,
  compareAgentEvaluationViews,
  findEvaluationCase,
} from "../src/agents/evaluations/agentEvaluationView.js";
import {
  evaluationDatasetRun,
  evaluationVerification,
} from "./helpers/evaluationFixture.js";

async function view(id: string, outcomes: boolean[]) {
  const datasetRun = evaluationDatasetRun(`${id}-dataset`, outcomes);
  const experiment = createAgentEvaluationExperiment({
    experimentId: id,
    agentId: datasetRun.agentId,
    agentVersion: datasetRun.agentVersion,
    workspaceId: "fixture-workspace",
    model: "fake-model",
    repetitions: outcomes.length,
    concurrency: 1,
    datasets: [{ datasetRun, verification: evaluationVerification(datasetRun), artifactId: datasetRun.datasetRunId }],
  });
  return buildAgentEvaluationView(experiment, async (artifactId) => {
    if (artifactId !== datasetRun.datasetRunId) throw new Error("Unknown fixture.");
    return { kind: "agent-dataset-run", artifact: datasetRun };
  });
}

describe("agent evaluation view", () => {
  it("reconstructs case and trial evidence through immutable references", async () => {
    const evaluation = await view("experiment-1", [true, false]);
    const datasetCase = findEvaluationCase(evaluation, "evaluation-dataset", "checkout-timeout");

    expect(datasetCase).toMatchObject({
      totalRuns: 2,
      passedRuns: 1,
      passRate: 0.5,
      passed: false,
      input: { failureLog: "Timeout waiting for checkout." },
    });
    expect(datasetCase.trials.map(({ succeeded }) => succeeded)).toEqual([true, false]);
  });

  it("aligns stable cases and exposes regression direction", async () => {
    const comparison = compareAgentEvaluationViews(
      await view("baseline", [true, true]),
      await view("candidate", [true, false]),
    );

    expect(comparison.summary).toEqual({
      improvedCases: 0,
      regressedCases: 1,
      unchangedCases: 0,
      insufficientEvidenceCases: 0,
    });
    expect(comparison.cases[0]).toMatchObject({
      datasetCaseId: "checkout-timeout",
      passRateDelta: -0.5,
      classification: "regressed",
    });
  });
});
