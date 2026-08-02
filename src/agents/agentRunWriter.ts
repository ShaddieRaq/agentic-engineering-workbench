import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  agentRunResultSchema,
  type AgentRunResult,
} from "./agentRunResult.js";

export async function writeAgentRun(
  result: AgentRunResult,
  runsDirectory = "runs",
): Promise<string> {
  const validated = agentRunResultSchema.parse(result);
  await mkdir(runsDirectory, { recursive: true });
  const path = join(runsDirectory, `agent-run-${validated.agentRunId}.json`);
  await writeFile(path, JSON.stringify(validated, null, 2), "utf8");
  return path;
}
