import { z } from "zod";

export const evaluationResultSchema = z
  .object({
    evaluatorId: z.string().min(1),
    passed: z.boolean(),
    message: z.string().min(1),
  })
  .strict();

export type EvaluationResult = z.infer<typeof evaluationResultSchema>;
