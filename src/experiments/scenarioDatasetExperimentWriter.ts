import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { ScenarioDatasetExperimentResult } from "./scenarioDatasetExperimentRunner.js";

export async function writeScenarioDatasetExperiment(
  result: ScenarioDatasetExperimentResult,
  runsDirectory = "runs",
): Promise<string> {
  await mkdir(runsDirectory, { recursive: true });

  const filePath = join(
    runsDirectory,
    `experiment-run-${randomUUID()}.json`,
  );

  await writeFile(
    filePath,
    JSON.stringify(result, null, 2),
    "utf8",
  );

  return filePath;
}
