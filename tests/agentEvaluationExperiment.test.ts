import { describe, expect, it } from "vitest";
import {
  agentEvaluationExperimentSchema,
  createAgentEvaluationExperiment,
} from "../src/agents/evaluations/agentEvaluationExperiment.js";
import {
  evaluationDatasetRun,
  evaluationVerification,
} from "./helpers/evaluationFixture.js";

describe("agent evaluation experiment", () => {
  it("freezes configuration and derives dataset, case, and trial metrics", () => {
    const datasetRun = evaluationDatasetRun("dataset-run-1", [true, false]);
    const experiment = createAgentEvaluationExperiment({
      experimentId: "experiment-1",
      agentId: datasetRun.agentId,
      agentVersion: datasetRun.agentVersion,
      workspaceId: "fixture-workspace",
      model: "fake-model",
      repetitions: 2,
      concurrency: 1,
      datasets: [{
        datasetRun,
        verification: evaluationVerification(datasetRun),
        artifactId: datasetRun.datasetRunId,
      }],
      completedAt: "2026-08-02T12:00:02.000Z",
    });

    expect(experiment).toMatchObject({
      experimentId: "experiment-1",
      passed: false,
      datasets: [{ datasetPurpose: "regression" }],
      execution: { repetitions: 2, concurrency: 1 },
      summary: {
        totalDatasets: 1,
        totalCases: 1,
        passedCases: 0,
        totalRuns: 2,
        passedRuns: 1,
        passRate: 0.5,
      },
    });
    const historical = {
      ...experiment,
      datasets: experiment.datasets.map(
        ({ datasetPurpose: _purpose, ...dataset }) => dataset,
      ),
    };
    expect(
      agentEvaluationExperimentSchema.parse(historical).datasets[0]
        ?.datasetPurpose,
    ).toBe("regression");
  });

  it("rejects a summary that does not match referenced evidence", () => {
    const datasetRun = evaluationDatasetRun("dataset-run-1", [true]);
    const experiment = createAgentEvaluationExperiment({
      experimentId: "experiment-1",
      agentId: datasetRun.agentId,
      agentVersion: datasetRun.agentVersion,
      workspaceId: "fixture-workspace",
      model: "fake-model",
      repetitions: 1,
      concurrency: 1,
      datasets: [{ datasetRun, verification: evaluationVerification(datasetRun), artifactId: datasetRun.datasetRunId }],
    });

    expect(() => agentEvaluationExperimentSchema.parse({
      ...experiment,
      summary: { ...experiment.summary, passedRuns: 0 },
    })).toThrow("Evaluation summary does not match dataset evidence");
  });
});
