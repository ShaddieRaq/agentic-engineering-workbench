import { describe, expect, it } from "vitest";
import type {
  AIProvider,
  AIProviderRequest,
  AIProviderResult,
} from "../src/providers/aiProvider.js";
import { AIProviderError } from "../src/providers/aiProviderError.js";
import type { RepositoryAnalysisOutput } from "../src/workflows/repositoryAnalysisOutput.js";
import { repositoryAnalysisOutputSchema } from "../src/workflows/repositoryAnalysisOutput.js";
import { runRepositoryAnalysis } from "../src/workflows/repositoryAnalysisRunner.js";
import type { RepositoryInspectionWorkflowResult } from "../src/workflows/repositoryInspectionWorkflow.js";

const parsedAnalysis: RepositoryAnalysisOutput = {
  overview: "A small TypeScript workbench.",
  architectureComponents: [
    {
      component: "CLI",
      responsibility: "Starts repository workflows.",
      evidencePaths: ["README.md"],
    },
  ],
  entryPoints: [],
  risks: [],
  recommendedTests: [
    {
      test: "Run the CLI test suite.",
      rationale: "The README exposes CLI behavior.",
      evidencePaths: ["README.md"],
    },
  ],
};

function inspection(): RepositoryInspectionWorkflowResult {
  return {
    workflowRunId: "workflow-1",
    workflowId: "repository-inspection",
    steps: [],
    contextSelection: {
      selectionId: "repository-orientation",
      sourceToolCallId: "files-1",
      candidates: [
        {
          path: "README.md",
          priority: 1,
          rationale: "Project overview.",
        },
      ],
      complete: true,
    },
    contextAssembly: {
      maximumBytes: 100,
      totalBytes: 18,
      items: [
        {
          id: "repository:README.md",
          source: "README.md",
          toolCallId: "read-1",
          sizeBytes: 18,
          priority: 1,
          rationale: "Project overview.",
        },
      ],
      reads: [
        {
          candidate: {
            path: "README.md",
            priority: 1,
            rationale: "Project overview.",
          },
          evidence: {
            toolCallId: "read-1",
            toolId: "read-file",
            input: { path: "README.md", maxBytes: 100 },
            output: {
              path: "README.md",
              content: "Repository readme.",
              sizeBytes: 18,
            },
            failure: null,
            durationMs: 1,
            completedAt: "2026-08-01T12:00:00.000Z",
            succeeded: true,
          },
        },
      ],
      rejectedCandidates: [],
      complete: true,
    },
    succeeded: true,
    durationMs: 5,
    completedAt: "2026-08-01T12:00:00.000Z",
  };
}

class TestProvider implements AIProvider {
  request: AIProviderRequest<unknown> | null = null;

  constructor(
    private readonly result:
      | AIProviderResult<RepositoryAnalysisOutput>
      | Error,
  ) {}

  async generate<TOutput = unknown>(
    request: AIProviderRequest<TOutput>,
  ): Promise<AIProviderResult<TOutput>> {
    this.request = request;

    if (this.result instanceof Error) {
      throw this.result;
    }

    return this.result as AIProviderResult<TOutput>;
  }
}

describe("runRepositoryAnalysis", () => {
  it("preserves inspection, request, and structured provider evidence", async () => {
    const provider = new TestProvider({
      rawOutput: JSON.stringify(parsedAnalysis),
      parsedOutput: parsedAnalysis,
      refusal: null,
      provider: {
        model: "test-model",
        usage: {
          inputTokens: 100,
          cachedInputTokens: 0,
          outputTokens: 50,
          reasoningTokens: 0,
          totalTokens: 150,
        },
      },
    });
    const sourceInspection = inspection();
    const result = await runRepositoryAnalysis(
      sourceInspection,
      provider,
    );

    expect(provider.request?.outputSchema).toBe(
      repositoryAnalysisOutputSchema,
    );
    expect(result.inspection).toBe(sourceInspection);
    expect(result.request.outputContractId).toBe("repository-analysis-v1");
    expect(result.parsedOutput).toEqual(parsedAnalysis);
    expect(result.provider?.model).toBe("test-model");
    expect(result.executionFailure).toBeNull();
    expect(result.succeeded).toBe(true);
  });

  it("preserves a provider refusal as an unsuccessful result", async () => {
    const provider = new TestProvider({
      rawOutput: "",
      parsedOutput: null,
      refusal: "I cannot analyze this repository.",
      provider: { model: "test-model", usage: null },
    });
    const result = await runRepositoryAnalysis(inspection(), provider);

    expect(result.refusal).toBe("I cannot analyze this repository.");
    expect(result.executionFailure).toBeNull();
    expect(result.succeeded).toBe(false);
  });

  it("classifies provider failures without rejecting the analysis run", async () => {
    const provider = new TestProvider(
      new AIProviderError("transport", "Provider unavailable."),
    );
    const result = await runRepositoryAnalysis(inspection(), provider);

    expect(result.rawOutput).toBe("");
    expect(result.parsedOutput).toBeNull();
    expect(result.provider).toBeNull();
    expect(result.executionFailure).toEqual({
      stage: "provider",
      category: "transport",
      message: "Provider unavailable.",
    });
    expect(result.succeeded).toBe(false);
  });
});
