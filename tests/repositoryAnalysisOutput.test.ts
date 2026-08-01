import { describe, expect, it } from "vitest";
import { repositoryAnalysisOutputSchema } from "../src/workflows/repositoryAnalysisOutput.js";

const completeAnalysis = {
  overview: "A TypeScript workbench for reliable agent systems.",
  architectureComponents: [
    {
      component: "Provider boundary",
      responsibility: "Hide model-specific generation details.",
      evidencePaths: ["README.md"],
    },
  ],
  entryPoints: [
    {
      path: "src/index.ts",
      purpose: "Run the primary harness CLI.",
      evidencePaths: ["package.json"],
    },
  ],
  risks: [
    {
      risk: "The main project description may drift from implementation.",
      evidencePaths: ["README.md"],
    },
  ],
  recommendedTests: [
    {
      test: "Exercise every package script entry point.",
      rationale: "Command wiring is part of the operator contract.",
      evidencePaths: ["package.json"],
    },
  ],
};

describe("repositoryAnalysisOutputSchema", () => {
  it("accepts a complete citation-bearing analysis", () => {
    expect(repositoryAnalysisOutputSchema.safeParse(completeAnalysis).success)
      .toBe(true);
  });

  it("rejects recommendations without evidence paths", () => {
    const result = repositoryAnalysisOutputSchema.safeParse({
      ...completeAnalysis,
      recommendedTests: [
        {
          test: "Run tests.",
          rationale: "Tests provide confidence.",
          evidencePaths: [],
        },
      ],
    });

    expect(result.success).toBe(false);
  });
});
