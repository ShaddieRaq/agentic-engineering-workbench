import { describe, expect, it } from "vitest";
import type { RepositoryContextAssembly } from "../src/workflows/repositoryContextLoader.js";
import type { RepositoryAnalysisOutput } from "../src/workflows/repositoryAnalysisOutput.js";
import { evaluateRepositoryAnalysisCitations } from "../src/workflows/repositoryAnalysisEvaluator.js";

const context = {
  maximumBytes: 100,
  totalBytes: 10,
  items: [
    {
      id: "repository:README.md",
      source: "README.md",
      toolCallId: "read-1",
      sizeBytes: 10,
      priority: 1,
      rationale: "Project overview.",
    },
  ],
  reads: [],
  rejectedCandidates: [],
  complete: true,
} satisfies RepositoryContextAssembly;

function analysis(evidencePaths: string[]): RepositoryAnalysisOutput {
  return {
    overview: "A repository.",
    architectureComponents: [
      {
        component: "Documentation",
        responsibility: "Explain the project.",
        evidencePaths,
      },
    ],
    entryPoints: [],
    risks: [],
    recommendedTests: [
      {
        test: "Check the documentation.",
        rationale: "Documentation is part of the contract.",
        evidencePaths: ["README.md"],
      },
    ],
  };
}

describe("evaluateRepositoryAnalysisCitations", () => {
  it("passes exact citations to assembled context", () => {
    expect(
      evaluateRepositoryAnalysisCitations(
        analysis(["README.md"]),
        context,
      ),
    ).toEqual({
      evaluatorId: "repository-evidence-paths",
      passed: true,
      availablePaths: ["README.md"],
      citedPaths: ["README.md"],
      invalidPaths: [],
      message: "Every analysis citation references assembled context.",
    });
  });

  it("reports citations to unavailable paths", () => {
    const evaluation = evaluateRepositoryAnalysisCitations(
      analysis(["src/index.ts", "README.md"]),
      context,
    );

    expect(evaluation.passed).toBe(false);
    expect(evaluation.invalidPaths).toEqual(["src/index.ts"]);
  });
});
