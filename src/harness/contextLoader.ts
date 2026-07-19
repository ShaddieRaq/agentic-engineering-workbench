import { readFile } from "node:fs/promises";
import { contextItemSchema, type ContextItem } from "./contextItem.js";

export async function loadContextItem(
  id: string,
  filePath: string,
): Promise<ContextItem> {
  const content = await readFile(filePath, "utf8");

  return contextItemSchema.parse({
    id,
    source: filePath,
    content: content.trim(),
  });
}