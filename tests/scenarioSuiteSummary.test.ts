import { describe, expect, it } from "vitest";
import { summarizeScenarioSuiteRuns } from "../src/suites/scenarioSuiteSummary.js";

describe("summarizeScenarioSuiteRuns", () => {
  it("calculates suite reliability metrics", () => {
    const summary = summarizeScenarioSuiteRuns([
      { passed: true },
      { passed: true },
      { passed: false },
      { passed: true },
    ]);

    expect(summary).toEqual({
      totalRuns: 4,
      passedRuns: 3,
      failedRuns: 1,
      passRate: 0.75,
    });
  });
  it("reports no pass rate when there are no runs", () => {
    expect(summarizeScenarioSuiteRuns([])).toEqual({
      totalRuns: 0,
      passedRuns: 0,
      failedRuns: 0,
      passRate: null,
    });
  });
});