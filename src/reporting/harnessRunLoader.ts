import { readFile, realpath, stat } from "node:fs/promises";
import { relative, resolve } from "node:path";
import { ZodError } from "zod";
import {
  harnessResultSchema,
  type HarnessResult,
} from "../harness/harnessResult.js";

export interface HarnessRunLoaderOptions {
  allowedRoot: string;
  maximumBytes?: number;
}

export interface RejectedHarnessRunArtifact {
  path: string;
  reason: string;
}

export interface HarnessRunCollection {
  runs: HarnessResult[];
  acceptedPaths: string[];
  rejectedArtifacts: RejectedHarnessRunArtifact[];
}

function describeLoadFailure(error: unknown): string {
  if (error instanceof ZodError) {
    const visibleIssues = error.issues
      .slice(0, 5)
      .map(({ path, message }) => `${path.join(".") || "<root>"}: ${message}`);
    const remaining = error.issues.length - visibleIssues.length;
    const suffix = remaining > 0 ? `; ${remaining} more issue(s)` : "";

    return `Artifact does not match the current HarnessResult schema: ${visibleIssues.join("; ")}${suffix}`;
  }

  if (error instanceof SyntaxError) {
    return "Artifact is not valid JSON.";
  }

  return error instanceof Error ? error.message : String(error);
}

export async function loadHarnessRun(
  path: string,
  options: HarnessRunLoaderOptions,
): Promise<HarnessResult> {
  const maximumBytes = options.maximumBytes ?? 1_000_000;

  if (!Number.isInteger(maximumBytes) || maximumBytes < 1) {
    throw new Error("maximumBytes must be a positive integer.");
  }

  const allowedRoot = await realpath(options.allowedRoot);
  const candidate = await realpath(resolve(allowedRoot, path));
  const relativePath = relative(allowedRoot, candidate);

  if (
    relativePath === "" ||
    relativePath.startsWith("..") ||
    relativePath.includes("/../")
  ) {
    throw new Error("Run path must resolve to a file inside the allowed root.");
  }

  const fileStat = await stat(candidate);

  if (!fileStat.isFile()) {
    throw new Error("Run path must reference a file.");
  }

  if (fileStat.size > maximumBytes) {
    throw new Error(`Run artifact exceeds the ${maximumBytes}-byte limit.`);
  }

  const content = await readFile(candidate, "utf8");
  return harnessResultSchema.parse(JSON.parse(content));
}

export async function loadHarnessRuns(
  paths: readonly string[],
  options: HarnessRunLoaderOptions,
): Promise<HarnessRunCollection> {
  const runs: HarnessResult[] = [];
  const acceptedPaths: string[] = [];
  const rejectedArtifacts: RejectedHarnessRunArtifact[] = [];

  for (const path of paths) {
    try {
      runs.push(await loadHarnessRun(path, options));
      acceptedPaths.push(path);
    } catch (error: unknown) {
      rejectedArtifacts.push({
        path,
        reason: describeLoadFailure(error),
      });
    }
  }

  return { runs, acceptedPaths, rejectedArtifacts };
}
