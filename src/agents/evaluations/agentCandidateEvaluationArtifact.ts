import { randomUUID } from "node:crypto";
import { z } from "zod";
import { agentCandidateEvaluationPlanEvidenceSchema } from "./agentCandidateEvaluationPlan.js";
import {
  agentCandidatePromotionGateEvaluationSchema,
  evaluateAgentCandidatePromotionGates,
  type AgentCandidatePromotionGatePolicy,
} from "./agentCandidatePromotionGates.js";
import type { AgentCandidateEvaluationExecution } from "./agentCandidateEvaluationRunner.js";
import { agentEvaluationComparisonSchema } from "./agentEvaluationView.js";

const evaluationReferenceSchema = z
  .object({
    experimentArtifactId: z.string().min(1),
    datasetRunArtifactIds: z.array(z.string().min(1)).min(1),
  })
  .strict();

export const agentCandidateEvaluationArtifactSchema = z
  .object({
    candidateEvaluationId: z.uuid(),
    plan: agentCandidateEvaluationPlanEvidenceSchema,
    baseline: evaluationReferenceSchema,
    candidate: evaluationReferenceSchema,
    comparison: agentEvaluationComparisonSchema,
    gates: agentCandidatePromotionGateEvaluationSchema,
    completedAt: z.string().min(1),
  })
  .strict()
  .superRefine((artifact, context) => {
    if (
      artifact.baseline.experimentArtifactId !==
      artifact.comparison.baseline.experimentId
    ) {
      context.addIssue({
        code: "custom",
        path: ["baseline", "experimentArtifactId"],
        message: "Baseline reference does not match comparison evidence.",
      });
    }
    if (
      artifact.candidate.experimentArtifactId !==
      artifact.comparison.candidate.experimentId
    ) {
      context.addIssue({
        code: "custom",
        path: ["candidate", "experimentArtifactId"],
        message: "Candidate reference does not match comparison evidence.",
      });
    }
    if (
      artifact.comparison.baseline.agentId !== artifact.plan.subject.agentId ||
      artifact.comparison.candidate.agentId !== artifact.plan.subject.agentId ||
      artifact.comparison.baseline.agentVersion !==
        artifact.plan.subject.agentVersion ||
      artifact.comparison.candidate.agentVersion !==
        artifact.plan.subject.agentVersion
    ) {
      context.addIssue({
        code: "custom",
        path: ["comparison"],
        message: "Comparison subject does not match the frozen plan.",
      });
    }
    if (
      artifact.comparison.baseline.model !== artifact.plan.model ||
      artifact.comparison.candidate.model !== artifact.plan.model
    ) {
      context.addIssue({
        code: "custom",
        path: ["comparison"],
        message: "Comparison model does not match the frozen plan.",
      });
    }
    const expectedDatasets = artifact.plan.datasets.length;
    if (
      artifact.baseline.datasetRunArtifactIds.length !== expectedDatasets ||
      artifact.candidate.datasetRunArtifactIds.length !== expectedDatasets
    ) {
      context.addIssue({
        code: "custom",
        path: ["plan", "datasets"],
        message: "Comparison dataset references are incomplete.",
      });
    }
    const allReferences = [
      ...artifact.baseline.datasetRunArtifactIds,
      ...artifact.candidate.datasetRunArtifactIds,
    ];
    if (new Set(allReferences).size !== allReferences.length) {
      context.addIssue({
        code: "custom",
        path: ["baseline", "datasetRunArtifactIds"],
        message: "Baseline and candidate dataset references must be distinct.",
      });
    }
  });

export type AgentCandidateEvaluationArtifact = z.infer<
  typeof agentCandidateEvaluationArtifactSchema
>;

export function createAgentCandidateEvaluationArtifact(
  execution: AgentCandidateEvaluationExecution,
  options: {
    candidateEvaluationId?: string;
    completedAt?: string;
    gatePolicy?: AgentCandidatePromotionGatePolicy;
  } = {},
): AgentCandidateEvaluationArtifact {
  return agentCandidateEvaluationArtifactSchema.parse({
    candidateEvaluationId:
      options.candidateEvaluationId ?? randomUUID(),
    plan: execution.plan,
    baseline: {
      experimentArtifactId: execution.baseline.experiment.experimentId,
      datasetRunArtifactIds: execution.baseline.datasetRuns.map(
        ({ datasetRunId }) => datasetRunId,
      ),
    },
    candidate: {
      experimentArtifactId: execution.candidate.experiment.experimentId,
      datasetRunArtifactIds: execution.candidate.datasetRuns.map(
        ({ datasetRunId }) => datasetRunId,
      ),
    },
    comparison: execution.comparison,
    gates: evaluateAgentCandidatePromotionGates(
      execution,
      options.gatePolicy ?? {},
    ),
    completedAt: options.completedAt ?? new Date().toISOString(),
  });
}
