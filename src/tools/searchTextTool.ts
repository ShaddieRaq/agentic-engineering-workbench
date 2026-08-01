import { readFile, readdir, stat } from "node:fs/promises";
import { relative, resolve } from "node:path";
import { z } from "zod";
import {
  deniedSegmentsFor,
  resolveAllowedRepositoryPath,
} from "./repositoryPathPolicy.js";
import type { ToolDefinition } from "./toolDefinition.js";
import { ToolTimeoutError } from "./toolTimeoutError.js";

export const searchTextInputSchema = z
  .object({
    query: z
      .string()
      .min(1)
      .max(200)
      .refine((value) => !value.includes("\n"), {
        message: "Search query must be a single line.",
      }),
    path: z.string().min(1).default("."),
    caseSensitive: z.boolean().default(false),
    maxMatches: z.number().int().positive().max(100).default(50),
  })
  .strict();

const searchTextMatchSchema = z
  .object({
    path: z.string().min(1),
    line: z.number().int().positive(),
    column: z.number().int().positive(),
    preview: z.string(),
  })
  .strict();

export const searchTextOutputSchema = z
  .object({
    matches: z.array(searchTextMatchSchema),
    filesSearched: z.number().int().nonnegative(),
    truncated: z.boolean(),
  })
  .strict();

export type SearchTextInput = z.infer<typeof searchTextInputSchema>;
export type SearchTextOutput = z.infer<typeof searchTextOutputSchema>;

export interface SearchTextToolOptions {
  allowedRoot: string;
  deniedPathSegments?: string[];
  maximumMatches?: number;
  maximumFiles?: number;
  maximumFileBytes?: number;
  maximumOutputBytes?: number;
  timeoutMs?: number;
}

interface SearchState {
  filesSearched: number;
  matches: SearchTextOutput["matches"];
  outputBytes: number;
  truncated: boolean;
}

function assertPositiveInteger(value: number, name: string): void {
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`${name} must be a positive integer.`);
  }
}

export function createSearchTextTool(
  options: SearchTextToolOptions,
): ToolDefinition<SearchTextInput, SearchTextOutput> {
  const maximumMatches = options.maximumMatches ?? 100;
  const maximumFiles = options.maximumFiles ?? 500;
  const maximumFileBytes = options.maximumFileBytes ?? 262_144;
  const maximumOutputBytes = options.maximumOutputBytes ?? 65_536;
  const timeoutMs = options.timeoutMs ?? 2_000;

  assertPositiveInteger(maximumMatches, "maximumMatches");
  assertPositiveInteger(maximumFiles, "maximumFiles");
  assertPositiveInteger(maximumFileBytes, "maximumFileBytes");
  assertPositiveInteger(maximumOutputBytes, "maximumOutputBytes");
  assertPositiveInteger(timeoutMs, "timeoutMs");

  return {
    id: "search-text",
    description:
      "Search UTF-8 repository files for a literal single-line query.",
    inputSchema: searchTextInputSchema,
    outputSchema: searchTextOutputSchema,
    async execute(input): Promise<SearchTextOutput> {
      const resolved = await resolveAllowedRepositoryPath(
        options,
        input.path,
      );
      const deniedPathSegments = deniedSegmentsFor(options);
      const matchLimit = Math.min(
        input.maxMatches,
        maximumMatches,
      );
      const deadline = performance.now() + timeoutMs;
      const state: SearchState = {
        filesSearched: 0,
        matches: [],
        outputBytes: 0,
        truncated: false,
      };
      const needle = input.caseSensitive
        ? input.query
        : input.query.toLowerCase();

      function checkDeadline(): void {
        if (performance.now() > deadline) {
          throw new ToolTimeoutError(
            `Search exceeded the ${timeoutMs}-millisecond deadline.`,
          );
        }
      }

      async function searchFile(filePath: string): Promise<void> {
        checkDeadline();

        if (state.filesSearched >= maximumFiles) {
          state.truncated = true;
          return;
        }

        state.filesSearched += 1;
        const fileStats = await stat(filePath);

        if (!fileStats.isFile() || fileStats.size > maximumFileBytes) {
          return;
        }

        const buffer = await readFile(filePath);
        let content: string;

        try {
          content = new TextDecoder("utf-8", { fatal: true }).decode(buffer);
        } catch {
          return;
        }

        if (content.includes("\0")) return;

        const lines = content.split("\n");
        const repositoryPath = relative(
          resolved.allowedRoot,
          filePath,
        );

        for (const [lineIndex, rawLine] of lines.entries()) {
          const haystack = input.caseSensitive
            ? rawLine
            : rawLine.toLowerCase();
          let searchFrom = 0;

          while (searchFrom <= haystack.length - needle.length) {
            checkDeadline();
            const matchIndex = haystack.indexOf(needle, searchFrom);

            if (matchIndex === -1) break;

            const preview = rawLine.replace(/\r$/, "").slice(0, 200);
            const match = {
              path: repositoryPath,
              line: lineIndex + 1,
              column: matchIndex + 1,
              preview,
            };
            const matchBytes = Buffer.byteLength(
              `${match.path}:${match.line}:${match.column}:${match.preview}`,
            );

            if (
              state.matches.length >= matchLimit ||
              state.outputBytes + matchBytes > maximumOutputBytes
            ) {
              state.truncated = true;
              return;
            }

            state.matches.push(match);
            state.outputBytes += matchBytes;
            searchFrom = matchIndex + needle.length;
          }
        }
      }

      async function visit(target: string): Promise<void> {
        checkDeadline();

        if (state.truncated) return;

        const targetStats = await stat(target);

        if (targetStats.isFile()) {
          await searchFile(target);
          return;
        }

        if (!targetStats.isDirectory()) return;

        const entries = (await readdir(target, { withFileTypes: true }))
          .filter(
            (entry) =>
              !entry.isSymbolicLink() &&
              !deniedPathSegments.has(entry.name),
          )
          .sort((left, right) => left.name.localeCompare(right.name));

        for (const entry of entries) {
          await visit(resolve(target, entry.name));
          if (state.truncated) break;
        }
      }

      await visit(resolved.target);

      return {
        matches: state.matches,
        filesSearched: state.filesSearched,
        truncated: state.truncated,
      };
    },
  };
}
