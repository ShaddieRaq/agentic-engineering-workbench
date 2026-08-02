import { FileArtifactStore } from "../artifacts/fileArtifactStore.js";
import type { AgentRunResult } from "./agentRunResult.js";

export async function writeAgentRun(
  result: AgentRunResult,
  runsDirectory = "runs",
): Promise<string> {
  return (await new FileArtifactStore(runsDirectory).saveAgentRun(result)).path;
}
