import { z } from "zod";
import { digestJsonEvidence } from "../agentEvidenceDigest.js";
import type {
  AgentCandidateEvaluationExecution,
} from "./agentCandidateEvaluationRunner.js";

export const agentCandidatePromotionGateIdSchema = z.enum([
  "completeness",
  "scope",
  "regression",
  "protected",
  "improvement",
  "latency",
  "cost",
]);

const promotionGateResultSchema = z
  .object({
    gateId: agentCandidatePromotionGateIdSchema,
    status: z.enum(["passed", "failed", "not-applicable"]),
    message: z.string().min(1),
    details: z.json(),
  })
  .strict();

export const agentCandidatePromotionGatePolicySchema = z
  .object({
    maximumLatencyRegressionRatio: z.number().nonnegative().default(0.25),
    maximumCostRegressionRatio: z.number().nonnegative().default(0.25),
  })
  .strict();

export const agentCandidatePromotionGateEvaluationSchema = z
  .object({
    policy: agentCandidatePromotionGatePolicySchema,
    results: z
      .array(promotionGateResultSchema)
      .length(7)
      .refine(
        (results) =>
          new Set(results.map(({ gateId }) => gateId)).size === results.length,
        { message: "Promotion gate IDs must be unique." },
      ),
    passed: z.boolean(),
  })
  .strict()
  .superRefine((evaluation, context) => {
    const expected = evaluation.results.every(
      ({ status }) => status !== "failed",
    );
    if (evaluation.passed !== expected) {
      context.addIssue({
        code: "custom",
        path: ["passed"],
        message: "Promotion gate outcome does not match gate results.",
      });
    }
  });

export type AgentCandidatePromotionGatePolicy = z.input<
  typeof agentCandidatePromotionGatePolicySchema
>;
export type AgentCandidatePromotionGateEvaluation = z.infer<
  typeof agentCandidatePromotionGateEvaluationSchema
>;

function key(datasetId: string, datasetCaseId: string): string {
  return `${datasetId}\u0000${datasetCaseId}`;
}

function totalDurationMs(
  side: AgentCandidateEvaluationExecution["baseline"],
): { totalRuns: number; totalDurationMs: number; meanDurationMs: number | null } {
  const runs = side.datasetRuns.flatMap((dataset) =>
    dataset.runs.map(({ agentRun }) => agentRun)
  );
  const totalDurationMs = runs.reduce(
    (total, run) => total + run.durationMs,
    0,
  );
  return {
    totalRuns: runs.length,
    totalDurationMs,
    meanDurationMs: runs.length === 0 ? null : totalDurationMs / runs.length,
  };
}

