import { readdir, stat } from "node:fs/promises";
import { extname, relative, resolve } from "node:path";
import { z } from "zod";
import { deniedSegmentsFor, resolveAllowedRepositoryPath } from "./repositoryPathPolicy.js";
import type { ToolDefinition } from "./toolDefinition.js";
import { ToolTimeoutError } from "./toolTimeoutError.js";

export const fileInventoryInputSchema = z
  .object({
    path: z.string().min(1).default("."),
    extensions: z.array(z.string().regex(/^\.[a-zA-Z0-9]+$/)).max(30).default([]),
    maxFiles: z.number().int().positive().max(2_000).default(500),
    maxDepth: z.number().int().nonnegative().max(20).default(8),
  })
  .strict();

const fileInventoryEntrySchema = z
  .object({
    path: z.string().min(1),
    extension: z.string(),
    sizeBytes: z.number().int().nonnegative(),
  })
  .strict();

export const fileInventoryOutputSchema = z
  .object({
    entries: z.array(fileInventoryEntrySchema),
    filesObserved: z.number().int().nonnegative(),
    directoriesVisited: z.number().int().nonnegative(),
    truncated: z.boolean(),
  })
  .strict();

export type FileInventoryInput = z.infer<typeof fileInventoryInputSchema>;
export type FileInventoryOutput = z.infer<typeof fileInventoryOutputSchema>;

export interface FileInventoryToolOptions {
  allowedRoot: string;
  deniedPathSegments?: string[];
  maximumFiles?: number;
  maximumOutputBytes?: number;
  timeoutMs?: number;
}

export function createFileInventoryTool(
  options: FileInventoryToolOptions,
): ToolDefinition<FileInventoryInput, FileInventoryOutput> {
  const maximumFiles = options.maximumFiles ?? 2_000;
  const maximumOutputBytes = options.maximumOutputBytes ?? 131_072;
  const timeoutMs = options.timeoutMs ?? 2_000;
  if (!Number.isInteger(maximumFiles) || maximumFiles < 1) throw new Error("maximumFiles must be a positive integer.");
  if (!Number.isInteger(maximumOutputBytes) || maximumOutputBytes < 1) throw new Error("maximumOutputBytes must be a positive integer.");
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1) throw new Error("timeoutMs must be a positive integer.");

  return {
    id: "file-inventory",
    description: "Recursively inventory repository files without reading their contents.",
    inputSchema: fileInventoryInputSchema,
    outputSchema: fileInventoryOutputSchema,
    async execute(input) {
      const resolved = await resolveAllowedRepositoryPath(options, input.path);
      const denied = deniedSegmentsFor(options);
      const extensionFilter = new Set(input.extensions.map((value) => value.toLowerCase()));
      const limit = Math.min(input.maxFiles, maximumFiles);
      const deadline = performance.now() + timeoutMs;
      const entries: FileInventoryOutput["entries"] = [];
      let filesObserved = 0;
      let directoriesVisited = 0;
      let outputBytes = 0;
      let truncated = false;

      function checkDeadline() {
        if (performance.now() > deadline) {
          throw new ToolTimeoutError(`File inventory exceeded the ${timeoutMs}-millisecond deadline.`);
        }
      }

      async function visit(target: string, depth: number): Promise<void> {
        checkDeadline();
        if (truncated) return;
        const metadata = await stat(target);
        if (metadata.isFile()) {
          filesObserved += 1;
          const extension = extname(target).toLowerCase();
          if (extensionFilter.size > 0 && !extensionFilter.has(extension)) return;
          const entry = {
            path: relative(resolved.allowedRoot, target),
            extension,
            sizeBytes: metadata.size,
          };
          const bytes = Buffer.byteLength(JSON.stringify(entry));
          if (entries.length >= limit || outputBytes + bytes > maximumOutputBytes) {
            truncated = true;
            return;
          }
          entries.push(entry);
          outputBytes += bytes;
          return;
        }
        if (!metadata.isDirectory()) return;
        directoriesVisited += 1;
        if (depth >= input.maxDepth) {
          const children = await readdir(target, { withFileTypes: true });
          if (children.some((entry) => !entry.isSymbolicLink() && !denied.has(entry.name))) truncated = true;
          return;
        }
        const children = (await readdir(target, { withFileTypes: true }))
          .filter((entry) => !entry.isSymbolicLink() && !denied.has(entry.name))
          .sort((left, right) => left.name.localeCompare(right.name));
        for (const child of children) {
          await visit(resolve(target, child.name), depth + 1);
          if (truncated) break;
        }
      }

      await visit(resolved.target, 0);
      return { entries, filesObserved, directoriesVisited, truncated };
    },
  };
}
