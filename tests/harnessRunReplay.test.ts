import { describe, expect, it } from "vitest";
import { FakeProvider } from "../src/providers/fakeProvider.js";
import type { HarnessResult } from "../src/harness/harnessResult.js";
import { replayHarnessRun } from "../src/reporting/harnessRunReplay.js";

function sourceRun(): HarnessResult {
  return {
    runId: "source-1",
    harnessId: "basic-reliability",
    scenarioId: null,
    role: { id: "role", instructions: "Answer clearly." },
    task: { id: "task", instruction: "Explain reliability." },
    context: [],
    prompt: "Original prompt.",
    output: "bad",
    parsedOutput: null,
    refusal: null,
    provider: null,
    executionFailure: null,
    evaluations: [
      { evaluatorId: "non-empty-output", passed: true, message: "Present." },
      { evaluatorId: "minimum-length", passed: false, message: "Too short." },
    ],
    passed: false,
    durationMs: 1,
    completedAt: "2026-08-01T12:00:00.000Z",
  };
}

describe("replayHarnessRun", () => {
  it("reuses saved inputs and compares fresh policy evidence", async () => {
    const result = await replayHarnessRun(
      sourceRun(),
      new FakeProvider("This replay output is long enough to pass."),
    );

    expect(result.sourceRun.runId).toBe("source-1");
    expect(result.replayRun.role).toEqual(result.sourceRun.role);
    expect(result.replayRun.task).toEqual(result.sourceRun.task);
    expect(result.replayRun.context).toEqual(result.sourceRun.context);
    expect(result.replayRun.passed).toBe(true);
    expect(result.comparison.outcome).toBe("improved");
    expect(result.comparison.policyChanged).toBe(false);
    expect(result.comparison.evaluations[1]).toMatchObject({
      evaluatorId: "minimum-length",
      sourcePassed: false,
      replayPassed: true,
      changed: true,
    });
  });

  it("rejects replay when the saved harness no longer resolves", async () => {
    const source = sourceRun();
    source.harnessId = "missing-harness";

    await expect(
      replayHarnessRun(source, new FakeProvider("unused")),
    ).rejects.toThrow("Unknown harness: missing-harness");
  });
});
