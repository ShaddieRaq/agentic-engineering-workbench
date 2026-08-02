import { lstat, readdir, readFile } from "node:fs/promises";
import { relative, resolve } from "node:path";
import { z } from "zod";
import {
  deniedSegmentsFor,
  resolveAllowedRepositoryPath,
} from "./repositoryPathPolicy.js";
import type { ToolDefinition } from "./toolDefinition.js";

export const dependencyVersionAuditorInputSchema = z
  .object({
    path: z.string().min(1).default("."),
    maxFiles: z.number().int().positive().max(2_000).default(200),
    maxTotalBytes: z
      .number()
      .int()
      .positive()
      .max(10_000_000)
      .default(1_000_000),
    maxDepth: z.number().int().nonnegative().max(20).default(8),
  })
  .strict();

const declarationSchema = z
  .object({
    path: z.string().min(1),
    sections: z.array(
      z.enum([
        "dependencies",
        "devDependencies",
        "peerDependencies",
        "optionalDependencies",
      ]),
    ),
  })
  .strict();

const dependencyVersionSchema = z
  .object({
    version: z.string().min(1),
    declarations: z.array(declarationSchema),
  })
  .strict();

const inconsistentDependencySchema = z
  .object({
    name: z.string().min(1),
    versions: z.array(dependencyVersionSchema).min(2),
  })
  .strict();

const malformedPackageSchema = z
  .object({
    path: z.string().min(1),
    reason: z.enum([
      "invalid-json",
      "invalid-dependency-metadata",
      "invalid-utf8",
    ]),
  })
  .strict();

export const dependencyVersionAuditorOutputSchema = z
  .object({
    rootPath: z.string(),
    scannedFiles: z.array(z.string().min(1)),
    malformedFiles: z.array(malformedPackageSchema),
    inconsistentDependencies: z.array(inconsistentDependencySchema),
    totalBytesRead: z.number().int().nonnegative(),
    truncated: z.boolean(),
  })
  .strict();

export type DependencyVersionAuditorInput = z.infer<
  typeof dependencyVersionAuditorInputSchema
>;
export type DependencyVersionAuditorOutput = z.infer<
  typeof dependencyVersionAuditorOutputSchema
>;

export interface DependencyVersionAuditorOptions {
  allowedRoot: string;
  deniedPathSegments?: string[];
  maximumFiles?: number;
  maximumTotalBytes?: number;
  maximumDepth?: number;
}

const dependencySections = [
  "dependencies",
  "devDependencies",
  "peerDependencies",
  "optionalDependencies",
] as const;

type DependencySection = (typeof dependencySections)[number];

const dependencyMapSchema = z.record(z.string(), z.string().min(1));
const packageManifestSchema = z
  .object({
    dependencies: dependencyMapSchema.optional(),
    devDependencies: dependencyMapSchema.optional(),
    peerDependencies: dependencyMapSchema.optional(),
    optionalDependencies: dependencyMapSchema.optional(),
  })
  .passthrough();

type DeclarationIndex = Map<
  string,
  Map<string, Map<string, Set<DependencySection>>>
>;

function sortedStrings(values: Iterable<string>): string[] {
  return [...values].sort((left, right) => left.localeCompare(right));
}

function recordDeclaration(
  index: DeclarationIndex,
  dependency: string,
  version: string,
  path: string,
  section: DependencySection,
): void {
  const versions = index.get(dependency) ?? new Map();
  const declarations = versions.get(version) ?? new Map();
  const sections = declarations.get(path) ?? new Set();

  sections.add(section);
  declarations.set(path, sections);
  versions.set(version, declarations);
  index.set(dependency, versions);
}

function buildFindings(
  index: DeclarationIndex,
): DependencyVersionAuditorOutput["inconsistentDependencies"] {
  return sortedStrings(index.keys()).flatMap((name) => {
    const versions = index.get(name)!;
    if (versions.size < 2) return [];

    return [{
      name,
      versions: sortedStrings(versions.keys()).map((version) => ({
        version,
        declarations: sortedStrings(versions.get(version)!.keys()).map(
          (path) => ({
            path,
            sections: sortedStrings(
              versions.get(version)!.get(path)!,
            ) as DependencySection[],
          }),
        ),
      })),
    }];
  });
}

