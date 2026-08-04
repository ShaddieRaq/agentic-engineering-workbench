import { describe, expect, it, vi } from "vitest";
import {
  buildChangeRiskReviewRequest,
  changeRiskReviewOutputSchema,
  evaluateChangeRiskCitations,
  runChangeRiskReview,
} from "../src/agents/changeRiskReviewer/changeRiskReview.js";
import type { RepositoryInspectionWorkflowResult } from "../src/workflows/repositoryInspectionWorkflow.js";

function inspection(): RepositoryInspectionWorkflowResult {
  return {
    workflowRunId: "inspection-1",
    workflowId: "repository-inspection",
    steps: [{
      stepId: "git-changes",
      evidence: {
        toolCallId: "diff-1",
        toolId: "inspect-git-diff",
        input: {
          mode: "workspace",
          contextLines: 3,
          maxBytes: 65_536,
        },
        output: {
          mode: "workspace",
          diff: "diff --git a/src/index.ts b/src/index.ts\n+changed\n",
          sizeBytes: 54,
          empty: false,
          trackedPaths: ["src/index.ts"],
          untrackedPaths: [],
        },
        failure: null,
        durationMs: 1,
        completedAt: "2026-08-01T12:00:00.000Z",
        succeeded: true,
      },
    }],
    contextSelection: {
      selectionId: "repository-orientation",
      sourceToolCallId: "list-1",
      changeToolCallId: "diff-1",
      candidates: [],
      complete: true,
    },
    contextAssembly: {
      maximumBytes: 100,
      totalBytes: 10,
      items: [
        {
          id: "repository:src/index.ts",
          source: "src/index.ts",
          toolCallId: "read-1",
          sizeBytes: 10,
          priority: 1,
          rationale: "Changed implementation.",
        },
      ],
      reads: [
        {
          candidate: {
            path: "src/index.ts",
            priority: 1,
            rationale: "Changed implementation.",
          },
          evidence: {
            toolCallId: "read-1",
            toolId: "read-file",
            input: { path: "src/index.ts", maxBytes: 100 },
            output: {
              path: "src/index.ts",
              content: "export const changed = true;",
              sizeBytes: 10,
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
    durationMs: 1,
    completedAt: "2026-08-01T12:00:00.000Z",
  };
}

const output = changeRiskReviewOutputSchema.parse({
  summary: "One changed entry point requires focused testing.",
  overallRisk: "medium",
  findings: [
    {
      title: "Changed behavior",
      severity: "medium",
      category: "correctness",
      explanation: "The exported behavior changed.",
      evidencePaths: ["src/index.ts"],
      recommendedAction: "Review callers.",
    },
  ],
  missingTests: [
    {
      recommendation: "Add an entry-point regression test.",
      evidencePaths: ["src/index.ts"],
    },
  ],
  releaseRecommendation: "caution",
});

describe("change risk review", () => {
  it("builds a structured request from validated repository evidence", () => {
    const request = buildChangeRiskReviewRequest(
      inspection(),
      "Review this change.",
    );

    expect(request.outputSchema).toBe(changeRiskReviewOutputSchema);
    expect(request.prompt).toContain(
      "diff --git a/src/index.ts b/src/index.ts",
    );
    expect(request.prompt).toContain("Source: src/index.ts");
    expect(request.prompt).toContain("Review this change.");
  });

  it("rejects citations to unavailable repository context", () => {
    expect(evaluateChangeRiskCitations(output, inspection()).passed).toBe(true);

    const invalid = structuredClone(output);
    invalid.findings[0]!.evidencePaths = ["src/missing.ts"];

    expect(evaluateChangeRiskCitations(invalid, inspection())).toMatchObject({
      passed: false,
      invalidPaths: ["src/missing.ts"],
    });
  });

  it("does not call the model when no allowed workspace change exists", async () => {
    const clean = inspection();
    const changeStep = clean.steps[0]!;
    if (changeStep.stepId !== "git-changes" || !changeStep.evidence.output) {
      throw new Error("Expected Git evidence.");
    }
    changeStep.evidence.output = {
      ...changeStep.evidence.output,
      diff: "",
      sizeBytes: 0,
      empty: true,
      trackedPaths: [],
      untrackedPaths: [],
    };
    const generate = vi.fn();

    const result = await runChangeRiskReview(
      clean,
      { generate },
      "Review this change.",
    );

    expect(generate).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      succeeded: false,
      provider: null,
      executionFailure: {
        category: "evidence",
        message: "Change-risk review requires at least one allowed workspace change.",
      },
    });
    expect(result.inspection).toEqual(clean);
  });

  it("does not call the model when Git evidence failed", async () => {
    const failed = inspection();
    const changeStep = failed.steps[0]!;
    changeStep.evidence = {
      ...changeStep.evidence,
      output: null,
      failure: {
        category: "execution",
        message: "Git inspection failed.",
      },
      succeeded: false,
    };
    failed.succeeded = false;
    const generate = vi.fn();

    const result = await runChangeRiskReview(
      failed,
      { generate },
      "Review this change.",
    );

    expect(generate).not.toHaveBeenCalled();
    expect(result.executionFailure).toMatchObject({
      category: "evidence",
      message:
        "Change-risk review requires complete, successful Git and repository evidence.",
    });
  });
});
