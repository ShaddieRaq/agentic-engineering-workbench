import { z } from "zod";
import { compareReliabilitySummaries } from "../../orchestration/reliabilityComparison.js";
import type { StoredArtifact } from "../../artifacts/artifactStore.js";
import type { AgentRunFailure, AgentRunResult } from "../agentRunResult.js";
import type { AgentDatasetPurpose } from "../datasets/agentDatasetDefinition.js";
import type { AgentEvaluationExperiment } from "./agentEvaluationExperiment.js";

const jsonValueSchema = z.json();

export interface EvaluationTrialView {
  agentRunId: string;
  succeeded: boolean;
  runtimeSucceeded: boolean;
  input: z.infer<typeof jsonValueSchema>;
  output: z.infer<typeof jsonValueSchema> | null;
  assessment: { passed: boolean; message: string } | null;
  caseAssessment: { passed: boolean; message: string } | null;
  failure: AgentRunFailure | null;
  durationMs: number;
  completedAt: string;
}

export interface EvaluationCaseView {
  datasetId: string;
  datasetCaseId: string;
  totalRuns: number;
  passedRuns: number;
  failedRuns: number;
  passRate: number | null;
  minimumPassRate: number | null;
  passed: boolean;
  input: z.infer<typeof jsonValueSchema>;
  expectation: z.infer<typeof jsonValueSchema> | null;
  trials: EvaluationTrialView[];
}

export interface EvaluationDatasetView {
  datasetId: string;
  datasetPurpose: AgentDatasetPurpose;
  passed: boolean;
  minimumPassRate: number | null;
  cases: EvaluationCaseView[];
}

export interface AgentEvaluationView {
  experiment: AgentEvaluationExperiment;
  datasets: EvaluationDatasetView[];
}

export type EvaluationArtifactLoader = (id: string) => Promise<StoredArtifact>;

function trial(
  run: AgentRunResult,
  caseAssessment: { passed: boolean; message: string } | undefined,
): EvaluationTrialView {
  return {
    agentRunId: run.agentRunId,
    succeeded: run.succeeded && (caseAssessment?.passed ?? true),
    runtimeSucceeded: run.succeeded,
    input: run.input,
    output: run.output,
    assessment: run.assessment,
    caseAssessment: caseAssessment ?? null,
    failure: run.failure,
    durationMs: run.durationMs,
    completedAt: run.completedAt,
  };
}

export async function buildAgentEvaluationView(
  experiment: AgentEvaluationExperiment,
  load: EvaluationArtifactLoader,
): Promise<AgentEvaluationView> {
  const datasets: EvaluationDatasetView[] = [];

  for (const reference of experiment.datasets) {
    const stored = await load(reference.datasetRunArtifactId);
    if (stored.kind !== "agent-dataset-run") {
      throw new Error(`Evaluation reference ${reference.datasetRunArtifactId} is not a dataset run.`);
    }
    const datasetRun = stored.artifact;
    if (
      datasetRun.datasetId !== reference.datasetId
      || (datasetRun.datasetPurpose ?? "regression") !== reference.datasetPurpose
      || datasetRun.agentId !== experiment.agentId
      || datasetRun.agentVersion !== experiment.agentVersion
    ) {
      throw new Error(`Evaluation reference ${reference.datasetRunArtifactId} does not match the experiment.`);
    }
    const cases = datasetRun.caseSummaries.map((summary) => {
      const runEvidence = datasetRun.runs
        .filter(({ datasetCaseId }) => datasetCaseId === summary.datasetCaseId)
      const first = runEvidence[0];
      if (!first) throw new Error(`Evaluation case ${summary.datasetCaseId} has no run evidence.`);
      const threshold = reference.verification.minimumPassRate;
      return {
        datasetId: reference.datasetId,
        datasetCaseId: summary.datasetCaseId,
        totalRuns: summary.totalRuns,
        passedRuns: summary.passedRuns,
        failedRuns: summary.failedRuns,
        passRate: summary.passRate,
        minimumPassRate: threshold,
        passed: threshold !== null && summary.passRate !== null && summary.passRate >= threshold,
        input: first.agentRun.input,
        expectation: first.expectation ?? null,
        trials: runEvidence.map(({ agentRun, caseAssessment }) =>
          trial(agentRun, caseAssessment),
        ),
      };
    });
    datasets.push({
      datasetId: reference.datasetId,
      datasetPurpose: reference.datasetPurpose,
      passed: reference.verification.passed,
      minimumPassRate: reference.verification.minimumPassRate,
      cases,
    });
  }

  return { experiment, datasets };
}

