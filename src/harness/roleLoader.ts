import { readFile } from "node:fs/promises";
import { roleSpecSchema, type RoleSpec } from "./roleSpec.js";

export async function loadRole(
  id: string,
  filePath: string,
): Promise<RoleSpec> {
  const instructions = await readFile(filePath, "utf8");

  return roleSpecSchema.parse({
    id,
    instructions: instructions.trim(),
  });
}