import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { AgentModelComparison } from "./agentModelComparison.js";

export async function writeAgentModelComparison(
  modelComparison: AgentModelComparison,
  runsDirectory = "runs",
): Promise<string> {
  await mkdir(runsDirectory, { recursive: true });

  const filePath = join(runsDirectory, `model-comparison-${modelComparison.modelComparisonId}.json`);

  await writeFile(filePath, JSON.stringify(modelComparison, null, 2), "utf8");

  return filePath;
}
