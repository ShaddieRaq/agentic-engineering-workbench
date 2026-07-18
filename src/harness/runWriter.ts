import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { HarnessResult } from "./harnessResult.js";

export async function writeRun(
  result: HarnessResult,
  runsDirectory = "runs",
): Promise<string> {
  await mkdir(runsDirectory, { recursive: true });

  const timestamp = result.completedAt.replaceAll(":", "-");
  const filePath = join(runsDirectory, `run-${timestamp}.json`);

  await writeFile(filePath, JSON.stringify(result, null, 2), "utf8");

  return filePath;
}