import { randomUUID } from "node:crypto";
import { z } from "zod";
import {
  agentCandidateIdentitySchema,
  type AgentCandidateIdentity,
} from "../agentCandidateIdentity.js";
import {
  agentVerificationResultSchema,
  type AgentVerificationResult,
} from "../agentVerification.js";
import type { AgentDatasetRunResult } from "../datasets/agentDatasetRunner.js";
import { agentDatasetPurposeSchema } from "../datasets/agentDatasetDefinition.js";

const evaluationDatasetSummarySchema = z.object({
  datasetId: z.string().min(1),
  datasetPurpose: agentDatasetPurposeSchema.default("regression"),
  datasetRunArtifactId: z.string().min(1),
  verification: agentVerificationResultSchema,
  totalCases: z.number().int().nonnegative(),
  passedCases: z.number().int().nonnegative(),
  failedCases: z.number().int().nonnegative(),
  totalRuns: z.number().int().nonnegative(),
  passedRuns: z.number().int().nonnegative(),
  failedRuns: z.number().int().nonnegative(),
  passRate: z.number().min(0).max(1).nullable(),
}).strict();

const evaluationSummarySchema = z.object({
  totalDatasets: z.number().int().nonnegative(),
  passedDatasets: z.number().int().nonnegative(),
  failedDatasets: z.number().int().nonnegative(),
  totalCases: z.number().int().nonnegative(),
  passedCases: z.number().int().nonnegative(),
  failedCases: z.number().int().nonnegative(),
  totalRuns: z.number().int().nonnegative(),
  passedRuns: z.number().int().nonnegative(),
  failedRuns: z.number().int().nonnegative(),
  passRate: z.number().min(0).max(1).nullable(),
}).strict();

export const agentEvaluationExperimentSchema = z.object({
  experimentId: z.string().min(1),
  agentId: z.string().min(1),
  agentVersion: z.string().min(1),
  candidate: agentCandidateIdentitySchema.optional(),
  workspaceId: z.string().min(1),
  model: z.string().min(1),
  execution: z.object({
    repetitions: z.number().int().positive(),
    concurrency: z.number().int().positive(),
  }).strict(),
  datasets: z.array(evaluationDatasetSummarySchema).min(1),
  summary: evaluationSummarySchema,
  passed: z.boolean(),
  completedAt: z.string().min(1),
}).strict().superRefine((experiment, context) => {
  const datasetIds = experiment.datasets.map(({ datasetId }) => datasetId);
  if (new Set(datasetIds).size !== datasetIds.length) {
    context.addIssue({ code: "custom", path: ["datasets"], message: "Evaluation dataset IDs must be unique." });
  }

  const expected = summarizeEvaluationDatasets(experiment.datasets);
  for (const key of Object.keys(expected) as Array<keyof typeof expected>) {
    if (experiment.summary[key] !== expected[key]) {
      context.addIssue({ code: "custom", path: ["summary", key], message: "Evaluation summary does not match dataset evidence." });
    }
  }
  if (experiment.passed !== experiment.datasets.every(({ verification }) => verification.passed)) {
    context.addIssue({ code: "custom", path: ["passed"], message: "Evaluation outcome does not match dataset gates." });
  }
});

export type AgentEvaluationExperiment = z.infer<
  typeof agentEvaluationExperimentSchema
>;
export type EvaluationDatasetSummary = z.infer<
  typeof evaluationDatasetSummarySchema
>;

export interface EvaluationDatasetEvidence {
  datasetRun: AgentDatasetRunResult;
  verification: AgentVerificationResult;
  artifactId: string;
}

function summarizeEvaluationDatasets(
  datasets: EvaluationDatasetSummary[],
): AgentEvaluationExperiment["summary"] {
  const totalRuns = datasets.reduce((total, dataset) => total + dataset.totalRuns, 0);
  const passedRuns = datasets.reduce((total, dataset) => total + dataset.passedRuns, 0);
  const totalCases = datasets.reduce((total, dataset) => total + dataset.totalCases, 0);
  const passedCases = datasets.reduce((total, dataset) => total + dataset.passedCases, 0);
  const passedDatasets = datasets.filter(({ verification }) => verification.passed).length;
  return {
    totalDatasets: datasets.length,
    passedDatasets,
    failedDatasets: datasets.length - passedDatasets,
    totalCases,
    passedCases,
    failedCases: totalCases - passedCases,
    totalRuns,
    passedRuns,
    failedRuns: totalRuns - passedRuns,
    passRate: totalRuns === 0 ? null : passedRuns / totalRuns,
  };
}

export function createAgentEvaluationExperiment(input: {
  agentId: string;
  agentVersion: string;
  workspaceId: string;
  model: string;
  repetitions: number;
  concurrency: number;
  datasets: EvaluationDatasetEvidence[];
  candidate?: AgentCandidateIdentity;
  experimentId?: string;
  completedAt?: string;
}): AgentEvaluationExperiment {
  if (input.datasets.length === 0) {
    throw new Error("An evaluation experiment requires at least one dataset result.");
  }
  if (
    input.candidate &&
    (
      input.candidate.subjectAgentId !== input.agentId ||
      input.candidate.baseVersion !== input.agentVersion
    )
  ) {
    throw new Error("Evaluation candidate identity does not match the subject.");
  }

  const datasets = input.datasets.map(({ datasetRun, verification, artifactId }) => {
    if (datasetRun.agentId !== input.agentId || verification.agentId !== input.agentId) {
      throw new Error("Evaluation evidence belongs to another agent.");
    }
    if (datasetRun.agentVersion !== input.agentVersion || verification.agentVersion !== input.agentVersion) {
      throw new Error("Evaluation evidence belongs to another agent version.");
    }
    if (datasetRun.datasetId !== verification.datasetId) {
      throw new Error("Evaluation dataset and verification IDs do not match.");
    }
    const threshold = verification.minimumPassRate;
    const passedCases = datasetRun.caseSummaries.filter(
      ({ passRate }) => threshold !== null && passRate !== null && passRate >= threshold,
    ).length;
    const totalRuns = datasetRun.caseSummaries.reduce((total, summary) => total + summary.totalRuns, 0);
    const passedRuns = datasetRun.caseSummaries.reduce((total, summary) => total + summary.passedRuns, 0);
    return {
      datasetId: datasetRun.datasetId,
      datasetPurpose: datasetRun.datasetPurpose ?? "regression",
      datasetRunArtifactId: artifactId,
      verification,
      totalCases: datasetRun.caseSummaries.length,
      passedCases,
      failedCases: datasetRun.caseSummaries.length - passedCases,
      totalRuns,
      passedRuns,
      failedRuns: totalRuns - passedRuns,
      passRate: totalRuns === 0 ? null : passedRuns / totalRuns,
    };
  });
  const experiment = {
    experimentId: input.experimentId ?? randomUUID(),
    agentId: input.agentId,
    agentVersion: input.agentVersion,
    ...(input.candidate ? { candidate: input.candidate } : {}),
    workspaceId: input.workspaceId,
    model: input.model,
    execution: {
      repetitions: input.repetitions,
      concurrency: input.concurrency,
    },
    datasets,
    summary: summarizeEvaluationDatasets(datasets),
    passed: datasets.every(({ verification }) => verification.passed),
    completedAt: input.completedAt ?? new Date().toISOString(),
  };
  return agentEvaluationExperimentSchema.parse(experiment);
}
