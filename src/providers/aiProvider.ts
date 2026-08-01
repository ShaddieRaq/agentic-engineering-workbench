import type { ZodType } from "zod";

export interface AIProviderRequest<TOutput = unknown> {
    prompt: string;
    outputSchema?: ZodType<TOutput>;
}

export interface AIProviderUsage {
    inputTokens: number;
    cachedInputTokens: number;
    outputTokens: number;
    reasoningTokens: number;
    totalTokens: number;
}

export interface AIProviderEvidence {
    model: string;
    usage: AIProviderUsage | null;
}

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
