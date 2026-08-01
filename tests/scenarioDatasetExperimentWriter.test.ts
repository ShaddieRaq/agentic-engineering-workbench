import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { writeScenarioDatasetExperiment } from "../src/experiments/scenarioDatasetExperimentWriter.js";
import type { ScenarioDatasetExperimentResult } from "../src/experiments/scenarioDatasetExperimentRunner.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  );
});

describe("writeScenarioDatasetExperiment", () => {
  it("persists the complete experiment result", async () => {
    const directory = await mkdtemp(
      join(tmpdir(), "experiment-runs-"),
    );
    temporaryDirectories.push(directory);
    const result = {
      definition: {
        id: "test-experiment",
        datasetId: "test-dataset",
        harnessId: "test-harness",
        baseline: { id: "baseline", rolePath: "baseline.md" },
        candidate: { id: "candidate", rolePath: "candidate.md" },
        execution: { repetitions: 1, concurrency: 1 },
      },
      baseline: {
        datasetId: "test-dataset",
        runs: [],
        caseSummaries: [],
      },
      candidate: {
        datasetId: "test-dataset",
        runs: [],
        caseSummaries: [],
      },
      comparisons: [],
      completedAt: "2026-08-01T12:00:00.000Z",
    } satisfies ScenarioDatasetExperimentResult;

    const filePath = await writeScenarioDatasetExperiment(
      result,
      directory,
    );
    const persisted = JSON.parse(
      await readFile(filePath, "utf8"),
    );

    expect(persisted).toEqual(result);
  });
});
