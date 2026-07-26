import { describe, expect, it, vi } from "vitest";
import { getScenarioSuiteDefinition } from "../src/suites/scenarioSuiteRegistry.js";
import {
    runScenarioSuite,
    type ScenarioExecutor,
} from "../src/suites/scenarioSuiteRunner.js";
import type { HarnessResult } from "../src/harness/harnessResult.js";
import type { ScenarioDefinition } from "../src/scenarios/scenarioDefinition.js";

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
        });
      });
});