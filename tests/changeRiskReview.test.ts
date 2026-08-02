import { describe, expect, it } from "vitest";
import {
  buildChangeRiskReviewRequest,
  changeRiskReviewOutputSchema,
  evaluateChangeRiskCitations,
} from "../src/agents/changeRiskReviewer/changeRiskReview.js";
import type { RepositoryInspectionWorkflowResult } from "../src/workflows/repositoryInspectionWorkflow.js";

function inspection(): RepositoryInspectionWorkflowResult {
  return {
    workflowRunId: "inspection-1",
    workflowId: "repository-inspection",
    steps: [],
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
});
