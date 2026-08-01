import { z } from "zod";

export const modelBasedJudgeOutputSchema = z
  .object({
    verdict: z.enum(["pass", "fail", "uncertain"]),
    score: z.number().int().min(0).max(100),
    rationale: z.string().min(1),
    criteria: z.array(
      z.object({
        criterion: z.string().min(1),
        passed: z.boolean(),
        evidence: z.string().min(1),
      }).strict(),
    ).min(1),
  })
  .strict();

export type ModelBasedJudgeOutput = z.infer<
  typeof modelBasedJudgeOutputSchema
>;

export const modelBasedEvaluatorConfigSchema = z
  .object({
    evaluatorId: z.string().min(1).default("model-technical-quality"),
    promptVersion: z.string().min(1).default("technical-quality-v1"),
    criteria: z.array(z.string().min(1)).min(1),
  })
  .strict();

export type ModelBasedEvaluatorConfig = z.input<
  typeof modelBasedEvaluatorConfigSchema
>;
