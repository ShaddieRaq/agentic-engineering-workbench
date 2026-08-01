import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { ScenarioDatasetRunResult } from "./scenarioDatasetRunner.js";

export async function writeScenarioDatasetRun(
  result: ScenarioDatasetRunResult,
  runsDirectory = "runs",
): Promise<string> {
  await mkdir(runsDirectory, { recursive: true });

  const filePath = join(
    runsDirectory,
    `dataset-run-${randomUUID()}.json`,
  );

  await writeFile(
    filePath,
    JSON.stringify(result, null, 2),
    "utf8",
  );

  return filePath;
}
