import { readFile } from "node:fs/promises";
import { taskSpecSchema, type TaskSpec } from "./taskSpec.js";

export async function loadTask(
  id: string,
  filePath: string,
): Promise<TaskSpec> {
  const instruction = await readFile(filePath, "utf8");

  return taskSpecSchema.parse({
    id,
    instruction: instruction.trim(),
  });
}