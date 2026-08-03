import { z } from "zod";

const uniqueStrings = z
  .array(z.string().min(1).max(200))
  .min(1)
  .max(30)
  .refine((values) => new Set(values).size === values.length, {
    message: "Policy values must be unique.",
  });

export const documentationAuditorPolicySchema = z
  .object({
    instructions: z
      .object({
        roleLines: uniqueStrings.max(20),
        defaultTaskInstruction: z.string().min(1).max(2_000),
      })
      .strict(),
    contextSelection: z
      .object({
        documentationExtensions: uniqueStrings,
        sourceExtensions: uniqueStrings,
        manifestNames: uniqueStrings,
        sourcePathPrefix: z
          .string()
          .min(1)
          .max(200)
          .regex(/^[a-zA-Z0-9._/-]+\/$/)
          .refine((value) => !value.split("/").includes(".."), {
            message: "Source path prefix cannot contain traversal segments.",
          }),
        defaultMaximumFiles: z.number().int().min(2).max(30),
        documentFraction: z.number().min(0.25).max(0.75),
        maximumManifestFiles: z.number().int().min(1).max(10),
        maximumContextBytes: z.number().int().min(1).max(262_144),
        perFileMaximumBytes: z.number().int().min(1).max(32_768),
      })
      .strict(),
  })
  .strict();

export type DocumentationAuditorPolicy = z.infer<
  typeof documentationAuditorPolicySchema
>;

export const documentationAuditorBaselinePolicy =
  documentationAuditorPolicySchema.parse({
    instructions: {
      roleLines: [
        "You are a repository documentation auditor.",
        "Use only the supplied repository files.",
        "Find stale commands, inconsistent claims, missing documentation, and confirmed accurate documentation.",
        "Every finding and coverage gap must cite exact Source paths from the supplied context.",
        "Do not infer that an absent file or command exists.",
        "Prioritize concrete, actionable changes.",
      ],
      defaultTaskInstruction:
        "Audit this repository's documentation for stale, inconsistent, missing, and accurate guidance.",
    },
    contextSelection: {
      documentationExtensions: [".md", ".mdx", ".rst"],
      sourceExtensions: [
        ".ts",
        ".tsx",
        ".js",
        ".jsx",
        ".py",
        ".go",
        ".rs",
        ".java",
        ".cs",
      ],
      manifestNames: [
        "package.json",
        "pyproject.toml",
        "Cargo.toml",
        "go.mod",
        "pom.xml",
        "README.md",
      ],
      sourcePathPrefix: "src/",
      defaultMaximumFiles: 16,
      documentFraction: 0.5,
      maximumManifestFiles: 4,
      maximumContextBytes: 131_072,
      perFileMaximumBytes: 32_768,
    },
  });
