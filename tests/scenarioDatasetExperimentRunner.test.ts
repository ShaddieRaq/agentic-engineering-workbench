import { describe, expect, it } from "vitest";
import { createScenarioDatasetExecutor } from "../src/datasets/createScenarioDatasetExecutor.js";
import { getScenarioDatasetDefinition } from "../src/datasets/scenarioDatasetRegistry.js";
import { runScenarioDatasetExperiment } from "../src/experiments/scenarioDatasetExperimentRunner.js";
import { getHarnessDefinition } from "../src/harnesses/harnessRegistry.js";
import { FakeProvider } from "../src/providers/fakeProvider.js";

const definition = {
  id: "test-experiment",
  datasetId: "agentic-harness-audiences",
  harnessId: "basic-reliability",
  baseline: {
    id: "baseline",
    rolePath: "roles/baseline.md",
  },
  candidate: {
    id: "candidate",
    rolePath: "roles/candidate.md",
  },
  execution: {
    repetitions: 1,
    concurrency: 1,
  },
};

describe("runScenarioDatasetExperiment", () => {
  it("compares baseline and candidate evidence by case", async () => {
    const dataset = getScenarioDatasetDefinition(
      "agentic-harness-audiences",
    );
    const harnessDefinition = getHarnessDefinition(
      "basic-reliability",
    );
    const role = {
      id: "test-role",
      instructions: "Follow the task.",
    };
    const baselineExecutor = createScenarioDatasetExecutor({
      provider: new FakeProvider("Invalid output", {
        model: "gpt-5.4",
        usage: {
          inputTokens: 100,
          cachedInputTokens: 0,
          outputTokens: 50,
          reasoningTokens: 10,
          totalTokens: 150,
        },
      }),
      role,
      harnessDefinition,
    });
    const candidateExecutor = createScenarioDatasetExecutor({
      provider: new FakeProvider(
        JSON.stringify({
          definition: "An agentic harness controls an AI run.",
          responsibilities: ["Build prompts", "Evaluate output"],
          modelBoundary: "The model generates the proposed output.",
          practicalExample: "Test support answers before release.",
        }),
        {
          model: "gpt-5.4",
          usage: {
            inputTokens: 90,
            cachedInputTokens: 0,
            outputTokens: 40,
            reasoningTokens: 5,
            totalTokens: 130,
          },
        },
      ),
      role,
      harnessDefinition,
    });

    const result = await runScenarioDatasetExperiment(
      definition,
      dataset,
      baselineExecutor,
      candidateExecutor,
    );

    expect(result.baseline.runs).toHaveLength(2);
    expect(result.candidate.runs).toHaveLength(2);
    expect(result.reliabilityComparisons).toEqual([
      {
        datasetCaseId: "beginner",
        baselinePassRate: 0,
        candidatePassRate: 1,
        passRateDelta: 1,
        classification: "improved",
      },
      {
        datasetCaseId: "staff-engineer",
        baselinePassRate: 0,
        candidatePassRate: 1,
        passRateDelta: 1,
        classification: "improved",
      },
    ]);
    expect(result.latencyComparisons).toHaveLength(2);

    for (const comparison of result.latencyComparisons) {
      expect(comparison.baseline.sampleCount).toBe(1);
      expect(comparison.candidate.sampleCount).toBe(1);
      expect(comparison.averageDurationDeltaMs).toEqual(
        expect.any(Number),
      );
    }

    expect(result.tokenCostComparisons).toHaveLength(2);

    for (const comparison of result.tokenCostComparisons) {
      expect(comparison).toMatchObject({
        totalTokensDelta: -20,
        tokenClassification: "fewer",
        costClassification: "cheaper",
      });
    }
  });
});
