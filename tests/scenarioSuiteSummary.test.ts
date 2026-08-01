import { describe, expect, it } from "vitest";
import {
    summarizeScenarioSuiteFailures,
    summarizeScenarioSuiteRuns,
  } from "../src/suites/scenarioSuiteSummary.js";

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

describe("summarizeScenarioSuiteFailures", () => {
    it("separates execution failures from evaluator failures", () => {
      const summary = summarizeScenarioSuiteFailures([
        {
          executionFailure: {
            stage: "provider",
            category: "transport",
            message: "Connection failed.",
          },
          evaluations: [
            {
              evaluatorId: "required-phrase",
              passed: false,
              message: "Required phrase missing.",
            },
            {
              evaluatorId: "structured-output",
              passed: true,
              message: "Output matched the schema.",
            },
          ],
        },
        {
          executionFailure: null,
          evaluations: [
            {
              evaluatorId: "required-phrase",
              passed: false,
              message: "Required phrase missing.",
            },
          ],
        },
      ]);

      expect(summary).toEqual({
        executionFailures: {
          transport: 1,
          parsing: 0,
          unknown: 0,
        },
        evaluatorFailures: {
          "required-phrase": 2,
        },
      });
    });
  });