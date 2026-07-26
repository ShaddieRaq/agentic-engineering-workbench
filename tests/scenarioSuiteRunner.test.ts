import { describe, expect, it, vi } from "vitest";
import { getScenarioSuiteDefinition } from "../src/suites/scenarioSuiteRegistry.js";
import {
    runScenarioSuite,
    type ScenarioExecutor,
} from "../src/suites/scenarioSuiteRunner.js";

describe("runScenarioSuite", () => {
    it("executes every resolved scenario", async () => {
        const suite = getScenarioSuiteDefinition(
            "core-reliability",
        );
        const executeScenario = vi.fn<ScenarioExecutor>(
            async (_scenario) => undefined,
        );

        await runScenarioSuite(
            suite,
            executeScenario,
        );

        expect(executeScenario).toHaveBeenCalledOnce();
        expect(
            executeScenario.mock.calls[0]?.[0]?.id
        ).toBe("explain-agentic-harness");
    });
    it("executes nothing when suite resolution fails", async () => {
        const executeScenario = vi.fn<ScenarioExecutor>(
            async (_scenario) => undefined,
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
});