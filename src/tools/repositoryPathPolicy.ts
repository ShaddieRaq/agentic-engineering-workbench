import { realpath } from "node:fs/promises";
import {
  isAbsolute,
  relative,
  resolve,
  sep,
} from "node:path";
import { ToolPermissionError } from "./toolPermissionError.js";

export const defaultDeniedPathSegments = [
  ".git",
  ".env",
  "node_modules",
  "runs",
] as const;

export interface RepositoryPathPolicy {
  allowedRoot: string;
  deniedPathSegments?: readonly string[];
}

export interface AllowedRepositoryPath {
  allowedRoot: string;
  target: string;
  relativePath: string;
}

function isWithinRoot(root: string, target: string): boolean {
  const relativePath = relative(root, target);

  return (
    relativePath === "" ||
    (!relativePath.startsWith(`..${sep}`) &&
      relativePath !== ".." &&
      !isAbsolute(relativePath))
  );
}

export function deniedSegmentsFor(
  policy: RepositoryPathPolicy,
): Set<string> {
  return new Set(
    policy.deniedPathSegments ?? defaultDeniedPathSegments,
  );
}

export async function resolveAllowedRepositoryPath(
  policy: RepositoryPathPolicy,
  requestedPath: string,
): Promise<AllowedRepositoryPath> {
  const allowedRoot = await realpath(policy.allowedRoot);
  const lexicalTarget = resolve(allowedRoot, requestedPath);

  if (!isWithinRoot(allowedRoot, lexicalTarget)) {
    throw new ToolPermissionError(
      "Requested path is outside the allowed root.",
    );
  }

  const relativePath = relative(allowedRoot, lexicalTarget);
  const requestedSegments = relativePath === ""
    ? []
    : relativePath.split(sep);
  const deniedPathSegments = deniedSegmentsFor(policy);

  if (
    requestedSegments.some((segment) =>
      deniedPathSegments.has(segment),
    )
  ) {
    throw new ToolPermissionError(
      "Requested path is denied by tool policy.",
    );
  }

  const target = await realpath(lexicalTarget);

  if (!isWithinRoot(allowedRoot, target)) {
    throw new ToolPermissionError(
      "Requested path resolves outside the allowed root.",
    );
  }

  return {
    allowedRoot,
    target,
    relativePath: relative(allowedRoot, target),
  };
}
