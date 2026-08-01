import { basename } from "node:path";
import { z } from "zod";
import { createReadFileTool } from "./readFileTool.js";
import type { ToolDefinition } from "./toolDefinition.js";

export const inspectPackageInputSchema = z
  .object({
    path: z
      .string()
      .min(1)
      .default("package.json")
      .refine((value) => basename(value) === "package.json", {
        message: "Package metadata path must target package.json.",
      }),
    maxBytes: z.number().int().positive().max(1_000_000).default(65_536),
  })
  .strict();

const dependencyMapSchema = z.record(z.string(), z.string());

export const inspectPackageOutputSchema = z
  .object({
    path: z.string().min(1),
    name: z.string().nullable(),
    version: z.string().nullable(),
    moduleType: z.enum(["module", "commonjs"]).nullable(),
    scripts: dependencyMapSchema,
    dependencies: dependencyMapSchema,
    devDependencies: dependencyMapSchema,
  })
  .strict();

const packageManifestSchema = z
  .object({
    name: z.string().optional(),
    version: z.string().optional(),
    type: z.enum(["module", "commonjs"]).optional(),
    scripts: dependencyMapSchema.optional(),
    dependencies: dependencyMapSchema.optional(),
    devDependencies: dependencyMapSchema.optional(),
  })
  .passthrough();

export type InspectPackageInput = z.infer<
  typeof inspectPackageInputSchema
>;
export type InspectPackageOutput = z.infer<
  typeof inspectPackageOutputSchema
>;

export interface InspectPackageToolOptions {
  allowedRoot: string;
  maximumBytes?: number;
  deniedPathSegments?: string[];
}

function sortedRecord(
  value: Record<string, string> | undefined,
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(value ?? {}).sort(([left], [right]) =>
      left.localeCompare(right),
    ),
  );
}

export function createInspectPackageTool(
  options: InspectPackageToolOptions,
): ToolDefinition<InspectPackageInput, InspectPackageOutput> {
  const readFileTool = createReadFileTool(options);

  return {
    id: "inspect-package",
    description:
      "Read validated project, script, and dependency metadata from package.json.",
    inputSchema: inspectPackageInputSchema,
    outputSchema: inspectPackageOutputSchema,
    async execute(input): Promise<InspectPackageOutput> {
      const file = await readFileTool.execute(input);
      const manifest = packageManifestSchema.parse(
        JSON.parse(file.content),
      );

      return {
        path: file.path,
        name: manifest.name ?? null,
        version: manifest.version ?? null,
        moduleType: manifest.type ?? null,
        scripts: sortedRecord(manifest.scripts),
        dependencies: sortedRecord(manifest.dependencies),
        devDependencies: sortedRecord(manifest.devDependencies),
      };
    },
  };
}
