import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { ScenarioDatasetRunResult } from "../src/datasets/scenarioDatasetRunner.js";
import { writeScenarioDatasetRun } from "../src/datasets/scenarioDatasetRunWriter.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  );
});

describe("writeScenarioDatasetRun", () => {
  it("preserves case-linked run evidence and summaries", async () => {
    const runsDirectory = await mkdtemp(
      join(tmpdir(), "dataset-runs-"),
    );
    temporaryDirectories.push(runsDirectory);
    const result: ScenarioDatasetRunResult = {
      datasetId: "test-dataset",
      runs: [],
      caseSummaries: [
        {
          datasetCaseId: "test-case",
          totalRuns: 0,
          passedRuns: 0,
          failedRuns: 0,
          passRate: null,
        },
      ],
    };

    const filePath = await writeScenarioDatasetRun(
      result,
      runsDirectory,
    );
    const persisted = JSON.parse(
      await readFile(filePath, "utf8"),
    );

    expect(persisted).toEqual(result);
  });
});
