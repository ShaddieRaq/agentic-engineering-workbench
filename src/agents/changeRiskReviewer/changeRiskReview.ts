import { randomUUID } from "node:crypto";
import { z } from "zod";
import type {
  AIProvider,
  AIProviderEvidence,
  AIProviderResult,
} from "../../providers/aiProvider.js";
import { AIProviderError } from "../../providers/aiProviderError.js";
import { buildRepositoryContextPromptEvidence } from "../../workflows/repositoryContextPrompt.js";
import type { RepositoryInspectionWorkflowResult } from "../../workflows/repositoryInspectionWorkflow.js";

const evidencePathsSchema = z.array(z.string().min(1)).min(1);

export const changeRiskReviewOutputSchema = z
  .object({
    summary: z.string().min(1),
    overallRisk: z.enum(["low", "medium", "high", "critical"]),
    findings: z.array(
      z
        .object({
          title: z.string().min(1),
          severity: z.enum(["low", "medium", "high", "critical"]),
          category: z.enum([
            "correctness",
            "security",
            "performance",
            "testing",
            "maintainability",
          ]),
          explanation: z.string().min(1),
          evidencePaths: evidencePathsSchema,
          recommendedAction: z.string().min(1),
        })
        .strict(),
    ),
    missingTests: z.array(
      z
        .object({
          recommendation: z.string().min(1),
          evidencePaths: evidencePathsSchema,
        })
        .strict(),
    ),
    releaseRecommendation: z.enum(["approve", "caution", "block"]),
  })
  .strict();

export type ChangeRiskReviewOutput = z.infer<
  typeof changeRiskReviewOutputSchema
>;

export interface ChangeRiskCitationEvaluation {
  passed: boolean;
  availablePaths: string[];
  citedPaths: string[];
  invalidPaths: string[];
  message: string;
}

export interface ChangeRiskReviewResult {
  reviewRunId: string;
  inspection: RepositoryInspectionWorkflowResult;
  prompt: string;
  rawOutput: string;
  parsedOutput: ChangeRiskReviewOutput | null;
  refusal: string | null;
  provider: AIProviderEvidence | null;
  executionFailure: {
    category: "transport" | "parsing" | "unknown";
    message: string;
  } | null;
  citationEvaluation: ChangeRiskCitationEvaluation | null;
  succeeded: boolean;
  durationMs: number;
  completedAt: string;
}

function uniqueSorted(paths: string[]): string[] {
  return [...new Set(paths)].sort((left, right) => left.localeCompare(right));
}

export function evaluateChangeRiskCitations(
  output: ChangeRiskReviewOutput,
  inspection: RepositoryInspectionWorkflowResult,
): ChangeRiskCitationEvaluation {
  const availablePaths = uniqueSorted(
    inspection.contextAssembly.items.map(({ source }) => source),
  );
  const citedPaths = uniqueSorted([
    ...output.findings.flatMap(({ evidencePaths }) => evidencePaths),
    ...output.missingTests.flatMap(({ evidencePaths }) => evidencePaths),
  ]);
  const available = new Set(availablePaths);
  const invalidPaths = citedPaths.filter((path) => !available.has(path));

  return {
    passed: invalidPaths.length === 0,
    availablePaths,
    citedPaths,
    invalidPaths,
    message: invalidPaths.length === 0
      ? "Every risk finding cites assembled repository evidence."
      : `Risk review cites unavailable paths: ${invalidPaths.join(", ")}.`,
  };
}

export function buildChangeRiskReviewRequest(
  inspection: RepositoryInspectionWorkflowResult,
  instruction: string,
) {
  if (instruction.trim().length === 0) {
    throw new Error("Change-risk instruction must not be empty.");
  }

  const { contextSections, rejectedSummary } =
    buildRepositoryContextPromptEvidence(inspection.contextAssembly);

  return {
    prompt: [
      "ROLE:",
      "You are a repository change-risk reviewer.",
      "Use only supplied repository evidence.",
      "Do not invent changed behavior, files, tests, or dependencies.",
      "Every finding and missing-test recommendation must cite exact Source paths.",
      "Separate correctness, security, performance, testing, and maintainability risk.",
      "A clean diff is evidence of no observed change, not proof that the repository is risk-free.",
      "",
      `Context completeness: ${inspection.contextAssembly.complete ? "complete" : "incomplete"}`,
      "Rejected candidates:",
      rejectedSummary,
      "",
      "CONTEXT FILES:",
      contextSections.join("\n\n---\n\n"),
      "",
      "TASK:",
      instruction.trim(),
    ].join("\n"),
    outputSchema: changeRiskReviewOutputSchema,
  };
}

export async function runChangeRiskReview(
  inspection: RepositoryInspectionWorkflowResult,
  provider: AIProvider,
  instruction: string,
): Promise<ChangeRiskReviewResult> {
  const startedAt = performance.now();
  const request = buildChangeRiskReviewRequest(inspection, instruction);
  let providerResult: AIProviderResult<ChangeRiskReviewOutput>;
  let executionFailure: ChangeRiskReviewResult["executionFailure"] = null;

  try {
    providerResult = await provider.generate(request);
  } catch (error: unknown) {
    providerResult = {
      rawOutput: "",
      parsedOutput: null,
      refusal: null,
      provider: { model: "unknown", usage: null },
    };
    executionFailure = {
      category: error instanceof AIProviderError ? error.category : "unknown",
      message: error instanceof Error ? error.message : String(error),
    };
  }

  const citationEvaluation = providerResult.parsedOutput === null
    ? null
    : evaluateChangeRiskCitations(providerResult.parsedOutput, inspection);

  return {
    reviewRunId: randomUUID(),
    inspection,
    prompt: request.prompt,
    rawOutput: providerResult.rawOutput,
    parsedOutput: providerResult.parsedOutput,
    refusal: providerResult.refusal,
    provider: executionFailure === null ? providerResult.provider : null,
    executionFailure,
    citationEvaluation,
    succeeded:
      executionFailure === null &&
      providerResult.refusal === null &&
      providerResult.parsedOutput !== null &&
      citationEvaluation?.passed === true,
    durationMs: performance.now() - startedAt,
    completedAt: new Date().toISOString(),
  };
}
