import { z } from "zod";

const evidencePathsSchema = z.array(z.string().min(1)).min(1);

export const repositoryAnalysisOutputSchema = z
  .object({
    overview: z.string().min(1),
    architectureComponents: z
      .array(
        z
          .object({
            component: z.string().min(1),
            responsibility: z.string().min(1),
            evidencePaths: evidencePathsSchema,
          })
          .strict(),
      )
      .min(1),
    entryPoints: z.array(
      z
        .object({
          path: z.string().min(1),
          purpose: z.string().min(1),
          evidencePaths: evidencePathsSchema,
        })
        .strict(),
    ),
    risks: z.array(
      z
        .object({
          risk: z.string().min(1),
          evidencePaths: evidencePathsSchema,
        })
        .strict(),
    ),
    recommendedTests: z
      .array(
        z
          .object({
            test: z.string().min(1),
            rationale: z.string().min(1),
            evidencePaths: evidencePathsSchema,
          })
          .strict(),
      )
      .min(1),
  })
  .strict();

export type RepositoryAnalysisOutput = z.infer<
  typeof repositoryAnalysisOutputSchema
>;
