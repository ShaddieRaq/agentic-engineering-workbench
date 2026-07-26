import type {
    AIProvider,
    AIProviderRequest,
    AIProviderResult,
  } from "./aiProvider.js";

export class FakeProvider implements AIProvider {
  constructor(private readonly response: string) {}

  async generate<TOutput = unknown>(
    _request: AIProviderRequest<TOutput>,
  ): Promise<AIProviderResult<TOutput>> {
    return {
      rawOutput: this.response,
      parsedOutput: null,
      refusal: null,
    };
  }

}