import { describe, expect, it } from "vitest";
import { buildAgentImprovementEvidencePacket } from "../src/agents/agentImprovement/agentImprovementEvidenceBuilder.js";
import { buildAgentEvaluationView } from "../src/agents/evaluations/agentEvaluationView.js";
import { createAgentEvaluationExperiment } from "../src/agents/evaluations/agentEvaluationExperiment.js";
import {
  evaluationDatasetRun,
  evaluationVerification,
} from "./helpers/evaluationFixture.js";

describe("buildAgentImprovementEvidencePacket", () => {
  it("selects failed evidence while withholding hidden expectations", async () => {
    const datasetRun = evaluationDatasetRun("failed-dataset", [false]);
    datasetRun.runs[0]!.expectation = {
      secretGroundTruth: "test-defect",
    };
    datasetRun.runs[0]!.caseAssessment = {
      passed: false,
      message: "The observed classification did not match hidden ground truth.",
    };
    const experiment = createAgentEvaluationExperiment({
      experimentId: "failed-evaluation",
      agentId: datasetRun.agentId,
      agentVersion: datasetRun.agentVersion,
      workspaceId: "fixture-workspace",
      model: "fake-model",
      repetitions: 1,
      concurrency: 1,
      datasets: [
        {
          datasetRun,
          verification: evaluationVerification(datasetRun),
          artifactId: datasetRun.datasetRunId,
        },
      ],
    });
    const view = await buildAgentEvaluationView(experiment, async () => ({
      kind: "agent-dataset-run",
      artifact: datasetRun,
    }));
    const frozenRun = datasetRun.runs[0]!.agentRun;

    const packet = buildAgentImprovementEvidencePacket({
      view,
      subject: {
        manifest: frozenRun.manifest,
        manifestDigest: frozenRun.manifestDigest,
      },
    });

    expect(packet.evidenceItems.map(({ id }) => id)).toEqual([
      "evaluation:failed-evaluation",
      "case:evaluation-dataset/checkout-timeout",
      "trial:failed-dataset-run-1",
    ]);
    expect(packet.excludedEvidence).toContainEqual({
      source: "evaluation-dataset/checkout-timeout/expectation",
      reason:
        "Hidden evaluation ground truth is withheld from the improvement analyst.",
    });
    expect(JSON.stringify(packet)).not.toContain("secretGroundTruth");
    expect(packet.revisionSurface).toBeNull();
  });

  it("rejects an evaluation with no failed case", async () => {
    const datasetRun = evaluationDatasetRun("passing-dataset", [true]);
    const experiment = createAgentEvaluationExperiment({
      experimentId: "passing-evaluation",
      agentId: datasetRun.agentId,
      agentVersion: datasetRun.agentVersion,
      workspaceId: "fixture-workspace",
      model: "fake-model",
      repetitions: 1,
      concurrency: 1,
      datasets: [
        {
          datasetRun,
          verification: evaluationVerification(datasetRun),
          artifactId: datasetRun.datasetRunId,
        },
      ],
    });
    const view = await buildAgentEvaluationView(experiment, async () => ({
      kind: "agent-dataset-run",
      artifact: datasetRun,
    }));
    const frozenRun = datasetRun.runs[0]!.agentRun;

    expect(() =>
      buildAgentImprovementEvidencePacket({
        view,
        subject: {
          manifest: frozenRun.manifest,
          manifestDigest: frozenRun.manifestDigest,
        },
      }),
    ).toThrow("at least one failed evaluation case");
  });
});
