import { describe, expect, it, vi } from "vitest";
import type { HarnessResult } from "../src/harness/harnessResult.js";
import { getScenarioDatasetDefinition } from "../src/datasets/scenarioDatasetRegistry.js";
import type { ResolvedScenarioDatasetCase } from "../src/datasets/scenarioDatasetResolver.js";
import { runScenarioDataset, type ScenarioDatasetExecutor, } from "../src/datasets/scenarioDatasetRunner.js";

function createDeferred() {
    let resolve!: () => void;

    const promise = new Promise<void>((complete) => {
        resolve = complete;
    });

    return { promise, resolve };
}

describe("runScenarioDataset", () => {
    it("repeats every case and preserves case identity", async () => {
        const dataset = getScenarioDatasetDefinition(
            "agentic-harness-audiences",
        );

        const releases = Array.from(
            { length: 4 },
            () => createDeferred(),
        );
        const started: string[] = [];
        let invocationCount = 0;

        const executeDatasetCase = vi.fn(
            async ({
                datasetCase,
                scenario,
            }: ResolvedScenarioDatasetCase): Promise<HarnessResult> => {
                const invocation = invocationCount;
                invocationCount += 1;
                started.push(datasetCase.id);

                await releases[invocation]!.promise;

                return {
                    runId: `run-${datasetCase.id}`,
                    harnessId: "test-harness",
                    scenarioId: scenario.id,
                    role: {
                        id: "test-role",
                        instructions: "Test instructions.",
                    },
                    task: datasetCase.task,
                    context: datasetCase.context,
                    prompt: datasetCase.task.instruction,
                    output: "Test output.",
                    parsedOutput: null,
                    refusal: null,
                    executionFailure: null,
                    evaluations: [],
                    durationMs: 1,
                    completedAt: "2026-08-01T12:00:00.000Z",
                    passed: true,
                };
            },
        );

        const resultPromise = runScenarioDataset(
            dataset,
            executeDatasetCase,
            {
                repetitions: 2,
                concurrency: 2,
            },
        );

        const startedBeforeRelease = [...started];

        for (const release of releases) {
            release.resolve();
        }

        const result = await resultPromise;
        expect(startedBeforeRelease).toEqual([
            "beginner",
            "beginner",
        ]);
        expect(executeDatasetCase).toHaveBeenCalledTimes(4);
        expect(
            result.runs.map(({ datasetCaseId, harnessResult }) => ({
                datasetCaseId,
                runId: harnessResult.runId,
            })),
        ).toEqual([
            {
                datasetCaseId: "beginner",
                runId: "run-beginner",
            },
            {
                datasetCaseId: "beginner",
                runId: "run-beginner",
            },
            {
                datasetCaseId: "staff-engineer",
                runId: "run-staff-engineer",
            },
            {
                datasetCaseId: "staff-engineer",
                runId: "run-staff-engineer",
            },
        ]);
        expect(result.caseSummaries).toEqual([
            {
                datasetCaseId: "beginner",
                totalRuns: 2,
                passedRuns: 2,
                failedRuns: 0,
                passRate: 1,
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
    it("executes nothing when dataset resolution fails", async () => {
        const executeDatasetCase = vi.fn<ScenarioDatasetExecutor>(
            async (_resolvedCase) => {
                throw new Error("Dataset case execution should not occur.");
            },
        );

        await expect(
            runScenarioDataset(
                {
                    id: "invalid-dataset",
                    description: "Contains an invalid policy reference.",
                    cases: [
                        {
                            id: "valid-case",
                            scenarioId: "explain-agentic-harness",
                            task: {
                                id: "valid-task",
                                instruction: "Explain an agentic harness.",
                            },
                            context: [],
                        },
                        {
                            id: "invalid-case",
                            scenarioId: "unknown-scenario",
                            task: {
                                id: "invalid-task",
                                instruction: "This case must not execute.",
                            },
                            context: [],
                        },
                    ],
                },
                executeDatasetCase,
            ),
        ).rejects.toThrow("Unknown scenario: unknown-scenario");

        expect(executeDatasetCase).not.toHaveBeenCalled();
    });
});