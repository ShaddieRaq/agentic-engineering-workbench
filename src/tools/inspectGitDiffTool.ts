import { execFile } from "node:child_process";
import { realpath } from "node:fs/promises";
import { z } from "zod";
import type { ToolDefinition } from "./toolDefinition.js";
import { ToolPermissionError } from "./toolPermissionError.js";
import { ToolTimeoutError } from "./toolTimeoutError.js";
import { deniedSegmentsFor } from "./repositoryPathPolicy.js";

export const inspectGitDiffInputSchema = z
  .object({
    mode: z.enum(["working-tree", "staged"]).default("working-tree"),
    contextLines: z.number().int().min(0).max(20).default(3),
    maxBytes: z.number().int().positive().max(1_000_000).default(65_536),
  })
  .strict();

export const inspectGitDiffOutputSchema = z
  .object({
    mode: z.enum(["working-tree", "staged"]),
    diff: z.string(),
    sizeBytes: z.number().int().nonnegative(),
    empty: z.boolean(),
    untrackedPaths: z.array(z.string().min(1)),
  })
  .strict();

export type InspectGitDiffInput = z.infer<
  typeof inspectGitDiffInputSchema
>;
export type InspectGitDiffOutput = z.infer<
  typeof inspectGitDiffOutputSchema
>;

export interface GitDiffInvocation {
  cwd: string;
  args: string[];
  timeoutMs: number;
  maximumBytes: number;
}

export type GitDiffRunner = (
  invocation: GitDiffInvocation,
) => Promise<Buffer>;

export interface InspectGitDiffToolOptions {
  allowedRoot: string;
  maximumBytes?: number;
  timeoutMs?: number;
  deniedPathSegments?: string[];
  runGit?: GitDiffRunner;
}

function runGitDiff({
  cwd,
  args,
  timeoutMs,
  maximumBytes,
}: GitDiffInvocation): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    execFile(
      "git",
      args,
      {
        cwd,
        encoding: "buffer",
        maxBuffer: maximumBytes + 1,
        timeout: timeoutMs,
      },
      (error, stdout) => {
        if (error) {
          const processError = error as NodeJS.ErrnoException & {
            killed?: boolean;
            signal?: NodeJS.Signals;
          };

          if (processError.code === "ERR_CHILD_PROCESS_STDIO_MAXBUFFER") {
            reject(
              new ToolPermissionError(
                `Git diff exceeds the ${maximumBytes}-byte limit.`,
              ),
            );
            return;
          }

          if (processError.killed || processError.signal === "SIGTERM") {
            reject(
              new ToolTimeoutError(
                `Git diff exceeded the ${timeoutMs}-millisecond deadline.`,
              ),
            );
            return;
          }

          reject(error);
          return;
        }

        resolve(stdout);
      },
    );
  });
}

export function createInspectGitDiffTool(
  options: InspectGitDiffToolOptions,
): ToolDefinition<InspectGitDiffInput, InspectGitDiffOutput> {
  const maximumBytes = options.maximumBytes ?? 65_536;
  const timeoutMs = options.timeoutMs ?? 5_000;
  const runner = options.runGit ?? runGitDiff;

  if (!Number.isInteger(maximumBytes) || maximumBytes < 1) {
    throw new Error("maximumBytes must be a positive integer.");
  }

  if (!Number.isInteger(timeoutMs) || timeoutMs < 1) {
    throw new Error("timeoutMs must be a positive integer.");
  }

  return {
    id: "inspect-git-diff",
    description:
      "Inspect a bounded working-tree or staged Git diff without accepting shell commands.",
    inputSchema: inspectGitDiffInputSchema,
    outputSchema: inspectGitDiffOutputSchema,
    async execute(input): Promise<InspectGitDiffOutput> {
      const allowedRoot = await realpath(options.allowedRoot);
      const byteLimit = Math.min(input.maxBytes, maximumBytes);
      const args = [
        "diff",
        "--no-ext-diff",
        "--no-textconv",
        "--no-color",
        `--unified=${input.contextLines}`,
        "--src-prefix=a/",
        "--dst-prefix=b/",
      ];

      if (input.mode === "staged") {
        args.push("--cached");
      }

      args.push("--");

      const output = await runner({
        cwd: allowedRoot,
        args,
        timeoutMs,
        maximumBytes: byteLimit,
      });

      const untrackedOutput = input.mode === "working-tree"
        ? await runner({
            cwd: allowedRoot,
            args: [
              "ls-files",
              "--others",
              "--exclude-standard",
              "-z",
              "--",
            ],
            timeoutMs,
            maximumBytes: byteLimit,
          })
        : Buffer.alloc(0);

      if (output.byteLength + untrackedOutput.byteLength > byteLimit) {
        throw new ToolPermissionError(
          `Git change evidence exceeds the ${byteLimit}-byte limit.`,
        );
      }

      const diff = new TextDecoder("utf-8", { fatal: true }).decode(output);
      const untrackedText = new TextDecoder("utf-8", { fatal: true }).decode(
        untrackedOutput,
      );
      const deniedPathSegments = deniedSegmentsFor(
        options.deniedPathSegments === undefined
          ? { allowedRoot }
          : {
              allowedRoot,
              deniedPathSegments: options.deniedPathSegments,
            },
      );
      const untrackedPaths = untrackedText
        .split("\0")
        .filter(Boolean)
        .filter((path) =>
          !path.split("/").some((segment) =>
            deniedPathSegments.has(segment),
          ),
        )
        .sort((left, right) => left.localeCompare(right));

      return {
        mode: input.mode,
        diff,
        sizeBytes: output.byteLength,
        empty: output.byteLength === 0 && untrackedPaths.length === 0,
        untrackedPaths,
      };
    },
  };
}
