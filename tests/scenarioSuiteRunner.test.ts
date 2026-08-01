import { describe, expect, it, vi } from "vitest";
import { getScenarioSuiteDefinition } from "../src/suites/scenarioSuiteRegistry.js";
import {
    runScenarioSuite,
    type ScenarioExecutor,
} from "../src/suites/scenarioSuiteRunner.js";
import type { HarnessResult } from "../src/harness/harnessResult.js";
import type { ScenarioDefinition } from "../src/scenarios/scenarioDefinition.js";

function createDeferred() {
    let resolve!: () => void;

    const promise = new Promise<void>((complete) => {
      resolve = complete;
    });

    return { promise, resolve };
  }

const harnessResult: HarnessResult = {
    runId: "run-1",
    harnessId: "test-harness",
    scenarioId: "explain-agentic-harness",
    role: {
      id: "test-role",
      instructions: "Test instructions.",
    },
    task: {
      id: "test-task",
      instruction: "Test task.",
    },
    context: [],
    prompt: "Test prompt.",
    output: "Test output.",
    parsedOutput: null,
    refusal: null,
    executionFailure: null,
    evaluations: [],
    durationMs: 1,
    completedAt: "2026-07-26T12:00:00.000Z",
    passed: true,
  };

describe("runScenarioSuite", () => {
    it("executes nothing when suite resolution fails", async () => {
        const executeScenario = vi.fn<ScenarioExecutor>(
            async (_scenario) => {
              throw new Error("Scenario execution should not occur.");
            },
          );

        await expect(
            runScenarioSuite(
                {
                    id: "invalid-suite",
                    description: "Contains an invalid reference.",
                    scenarioIds: [
                        "explain-agentic-harness",
                        "unknown-scenario",
                    ],
                },
                executeScenario,
            ),
        ).rejects.toThrow(
            "Unknown scenario: unknown-scenario",
        );

        expect(executeScenario).not.toHaveBeenCalled();
    });
    it("collects every scenario result", async () => {
        const suite = getScenarioSuiteDefinition("core-reliability");
    
        const executeScenario = vi.fn(
          async (_scenario: ScenarioDefinition) => harnessResult,
        );
    
        const result = await runScenarioSuite(suite, executeScenario);
    
        expect(executeScenario).toHaveBeenCalledOnce();
        expect(executeScenario.mock.calls[0]?.[0]?.id).toBe(
          "explain-agentic-harness",
        );
        expect(result).toEqual({
            suiteId: "core-reliability",
            runs: [harnessResult],
            summary: {
              totalRuns: 1,
              passedRuns: 1,
              failedRuns: 0,
              passRate: 1,
            },
            failureSummary: {
              executionFailures: {
                transport: 0,
                parsing: 0,
                unknown: 0,
              },
              evaluatorFailures: {},
            },
          });
      });

      it("repeats each scenario the requested number of times", async () => {
        const suite = getScenarioSuiteDefinition("core-reliability");
        let runNumber = 0;
    
        const executeScenario = vi.fn(
          async (_scenario: ScenarioDefinition): Promise<HarnessResult> => ({
            ...harnessResult,
            runId: `run-${++runNumber}`,
          }),
        );
    
        const result = await runScenarioSuite(suite, executeScenario, {
          repetitions: 3,
        });
    
        expect(executeScenario).toHaveBeenCalledTimes(3);
        expect(result.runs.map((run) => run.runId)).toEqual([
          "run-1",
          "run-2",
          "run-3",
        ]);
      });
      it.each([0, -1, 1.5])(
        "rejects invalid repetition count %s",
        async (repetitions) => {
          const suite = getScenarioSuiteDefinition("core-reliability");
          const executeScenario = vi.fn(
            async (_scenario: ScenarioDefinition): Promise<HarnessResult> =>
              harnessResult,
          );
    
          await expect(
            runScenarioSuite(suite, executeScenario, { repetitions }),
          ).rejects.toThrow();
    
          expect(executeScenario).not.toHaveBeenCalled();
        },
      );
      it("limits concurrent scenario execution", async () => {
        const suite = getScenarioSuiteDefinition("core-reliability");
        const releases = [
          createDeferred(),
          createDeferred(),
          createDeferred(),
        ];
        const started: number[] = [];
        let invocationCount = 0;
    
        const executeScenario = vi.fn(
          async (_scenario: ScenarioDefinition): Promise<HarnessResult> => {
            const invocation = invocationCount;
            invocationCount += 1;
            started.push(invocation + 1);
    
            await releases[invocation]!.promise;
    
            return {
              ...harnessResult,
              runId: `run-${invocation + 1}`,
            };
          },
        );
    
        const resultPromise = runScenarioSuite(suite, executeScenario, {
          repetitions: 3,
          concurrency: 2,
        });
    
        const startedBeforeRelease = [...started];
    
        for (const release of releases) {
          release.resolve();
        }
    
        const result = await resultPromise;
    
        expect(startedBeforeRelease).toEqual([1, 2]);
        expect(result.runs.map((run) => run.runId)).toEqual([
          "run-1",
          "run-2",
          "run-3",
        ]);
      });
});