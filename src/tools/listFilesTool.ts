import { readdir, stat } from "node:fs/promises";
import { relative, resolve } from "node:path";
import { z } from "zod";
import type { ToolDefinition } from "./toolDefinition.js";
import {
  deniedSegmentsFor,
  resolveAllowedRepositoryPath,
} from "./repositoryPathPolicy.js";

export const listFilesInputSchema = z
  .object({
    path: z.string().min(1).default("."),
    maxEntries: z.number().int().positive().max(100).default(50),
  })
  .strict();

const listFilesEntrySchema = z
  .object({
    path: z.string().min(1),
    type: z.enum([
      "file",
      "directory",
      "symbolic-link",
      "other",
    ]),
  })
  .strict();

export const listFilesOutputSchema = z
  .object({
    entries: z.array(listFilesEntrySchema),
    truncated: z.boolean(),
  })
  .strict();

export type ListFilesInput = z.infer<typeof listFilesInputSchema>;
export type ListFilesOutput = z.infer<typeof listFilesOutputSchema>;

export interface ListFilesToolOptions {
  allowedRoot: string;
  maximumEntries?: number;
  deniedPathSegments?: string[];
}

function entryType(entry: {
  isFile(): boolean;
  isDirectory(): boolean;
  isSymbolicLink(): boolean;
}): ListFilesOutput["entries"][number]["type"] {
  if (entry.isFile()) return "file";
  if (entry.isDirectory()) return "directory";
  if (entry.isSymbolicLink()) return "symbolic-link";
  return "other";
}

export function createListFilesTool(
  options: ListFilesToolOptions,
): ToolDefinition<ListFilesInput, ListFilesOutput> {
  const maximumEntries = options.maximumEntries ?? 100;
  const deniedPathSegments = deniedSegmentsFor(options);

  if (!Number.isInteger(maximumEntries) || maximumEntries < 1) {
    throw new Error("maximumEntries must be a positive integer.");
  }

  return {
    id: "list-files",
    description:
      "List immediate files and directories within the allowed repository root.",
    inputSchema: listFilesInputSchema,
    outputSchema: listFilesOutputSchema,
    async execute(input): Promise<ListFilesOutput> {
      const { allowedRoot, target } =
        await resolveAllowedRepositoryPath(options, input.path);

      const targetStats = await stat(target);

      if (!targetStats.isDirectory()) {
        throw new Error("Requested path is not a directory.");
      }

      const entries = (await readdir(target, { withFileTypes: true }))
        .filter((entry) => !deniedPathSegments.has(entry.name))
        .sort((left, right) => left.name.localeCompare(right.name))
        .map((entry) => ({
          path: relative(allowedRoot, resolve(target, entry.name)),
          type: entryType(entry),
        }));
      const limit = Math.min(input.maxEntries, maximumEntries);

      return {
        entries: entries.slice(0, limit),
        truncated: entries.length > limit,
      };
    },
  };
}
