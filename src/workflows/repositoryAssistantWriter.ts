import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { RepositoryAssistantWorkflowResult } from "./repositoryAssistantWorkflow.js";

export async function writeRepositoryAssistantRun(
  result: RepositoryAssistantWorkflowResult,
  runsDirectory = "runs",
): Promise<string> {
  await mkdir(runsDirectory, { recursive: true });
  const filePath = join(
    runsDirectory,
    `assistant-run-${result.workflowRunId}.json`,
  );
  await writeFile(filePath, JSON.stringify(result, null, 2), "utf8");
  return filePath;
}
