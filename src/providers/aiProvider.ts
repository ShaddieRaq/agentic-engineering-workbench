import type { ZodType } from "zod";

export interface AIProviderRequest {
  prompt: string;
  outputSchema?: ZodType;
}

export interface AIProviderResult {
    rawOutput: string;
    parsedOutput: unknown | null;
    refusal: string | null;
  }

export interface AIProvider {
    generate(request: AIProviderRequest): Promise<AIProviderResult>;
  }