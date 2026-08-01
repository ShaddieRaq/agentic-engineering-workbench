import { randomUUID } from "node:crypto";
import type {
  AIProvider,
  AIProviderEvidence,
  AIProviderResult,
} from "../providers/aiProvider.js";
import {
  AIProviderError,
  type AIProviderErrorCategory,
} from "../providers/aiProviderError.js";
import type { RepositoryInspectionWorkflowResult } from "./repositoryInspectionWorkflow.js";
import type { RepositoryAnalysisOutput } from "./repositoryAnalysisOutput.js";
import { buildRepositoryAnalysisRequest } from "./repositoryAnalysisRequest.js";
import {
  evaluateRepositoryAnalysisCitations,
  type RepositoryAnalysisCitationEvaluation,
} from "./repositoryAnalysisEvaluator.js";

export interface RepositoryAnalysisExecutionFailure {
  stage: "provider";
  category: AIProviderErrorCategory | "unknown";
  message: string;
}

export interface RepositoryAnalysisRequestEvidence {
  prompt: string;
  outputContractId: "repository-analysis-v1";
}

export interface RepositoryAnalysisRunResult {
  analysisRunId: string;
  inspection: RepositoryInspectionWorkflowResult;
  request: RepositoryAnalysisRequestEvidence;
  rawOutput: string;
  parsedOutput: RepositoryAnalysisOutput | null;
  refusal: string | null;
  provider: AIProviderEvidence | null;
  executionFailure: RepositoryAnalysisExecutionFailure | null;
  evaluations: RepositoryAnalysisCitationEvaluation[];
  succeeded: boolean;
  durationMs: number;
  completedAt: string;
}

export async function runRepositoryAnalysis(
  inspection: RepositoryInspectionWorkflowResult,
  provider: AIProvider,
  instruction?: string,
): Promise<RepositoryAnalysisRunResult> {
  const startedAt = performance.now();
  const request = buildRepositoryAnalysisRequest(
    inspection.contextAssembly,
    instruction,
  );
  let providerResult: AIProviderResult<RepositoryAnalysisOutput>;
  let executionFailure: RepositoryAnalysisExecutionFailure | null = null;

  try {
    providerResult = await provider.generate(request);
  } catch (error: unknown) {
    providerResult = {
      rawOutput: "",
      parsedOutput: null,
      refusal: null,
      provider: {
        model: "unknown",
        usage: null,
      },
    };
    executionFailure = {
      stage: "provider",
      category:
        error instanceof AIProviderError ? error.category : "unknown",
      message: error instanceof Error ? error.message : String(error),
    };
  }

  const evaluations = providerResult.parsedOutput === null
    ? []
    : [
        evaluateRepositoryAnalysisCitations(
          providerResult.parsedOutput,
          inspection.contextAssembly,
        ),
      ];

  return {
    analysisRunId: randomUUID(),
    inspection,
    request: {
      prompt: request.prompt,
      outputContractId: "repository-analysis-v1",
    },
    rawOutput: providerResult.rawOutput,
    parsedOutput: providerResult.parsedOutput,
    refusal: providerResult.refusal,
    provider:
      executionFailure === null ? providerResult.provider : null,
    executionFailure,
    evaluations,
    succeeded:
      executionFailure === null &&
      providerResult.refusal === null &&
      providerResult.parsedOutput !== null &&
      evaluations.every(({ passed }) => passed),
    durationMs: performance.now() - startedAt,
    completedAt: new Date().toISOString(),
  };
}
