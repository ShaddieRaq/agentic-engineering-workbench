import type { ZodType } from "zod";

export interface AIProviderRequest<TOutput = unknown> {
    prompt: string;
    outputSchema?: ZodType<TOutput>;
}

export interface AIProviderResult<TOutput = unknown> {
    rawOutput: string;
    parsedOutput: TOutput | null;
    refusal: string | null;
}

export interface AIProvider {
    generate<TOutput = unknown>(
        request: AIProviderRequest<TOutput>,
    ): Promise<AIProviderResult<TOutput>>;
}