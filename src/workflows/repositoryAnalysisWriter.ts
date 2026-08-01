import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { RepositoryAnalysisRunResult } from "./repositoryAnalysisRunner.js";

export async function writeRepositoryAnalysis(
  result: RepositoryAnalysisRunResult,
  runsDirectory = "runs",
): Promise<string> {
  await mkdir(runsDirectory, { recursive: true });

  const filePath = join(
    runsDirectory,
    `analysis-run-${result.analysisRunId}.json`,
  );

  await writeFile(
    filePath,
    JSON.stringify(result, null, 2),
    "utf8",
  );

  return filePath;
}
