import { readFile, stat } from "node:fs/promises";
import { z } from "zod";
import type { ToolDefinition } from "./toolDefinition.js";
import { ToolPermissionError } from "./toolPermissionError.js";
import { resolveAllowedRepositoryPath } from "./repositoryPathPolicy.js";

export const readFileInputSchema = z
  .object({
    path: z.string().min(1),
    maxBytes: z.number().int().positive().max(1_000_000).default(32_768),
  })
  .strict();

export const readFileOutputSchema = z
  .object({
    path: z.string().min(1),
    content: z.string(),
    sizeBytes: z.number().int().nonnegative(),
  })
  .strict();

export type ReadFileInput = z.infer<typeof readFileInputSchema>;
export type ReadFileOutput = z.infer<typeof readFileOutputSchema>;

export interface ReadFileToolOptions {
  allowedRoot: string;
  maximumBytes?: number;
  deniedPathSegments?: string[];
}

export function createReadFileTool(
  options: ReadFileToolOptions,
): ToolDefinition<ReadFileInput, ReadFileOutput> {
  const maximumBytes = options.maximumBytes ?? 65_536;

  if (!Number.isInteger(maximumBytes) || maximumBytes < 1) {
    throw new Error("maximumBytes must be a positive integer.");
  }

  return {
    id: "read-file",
    description:
      "Read one UTF-8 text file within the allowed repository root.",
    inputSchema: readFileInputSchema,
    outputSchema: readFileOutputSchema,
    async execute(input): Promise<ReadFileOutput> {
      const resolved = await resolveAllowedRepositoryPath(
        options,
        input.path,
      );
      const fileStats = await stat(resolved.target);

      if (!fileStats.isFile()) {
        throw new Error("Requested path is not a file.");
      }

      const byteLimit = Math.min(input.maxBytes, maximumBytes);

      if (fileStats.size > byteLimit) {
        throw new ToolPermissionError(
          `Requested file exceeds the ${byteLimit}-byte limit.`,
        );
      }

      const buffer = await readFile(resolved.target);
      let content: string;

      try {
        content = new TextDecoder("utf-8", { fatal: true }).decode(buffer);
      } catch {
        throw new ToolPermissionError(
          "Requested file is not valid UTF-8 text.",
        );
      }

      if (content.includes("\0")) {
        throw new ToolPermissionError(
          "Requested file appears to contain binary content.",
        );
      }

      return {
        path: resolved.relativePath,
        content,
        sizeBytes: buffer.byteLength,
      };
    },
  };
}
