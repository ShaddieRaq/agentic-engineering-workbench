import { describe, expect, it } from "vitest";
import { summarizeScenarioDatasetCases } from "../src/datasets/scenarioDatasetSummary.js";

describe("summarizeScenarioDatasetCases", () => {
  it("calculates reliability metrics for each dataset case", () => {
    const summaries = summarizeScenarioDatasetCases([
      {
        datasetCaseId: "beginner",
        harnessResult: { passed: true },
      },
      {
        datasetCaseId: "beginner",
        harnessResult: { passed: false },
      },
      {
        datasetCaseId: "staff-engineer",
        harnessResult: { passed: true },
      },
      {
        datasetCaseId: "staff-engineer",
        harnessResult: { passed: true },
      },
    ]);

    expect(summaries).toEqual([
      {
        datasetCaseId: "beginner",
        totalRuns: 2,
        passedRuns: 1,
        failedRuns: 1,
        passRate: 0.5,
      },
      {
        datasetCaseId: "staff-engineer",
        totalRuns: 2,
        passedRuns: 2,
        failedRuns: 0,
        passRate: 1,
      },
    ]);
  });
});