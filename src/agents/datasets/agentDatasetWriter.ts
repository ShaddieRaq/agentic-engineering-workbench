import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  agentDatasetRunResultSchema,
  type AgentDatasetRunResult,
} from "./agentDatasetRunner.js";

export async function writeAgentDatasetRun(
  result: AgentDatasetRunResult,
  runsDirectory = "runs",
): Promise<string> {
  const validated = agentDatasetRunResultSchema.parse(result);
  await mkdir(runsDirectory, { recursive: true });
  const path = join(
    runsDirectory,
    `agent-dataset-run-${validated.datasetRunId}.json`,
  );
  await writeFile(path, JSON.stringify(validated, null, 2), "utf8");
  return path;
}
