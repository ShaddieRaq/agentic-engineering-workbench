import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { AgentModelMatrix } from "./agentModelMatrix.js";

export async function writeAgentModelMatrix(
  matrix: AgentModelMatrix,
  runsDirectory = "runs",
): Promise<string> {
  await mkdir(runsDirectory, { recursive: true });

  const filePath = join(runsDirectory, `model-matrix-${matrix.matrixId}.json`);

  await writeFile(filePath, JSON.stringify(matrix, null, 2), "utf8");

  return filePath;
}