const evaluationIdentitySchema = z
  .object({
    experimentId: z.string().min(1),
    agentId: z.string().min(1),
    agentVersion: z.string().min(1),
    model: z.string().min(1),
    completedAt: z.string().min(1),
  })
  .strict();

export const evaluationCaseComparisonSchema = z
  .object({
    datasetId: z.string().min(1),
    datasetCaseId: z.string().min(1),
    baselinePassRate: z.number().min(0).max(1).nullable(),
    candidatePassRate: z.number().min(0).max(1).nullable(),
    passRateDelta: z.number().min(-1).max(1).nullable(),
    classification: z.enum([
      "improved",
      "regressed",
      "unchanged",
      "insufficient-evidence",
    ]),
  })
  .strict();

export const agentEvaluationComparisonSchema = z
  .object({
    baseline: evaluationIdentitySchema,
    candidate: evaluationIdentitySchema,
    summary: z
      .object({
        improvedCases: z.number().int().nonnegative(),
        regressedCases: z.number().int().nonnegative(),
        unchangedCases: z.number().int().nonnegative(),
        insufficientEvidenceCases: z.number().int().nonnegative(),
      })
      .strict(),
    cases: z.array(evaluationCaseComparisonSchema),
  })
  .strict();

export type EvaluationCaseComparison = z.infer<
  typeof evaluationCaseComparisonSchema
>;
export type AgentEvaluationComparison = z.infer<
  typeof agentEvaluationComparisonSchema
>;

export function compareAgentEvaluationViews(
  baseline: AgentEvaluationView,
  candidate: AgentEvaluationView,
): AgentEvaluationComparison {
  if (baseline.experiment.agentId !== candidate.experiment.agentId) {
    throw new Error("Evaluation experiments must belong to the same agent.");
  }
  const keyed = (view: AgentEvaluationView) => new Map(
    view.datasets.flatMap(({ cases }) => cases).map((item) => [
      `${item.datasetId}\u0000${item.datasetCaseId}`,
      item,
    ]),
  );
  const baselineCases = keyed(baseline);
  const candidateCases = keyed(candidate);
  const keys = [...new Set([...baselineCases.keys(), ...candidateCases.keys()])].sort();
  const cases = keys.map((key) => {
    const left = baselineCases.get(key);
    const right = candidateCases.get(key);
    const [datasetId = "", datasetCaseId = ""] = key.split("\u0000");
    const comparison = compareReliabilitySummaries(
      { passRate: left?.passRate ?? null },
      { passRate: right?.passRate ?? null },
    );
    return { datasetId, datasetCaseId, ...comparison };
  });
  const identity = (experiment: AgentEvaluationExperiment) => ({
    experimentId: experiment.experimentId,
    agentId: experiment.agentId,
    agentVersion: experiment.agentVersion,
    model: experiment.model,
    completedAt: experiment.completedAt,
  });
  return agentEvaluationComparisonSchema.parse({
    baseline: identity(baseline.experiment),
    candidate: identity(candidate.experiment),
    summary: {
      improvedCases: cases.filter(({ classification }) => classification === "improved").length,
      regressedCases: cases.filter(({ classification }) => classification === "regressed").length,
      unchangedCases: cases.filter(({ classification }) => classification === "unchanged").length,
      insufficientEvidenceCases: cases.filter(({ classification }) => classification === "insufficient-evidence").length,
    },
    cases,
  });
}

export function findEvaluationCase(
  view: AgentEvaluationView,
  datasetId: string,
  datasetCaseId: string,
): EvaluationCaseView {
  const result = view.datasets
    .find((dataset) => dataset.datasetId === datasetId)
    ?.cases.find((datasetCase) => datasetCase.datasetCaseId === datasetCaseId);
  if (!result) throw new Error(`Unknown evaluation case: ${datasetId}/${datasetCaseId}`);
  return result;
}
