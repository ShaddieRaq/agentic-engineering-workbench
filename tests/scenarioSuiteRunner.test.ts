import { describe, expect, it, vi } from "vitest";
import { getScenarioSuiteDefinition } from "../src/suites/scenarioSuiteRegistry.js";
import {
    runScenarioSuite,
    type ScenarioExecutor,
} from "../src/suites/scenarioSuiteRunner.js";
import type { HarnessResult } from "../src/harness/harnessResult.js";
import type { ScenarioDefinition } from "../src/scenarios/scenarioDefinition.js";

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
});