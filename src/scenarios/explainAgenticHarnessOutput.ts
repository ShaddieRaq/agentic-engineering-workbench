import { z } from "zod";

export const explainAgenticHarnessOutputSchema = z
  .object({
    definition: z.string().min(1),
    responsibilities: z.array(z.string().min(1)).min(1),
    modelBoundary: z.string().min(1),
    practicalExample: z.string().min(1),
  })
  .strict();

export type ExplainAgenticHarnessOutput = z.infer<
  typeof explainAgenticHarnessOutputSchema
>;