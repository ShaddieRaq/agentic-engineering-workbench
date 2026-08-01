import { describe, expect, it } from "vitest";
import type { HarnessResult } from "../src/harness/harnessResult.js";
import { summarizeHarnessRuns } from "../src/reporting/harnessRunReport.js";

function run(id: string, passed: boolean): HarnessResult {
  return {
    runId: id,
    harnessId: "basic-reliability",
    scenarioId: null,
    role: { id: "role", instructions: "Be useful." },
    task: { id: "task", instruction: "Do work." },
    context: [],
    prompt: "Do work.",
    output: passed ? "Useful output." : "",
    parsedOutput: null,
    refusal: null,
    provider: passed
      ? {
          model: "gpt-5.4-mini-2026-03-17",
          usage: {
            inputTokens: 100,
            cachedInputTokens: 20,
            outputTokens: 30,
            reasoningTokens: 10,
            totalTokens: 130,
          },
        }
      : null,
    executionFailure: passed
      ? null
      : {
          stage: "provider",
          category: "transport",
          message: "Unavailable.",
        },
    evaluations: [
      {
        evaluatorId: "non-empty-output",
        passed,
        message: passed ? "Present." : "Missing.",
      },
    ],
    passed,
    durationMs: passed ? 10 : 20,
    completedAt: "2026-08-01T12:00:00.000Z",
  };
}

describe("summarizeHarnessRuns", () => {
  it("derives outcomes, failures, models, latency, usage, and cost", () => {
    const report = summarizeHarnessRuns([
      run("run-1", true),
      run("run-2", false),
    ]);

    expect(report).toMatchObject({
      runIds: ["run-1", "run-2"],
      totalRuns: 2,
      passedRuns: 1,
      failedRuns: 1,
      passRate: 0.5,
      latencyMs: { average: 15, minimum: 10, maximum: 20 },
      executionFailures: { transport: 1, parsing: 0, unknown: 0 },
      evaluatorFailures: { "non-empty-output": 1 },
      models: { "gpt-5.4-mini-2026-03-17": 1 },
      modelJudgments: {
        samples: 0,
        passed: 0,
        failed: 0,
        uncertain: 0,
        disagreements: 0,
      },
    });
    expect(report.usage.totalTokens).toBe(130);
    expect(report.usage.estimatedCostUsd).not.toBeNull();
  });

  it("uses null metrics for an empty evidence set", () => {
    const report = summarizeHarnessRuns([]);

    expect(report.passRate).toBeNull();
    expect(report.latencyMs).toEqual({
      average: null,
      minimum: null,
      maximum: null,
    });
  });

  it("preserves accepted and rejected source artifact evidence", () => {
    const report = summarizeHarnessRuns([run("run-1", true)], [], {
      acceptedPaths: ["run-current.json"],
      rejectedArtifacts: [
        { path: "run-legacy.json", reason: "Missing harnessId." },
      ],
    });

    expect(report.sources).toEqual({
      acceptedPaths: ["run-current.json"],
      rejectedArtifacts: [
        { path: "run-legacy.json", reason: "Missing harnessId." },
      ],
    });
  });
});