export function evaluateAgentCandidatePromotionGates(
  execution: AgentCandidateEvaluationExecution,
  policyInput: AgentCandidatePromotionGatePolicy = {},
): AgentCandidatePromotionGateEvaluation {
  const policy = agentCandidatePromotionGatePolicySchema.parse(policyInput);
  const purposeByDataset = new Map(
    execution.plan.datasets.map(({ datasetId, purpose }) => [
      datasetId,
      purpose,
    ]),
  );
  const expectedCaseKeys = execution.plan.datasets
    .flatMap(({ datasetId, caseIds }) =>
      caseIds.map((caseId) => key(datasetId, caseId))
    )
    .sort();
  const actualCaseKeys = execution.comparison.cases
    .map(({ datasetId, datasetCaseId }) => key(datasetId, datasetCaseId))
    .sort();
  const expectedRuns = expectedCaseKeys.length *
    execution.plan.execution.repetitions;
  const baselineRuns = execution.baseline.datasetRuns.flatMap(
    ({ runs }) => runs,
  );
  const candidateRuns = execution.candidate.datasetRuns.flatMap(
    ({ runs }) => runs,
  );
  const complete =
    JSON.stringify(actualCaseKeys) === JSON.stringify(expectedCaseKeys) &&
    baselineRuns.length === expectedRuns &&
    candidateRuns.length === expectedRuns &&
    execution.comparison.cases.every(
      ({ classification }) => classification !== "insufficient-evidence",
    );

  const candidateIdentity = JSON.stringify(execution.plan.candidate);
  const {
    planId: _planId,
    planDigest,
    ...planBody
  } = execution.plan;
  const scopePassed =
    digestJsonEvidence(planBody) === planDigest &&
    execution.baseline.experiment.candidate === undefined &&
    JSON.stringify(execution.candidate.experiment.candidate) ===
      candidateIdentity &&
    execution.baseline.experiment.workspaceId === execution.plan.workspaceId &&
    execution.candidate.experiment.workspaceId === execution.plan.workspaceId &&
    execution.baseline.experiment.model === execution.plan.model &&
    execution.candidate.experiment.model === execution.plan.model &&
    JSON.stringify(execution.baseline.experiment.execution) ===
      JSON.stringify(execution.plan.execution) &&
    JSON.stringify(execution.candidate.experiment.execution) ===
      JSON.stringify(execution.plan.execution) &&
    baselineRuns.every(({ agentRun }) => agentRun.candidate === undefined) &&
    candidateRuns.every(
      ({ agentRun }) => JSON.stringify(agentRun.candidate) === candidateIdentity,
    );

  const regressionCases = execution.comparison.cases.filter(
    ({ datasetId }) => purposeByDataset.get(datasetId) === "regression",
  );
  const regressedCases = regressionCases.filter(
    ({ classification }) => classification === "regressed",
  );

  const protectedDatasets = execution.plan.datasets.filter(
    ({ purpose }) => purpose === "protected",
  );
  const protectedCases = execution.comparison.cases.filter(
    ({ datasetId }) => purposeByDataset.get(datasetId) === "protected",
  );
  const protectedFailures = protectedCases.filter((comparison) => {
    const dataset = protectedDatasets.find(
      ({ datasetId }) => datasetId === comparison.datasetId,
    );
    return (
      dataset?.minimumPassRate === null ||
      comparison.candidatePassRate === null ||
      comparison.candidatePassRate < (dataset?.minimumPassRate ?? 1) ||
      comparison.classification === "regressed"
    );
  });

  const eligibleImprovements = execution.comparison.cases.filter(
    ({ datasetId, classification }) =>
      purposeByDataset.get(datasetId) !== "protected" &&
      classification === "improved",
  );

  const baselineLatency = totalDurationMs(execution.baseline);
  const candidateLatency = totalDurationMs(execution.candidate);
  const latencyRegressionRatio =
    baselineLatency.meanDurationMs === null ||
      candidateLatency.meanDurationMs === null ||
      baselineLatency.meanDurationMs === 0
      ? null
      : (
        candidateLatency.meanDurationMs - baselineLatency.meanDurationMs
      ) / baselineLatency.meanDurationMs;
  const latencyPassed = latencyRegressionRatio === null ||
    latencyRegressionRatio <= policy.maximumLatencyRegressionRatio;

  const results: AgentCandidatePromotionGateEvaluation["results"] = [
    {
      gateId: "completeness",
      status: complete ? "passed" : "failed",
      message: complete
        ? "Every planned case has complete baseline and candidate evidence."
        : "Comparison evidence is missing planned cases, trials, or pass rates.",
      details: {
        expectedCases: expectedCaseKeys.length,
        comparedCases: actualCaseKeys.length,
        expectedRunsPerSide: expectedRuns,
        baselineRuns: baselineRuns.length,
        candidateRuns: candidateRuns.length,
      },
    },
    {
      gateId: "scope",
      status: scopePassed ? "passed" : "failed",
      message: scopePassed
        ? "Candidate lineage and frozen execution scope match every run."
        : "Candidate lineage or frozen execution scope drifted.",
      details: {
        planId: execution.plan.planId,
        candidateId: execution.plan.candidate.candidateId,
      },
    },
    {
      gateId: "regression",
      status: regressedCases.length === 0 ? "passed" : "failed",
      message: regressedCases.length === 0
        ? "No regression dataset case regressed."
        : `${regressedCases.length} regression case(s) regressed.`,
      details: {
        evaluatedCases: regressionCases.length,
        regressedCaseIds: regressedCases.map(
          ({ datasetId, datasetCaseId }) => `${datasetId}/${datasetCaseId}`,
        ),
      },
    },
    {
      gateId: "protected",
      status: protectedDatasets.length === 0
        ? "not-applicable"
        : protectedFailures.length === 0
        ? "passed"
        : "failed",
      message: protectedDatasets.length === 0
        ? "No protected dataset is present in this plan."
        : protectedFailures.length === 0
        ? "Every protected case met its threshold without regression."
        : `${protectedFailures.length} protected case(s) failed promotion policy.`,
      details: {
        protectedDatasets: protectedDatasets.length,
        failedCaseIds: protectedFailures.map(
          ({ datasetId, datasetCaseId }) => `${datasetId}/${datasetCaseId}`,
        ),
      },
    },
    {
      gateId: "improvement",
      status: eligibleImprovements.length > 0 ? "passed" : "failed",
      message: eligibleImprovements.length > 0
        ? `${eligibleImprovements.length} development or regression case(s) improved.`
        : "No development or regression case improved.",
      details: {
        improvedCaseIds: eligibleImprovements.map(
          ({ datasetId, datasetCaseId }) => `${datasetId}/${datasetCaseId}`,
        ),
      },
    },
    {
      gateId: "latency",
      status: latencyPassed ? "passed" : "failed",
      message: latencyPassed
        ? "Mean candidate latency stayed within the configured tolerance."
        : "Mean candidate latency exceeded the configured tolerance.",
      details: {
        baseline: baselineLatency,
        candidate: candidateLatency,
        regressionRatio: latencyRegressionRatio,
        maximumRegressionRatio: policy.maximumLatencyRegressionRatio,
      },
    },
    {
      gateId: "cost",
      status: "not-applicable",
      message: "Run evidence does not yet contain comparable usage or cost data.",
      details: {
        maximumRegressionRatio: policy.maximumCostRegressionRatio,
      },
    },
  ];

  return agentCandidatePromotionGateEvaluationSchema.parse({
    policy,
    results,
    passed: results.every(({ status }) => status !== "failed"),
  });
}
