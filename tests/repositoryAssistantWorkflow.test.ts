import { describe, expect, it, vi } from "vitest";
import type { RepositoryAnalysisRunResult } from "../src/workflows/repositoryAnalysisRunner.js";
import {
  runRepositoryAssistantWorkflow,
  reviewRepositoryAnalysis,
} from "../src/workflows/repositoryAssistantWorkflow.js";
import type { RepositoryInspectionWorkflowResult } from "../src/workflows/repositoryInspectionWorkflow.js";

function inspection(): RepositoryInspectionWorkflowResult {
  return {
    workflowRunId: "inspection-1",
    workflowId: "repository-inspection",
    steps: [],
    contextSelection: {
      selectionId: "repository-orientation",
      sourceToolCallId: "files-1",
      changeToolCallId: "changes-1",
      candidates: [],
      complete: true,
    },
    contextAssembly: {
      maximumBytes: 100,
      totalBytes: 10,
      items: [],
      reads: [],
      rejectedCandidates: [],
      complete: true,
    },
    succeeded: true,
    durationMs: 1,
    completedAt: "2026-08-01T12:00:00.000Z",
  };
}

function analysis(
  citationPassed = true,
): RepositoryAnalysisRunResult {
  return {
    analysisRunId: "analysis-1",
    inspection: inspection(),
    request: {
      prompt: "Analyze.",
      outputContractId: "repository-analysis-v1",
    },
    rawOutput: "{}",
    parsedOutput: {
      overview: "Overview.",
      architectureComponents: [],
      entryPoints: [],
      risks: [],
      recommendedTests: [],
    },
    refusal: null,
    provider: { model: "test-model", usage: null },
    executionFailure: null,
    evaluations: [
      {
        evaluatorId: "repository-evidence-paths",
        passed: citationPassed,
        message: citationPassed
          ? "All citations are available."
          : "Unavailable citation.",
        availablePaths: ["README.md"],
        citedPaths: citationPassed ? ["README.md"] : ["missing.ts"],
        invalidPaths: citationPassed ? [] : ["missing.ts"],
      },
    ],
    succeeded: citationPassed,
    durationMs: 2,
    completedAt: "2026-08-01T12:00:01.000Z",
  };
}

describe("repository assistant workflow", () => {
  it("runs inspection, analysis, and verification with one ordered trace", async () => {
    const inspect = vi.fn(async () => inspection());
    const analyze = vi.fn(async () => analysis());

    const result = await runRepositoryAssistantWorkflow(inspect, analyze);

    expect(inspect).toHaveBeenCalledOnce();
    expect(analyze).toHaveBeenCalledWith(result.state.inspection);
    expect(result.steps.map(({ stepId }) => stepId)).toEqual([
      "inspect",
      "analyze",
      "verify",
    ]);
    expect(result.state.review?.passed).toBe(true);
    expect(result.succeeded).toBe(true);
  });

  it("fails domain success when deterministic verification fails", async () => {
    const result = await runRepositoryAssistantWorkflow(
      async () => inspection(),
      async () => analysis(false),
    );

    expect(result.status).toBe("completed");
    expect(result.state.review?.checks).toContainEqual({
      id: "citation-grounding",
      passed: false,
      message: "Unavailable citation.",
    });
    expect(result.succeeded).toBe(false);
  });

  it("records analysis exceptions and does not execute verification", async () => {
    const result = await runRepositoryAssistantWorkflow(
      async () => inspection(),
      async () => {
        throw new Error("Provider unavailable.");
      },
    );

    expect(result.steps.map(({ stepId }) => stepId)).toEqual([
      "inspect",
      "analyze",
    ]);
    expect(result.steps[1]?.failure).toMatchObject({
      category: "execution",
      message: "Provider unavailable.",
    });
    expect(result.succeeded).toBe(false);
  });

  it("reviews provider, structure, and citation evidence separately", () => {
    const review = reviewRepositoryAnalysis(analysis());

    expect(review.checks.map(({ id }) => id)).toEqual([
      "provider-execution",
      "structured-output",
      "citation-grounding",
    ]);
    expect(review.passed).toBe(true);
  });
});
