import { z } from "zod";
import type { RepositoryAnalysisRunResult } from "./repositoryAnalysisRunner.js";
import type { RepositoryInspectionWorkflowResult } from "./repositoryInspectionWorkflow.js";
import {
  runMultiStepWorkflow,
  type MultiStepWorkflowOptions,
  type MultiStepWorkflowResult,
} from "./multiStepWorkflow.js";

export const repositoryAnalysisReviewSchema = z
  .object({
    analysisRunId: z.string().min(1),
    checks: z.array(
      z.object({
        id: z.string().min(1),
        passed: z.boolean(),
        message: z.string().min(1),
      }).strict(),
    ),
    passed: z.boolean(),
  })
  .strict();

export type RepositoryAnalysisReview = z.infer<
  typeof repositoryAnalysisReviewSchema
>;

export interface RepositoryAssistantState {
  inspection: RepositoryInspectionWorkflowResult | null;
  analysis: RepositoryAnalysisRunResult | null;
  review: RepositoryAnalysisReview | null;
}

const repositoryAssistantStateSchema: z.ZodType<RepositoryAssistantState> = z
  .object({
    inspection: z.custom<RepositoryInspectionWorkflowResult>().nullable(),
    analysis: z.custom<RepositoryAnalysisRunResult>().nullable(),
    review: repositoryAnalysisReviewSchema.nullable(),
  })
  .strict();

export type RepositoryInspector = () => Promise<
  RepositoryInspectionWorkflowResult
>;

export type RepositoryAnalyzer = (
  inspection: RepositoryInspectionWorkflowResult,
) => Promise<RepositoryAnalysisRunResult>;

export type RepositoryAssistantWorkflowResult = Omit<
  MultiStepWorkflowResult<RepositoryAssistantState>,
  "succeeded"
> & {
  succeeded: boolean;
};

export function reviewRepositoryAnalysis(
  analysis: RepositoryAnalysisRunResult,
): RepositoryAnalysisReview {
  const citationEvaluation = analysis.evaluations.find(
    ({ evaluatorId }) => evaluatorId === "repository-evidence-paths",
  );
  const checks = [
    {
      id: "provider-execution",
      passed: analysis.executionFailure === null,
      message: analysis.executionFailure === null
        ? "Provider execution completed."
        : `Provider failed: ${analysis.executionFailure.message}`,
    },
    {
      id: "structured-output",
      passed: analysis.parsedOutput !== null,
      message: analysis.parsedOutput !== null
        ? "Structured analysis output is available."
        : "Structured analysis output is unavailable.",
    },
    {
      id: "citation-grounding",
      passed: citationEvaluation?.passed === true,
      message: citationEvaluation?.message ??
        "Citation evaluation was not produced.",
    },
  ];

  return {
    analysisRunId: analysis.analysisRunId,
    checks,
    passed: checks.every(({ passed }) => passed),
  };
}

export async function runRepositoryAssistantWorkflow(
  inspectRepository: RepositoryInspector,
  analyzeRepository: RepositoryAnalyzer,
  options: MultiStepWorkflowOptions = { maximumSteps: 3 },
): Promise<RepositoryAssistantWorkflowResult> {
  const result = await runMultiStepWorkflow(
    {
      id: "repository-assistant",
      description: "Inspect, analyze, and verify a local repository.",
      stateSchema: repositoryAssistantStateSchema,
      steps: [
        {
          id: "inspect",
          description: "Collect controlled repository evidence.",
          async execute(state) {
            const inspection = await inspectRepository();

            return {
              state: { ...state, inspection },
              evidence: {
                workflowRunId: inspection.workflowRunId,
                succeeded: inspection.succeeded,
                contextItems: inspection.contextAssembly.items.length,
              },
            };
          },
        },
        {
          id: "analyze",
          description: "Generate a structured repository analysis.",
          async execute(state) {
            if (state.inspection === null) {
              throw new Error("Repository inspection is unavailable.");
            }

            const analysis = await analyzeRepository(state.inspection);

            return {
              state: { ...state, analysis },
              evidence: {
                analysisRunId: analysis.analysisRunId,
                succeeded: analysis.succeeded,
                model: analysis.provider?.model ?? null,
              },
            };
          },
        },
        {
          id: "verify",
          description: "Verify provider, structure, and citation evidence.",
          async execute(state) {
            if (state.analysis === null) {
              throw new Error("Repository analysis is unavailable.");
            }

            const review = reviewRepositoryAnalysis(state.analysis);

            return {
              state: { ...state, review },
              evidence: review,
            };
          },
        },
      ],
    },
    { inspection: null, analysis: null, review: null },
    options,
  );

  return {
    ...result,
    succeeded: result.succeeded && result.state.review?.passed === true,
  };
}