export function createDependencyVersionAuditorTool(
  options: DependencyVersionAuditorOptions,
): ToolDefinition<
  DependencyVersionAuditorInput,
  DependencyVersionAuditorOutput
> {
  const maximumFiles = options.maximumFiles ?? 2_000;
  const maximumTotalBytes = options.maximumTotalBytes ?? 10_000_000;
  const maximumDepth = options.maximumDepth ?? 20;

  for (const [name, value] of Object.entries({
    maximumFiles,
    maximumTotalBytes,
  })) {
    if (!Number.isInteger(value) || value < 1) {
      throw new Error(`${name} must be a positive integer.`);
    }
  }
  if (!Number.isInteger(maximumDepth) || maximumDepth < 0) {
    throw new Error("maximumDepth must be a non-negative integer.");
  }

  return {
    id: "dependency-version-auditor",
    description:
      "Find inconsistent dependency versions across bounded workspace package.json files.",
    inputSchema: dependencyVersionAuditorInputSchema,
    outputSchema: dependencyVersionAuditorOutputSchema,
    async execute(input): Promise<DependencyVersionAuditorOutput> {
      const resolved = await resolveAllowedRepositoryPath(options, input.path);
      const rootMetadata = await lstat(resolved.target);
      if (!rootMetadata.isDirectory()) {
        throw new Error("Dependency version audit path must be a directory.");
      }

      const fileLimit = Math.min(input.maxFiles, maximumFiles);
      const byteLimit = Math.min(input.maxTotalBytes, maximumTotalBytes);
      const depthLimit = Math.min(input.maxDepth, maximumDepth);
      const denied = deniedSegmentsFor(options);
      const decoder = new TextDecoder("utf-8", { fatal: true });
      const declarations: DeclarationIndex = new Map();
      const scannedFiles: string[] = [];
      const malformedFiles: DependencyVersionAuditorOutput["malformedFiles"] = [];
      let totalBytesRead = 0;
      let truncated = false;

      async function inspectPackageJson(target: string): Promise<void> {
        if (scannedFiles.length >= fileLimit) {
          truncated = true;
          return;
        }

        const metadata = await lstat(target);
        if (!metadata.isFile()) return;
        if (totalBytesRead + metadata.size > byteLimit) {
          truncated = true;
          return;
        }

        const content = await readFile(target);
        totalBytesRead += content.byteLength;
        const path = relative(resolved.allowedRoot, target);
        scannedFiles.push(path);

        let text: string;
        try {
          text = decoder.decode(content);
        } catch {
          malformedFiles.push({ path, reason: "invalid-utf8" });
          return;
        }

        let value: unknown;
        try {
          value = JSON.parse(text);
        } catch {
          malformedFiles.push({ path, reason: "invalid-json" });
          return;
        }

        const parsed = packageManifestSchema.safeParse(value);
        if (!parsed.success) {
          malformedFiles.push({
            path,
            reason: "invalid-dependency-metadata",
          });
          return;
        }

        for (const section of dependencySections) {
          for (const [dependency, version] of Object.entries(
            parsed.data[section] ?? {},
          )) {
            recordDeclaration(
              declarations,
              dependency,
              version,
              path,
              section,
            );
          }
        }
      }

      async function visit(target: string, depth: number): Promise<void> {
        if (truncated) return;
        const entries = (await readdir(target, { withFileTypes: true }))
          .sort((left, right) => left.name.localeCompare(right.name));

        for (const entry of entries) {
          if (truncated) return;
          if (entry.isSymbolicLink() || denied.has(entry.name)) continue;
          const child = resolve(target, entry.name);

          if (entry.isFile() && entry.name === "package.json") {
            await inspectPackageJson(child);
          } else if (entry.isDirectory()) {
            if (depth >= depthLimit) {
              truncated = true;
              return;
            }
            await visit(child, depth + 1);
          }
        }
      }

      await visit(resolved.target, 0);

      return {
        rootPath: resolved.relativePath,
        scannedFiles: sortedStrings(scannedFiles),
        malformedFiles: malformedFiles.sort((left, right) =>
          left.path.localeCompare(right.path),
        ),
        inconsistentDependencies: buildFindings(declarations),
        totalBytesRead,
        truncated,
      };
    },
  };
}
