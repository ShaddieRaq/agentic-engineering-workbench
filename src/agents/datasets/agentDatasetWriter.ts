import { FileArtifactStore } from "../../artifacts/fileArtifactStore.js";
import type { AgentDatasetRunResult } from "./agentDatasetRunner.js";

export async function writeAgentDatasetRun(
  result: AgentDatasetRunResult,
  runsDirectory = "runs",
): Promise<string> {
  return (
    await new FileArtifactStore(runsDirectory).saveAgentDatasetRun(result)
  ).path;
}
