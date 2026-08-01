import { z, type ZodType } from "zod";

export const aiProviderUsageSchema = z
  .object({
    inputTokens: z.number().int().nonnegative(),
    cachedInputTokens: z.number().int().nonnegative(),
    outputTokens: z.number().int().nonnegative(),
    reasoningTokens: z.number().int().nonnegative(),
    totalTokens: z.number().int().nonnegative(),
  })
  .strict();

export const aiProviderEvidenceSchema = z
  .object({
    model: z.string().min(1),
    usage: aiProviderUsageSchema.nullable(),
  })
  .strict();

export interface AIProviderRequest<TOutput = unknown> {
    prompt: string;
    outputSchema?: ZodType<TOutput>;
}

export type AIProviderUsage = z.infer<typeof aiProviderUsageSchema>;

export type AIProviderEvidence = z.infer<typeof aiProviderEvidenceSchema>;

export interface AIProviderResult<TOutput = unknown> {
    rawOutput: string;
    parsedOutput: TOutput | null;
    refusal: string | null;
    provider: AIProviderEvidence;
}

export interface AIProvider {
    generate<TOutput = unknown>(
        request: AIProviderRequest<TOutput>,
    ): Promise<AIProviderResult<TOutput>>;
}
