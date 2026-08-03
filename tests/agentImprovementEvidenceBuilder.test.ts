import { z } from "zod";
import { describe, expect, it } from "vitest";
import { buildAgentImprovementEvidencePacket } from "../src/agents/agentImprovement/agentImprovementEvidenceBuilder.js";
import type { AgentRegistration } from "../src/agents/agentRegistration.js";
import { defineAgentRevisionSurface } from "../src/agents/agentRevisionSurface.js";
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
    datasetRun.runs[0]!.agentRun.output = {
      succeeded: false,
      disposition: "propose",
      summary: "Proposed a read JSON tool.",
      policyEvaluation: {
        passed: false,
        issues: [
          "Generated path is outside the permitted proposal roots: src/tools/read-json.ts",
          "A proposed tool requires a Vitest file under tests/.",
          "Verification must include npm run typecheck.",
        ],
        message: "The generated proposal violates policy.",
      },
      proposalEvidence: {
        rawOutput: "x".repeat(9_000),
      },
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
    const optInPacket = buildAgentImprovementEvidencePacket({
      view,
      subject: {
        manifest: frozenRun.manifest,
        manifestDigest: frozenRun.manifestDigest,
        revisionSurface: defineAgentRevisionSurface({
          schema: z
            .object({
              instructions: z.array(z.string().min(1)).min(1),
            })
            .strict(),
          baselinePolicy: {
            instructions: ["Use only supplied evidence."],
          },
          mutableFields: ["instructions"],
          createCandidate: () => ({} as AgentRegistration),
        }),
      },
    });
    expect(optInPacket.revisionSurface).toEqual({
      mutableFields: ["instructions"],
      baselinePolicy: {
        instructions: ["Use only supplied evidence."],
      },
    });
    const trialEvidence = packet.evidenceItems.find(
      ({ id }) => id === "trial:failed-dataset-run-1",
    );
    expect(trialEvidence?.details).toMatchObject({
      output: {
        omitted: true,
        omissionScope: "improvement-evidence-packet",
        reason:
          "Trial output was omitted only from the improvement evidence packet because it exceeded 8192 bytes.",
        causedTrialFailure: false,
      },
      diagnostics: {
        succeeded: false,
        disposition: "propose",
        summary: "Proposed a read JSON tool.",
        policyEvaluation: {
          passed: false,
          issues: [
            "Generated path is outside the permitted proposal roots: src/tools/read-json.ts",
            "A proposed tool requires a Vitest file under tests/.",
            "Verification must include npm run typecheck.",
          ],
        },
      },
    });
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
