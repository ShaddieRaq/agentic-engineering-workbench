import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { HarnessRunReplayResult } from "./harnessRunReplay.js";

export async function writeHarnessRunReplay(
  result: HarnessRunReplayResult,
  runsDirectory = "runs",
): Promise<string> {
  await mkdir(runsDirectory, { recursive: true });
  const path = join(runsDirectory, `replay-${result.replayId}.json`);
  await writeFile(path, JSON.stringify(result, null, 2), "utf8");
  return path;
}
